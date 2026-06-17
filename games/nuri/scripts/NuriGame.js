// NuriGame.js — 누리 / NURI  v2.4
// 조이스틱 달리기(200x340 run entity) + 모래시계 PixelStream + 오비터

import { Scene } from '../../../engine/scene/SceneManager.js';

const HOLD_THRESHOLD = 300;
const PM_DURATION    = 700;
const WAIST_SCALE    = 0.05;
const FLASH_MS       = 200;
const IDLE_FOOT_ROW  = 256;   // ch01_player.json GROUND_Y (fix_run_frames.py)
const RUN_FOOT_ROW   = 335;   // ch01_player_run.json GROUND_Y (extract_run_nuri.py)
const RUN_SPEED      = 160;   // px/s

export default class NuriGame extends Scene {
    constructor() { super('nuri_main'); }

    onEnter(engine) {
        this.engine  = engine;
        this._W      = engine.gameWidth;
        this._H      = engine.gameHeight;
        this._player = engine.entities.get('nuri_player')
                    ?? engine.entities.getAll?.()[0]
                    ?? null;

        this._pointerDown  = false;
        this._holdStart    = 0;
        this._holdPos      = null;
        this._pmBlend      = null;
        this._landing      = false;
        this._landingTimer = 0;

        this._runEntity = null;
        this._runState  = 'idle';   // 'idle' | 'running' | 'stopping'
        this._runDir    = 1;
        this._joy       = { left: false, right: false };

        this._initOrbits();
        this._loadRunEntity(engine);
        this._setupJoystick();

        this._onDown = this._handleDown.bind(this);
        this._onUp   = this._handleUp.bind(this);
        engine.canvas.addEventListener('pointerdown', this._onDown);
        window.addEventListener('pointerup', this._onUp);
    }

    onExit() {
        this.engine?.canvas.removeEventListener('pointerdown', this._onDown);
        window.removeEventListener('pointerup', this._onUp);
        if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
        if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
    }

    // ── 런 엔티티 비동기 로드 ─────────────────────────────────
    async _loadRunEntity(engine) {
        try {
            const r = await fetch('./pixels/characters/ch01_player_run.json', { cache: 'no-store' });
            if (!r.ok) { console.warn('[nuri] ch01_player_run.json not found'); return; }
            const data = await r.json();
            this._runEntity = engine.entities.add('nuri_run', {
                x: 0, y: -1000, pw: data.width, ph: data.height,
                layer: 2, visible: false,
                frames: data.frames,
                _palette: data.palette,
                stateDef: data.stateDef,
            });
            console.log(`[nuri] run entity: ${data.width}x${data.height}, ${data.frames.length} frames`);
        } catch (e) {
            console.warn('[nuri] run entity load error:', e);
        }
    }

    // ── 조이스틱 설정 ─────────────────────────────────────────
    _setupJoystick() {
        const jL = document.getElementById('btnL');
        const jR = document.getElementById('btnR');
        if (jL && jR) {
            const setL = v => { this._joy.left  = v; jL.classList.toggle('held', v); };
            const setR = v => { this._joy.right = v; jR.classList.toggle('held', v); };
            ['pointerdown','pointerup','pointerleave','pointercancel'].forEach(ev => {
                jL.addEventListener(ev, e => { e.preventDefault(); setL(ev === 'pointerdown'); });
                jR.addEventListener(ev, e => { e.preventDefault(); setR(ev === 'pointerdown'); });
            });
        }
        this._onKeyDown = e => {
            if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') this._joy.left  = true;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._joy.right = true;
        };
        this._onKeyUp = e => {
            if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') this._joy.left  = false;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._joy.right = false;
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup',   this._onKeyUp);
    }

    // ── 포인터 핸들러 ─────────────────────────────────────────
    _handleDown(e) {
        e.preventDefault();
        this._pointerDown = true;
        this._holdStart   = performance.now();
        const rect = this.engine.canvas.getBoundingClientRect();
        this._holdPos = {
            x: (e.clientX - rect.left) * (this._W / rect.width),
            y: (e.clientY - rect.top)  * (this._H / rect.height),
        };
    }

    _handleUp() {
        if (!this._pointerDown) return;
        const held = performance.now() - this._holdStart;
        this._pointerDown = false;
        // 달리는 중에는 클릭 이동 무시
        if (held < HOLD_THRESHOLD && this._runState === 'idle' && !this._pmBlend) {
            this._startMove(this._holdPos);
        }
    }

    // ── 클릭 이동(PixelStream 텔레포트) ──────────────────────
    _startMove(targetPos) {
        const p = this._player;
        if (!p || this._pmBlend) return;
        const src = this._pixelsScreen(p, p._frameIdx ?? 0, p.flipX ?? false);
        if (!src.length) return;

        const dstX    = Math.max(0, Math.min(this._W - p.pw, targetPos.x - p.pw / 2));
        if (Math.abs(dstX - p.x) < 5) return;
        const newFlip = targetPos.x > p.x + p.pw / 2;
        p.flipX = newFlip;

        const dx = dstX - p.x;

        const runStopFrames = p.asm?.states?.run_stop?.frames ?? [];
        const runStopF0     = runStopFrames[0] ?? (p._frameIdx ?? 0);
        const dstRaw        = this._pixelsScreen(p, runStopF0, newFlip);
        const N    = src.length;
        const step = dstRaw.length / N;
        const dst  = Array.from({ length: N }, (_, i) => {
            const d = dstRaw[Math.round(i * step) % dstRaw.length];
            return [d[0] + dx, d[1], d[2], d[3], d[4]];
        });

        p.visible = false;
        this._startPixelMoveBlend(src, dst, PM_DURATION, () => {
            p.x       = dstX;
            p.visible = true;
            if (p.asm) {
                if (p.asm.states?.run_stop) p.asm.states.run_stop.fps = 20;
                p.asm.setState('run_stop'); p.asm.restart();
            }
            p._frameIdx      = runStopF0;
            this._landing    = true;
            this._landingTimer = 450;
        });
    }

    // ── 런 상태 전환 ──────────────────────────────────────────
    _enterRunning(dir) {
        const p = this._player;
        const re = this._runEntity;
        if (!re) return;

        this._runState = 'running';
        this._runDir   = dir;
        this._landing  = false;   // 착지 타이머 취소

        // run entity 위치: idle entity bottom 맞춤
        re.y    = p.y + p.ph - re.ph;
        re.x    = p.x + Math.round((p.pw - re.pw) / 2);
        re.flipX = dir < 0;
        re.visible = true;

        if (re.asm) { re.asm.setState('run'); re.asm.restart(); }

        p.visible = false;
    }

    _enterStopping() {
        const p = this._player;
        const re = this._runEntity;
        if (!re) return;

        this._runState = 'stopping';

        // idle entity 위치: run entity bottom 맞춤
        p.x     = re.x + Math.round((re.pw - p.pw) / 2);
        p.y     = re.y + re.ph - p.ph;
        p.flipX = re.flipX;
        p.visible = true;

        if (p.asm) {
            if (p.asm.states?.run_stop) p.asm.states.run_stop.fps = 20;
            p.asm.setState('run_stop'); p.asm.restart();
        }
        re.visible = false;
        this._landing      = true;
        this._landingTimer = 450;
    }

    _enterIdle() {
        this._runState = 'idle';
        const p = this._player;
        if (p?.asm) { p.asm.setState('idle'); p.asm.restart(); }
    }

    // ── 업데이트 ─────────────────────────────────────────────
    onUpdate(now, dt) {
        // PixelStream 블렌드 진행
        if (this._pmBlend) {
            this._pmBlend.t += dt;
            if (this._pmBlend.t >= this._pmBlend.dur) {
                const cb = this._pmBlend.onDone;
                this._pmBlend = null;
                cb?.();
            }
        }

        const p = this._player;
        if (p?.asm) { p.asm.tick(now); p._frameIdx = p.asm.getCurrentFrame(); }
        this._updateOrbits(dt);

        // run_stop → idle 타이머 (클릭 이동 & 조이스틱 정지 공통)
        if (this._landing && this._landingTimer !== undefined) {
            this._landingTimer -= dt;
            if (this._landingTimer <= 0) {
                this._landing = false;
                if (this._runState === 'stopping') {
                    this._enterIdle();
                } else {
                    if (p?.asm) { p.asm.setState('idle'); p.asm.restart(); }
                }
            }
        }

        // 조이스틱 상태머신 (픽셀 블렌드 중에는 처리 안 함)
        if (!this._pmBlend) this._updateRunState(now, dt);
    }

    _updateRunState(now, dt) {
        const goLeft  = this._joy.left && !this._joy.right;
        const goRight = this._joy.right && !this._joy.left;
        const anyJoy  = goLeft || goRight;
        const re      = this._runEntity;
        const p       = this._player;

        switch (this._runState) {
            case 'idle':
                if (anyJoy && re) this._enterRunning(goRight ? 1 : -1);
                break;

            case 'running':
                if (re?.asm) { re.asm.tick(now); re._frameIdx = re.asm.getCurrentFrame(); }
                if (!anyJoy) {
                    this._enterStopping();
                } else {
                    const newDir = goRight ? 1 : -1;
                    if (newDir !== this._runDir) {
                        this._runDir = newDir;
                        if (re) re.flipX = newDir < 0;
                    }
                    if (re) {
                        const maxX = this._W - re.pw;
                        re.x = Math.max(0, Math.min(maxX, re.x + this._runDir * RUN_SPEED * dt / 1000));
                        // idle entity X 동기화 (정지 전환 시 위치 맞춤용)
                        p.x = re.x + Math.round((re.pw - p.pw) / 2);
                    }
                }
                break;

            case 'stopping':
                // 다시 조이스틱 → 즉시 달리기 재개
                if (anyJoy && re) this._enterRunning(goRight ? 1 : -1);
                break;
        }
    }

    // ── 렌더 ─────────────────────────────────────────────────
    onPostRender(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this._W, this._H);

        const p  = this._player;
        const re = this._runEntity;
        const isRunning = this._runState === 'running' && re?.visible;
        const activeEnt = isRunning ? re : p;

        if (this._pmBlend) {
            this._renderPixelMove(ctx, this._pmBlend);
        } else if (activeEnt?.visible !== false) {
            this._renderOrbits(ctx, false, activeEnt);
            this._drawEntity(ctx, activeEnt);
            this._renderOrbits(ctx, true, activeEnt);
        }
    }

    // ── 궤도 오비터 ───────────────────────────────────────────
    _initOrbits() {
        const N = 24, sq = [], ci = [];
        for (let i = 0; i < N; i++) {
            const d = (i / N) * 4;
            let x, y;
            if (d < 1)      { x = d;          y = 0; }
            else if (d < 2) { x = 1;          y = d - 1; }
            else if (d < 3) { x = 1 - (d-2);  y = 1; }
            else            { x = 0;          y = 1 - (d-3); }
            sq.push([x - 0.5, y - 0.5]);
            const ang = (i / N) * Math.PI * 2;
            ci.push([Math.cos(ang) * 0.56, Math.sin(ang) * 0.56]);
        }
        this._orbitPts = { sq, ci };
        this._orbits = [
            { angle: 0,             angVel: 0.45, rx: 65, ry: 22, size: 26, morphT: 0.0, morphSpeed: 1.5 },
            { angle: Math.PI * 0.4, angVel: 0.38, rx: 58, ry: 19, size: 20, morphT: 1.4, morphSpeed: 2.0 },
            { angle: Math.PI * 0.8, angVel: 0.52, rx: 70, ry: 25, size: 22, morphT: 2.8, morphSpeed: 1.7 },
            { angle: Math.PI * 1.2, angVel: 0.41, rx: 62, ry: 21, size: 28, morphT: 4.2, morphSpeed: 1.3 },
            { angle: Math.PI * 1.6, angVel: 0.47, rx: 68, ry: 23, size: 18, morphT: 5.6, morphSpeed: 2.2 },
        ];
    }

    _updateOrbits(dt) {
        if (!this._orbits) return;
        for (const orb of this._orbits) {
            orb.angle  = (orb.angle + orb.angVel * dt / 1000) % (Math.PI * 2);
            orb.morphT += orb.morphSpeed * dt / 1000;
        }
    }

    _renderOrbits(ctx, frontPass, activeEnt) {
        const T = this._orbits, pts = this._orbitPts;
        const ent = activeEnt ?? this._player;
        if (!T || !pts || !ent) return;

        const cx = ent.x + ent.pw / 2;
        const cy = ent.y + (ent.ph || 150) * 0.38;

        ctx.save();
        for (const orb of T) {
            const sa = Math.sin(orb.angle);
            if ((sa > 0) !== frontPass) continue;

            const ox    = cx + Math.cos(orb.angle) * orb.rx;
            const oy    = cy + sa * orb.ry;
            const scale = 0.65 + 0.35 * (sa + 1) / 2;
            const sz    = orb.size * scale;
            const alpha = frontPass ? 0.88 : 0.60;
            const phase = (Math.sin(orb.morphT) + 1) / 2;
            const morph = phase * phase * (3 - 2 * phase);

            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = 'lighter';
            const N = pts.sq.length;
            for (let i = 0; i < N; i++) {
                const s = pts.sq[i], c = pts.ci[i];
                const px = ox + (s[0] + (c[0] - s[0]) * morph) * sz;
                const py = oy + (s[1] + (c[1] - s[1]) * morph) * sz;
                ctx.fillStyle = (i % 2 === 0) ? 'rgb(255,110,210)' : 'rgb(110,200,255)';
                ctx.fillRect(px | 0, py | 0, 3, 3);
            }
        }
        ctx.restore();
    }

    // ── 엔티티 렌더 ────────────────────────────────────────────
    _drawEntity(ctx, entity) {
        if (!entity) return;
        const pixels = entity._frames
            ? (entity._frames[entity._frameIdx ?? 0]?.pixels ?? [])
            : (entity._pixels ?? []);
        const pal = entity._palette ?? [];
        if (!pixels.length) return;

        const pw = entity.pw, ph = entity.ph;
        if (!this._entBuf || this._entBuf.width !== pw || this._entBuf.height !== ph) {
            this._entBuf        = document.createElement('canvas');
            this._entBuf.width  = pw;
            this._entBuf.height = ph;
            this._entBufCtx     = this._entBuf.getContext('2d');
            this._palCache      = null;
            this._palCacheRef   = null;
        }
        if (this._palCacheRef !== pal) {
            this._palCacheRef = pal;
            this._palCache    = pal.map(hex => {
                if (!hex || hex === 'transparent') return null;
                return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
            });
        }
        const eCtx    = this._entBufCtx;
        const imgData = eCtx.createImageData(pw, ph);
        const d       = imgData.data;
        const flip    = entity.flipX ?? false;
        for (const [px, py, idx] of pixels) {
            const rgb = this._palCache[idx];
            if (!rgb) continue;
            const xi  = flip ? pw - 1 - px : px;
            const off = (py * pw + xi) * 4;
            d[off]=rgb[0]; d[off+1]=rgb[1]; d[off+2]=rgb[2]; d[off+3]=255;
        }
        eCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(this._entBuf, entity.x, entity.y);
    }

    // ── 픽셀 추출 ──────────────────────────────────────────────
    _pixelsScreen(entity, frameIdx, flip) {
        const pixels = entity._frames
            ? (entity._frames[frameIdx]?.pixels ?? [])
            : (entity._pixels ?? []);
        const pal = entity._palette ?? [];
        const out = [];
        const ox = entity.x, oy = entity.y, pw = entity.pw;
        for (const [px, py, idx] of pixels) {
            const hex = pal[idx];
            if (!hex || hex === 'transparent') continue;
            const cx = flip ? ox + pw - 1 - px : ox + px;
            out.push([cx, oy + py,
                parseInt(hex.slice(1,3), 16),
                parseInt(hex.slice(3,5), 16),
                parseInt(hex.slice(5,7), 16)]);
        }
        return out;
    }

    // ── 블렌드 초기화 ─────────────────────────────────────────
    _startPixelMoveBlend(src, dst, dur, onDone) {
        const N = src.length;
        if (!N) { onDone?.(); return; }

        let sx=0, sy=0, dx=0, dy=0;
        for (let i=0; i<N; i++) {
            sx += src[i][0]; sy += src[i][1];
            dx += (dst[i]??src[i])[0]; dy += (dst[i]??src[i])[1];
        }
        sx/=N; sy/=N; dx/=N; dy/=N;

        const tDir = Math.atan2(dy - sy, dx - sx);
        const cosA = Math.cos(tDir), sinA = Math.sin(tDir);

        let minL = Infinity, maxL = -Infinity;
        const particles = src.map((s, i) => {
            const d      = dst[i] ?? s;
            const relX   = s[0] - sx, relY = s[1] - sy;
            const longP  = relX * cosA + relY * sinA;
            const transP = -relX * sinA + relY * cosA;
            if (longP < minL) minL = longP;
            if (longP > maxL) maxL = longP;
            return { sx:s[0], sy:s[1], sr:s[2], sg:s[3], sb:s[4],
                     dx:d[0], dy:d[1],
                     longP, transP,
                     ff:       Math.random(),
                     ecgFreq:  1 + Math.random() * 3,
                     ecgPhase: Math.random() * 4 };
        });

        const gatherX  = sx + cosA * (maxL + 50);
        const gatherY  = sy + sinA * (maxL + 50);
        const releaseX = dx + cosA * (minL - 50);
        const releaseY = dy + sinA * (minL - 50);

        const streamDot = cosA * (releaseX - gatherX) + sinA * (releaseY - gatherY);
        const midX = (sx + dx) / 2, midY = (sy + dy) / 2;
        const safeGX = streamDot > 0 ? gatherX  : midX;
        const safeGY = streamDot > 0 ? gatherY  : midY;
        const safeRX = streamDot > 0 ? releaseX : midX;
        const safeRY = streamDot > 0 ? releaseY : midY;

        this._pmBlend = {
            particles,
            gatherX: safeGX, gatherY: safeGY,
            releaseX: safeRX, releaseY: safeRY,
            cosA, sinA, dur, t: 0, onDone,
        };
    }

    // ── ECG 심박 파형 ─────────────────────────────────────────
    _ecg(t) {
        const tc = ((t % 1) + 1) % 1;
        if (tc < 0.20) return 0;
        if (tc < 0.26) return -(tc - 0.20) / 0.06 * 0.25;
        if (tc < 0.32) return -0.25 + (tc - 0.26) / 0.06 * 1.25;
        if (tc < 0.40) return 1.0  - (tc - 0.32) / 0.08 * 1.4;
        if (tc < 0.46) return -0.4 + (tc - 0.40) / 0.06 * 0.4;
        if (tc < 0.58) return 0;
        if (tc < 0.72) return Math.sin((tc - 0.58) / 0.14 * Math.PI) * 0.28;
        return 0;
    }

    // ── 모래시계 렌더 ─────────────────────────────────────────
    _renderPixelMove(ctx, b) {
        const prog = Math.min(b.t / b.dur, 1);
        const ease = t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
        const W = this._W, H = this._H;

        if (!this._blendBuf || this._blendBuf.width !== W || this._blendBuf.height !== H) {
            this._blendBuf        = document.createElement('canvas');
            this._blendBuf.width  = W;
            this._blendBuf.height = H;
            this._blendBufCtx     = this._blendBuf.getContext('2d');
            this._blendImgD       = this._blendBufCtx.createImageData(W, H);
        }
        const imgD = this._blendImgD;
        imgD.data.fill(0);
        const d = imgD.data;

        for (const p of b.particles) {
            const trav = (prog - p.ff * 0.5) / 0.5;
            let px, py, a;

            if (trav <= 0) {
                px = p.sx|0; py = p.sy|0; a = 255;
            } else if (trav >= 1) {
                px = p.dx|0; py = p.dy|0; a = 255;
            } else {
                const gpx = b.gatherX  - b.sinA * (p.transP * WAIST_SCALE);
                const gpy = b.gatherY  + b.cosA * (p.transP * WAIST_SCALE);
                const rpx = b.releaseX - b.sinA * (p.transP * WAIST_SCALE);
                const rpy = b.releaseY + b.cosA * (p.transP * WAIST_SCALE);

                let bpx, bpy;
                if (trav < 0.25) {
                    const t = ease(trav / 0.25);
                    bpx = p.sx + (gpx - p.sx) * t;
                    bpy = p.sy + (gpy - p.sy) * t;
                    px = bpx | 0; py = bpy | 0;
                } else if (trav < 0.75) {
                    const st     = ease((trav - 0.25) / 0.50);
                    const ecgVal = this._ecg(st * p.ecgFreq + p.ecgPhase);
                    const disp   = ecgVal * 14 + p.transP * 0.01;
                    bpx = gpx + (rpx - gpx) * st;
                    bpy = gpy + (rpy - gpy) * st;
                    px  = (bpx - b.sinA * disp) | 0;
                    py  = (bpy + b.cosA * disp) | 0;
                    const spike = Math.min(1, Math.abs(ecgVal));
                    const sr2 = Math.min(255, (p.sr + spike * 140) | 0);
                    const sg2 = Math.min(255, (p.sg + spike * 180) | 0);
                    const sb2 = Math.min(255, (p.sb + spike * 255) | 0);
                    if (px >= 0 && px < W && py >= 0 && py < H) {
                        const o2 = (py * W + px) * 4;
                        const a2 = (180 + spike * 75) | 0;
                        if (a2 > d[o2+3]) { d[o2]=sr2; d[o2+1]=sg2; d[o2+2]=sb2; d[o2+3]=a2; }
                    }
                    continue;
                } else {
                    const raw = (trav - 0.75) / 0.25;
                    const t = raw * raw * raw;
                    bpx = rpx + (p.dx - rpx) * t;
                    bpy = rpy + (p.dy - rpy) * t;
                    px = bpx | 0; py = bpy | 0;
                }
                a = 215;
            }

            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const off = (py * W + px) * 4;
            if (a > d[off + 3]) {
                d[off]=p.sr; d[off+1]=p.sg; d[off+2]=p.sb; d[off+3]=a;
            }
        }

        if (b.t < FLASH_MS) {
            const fa = ((1 - b.t / FLASH_MS) * 255) | 0;
            for (const p of b.particles) {
                const x = p.sx|0, y = p.sy|0;
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const off = (y * W + x) * 4;
                d[off]   = Math.min(255, d[off]   + fa);
                d[off+1] = Math.min(255, d[off+1] + fa);
                d[off+2] = Math.min(255, d[off+2] + fa);
                d[off+3] = 255;
            }
        }
        if (b.dur - b.t < FLASH_MS) {
            const fa = ((1 - (b.dur - b.t) / FLASH_MS) * 255) | 0;
            for (const p of b.particles) {
                const x = p.dx|0, y = p.dy|0;
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const off = (y * W + x) * 4;
                d[off]   = Math.min(255, d[off]   + fa);
                d[off+1] = Math.min(255, d[off+1] + fa);
                d[off+2] = Math.min(255, d[off+2] + fa);
                d[off+3] = 255;
            }
        }

        this._blendBufCtx.putImageData(imgD, 0, 0);
        ctx.drawImage(this._blendBuf, 0, 0);
    }
}
