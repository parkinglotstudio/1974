import { Scene } from '../../../engine/scene/SceneManager.js';
import { SAND_BASE_RGB, SAND_TONES_RGB } from '../../../engine/SandPalette.js';

const MOVE_SPEED  = 220;   // px/sec
const WORLD_WIDTH = 2560;
const GROUND_Y    = 547;   // 발끝 = 547+270 = 817 (2/3 크기 캐릭터 높이 270)

// ── 배경 순환 ───────────────────────────────────────────────────────
const BG_LIST     = ['bg_1', 'bg_2', 'bg_3', 'bg_4'];
const BG_PID      = '1974';
const BG_INTERVAL = 10000;  // 10초마다 다음 배경
const BG_TRANS_MS = 2000;   // 전환 시간 (2초)
const CYCLE_ENABLED = false; // 자동 배경 순환/전환 연출 ON/OFF (확인 완료 → OFF)
const DIGITAL_ENABLED = false; // 디지털 회로/메시 오버레이 ON/OFF (저장만, 지금은 OFF)
const FOG_ENABLED = false;     // 안개(절차적 + 드리프트 구름) ON/OFF (지금은 OFF)

// 전환 효과를 차례대로 순환 — 새로 만든 모래 생성형 3종 테스트
const FX_LIST     = ['sand_top', 'sand_sides', 'wave'];

// ── SandScroll (모래 생성/소멸 스크롤) 프로토타입 파라미터 ───────────
const SAND_ENABLED   = true;
const SAND_BAND_MAX  = 0.065; // 최대 띠 폭 (화면 비율) — 절반으로 축소
const SAND_GRAIN     = 4;     // 모래 입자 크기 px
const SAND_SETTLE_MS = 280;   // 멈출 때 굳는(가라앉는) 시간
const SAND_BUILDUP_MS = 2000; // 걷기 시작 → 최대 크기까지 빌드업 (2초). 달리면 즉시.

// 앰비언트 — 가만히 있어도 픽셀이 톡톡 떨어지는 모래알
const SAND_FALL_RATE = 70;    // 초당 떨어져 나가는 디지털 픽셀 수
const SAND_FALL_G    = 4;     // 디지털 블록 크기 px (그리드 정렬)
const SAND_GRAVITY   = 130;   // 중력 가속 px/s² — 포물선 낙하

// 월드 고정 셀 의사난수 0~1 (콘텐츠가 흐르는 동안 입자가 정체성 유지 → 팝인/팝아웃)
function sandHash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}

export default class GolmokGame extends Scene {
    constructor() {
        super('golmok_main');
        this._player  = null;
        this._targetX = null;    // 클릭 이동 목표 X (월드 좌표, player.x 기준)
        this._clickBound = false;

        this._bgIdx   = 0;
        this._fxIdx   = 0;
        this._bgCache = {};
        this._bgReady = false;
        this._timer   = 0;
        this._tr      = null;    // { t, effect, swapped, _pxOut, _pxIn }

        // SandScroll 상태
        this._lastCamX = null;
        this._sandDir  = 1;      // +1: 오른쪽 이동, -1: 왼쪽
        this._sandI    = 0;      // 효과 강도 0~1 (이동 시 1, 멈추면 감쇠)
        this._sandSpeed = 0;     // 평활된 스크롤 속도 px/sec
        this._sandRamp  = 0;     // 좌우 효과 빌드업 0~1 (걷기 2초 / 달리기 즉시)
        this._ambient  = [];     // 앰비언트 모래알 파티클
        this._ambAcc   = 0;      // 스폰 누적기

        // IDLE(대기) 상태 — 픽셀 낙하 + 발밑 그림자
        this._idleT         = 0;   // 대기 누적 시간 (그림자 진하기)
        this._idleParticles = [];
        this._idleAcc       = 0;

        this._dayT = 0;            // 낮↔밤 60초 사이클 시간
        this._fxK  = 1;            // 현재 FX 세기 (0~1)
        this._fog  = [];           // 드리프트 구름-포그 레이어들

        // 디지털 오버레이 — 회로/메시 조각이 불규칙하게 일어났다 사라짐
        this._digital = [];
        this._digAcc  = 0;
    }

    onEnter(engine) {
        engine.bounds.setSceneBounds(WORLD_WIDTH, engine.gameHeight);

        // 엔진 FX 전부 ON (테스트)
        engine.lighting.setAmbient(0.2, '#0a1428');                  // 살짝만 어둡게 (밝은 쪽)
        engine.lighting.clearLights();
        engine.lighting.addLight({ id: 'key', x: 270, y: 300, radius: 340, color: '#ffd060', intensity: 0.95, fixed: true });
        engine.glow.enable();                                        // 발광(인덱스10) — 해당 픽셀 있을 때
        engine.rim.enable();                                         // 캐릭터 가장자리 림라이트
        if (FOG_ENABLED) {
            engine.fog.enable();
            engine.fog.enableLayerFog({ startY: 430, endY: 960, color: '#9fb3cc', maxOpacity: 0.5, direction: 'bottom' });
        } else {
            engine.fog.disable();
        }
        engine.vignette.setPreset('warm');                           // 가장자리 비네트

        this._player = engine.entities.get('player');
        this._preload();
        if (FOG_ENABLED) this._loadFog();

        // ── 화면 클릭/터치 → 그 지점으로 걸어가기 ──────────────────
        const canvas = engine.canvas;
        if (canvas && !this._clickBound) {
            this._clickBound = true;
            canvas.style.cursor = 'pointer';
            const onPoint = (clientX) => {
                const p = this._player; if (!p) return;
                const rect = canvas.getBoundingClientRect();
                if (rect.width <= 0) return;
                const gx     = (clientX - rect.left) / rect.width * engine.gameWidth; // 화면→논리 X
                const worldX = engine.cameraX + gx;                                   // →월드 X
                this._targetX = Math.max(0, Math.min(WORLD_WIDTH - p.pw, worldX - p.pw / 2));
            };
            canvas.addEventListener('pointerdown', (ev) => onPoint(ev.clientX));
        }
    }

    // 구름-포그 텍스쳐 로드 → 캔버스로 1회 래스터 (앞/뒤 2겹)
    async _loadFog() {
        const defs = [
            { file: 'fog_1', y: -20, dh: 540, speed: 5,  baseAlpha: 0.42 },  // 뒤(위), 느림
            { file: 'fog_2', y: 360, dh: 640, speed: 11, baseAlpha: 0.5  },  // 앞(아래), 빠름
        ];
        for (const def of defs) {
            try {
                const d = await fetch(`./pixels/fog/${def.file}.json`, { cache: 'no-store' }).then(r => r.json());
                this._fog.push({ canvas: this._rasterFog(d), x: Math.random() * d.width, ...def });
            } catch (e) { console.warn('[golmok] fog load fail:', def.file, e); }
        }
    }

    _rasterFog(d) {
        const cv = document.createElement('canvas'); cv.width = d.width; cv.height = d.height;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(d.width, d.height); const od = img.data;
        const pal = d.palette.map(c => {
            if (!c || c === 'transparent') return null;
            const h = c.slice(1);
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), h.length >= 8 ? parseInt(h.slice(6,8),16) : 255];
        });
        const s = d.scanline;
        for (let i = 0; i < s.length; i++) {
            const c = pal[s[i]]; if (!c) continue;
            const o = i << 2; od[o]=c[0]; od[o+1]=c[1]; od[o+2]=c[2]; od[o+3]=c[3];
        }
        ctx.putImageData(img, 0, 0);
        return cv;
    }

    async _preload() {
        for (const name of BG_LIST) {
            try {
                const r = await fetch(`./pixels/backgrounds/${name}.json`, { cache: 'no-store' });
                if (r.ok) this._bgCache[name] = await r.json();
            } catch (e) { console.warn('[golmok] bg preload fail:', name, e); }
        }
        this._bgReady = true;
        console.log('[golmok] backgrounds preloaded:', Object.keys(this._bgCache));
    }

    _swapBg(engine, name) {
        const d = this._bgCache[name];
        if (!d) return;
        engine.entities.remove('bg_alley');
        engine.entities.add('bg_alley', {
            x: 0, y: 0, pw: d.width, ph: d.height,
            layer: 1, visible: true,
            _scanline: d.scanline, _palette: d.palette,
        });
    }

    onUpdate(now, dt, input) {
        const engine = this.engine;
        const player = this._player ?? engine.entities.get('player');
        if (!player) return;
        this._player = player;

        const dtSec = dt / 1000;

        // 이동 — 키보드 우선, 없으면 클릭 목표로 이동
        let dx = 0;
        if (input.isDown('left'))  { dx = -MOVE_SPEED; this._targetX = null; }
        if (input.isDown('right')) { dx =  MOVE_SPEED; this._targetX = null; }
        if (dx === 0 && this._targetX != null) {
            const diff = this._targetX - player.x;
            const step = MOVE_SPEED * dtSec;
            if (Math.abs(diff) <= step) { player.x = this._targetX; this._targetX = null; }
            else dx = diff > 0 ? MOVE_SPEED : -MOVE_SPEED;
        }
        if (dx !== 0) {
            player.x += dx * dtSec;
            player.flipX = dx < 0;
            player.x = Math.max(0, Math.min(WORLD_WIDTH - player.pw, player.x));
            player.setState('walk');
        } else {
            player.setState('idle');
        }
        player.y = GROUND_Y;

        // 카메라
        const rawCamX = player.x + player.pw / 2 - engine.gameWidth / 2;
        engine.cameraX = engine.bounds.clampCameraX(rawCamX);

        // ── 스크롤 모션 추적 (SandScroll 효과용) ──────────────────
        const cam = engine.cameraX;
        if (this._lastCamX == null) this._lastCamX = cam;
        const camDelta = cam - this._lastCamX;
        this._lastCamX = cam;
        // 순간 속도(px/sec) → EMA 평활 (가감속 시 띠 폭이 부드럽게 부풀고 가라앉음)
        const instSpeed = Math.abs(camDelta) / Math.max(dtSec, 0.001);
        this._sandSpeed = this._sandSpeed * 0.8 + instSpeed * 0.2;
        const speedNorm = this._sandSpeed / MOVE_SPEED;
        if (Math.abs(camDelta) > 0.05) {
            this._sandDir = camDelta > 0 ? 1 : -1;
            this._sandI   = 1;
            // 빌드업: 걷기(≈1배속)면 2초에 걸쳐, 달리기(>1.2배속)면 즉시 최대로
            const rampMs = speedNorm > 1.2 ? 200 : SAND_BUILDUP_MS;
            this._sandRamp = Math.min(1, this._sandRamp + dt / rampMs);
        } else {
            this._sandI    = Math.max(0, this._sandI    - dt / SAND_SETTLE_MS);
            this._sandRamp = Math.max(0, this._sandRamp - dt / SAND_SETTLE_MS);
        }

        // ── 낮↔밤 60초 사이클 (값 애니메이션 — 부하 없음) ──────────
        // 1분 동안 전체 FX 세기 0(raw)↔최대(full) — 효과 차이를 확연히 보이게
        this._dayT += dtSec;
        const k = 0.5 - 0.5 * Math.cos(this._dayT * (Math.PI * 2 / 60));  // 0(raw)~1(full)~0
        this._fxK = k;
        for (const f of this._fog) f.x += f.speed * dtSec;               // 안개 드리프트
        if (DIGITAL_ENABLED) this._updateDigital(dt);                    // 디지털 패턴 생성/소멸 (현재 OFF)
        const hx = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
        engine.lighting.setAmbient(0.5 * k, '#0a1428');                  // 어둠 0↔0.5
        const lr = 185 + (255 - 185) * k, lg = 215 + (200 - 215) * k, lb = 255 + (95 - 255) * k;
        engine.lighting.updateLight('key', { color: '#' + hx(lr) + hx(lg) + hx(lb), intensity: 0.95 * k });
        engine.vignette.setStrength(0.55 * k);                           // 비네트 0↔0.55
        engine.glow._bloomStrength = 0.95 * k;                           // 글로우 0↔0.95
        engine.fog._layerFogOpts.maxOpacity = 0.5 * k;                   // 안개 0↔0.5
        engine.fog._gradCache = null;

        // ── IDLE 효과: 정지 시 캐릭터에서 픽셀 낙하 + 발밑 그림자 누적 ──
        if (dx === 0) {
            this._idleT += dtSec;
            this._spawnIdleParticles(dt);
        } else {
            this._idleT = 0;
        }
        this._updateIdleParticles(dt);

        // 앰비언트 모래알 (정지/이동 무관 항상)
        this._updateAmbientSand(dt);

        // ── 배경 순환 + 전환 ──────────────────────────────────────
        if (!this._bgReady) return;

        if (this._tr) {
            this._tr.t += dt / BG_TRANS_MS;
            // 화면이 가려진 중간 지점(t≥0.5)에서 배경 교체 → 전환에 가려져 자연스러움
            if (!this._tr.swapped && this._tr.t >= 0.5) {
                this._tr.swapped = true;
                this._bgIdx = (this._bgIdx + 1) % BG_LIST.length;
                this._swapBg(engine, BG_LIST[this._bgIdx]);
            }
            if (this._tr.t >= 1) { this._tr = null; this._timer = 0; }
            return;
        }

        if (!CYCLE_ENABLED) return;   // 자동 순환 OFF
        this._timer += dt;
        if (this._timer >= BG_INTERVAL) {
            this._tr = { t: 0, effect: FX_LIST[this._fxIdx], swapped: false };
            this._fxIdx = (this._fxIdx + 1) % FX_LIST.length;
        }
    }

    // composite/FX 이후 — 전환 오버레이 또는 SandScroll 가장자리 효과
    onPostRender(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        let overlay = false;

        if (this._tr) {
            const t = this._tr.t;
            switch (this._tr.effect) {
                case 'palette_flash': {
                    const flash = Math.min(1, (1 - Math.abs(2 * t - 1)) * 1.4);
                    ctx.save();
                    ctx.globalAlpha = flash;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, W, H);
                    ctx.restore();
                    break;
                }
                case 'slide_left': {
                    let panelX;
                    if (t < 0.5) panelX = W * (1 - this._ease(t * 2));
                    else         panelX = -(W * this._ease((t - 0.5) * 2));
                    ctx.fillStyle = '#000';
                    ctx.fillRect(panelX, 0, W, H);
                    break;
                }
                case 'convergence': {
                    this._drawConvergence(ctx, W, H, t);
                    break;
                }
                case 'sand_top':
                case 'sand_sides': {
                    // 앞 절반: 구 배경 모래 소멸 / 뒤 절반: 새 배경 모래 생성
                    const shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
                    const img = ctx.getImageData(0, 0, W, H);
                    const d = img.data;
                    for (let y = 0; y < H; y++) {
                        for (let x = 0; x < W; x++) {
                            const n = sandHash(x >> 2, y >> 2);
                            let thr;
                            if (this._tr.effect === 'sand_top') {
                                thr = (y / H) * 0.7 + n * 0.3;
                            } else {
                                const dc = Math.abs(x - W * 0.5) / (W * 0.5);
                                thr = (1 - dc) * 0.7 + n * 0.3;
                            }
                            if (shown < thr) {                 // 미생성 = 모래 바탕색
                                const i = (y * W + x) << 2;
                                d[i] = BR; d[i + 1] = BG; d[i + 2] = BB; d[i + 3] = 255;
                            }
                        }
                    }
                    ctx.putImageData(img, 0, 0);
                    break;
                }
                case 'wave': {
                    const shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const amp = (1 - shown) * 26, fade = shown, phase = t * Math.PI * 8;
                    const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
                    const src = ctx.getImageData(0, 0, W, H), sd = src.data;
                    const out = ctx.createImageData(W, H), od = out.data;
                    for (let y = 0; y < H; y++) {
                        const dx = Math.round(Math.sin(y * 0.045 + phase) * amp);
                        for (let x = 0; x < W; x++) {
                            let sxp = x - dx;
                            if (sxp < 0) sxp = 0; else if (sxp >= W) sxp = W - 1;
                            const si = (y * W + sxp) << 2, oi = (y * W + x) << 2;
                            // 모래 바탕색에서 그림색으로 보간 (검정 대신)
                            od[oi]     = BR + (sd[si]     - BR) * fade;
                            od[oi + 1] = BG + (sd[si + 1] - BG) * fade;
                            od[oi + 2] = BB + (sd[si + 2] - BB) * fade;
                            od[oi + 3] = 255;
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    break;
                }
            }
            overlay = true;
        } else if (SAND_ENABLED && this._sandRamp > 0.01) {
            this._renderSandScroll(ctx, W, H);
            overlay = true;
        }

        // 발밑 그림자 (항상, 캐릭터 아래) — 정지=픽셀 깨짐 / 이동=블러 모션
        this._drawShadow(ctx);

        // 캐릭터 본체 (그림자 위, 항상 재그림)
        const moving = this._sandI > 0.05;
        const l2 = this.engine.layers.getCanvas(2);
        if (l2) {
            if (moving) this._renderCharTrail(ctx, l2, W, H);
            ctx.drawImage(l2, 0, 0, W, H, 0, 0, W, H);
        }

        // 캐릭터 외곽 역광 rim — 뒤 배경색을 받아 가장자리에서 페이드 (런타임)
        this._renderCharRim(ctx, W, H);

        // IDLE 떨어지는 픽셀 (캐릭터 위/주변)
        if (this._idleParticles.length) this._drawIdleParticles(ctx);

        // 앰비언트 모래알 (항상)
        this._drawAmbientSand(ctx);

        // 디지털 패턴 오버레이 (회로/메시가 불규칙하게 명멸 — 디지털 세계 느낌)
        this._drawDigital(ctx);

        // 드리프트 구름-포그 (몽환적 분위기, FX 세기에 연동)
        this._drawFog(ctx, W, H);

        // 가장자리 픽셀 깨짐 프레임 — 반듯한 사각 테두리를 픽셀아트답게 침식 (이동 시)
        this._renderEdgeFrame(ctx, W, H);
    }

    // ── 디지털 오버레이: 회로/메시 조각이 불규칙하게 명멸 ──────────────
    _updateDigital(dt) {
        const dtSec = dt / 1000;
        for (let i = this._digital.length - 1; i >= 0; i--) {
            const p = this._digital[i]; p.age += dtSec;
            if (p.age >= p.life) this._digital.splice(i, 1);
        }
        this._digAcc += 4 * dtSec;                          // ~초당 4개
        while (this._digAcc >= 1 && this._digital.length < 16) {
            this._digAcc -= 1; this._spawnDigital();
        }
    }

    _spawnDigital() {
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const wx = Math.floor(e.cameraX) + (Math.random() * (W + 100) - 50);
        const y  = 40 + Math.random() * (H - 220);
        const scale = 0.8 + Math.random() * 1.0;
        const pts = [], edges = [];
        if (Math.random() < 0.5) {
            // 회로 트레이스 (직각 경로 + 노드)
            let cx = 0, cy = 0; pts.push([cx, cy]);
            const segs = 3 + (Math.random() * 4 | 0);
            for (let i = 0; i < segs; i++) {
                const len = (18 + Math.random() * 48) * scale;
                if (i % 2 === 0) cx += (Math.random() < 0.5 ? -1 : 1) * len;
                else             cy += (Math.random() < 0.5 ? -1 : 1) * len;
                pts.push([cx, cy]);
            }
            for (let i = 0; i < pts.length - 1; i++) edges.push([i, i + 1]);
        } else {
            // 와이어프레임 노드망
            const n = 4 + (Math.random() * 4 | 0);
            for (let i = 0; i < n; i++) pts.push([(Math.random() - 0.5) * 100 * scale, (Math.random() - 0.5) * 100 * scale]);
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.random() < 0.4) edges.push([i, j]);
        }
        this._digital.push({ wx, y, age: 0, life: 0.7 + Math.random() * 1.7, pts, edges });
    }

    _drawDigital(ctx) {
        if (!this._digital.length) return;
        const cam = this.engine.cameraX;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';   // 가산 → 파랑 글로우
        for (const p of this._digital) {
            const t = p.age / p.life;
            const fade = t < 0.25 ? t / 0.25 : (t > 0.6 ? (1 - t) / 0.4 : 1);
            const a = Math.max(0, fade) * 0.75;
            if (a <= 0.02) continue;
            const ox = p.wx - cam, oy = p.y;
            ctx.globalAlpha = a;
            ctx.strokeStyle = '#3aa8ff'; ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (const [i, j] of p.edges) {
                ctx.moveTo(ox + p.pts[i][0], oy + p.pts[i][1]);
                ctx.lineTo(ox + p.pts[j][0], oy + p.pts[j][1]);
            }
            ctx.stroke();
            ctx.fillStyle = '#cfeaff';
            for (const pt of p.pts) ctx.fillRect((ox + pt[0] - 1) | 0, (oy + pt[1] - 1) | 0, 3, 3);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // 구름-포그 2겹 가로 드리프트 (반투명, FX 세기 k에 연동)
    _drawFog(ctx, W, H) {
        const k = this._fxK;
        if (k <= 0.02 || !this._fog.length) return;
        for (const f of this._fog) {
            const cw = f.canvas.width, ch = f.canvas.height;
            const drift = ((f.x % cw) + cw) % cw;
            ctx.save();
            ctx.globalAlpha = Math.min(1, f.baseAlpha * k);
            ctx.drawImage(f.canvas, 0, 0, cw, ch, -drift,     f.y, W, f.dh);  // 무한 가로 스크롤
            ctx.drawImage(f.canvas, 0, 0, cw, ch, W - drift,  f.y, W, f.dh);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 외곽이 디지털 픽셀로 부서져 곡선을 그리며 중력 낙하 (이 세계 = 디지털)
    _updateAmbientSand(dt) {
        const dtSec = dt / 1000;
        const e = this.engine;
        const W = e.gameWidth, H = e.gameHeight;
        const L2 = e.layers.getCanvas(2);
        const lctx2 = L2 ? L2.getContext('2d') : null;
        const p = this._player;

        // ── 스폰: 캐릭터 경계 픽셀만 추려서 디지털 블록으로 떨어뜨림 ──
        if (p && lctx2) {
            const psx = (p.x - e.cameraX) | 0;
            const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
            const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
            const rw = x1 - x0, rh = y1 - y0;
            let img = null;
            if (rw > 0 && rh > 0) { try { img = lctx2.getImageData(x0, y0, rw, rh).data; } catch (_) {} }
            if (img) {
                const A = (lx, ly) => (lx < 0 || lx >= rw || ly < 0 || ly >= rh) ? 0 : img[((ly * rw + lx) << 2) + 3];
                // 경계 픽셀 수집 (step 2) — 투명 이웃이 있는 캐릭터 픽셀
                const edges = [];
                for (let ly = 0; ly < rh; ly += 2) {
                    for (let lx = 0; lx < rw; lx += 2) {
                        if (A(lx, ly) < 40) continue;
                        if (A(lx-2,ly)>=40 && A(lx+2,ly)>=40 && A(lx,ly-2)>=40 && A(lx,ly+2)>=40) continue;
                        edges.push(lx, ly);
                    }
                }
                if (edges.length) {
                    const dir = this._sandDir || 1, moving = this._sandI;   // 0~1
                    this._ambAcc += SAND_FALL_RATE * dtSec;
                    while (this._ambAcc >= 1) {
                        this._ambAcc -= 1;
                        const k = ((Math.random() * (edges.length >> 1)) | 0) << 1;
                        const lx = edges[k], ly = edges[k + 1];
                        const o = (ly * rw + lx) << 2;
                        // 어두운 실루엣 → 차가운 청회색 '데이터' 픽셀로 살짝 들어올림
                        const r = Math.min(255, img[o]   + 30);
                        const g = Math.min(255, img[o+1] + 40);
                        const b = Math.min(255, img[o+2] + 60);
                        this._ambient.push({
                            x: x0 + lx, y: y0 + ly,
                            vx: (Math.random() - 0.5) * 24 - dir * 26 * moving, // 곡선 + 이동 시 뒤로 흩날림
                            vy: -(Math.random() * 16),                          // 살짝 떠올랐다 중력에 낙하
                            age: 0, maxlife: 0.7 + Math.random() * 0.9,
                            r, g, b,
                        });
                    }
                }
            }
        }

        // ── 업데이트: 중력 가속 → 포물선 낙하 ──
        for (let i = this._ambient.length - 1; i >= 0; i--) {
            const q = this._ambient[i];
            q.vy += SAND_GRAVITY * dtSec;
            q.x  += q.vx * dtSec;
            q.y  += q.vy * dtSec;
            q.age += dtSec;
            if (q.age >= q.maxlife || q.y > H + 6) this._ambient.splice(i, 1);
        }
    }

    _drawAmbientSand(ctx) {
        const G = SAND_FALL_G;
        for (const p of this._ambient) {
            const t = p.age / p.maxlife;                       // 0→1
            // 디지털: 또렷하게 유지하다 끝에서만 페이드 (소프트 팝 없음)
            const a = (t > 0.7 ? (1 - (t - 0.7) / 0.3) : 1) * 0.95;
            if (a <= 0.04) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
            // 그리드 정렬 → 디지털 블록 느낌
            ctx.fillRect(((p.x / G) | 0) * G, ((p.y / G) | 0) * G, G, G);
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 외곽 역광 rim: 뒤 배경(L1)색을 가져와 가장자리부터 안쪽으로 페이드 + 우상단 광원 방향
    _renderCharRim(ctx, W, H) {
        const e = this.engine; const L2 = e.layers.getCanvas(2); const L1 = e.layers.getCanvas(1); const p = this._player;
        if (!L2 || !L1 || !p) return;
        const N = 3;                         // rim 폭(px) — 얇게
        const PEAK = 0.9;                    // 최대 세기
        const Lx = 0.7071, Ly = -0.7071;     // 우상단 광원(역광)
        const psx = (p.x - e.cameraX) | 0;
        const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
        const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
        const rw = x1 - x0, rh = y1 - y0; if (rw <= 0 || rh <= 0) return;
        const l2d = L2.getContext('2d').getImageData(x0, y0, rw, rh).data;
        const camX = Math.floor(e.cameraX);
        let bgsx = camX + x0; if (bgsx < 0) bgsx = 0;
        const l1d = L1.getContext('2d').getImageData(bgsx, y0, Math.min(rw, L1.width - bgsx), rh).data;
        const lw = Math.min(rw, L1.width - bgsx);
        const A = (lx, ly) => (lx < 0 || lx >= rw || ly < 0 || ly >= rh) ? 0 : l2d[((ly * rw + lx) << 2) + 3];
        for (let ly = 0; ly < rh; ly++) {
            for (let lx = 0; lx < rw; lx++) {
                if (A(lx, ly) < 40) continue;
                if (A(lx - N, ly) >= 40 && A(lx + N, ly) >= 40 && A(lx, ly - N) >= 40 && A(lx, ly + N) >= 40) continue; // 깊은 내부 skip
                let d = 0;
                for (let r = 1; r <= N; r++) {
                    if (A(lx-r,ly)<40||A(lx+r,ly)<40||A(lx,ly-r)<40||A(lx,ly+r)<40||A(lx-r,ly-r)<40||A(lx+r,ly-r)<40||A(lx-r,ly+r)<40||A(lx+r,ly+r)<40) { d = r; break; }
                }
                if (!d) continue;
                const gx = A(lx+2,ly) - A(lx-2,ly), gy = A(lx,ly+2) - A(lx,ly-2);
                const ox = -gx, oy = -gy; const ln = Math.hypot(ox, oy); let dir = 0;
                if (ln > 0) dir = Math.max(0, (ox/ln)*Lx + (oy/ln)*Ly);
                const falloff = 1 - (d - 1) / N;
                const a = PEAK * (0.4 + 0.6 * falloff) * (0.28 + 0.72 * dir);  // 밴드 더 채우고 또렷
                if (a <= 0.03) continue;
                const bi = (ly * lw + Math.min(lx, lw - 1)) << 2;   // 뒤 배경색 샘플
                const r0 = Math.min(255, l1d[bi]   * 2.3) | 0;       // 배경색 강하게 부스트
                const g0 = Math.min(255, l1d[bi+1] * 2.3) | 0;
                const b0 = Math.min(255, l1d[bi+2] * 2.3) | 0;
                ctx.globalAlpha = a;
                ctx.fillStyle = `rgb(${r0},${g0},${b0})`;
                ctx.fillRect(x0 + lx, y0 + ly, 1, 1);
            }
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 가장자리를 매 프레임 움직이는 검은 픽셀로 — 디지털 세계 느낌 (현재 미사용)
    _renderCharEdge(ctx, W, H) {
        const e = this.engine; const L2 = e.layers.getCanvas(2); const p = this._player;
        if (!L2 || !p) return;
        const G = 3;
        const psx = (p.x - e.cameraX) | 0;
        const x0 = Math.max(0, psx - G), x1 = Math.min(W, psx + p.pw + G);
        const y0 = Math.max(0, p.y - G), y1 = Math.min(H, p.y + p.ph + G);
        const rw = x1 - x0, rh = y1 - y0;
        if (rw <= 0 || rh <= 0) return;
        const img = L2.getContext('2d').getImageData(x0, y0, rw, rh).data;
        const A = (lx, ly) => (lx < 0 || lx >= rw || ly < 0 || ly >= rh) ? 0 : img[((ly * rw + lx) << 2) + 3];
        const fb = (e._frame || 0) * 0.7;          // 프레임마다 패턴 이동 → 깜빡임
        ctx.fillStyle = '#000';
        for (let ly = 0; ly < rh; ly += G) {
            for (let lx = 0; lx < rw; lx += G) {
                if (A(lx, ly) < 40) continue;       // 캐릭터 픽셀만
                // 내부(사방 불투명)는 제외 → 경계만
                if (A(lx - G, ly) >= 40 && A(lx + G, ly) >= 40 && A(lx, ly - G) >= 40 && A(lx, ly + G) >= 40) continue;
                if (sandHash(lx / G + fb, ly / G) < 0.45) ctx.fillRect(x0 + lx, y0 + ly, G, G);
            }
        }
    }

    // ── IDLE: 캐릭터에서 픽셀이 아래로 떨어짐 ──────────────────────
    _spawnIdleParticles(dt) {
        const e = this.engine; const p = this._player;
        const L2 = e.layers.getCanvas(2);
        if (!p || !L2) return;
        const lctx2 = L2.getContext('2d');
        const psx = p.x - e.cameraX;
        this._idleAcc += 48 * (dt / 1000);          // 초당 ~48개
        while (this._idleAcc >= 1) {
            this._idleAcc -= 1;
            const x = (psx + Math.random() * p.pw) | 0;
            const y = (p.y + Math.random() * p.ph * 0.9) | 0;
            if (x < 0 || x >= e.gameWidth || y < 0 || y >= e.gameHeight) continue;
            let col; try { col = lctx2.getImageData(x, y, 1, 1).data; } catch (_) { continue; }
            if (col[3] < 16) continue;
            this._idleParticles.push({
                x, y, vy: 30 + Math.random() * 80,      // 아래로 낙하
                age: 0, maxlife: 0.5 + Math.random() * 0.9,
                r: col[0], g: col[1], b: col[2],
            });
        }
    }

    _updateIdleParticles(dt) {
        const dtSec = dt / 1000;
        const ground = GROUND_Y + (this._player ? this._player.ph : 490) - 4;  // 발끝 바닥
        for (let i = this._idleParticles.length - 1; i >= 0; i--) {
            const q = this._idleParticles[i];
            q.y += q.vy * dtSec;
            q.age += dtSec;
            if (q.age >= q.maxlife || q.y >= ground) this._idleParticles.splice(i, 1);
        }
    }

    // 발밑 그림자 — 캐릭터 넓이 기준(작게). 정지=픽셀 깨짐 가장자리 / 이동=블러 모션
    _drawShadow(ctx) {
        const e = this.engine; const p = this._player;
        if (!p) return;
        const cx = p.x - e.cameraX + p.pw / 2;
        const cy = GROUND_Y + p.ph - 5;          // 발밑
        const rx = p.pw * 0.24;                  // 캐릭터 넓이 기준, 작게
        const ry = 8;
        const moving = this._sandI > 0.05;
        if (moving) {
            // 이동: 블러 모션 그림자 (진행할수록 늘어나고 흐려짐)
            const sn = Math.min(1, this._sandSpeed / MOVE_SPEED);
            ctx.save();
            ctx.globalAlpha = 0.36;
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${(3 + 5 * sn) | 0}px)`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx * (1 + 0.7 * sn), ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.filter = 'none';
            ctx.restore();
        } else {
            // 정지: 픽셀 그레인 — 중심 진하고 가장자리 깨지며 사라짐
            const a0 = Math.min(1, this._idleT / 0.5);
            if (a0 <= 0.02) return;
            const G = 3;
            ctx.save();
            ctx.fillStyle = '#000';
            for (let dy = -ry; dy <= ry; dy += G) {
                for (let dx = -Math.ceil(rx); dx <= rx; dx += G) {
                    const nx = dx / rx, ny = dy / ry;
                    const dist = nx * nx + ny * ny;
                    if (dist > 1) continue;
                    const dens = 1 - dist;                          // 중심 1 ~ 가장자리 0
                    if (sandHash((dx / G) | 0, (dy / G) | 0) > dens) continue;  // 가장자리 깨짐
                    ctx.globalAlpha = 0.5 * a0;
                    ctx.fillRect((cx + dx) | 0, (cy + dy) | 0, G, G);
                }
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    _drawIdleParticles(ctx) {
        for (const q of this._idleParticles) {
            const a = Math.max(0, 1 - q.age / q.maxlife) * 0.7;
            if (a <= 0.02) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${q.r},${q.g},${q.b})`;
            ctx.fillRect(q.x | 0, q.y | 0, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 뒤로 모래 트레일 — 진행 반대 방향으로 옅어지는 입자 (모션블러 + 모래에서 밀려나옴)
    _renderCharTrail(ctx, l2, W, H) {
        const speedNorm = Math.min(1, this._sandSpeed / MOVE_SPEED);
        if (speedNorm < 0.05) return;
        const dir  = this._sandDir;                  // +1 오른쪽 → 트레일은 왼쪽(-dir)
        const N    = Math.round(3 + 5 * speedNorm);  // 속도↑ → 트레일 길게
        const STEP = 4 + 8 * speedNorm;              // 잔상 간격
        const G    = 3;                              // 모래 입자
        const img  = l2.getContext('2d').getImageData(0, 0, W, H).data;
        for (let k = N; k >= 1; k--) {               // 뒤(옅음) → 앞(진함)
            const ox  = -dir * Math.round(k * STEP);
            const cov = (1 - k / (N + 1)) * speedNorm; // 뒤로 갈수록 입자 듬성
            const a   = cov * 0.85;
            if (a <= 0.02) continue;
            ctx.globalAlpha = a;
            for (let y = 0; y < H; y += G) {
                for (let x = 0; x < W; x += G) {
                    const i = (y * W + x) << 2;
                    if (img[i + 3] < 16) continue;             // 캐릭터 픽셀만
                    if (sandHash(x / G + k * 13, y / G) > cov) continue;
                    ctx.fillStyle = `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`;
                    ctx.fillRect(x + ox, y, G, G);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    // 그 변에 더 펼쳐질 월드가 있는지 (좌우만 — 위/아래는 월드 없음)
    _edgeActive(side) {
        const e = this.engine;
        const maxCam = Math.max(0, WORLD_WIDTH - e.gameWidth);
        const cam = e.cameraX;
        if (side === 'left')  return cam > 1;            // 왼쪽에 더 보여줄 월드 있음
        if (side === 'right') return cam < maxCam - 1;   // 오른쪽에 더 있음
        return false;
    }

    // 좌/우 가장자리만 픽셀 침식 (위·아래 없음). 월드가 더 있는 변에서만.
    _renderEdgeFrame(ctx, W, H) {
        const inten   = this._sandI;
        const FRAME   = Math.round(3 + 3 * inten);   // 절반: 기본 3px, 이동 시 최대 6px
        const G       = 3;
        const NT      = SAND_TONES_RGB.length;
        const leftOn  = this._edgeActive('left');
        const rightOn = this._edgeActive('right');
        if (!leftOn && !rightOn) return;
        ctx.save();
        for (let y = 0; y < H; y += G) {
            for (let x = 0; x < W; x += G) {
                let d, active;
                if (x < FRAME)            { d = x;          active = leftOn; }
                else if (x >= W - FRAME)  { d = W - 1 - x;  active = rightOn; }
                else continue;                           // 중앙·상하 제외
                if (!active) continue;
                let t = d / FRAME; t = t * t * (3 - 2 * t);
                if (sandHash(x / G, y / G) < (1 - t)) {   // 가장자리일수록 잘 깨짐 → 검정
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x, y, G, G);
                }
            }
        }
        ctx.restore();
    }

    // ── SandScroll: 진행 방향 가장자리에서 배경이 모래로 생성/소멸 ──────
    _renderSandScroll(ctx, W, H) {
        const engine = this.engine;
        const band = Math.round(W * SAND_BAND_MAX * this._sandRamp);  // 빌드업(걷기2초/달리기즉시)
        if (band < 2) return;

        const L1 = engine.layers.getCanvas(1);
        if (!L1) return;
        const lctx = L1.getContext('2d');
        const cam  = Math.floor(engine.cameraX);

        ctx.globalAlpha = 1;
        // 진행 방향 = 선행(생성) / 반대 = 후행(소멸). 단, 그쪽에 월드가 더 있을 때만.
        const dir = this._sandDir;
        const leftRole  = dir > 0 ? 'trail' : 'lead';
        const rightRole = dir > 0 ? 'lead'  : 'trail';
        if (this._edgeActive('left'))  this._sandBand(ctx, lctx, cam, 0,        band, H, 'left',  leftRole);
        if (this._edgeActive('right')) this._sandBand(ctx, lctx, cam, W - band, band, H, 'right', rightRole);
    }

    // 가장자리에서 이미지가 "검은 픽셀"로 갉아먹히며 생성/소멸 (검정만, 모래색 없음)
    // side: 'left'|'right' / role: 'lead'(생성=빨리 채워짐) | 'trail'(소멸=검정 많이)
    _sandBand(ctx, lctx, cam, x0, bw, H, side, role) {
        let sx = cam + x0;
        if (sx < 0) sx = 0;
        const src = lctx.getImageData(sx, 0, bw, H);
        const out = ctx.createImageData(bw, H);
        const od  = out.data;
        od.set(src.data);                                // 이미지 그대로 복사
        const bwm = bw - 1;
        const G   = SAND_GRAIN;
        const isLead = role === 'lead';
        const NT = SAND_TONES_RGB.length;
        const sd = src.data;                              // 원본 이미지 픽셀

        for (let ly = 0; ly < H; ly += G) {
            for (let lx = 0; lx < bw; lx += G) {
                const distOuter = (side === 'left') ? lx : (bwm - lx);
                let f = bwm > 0 ? distOuter / bwm : 1;
                f = f * f * (3 - 2 * f);                  // 0=바깥(가장자리), 1=안쪽(화면)
                const wcx = ((sx + lx) / G) | 0, wcy = (ly / G) | 0;
                const h   = sandHash(wcx, wcy);
                // 셀마다 임계가 달라 순차 생성. 선행(생성)=바깥부터 빨리 / 후행(소멸)=늦게까지 모래.
                // thr 범위 0~0.7 → f=1(안쪽)에서 모든 셀이 완성되어 화면과 이음새 없음.
                const thr = isLead ? (h * 0.5) : (0.2 + h * 0.5);
                let rev = (f - thr) / 0.30;               // 모래(0) → 이미지(1) 연속 블렌드
                rev = rev <= 0 ? 0 : rev >= 1 ? 1 : rev * rev * (3 - 2 * rev);
                if (rev >= 0.999) continue;               // 완전 이미지 → 원본 그대로
                // 모래 매질: 어두운 따뜻한 톤 + 14% 밝은 모래알 → 이미지가 모래에서 솟아오름
                let mr = 14, mg = 12, mb = 9;
                if (sandHash(wcx + 41, wcy + 23) < 0.14) {
                    const tc = SAND_TONES_RGB[(sandHash(wcx + 5, wcy + 9) * NT) | 0];
                    mr = (tc[0] * 0.55) | 0; mg = (tc[1] * 0.55) | 0; mb = (tc[2] * 0.55) | 0;
                }
                for (let dy = 0; dy < G && ly + dy < H; dy++) {
                    const rowBase = (ly + dy) * bw;
                    for (let dx = 0; dx < G && lx + dx < bw; dx++) {
                        const oi = (rowBase + lx + dx) << 2;
                        od[oi]     = (mr + (sd[oi]     - mr) * rev) | 0;
                        od[oi + 1] = (mg + (sd[oi + 1] - mg) * rev) | 0;
                        od[oi + 2] = (mb + (sd[oi + 2] - mb) * rev) | 0;
                        od[oi + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(out, x0, 0);
    }

    // ── Convergence 픽셀 수렴/방산 (SceneManager 로직 이식) ──────────
    _drawConvergence(ctx, W, H, t) {
        if (t < 0.5) {
            if (!this._tr._pxOut) this._tr._pxOut = this._capturePx(ctx, W, H, 'in');
            this._renderPx(ctx, W, H, this._tr._pxOut, t * 2, 'in');   // 수렴
        } else {
            if (!this._tr._pxIn) this._tr._pxIn = this._capturePx(ctx, W, H, 'out');
            this._renderPx(ctx, W, H, this._tr._pxIn, (t - 0.5) * 2, 'out'); // 방산
        }
    }

    _capturePx(ctx, W, H, dir) {
        const cx = W * 0.5, cy = H * 0.5;
        const data = ctx.getImageData(0, 0, W, H).data;
        const STRIDE = Math.max(2, Math.round(Math.sqrt(W * H / 10000)));
        const particles = [];
        for (let y = 0; y < H; y += STRIDE) {
            for (let x = 0; x < W; x += STRIDE) {
                const i = (y * W + x) * 4;
                if (data[i + 3] < 8) continue;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if (r === 0 && g === 0 && b === 0 && Math.random() < 0.6) continue;
                const delay = Math.random() * 0.35;
                if (dir === 'in') particles.push({ sx: x, sy: y, ex: cx, ey: cy, r, g, b, delay });
                else              particles.push({ sx: cx, sy: cy, ex: x, ey: y, r, g, b, delay });
            }
        }
        return { particles, STRIDE };
    }

    _renderPx(ctx, W, H, pxData, t, dir) {
        if (!pxData._buf) pxData._buf = ctx.createImageData(W, H);
        const buf = pxData._buf.data;
        buf.fill(0);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        const S = pxData.STRIDE;
        for (const p of pxData.particles) {
            const lt = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
            const eased = dir === 'in' ? (lt * lt * lt) : (1 - Math.pow(1 - lt, 3));
            const px = Math.round(p.sx + (p.ex - p.sx) * eased);
            const py = Math.round(p.sy + (p.ey - p.sy) * eased);
            for (let dy = 0; dy < S; dy++) {
                for (let dx = 0; dx < S; dx++) {
                    const bx = px + dx, by = py + dy;
                    if (bx < 0 || bx >= W || by < 0 || by >= H) continue;
                    const bi = (by * W + bx) * 4;
                    buf[bi] = p.r; buf[bi + 1] = p.g; buf[bi + 2] = p.b; buf[bi + 3] = 255;
                }
            }
        }
        ctx.putImageData(pxData._buf, 0, 0);
    }

    _ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    onExit() {
        this.engine.lighting.clearLights();
    }
}
