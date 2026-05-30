import { Scene } from '../../../engine/scene/SceneManager.js';

const MOVE_SPEED  = 440;   // px/sec
const WORLD_WIDTH = 2560;
const GROUND_Y    = 490;

// ── 배경 순환 ───────────────────────────────────────────────────────
const BG_LIST     = ['bg_1', 'bg_2', 'bg_3', 'bg_4'];
const BG_PID      = '1974';
const BG_INTERVAL = 10000;  // 10초마다 다음 배경
const BG_TRANS_MS = 2000;   // 전환 시간 (2초)
const CYCLE_ENABLED = false; // 자동 배경 순환 ON/OFF (현재 OFF — 새 효과 개발용)

// 전환 효과를 차례대로 순환
const FX_LIST     = ['palette_flash', 'slide_left', 'convergence'];

// ── SandScroll (모래 생성/소멸 스크롤) 프로토타입 파라미터 ───────────
const SAND_ENABLED   = true;
const SAND_BAND      = 0.22;  // 가장자리 띠 폭 (화면 비율) — 해상도 단계가 보이게
const SAND_SETTLE_MS = 280;   // 멈출 때 굳는 시간

// 픽셀화 해상도 단계: 바깥(미완성)=큰 블록 → 안쪽(완성)=실제 그림
// f(생성 진행도 0~1) → 블록 크기(px)
function sandBlockSize(f) {
    if (f >= 0.95) return 1;   // 실제 그림
    if (f >= 0.72) return 2;
    if (f >= 0.50) return 4;
    if (f >= 0.28) return 8;
    return 16;                 // 가장 큰 픽셀(모자이크)
}

export default class GolmokGame extends Scene {
    constructor() {
        super('golmok_main');
        this._player  = null;

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
    }

    onEnter(engine) {
        engine.bounds.setSceneBounds(WORLD_WIDTH, engine.gameHeight);

        // 조명/연출 OFF
        engine.lighting.setAmbient(0);
        engine.lighting.clearLights();
        engine.glow.disable();
        engine.rim.disable();
        engine.fog.disable();
        engine.vignette.setPreset('none');

        this._player = engine.entities.get('player');
        this._preload();
    }

    async _preload() {
        for (const name of BG_LIST) {
            try {
                const r = await fetch(`/projects/${BG_PID}/pixels/backgrounds/${name}.json`, { cache: 'no-store' });
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

        // 이동
        let dx = 0;
        if (input.isDown('left'))  dx = -MOVE_SPEED;
        if (input.isDown('right')) dx =  MOVE_SPEED;
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
        if (Math.abs(camDelta) > 0.05) {
            this._sandDir = camDelta > 0 ? 1 : -1;
            this._sandI   = 1;
        } else {
            this._sandI = Math.max(0, this._sandI - dt / SAND_SETTLE_MS);
        }

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
            }
            overlay = true;
        } else if (SAND_ENABLED && this._sandI > 0.01) {
            this._renderSandScroll(ctx, W, H);
            overlay = true;
        }

        // 캐릭터(L2)는 효과에 안 먹히도록 오버레이 위에 다시 그림 (항상 최상단)
        if (overlay) {
            const l2 = this.engine.layers.getCanvas(2);
            if (l2) ctx.drawImage(l2, 0, 0, W, H, 0, 0, W, H);
        }
    }

    // ── SandScroll: 진행 방향 가장자리에서 배경이 모래로 생성/소멸 ──────
    _renderSandScroll(ctx, W, H) {
        const engine = this.engine;
        const inten  = this._sandI;
        const band   = Math.round(W * SAND_BAND * inten);
        if (band < 2) return;

        const L1 = engine.layers.getCanvas(1);
        if (!L1) return;
        const lctx = L1.getContext('2d');
        const cam  = Math.floor(engine.cameraX);   // parallax 1.0 → L1 x = cam + screenX

        ctx.globalAlpha = 1;
        // 양쪽 가장자리 모두 처리 (둘 다 바깥쪽이 모래, 안쪽이 완성 그림)
        this._sandBand(ctx, lctx, cam, 0,        band, H, 'left');
        this._sandBand(ctx, lctx, cam, W - band, band, H, 'right');
    }

    _sandBand(ctx, lctx, cam, x0, bw, H, side) {
        let sx = cam + x0;
        if (sx < 0) sx = 0;
        const src = lctx.getImageData(sx, 0, bw, H);
        const sd  = src.data;
        const out = ctx.createImageData(bw, H);
        const od  = out.data;
        const bwm = bw - 1;

        for (let ly = 0; ly < H; ly++) {
            for (let lx = 0; lx < bw; lx++) {
                // 바깥 가장자리 거리 → 생성 진행도 f (0=큰 픽셀, 1=완성 그림)
                const distOuter = (side === 'left') ? lx : (bwm - lx);
                let f = bwm > 0 ? distOuter / bwm : 1;
                f = f * f * (3 - 2 * f);            // smoothstep
                const bs = sandBlockSize(f);        // 블록 크기 16→8→4→2→1

                // 월드 고정 블록 그리드에서 샘플 (스크롤해도 깜빡임 없이 콘텐츠가 통과)
                const wx = sx + lx;
                let blx = (Math.floor(wx / bs) * bs) - sx;
                if (blx < 0) blx = 0; else if (blx >= bw) blx = bw - 1;
                let bly = Math.floor(ly / bs) * bs;
                if (bly >= H) bly = H - 1;

                const si = (bly * bw + blx) << 2;
                const oi = (ly  * bw + lx ) << 2;
                od[oi]     = sd[si];
                od[oi + 1] = sd[si + 1];
                od[oi + 2] = sd[si + 2];
                od[oi + 3] = sd[si + 3];
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
