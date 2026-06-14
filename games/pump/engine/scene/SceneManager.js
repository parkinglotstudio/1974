/**
 * Sand Engine — SceneManager
 * 씬 등록 / 전환 / 생명주기 + TriggerSystem 통합.
 *
 * 전환 타입:
 *   'none'          — 즉시 전환
 *   'fade'          — 페이드 인/아웃 (검정)
 *   'dither'        — Bayer 8×8 디더 디졸브 (Scene 01~09 기본)
 *   'palette_flash' — 팔레트 순간 교체 + 화이트 플래시 (Scene 10 네온 폭발)
 *   'slide_left'    — 레이어 왼쪽 슬라이드 (챕터 전환)
 *   'convergence'   — 픽셀 수렴+방산 이펙트 (씬 종료=중앙집결 / 씬 시작=방사)
 *   'sand_top'      — 위에서부터 모래처럼 흩어지며 생겨남 (로딩/등장)
 *   'sand_sides'    — 양쪽에서 모래가 안쪽으로 튀며 생겨남
 *   'wave'          — 파도처럼 울렁이며 생겨남 (진폭 정착)
 *
 * 픽셀 전환 API:
 *   engine.scenes.transitionTo('target_scene', { effect: 'convergence', duration: 800 });
 *   engine.scenes.transitionTo('target_scene', { effect: 'convergence' }); // 기본 800ms
 *
 * TriggerSystem 통합:
 *   scenes.on('arcade_enter', () => {
 *     engine.palette_mgr.trigger('neon');
 *     scenes.change('scene_10', 'palette_flash');
 *   });
 *   scenes.trigger('arcade_enter');
 *
 * JSON 씬 설정 로드:
 *   scenes.loadConfig(scenesJSON, engine);
 *   // scenesJSON 포맷: CLAUDE.md "SceneManager 설계" 참조
 */
import TriggerSystem from './TriggerSystem.js';
import { SAND_BASE_RGB } from '../SandPalette.js';

// Bayer 8×8 내장 (dither 전환용)
const BAYER = [
    [ 0,32, 8,40, 2,34,10,42],
    [48,16,56,24,50,18,58,26],
    [12,44, 4,36,14,46, 6,38],
    [60,28,52,20,62,30,54,22],
    [ 3,35,11,43, 1,33, 9,41],
    [51,19,59,27,49,17,57,25],
    [15,47, 7,39,13,45, 5,37],
    [63,31,55,23,61,29,53,21],
];

// 모래 전환용 의사난수 0~1 (좌표 기반 결정적)
function sandNoise(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

// ── Scene 기본 클래스 ─────────────────────────────────────────────
export class Scene {
    constructor(name) {
        this.name   = name;
        this.engine = null;
    }

    onInit(engine)           {}
    onEnter(engine)          {}
    onUpdate(now, dt, input) {}
    onRender(cameraX)        {}
    onPostRender(canvas)     {}   // composite + drawOverlay 이후 메인 캔버스 위에 그리기
    onExit()                 {}
}

// ── SceneManager ─────────────────────────────────────────────────
export default class SceneManager {
    constructor(engine) {
        this._engine   = engine;
        this._scenes   = new Map();
        this._stack    = [];
        this._inited   = new Set();
        this._triggers = new TriggerSystem();

        // 전환 상태
        this._tr        = null;   // { type, duration, t, phase, next, ... }
        this._slideOff  = 0;      // slide_left 현재 오프셋 (px)
    }

    // ── TriggerSystem 위임 ────────────────────────────────────────

    // 이벤트 리스너 등록 (반환값 = 해제 함수)
    on(event, cb)      { return this._triggers.on(event, cb); }
    off(event, cb)     { this._triggers.off(event, cb); }
    once(event, cb)    { return this._triggers.once(event, cb); }
    trigger(event, data) { this._triggers.trigger(event, data); }

    // ── 씬 등록 ──────────────────────────────────────────────────

    register(name, scene) {
        scene.engine = this._engine;
        this._scenes.set(name, scene);
    }

    // JSON 씬 설정으로 씬 자동 생성 (CLAUDE.md SceneManager 설계 포맷)
    // scenesJSON: { scenes: { "scene_01": { palette, layers, bgm, transition, trigger }, ... } }
    loadConfig(scenesJSON) {
        const { scenes = {} } = scenesJSON;
        for (const [name, cfg] of Object.entries(scenes)) {
            const scene = new JsonScene(name, cfg);
            this.register(name, scene);

            // trigger 필드가 있으면 자동 이벤트 연결
            if (cfg.trigger) {
                this.on(cfg.trigger, () => {
                    const t = cfg.transition ?? 'dither';
                    this.change(name, t);
                });
            }
        }
    }

    // ── 씬 전환 ──────────────────────────────────────────────────

    // type: 'none'|'fade'|'dither'|'palette_flash'|'slide_left'|'convergence'
    change(name, type = 'none', duration = 300) {
        if (!this._scenes.has(name)) {
            console.warn(`[SceneManager] 씬 없음: "${name}"`);
            return;
        }
        if (type === 'none' || !this.current) {
            this._activate(name);
            return;
        }
        this._tr = { type, duration, t: 0, phase: 'out', next: name };
    }

    push(name, type = 'none', duration = 300) {
        if (!this._scenes.has(name)) return;
        if (type === 'none') { this._enter(name); return; }
        this._tr = { type, duration, t: 0, phase: 'out', next: name, isPush: true };
    }

    pop(type = 'none', duration = 300) {
        if (this._stack.length < 2) return;
        if (type === 'none') { this.current?.onExit(); this._stack.pop(); return; }
        this._tr = { type, duration, t: 0, phase: 'out', next: null, isPop: true };
    }

    /**
     * 픽셀 이펙트 씬 전환 (v2 API)
     * @param {string} name          — 전환할 씬 이름
     * @param {object} [options]
     * @param {string} [options.effect='convergence']  — 이펙트 타입
     * @param {number} [options.duration=800]          — 전환 시간 (ms, out+in 합산)
     *
     * 예시:
     *   engine.scenes.transitionTo('ch2', { effect: 'convergence' });
     *   engine.scenes.transitionTo('runner_game', { effect: 'convergence', duration: 1000 });
     */
    transitionTo(name, { effect = 'convergence', duration = 800 } = {}) {
        // duration은 OUT+IN 합산 (change()는 phase당 시간으로 처리)
        this.change(name, effect, Math.round(duration / 2));
    }

    /**
     * 외부 이동용 수렴 이펙트 — convergence-out 후 콜백 실행
     * 다른 URL/프로젝트로 이동할 때 사용 (in 페이즈 없음)
     *
     * @param {() => void} onComplete — convergence 완료 후 호출 (navigate 등)
     * @param {number}    [duration=400] — out 페이즈 시간 (ms)
     *
     * 예시:
     *   // ch2.html → runner 이동
     *   engine.scenes.convergeOut(() => {
     *       window.location.href = '/content/runner/index.html';
     *   }, 400);
     *
     *   // sand_engine iframe 안에서 부모에 알림
     *   engine.scenes.convergeOut(() => {
     *       window.parent.postMessage({ type: 'navigate', to: 'runner_game' }, '*');
     *   });
     */
    convergeOut(onComplete, duration = 400) {
        // 임시 더미 씬 등록 (전환용 — 실제로는 진입하지 않음)
        const DUMMY = '__converge_dummy__';
        if (!this._scenes.has(DUMMY)) {
            this._scenes.set(DUMMY, { onInit(){}, onEnter(){}, onUpdate(){}, onRender(){}, onExit(){} });
        }
        this._tr = {
            type:       'convergence',
            duration,
            t:          0,
            phase:      'out',
            next:       DUMMY,
            _onComplete: onComplete,
            _exitOnly:  true,   // in 페이즈 없이 onComplete 직행
        };
    }

    get current() { return this._stack[this._stack.length - 1] ?? null; }

    // ── 게임 루프 ─────────────────────────────────────────────────

    update(now, dt, input) {
        this._tickTransition(dt);
        this.current?.onUpdate(now, dt, input);
    }

    render(cameraX = 0) {
        this.current?.onRender(cameraX);
    }

    // drawOverlay 이후 씬이 메인 캔버스에 직접 그릴 수 있도록 위임
    postRender(canvas) {
        this.current?.onPostRender(canvas);
    }

    // layers.composite 이후 mainCanvas 위에 전환 오버레이 그리기
    drawOverlay(targetCanvas) {
        if (!this._tr) return;
        const type = this._tr.type;
        const t    = this._tr.phase === 'out' ? this._tr.t : 1 - this._tr.t;
        const ctx  = targetCanvas.getContext('2d');
        const W    = targetCanvas.width;
        const H    = targetCanvas.height;

        if (type === 'fade') {
            ctx.save();
            ctx.globalAlpha = t;
            ctx.fillStyle   = '#000';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            return;
        }

        if (type === 'dither' || type === 'dither_fade') {
            const imgData = ctx.getImageData(0, 0, W, H);
            const data    = imgData.data;
            for (let y = 0; y < H; y++) {
                const row = BAYER[y & 7];
                for (let x = 0; x < W; x++) {
                    if (row[x & 7] / 64 < t) {
                        const i = (y * W + x) << 2;
                        data[i] = data[i+1] = data[i+2] = 0;
                        data[i+3] = 255;
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return;
        }

        if (type === 'palette_flash') {
            // 화이트 플래시: out 절반은 흰색으로, in 절반은 새 씬으로 복귀
            const flash = this._tr.phase === 'out'
                ? Math.min(1, t * 2)          // 빠르게 하얗게
                : Math.max(0, 1 - t * 2);     // 빠르게 사라짐
            if (flash > 0) {
                ctx.save();
                ctx.globalAlpha = flash;
                ctx.fillStyle   = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
            return;
        }

        if (type === 'slide_left') {
            // 검정 패널이 오른쪽에서 들어와 왼쪽으로 나감
            const eased = this._ease(t);
            const panelX = this._tr.phase === 'out'
                ? W * (1 - eased)   // 오른쪽에서 진입
                : -(W * eased);     // 왼쪽으로 퇴장
            ctx.fillStyle = '#000';
            ctx.fillRect(panelX, 0, W, H);
            return;
        }

        if (type === 'convergence') {
            this._drawPxTransition(targetCanvas);
            return;
        }

        // ── 모래 생성형 전환 (로딩/등장 연출) ─────────────────────────
        // shown: 0=완전 숨김(검정) → 1=완성. (out 단계엔 1→0으로 소멸)
        if (type === 'sand_top' || type === 'sand_sides') {
            const shown = 1 - t;
            const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
            const img = ctx.getImageData(0, 0, W, H);
            const d = img.data;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const n = sandNoise(x >> 2, y >> 2);   // 4px 알갱이 노이즈
                    let thr;
                    if (type === 'sand_top') {
                        thr = (y / H) * 0.7 + n * 0.3;     // 위에서부터 생김
                    } else {
                        const dc = Math.abs(x - W * 0.5) / (W * 0.5);
                        thr = (1 - dc) * 0.7 + n * 0.3;    // 양쪽에서 안쪽으로
                    }
                    if (shown < thr) {                     // 아직 안 생긴 픽셀 → 모래 바탕색
                        const i = (y * W + x) << 2;
                        d[i] = BR; d[i + 1] = BG; d[i + 2] = BB; d[i + 3] = 255;
                    }
                }
            }
            ctx.putImageData(img, 0, 0);
            return;
        }

        if (type === 'wave') {
            const shown = 1 - t;
            const amp   = (1 - shown) * 26;                // 진행될수록 진폭 감소(정착)
            const fade  = shown;                           // 페이드 인
            const phase = this._tr.t * Math.PI * 6;        // 시간에 따라 울렁
            const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
            const src = ctx.getImageData(0, 0, W, H);
            const sd  = src.data;
            const out = ctx.createImageData(W, H);
            const od  = out.data;
            for (let y = 0; y < H; y++) {
                const dx = Math.round(Math.sin(y * 0.045 + phase) * amp);
                for (let x = 0; x < W; x++) {
                    let sxp = x - dx;
                    if (sxp < 0) sxp = 0; else if (sxp >= W) sxp = W - 1;
                    const si = (y * W + sxp) << 2;
                    const oi = (y * W + x) << 2;
                    // 모래 바탕색 → 그림색 보간 (검정 대신)
                    od[oi]     = BR + (sd[si]     - BR) * fade;
                    od[oi + 1] = BG + (sd[si + 1] - BG) * fade;
                    od[oi + 2] = BB + (sd[si + 2] - BB) * fade;
                    od[oi + 3] = 255;
                }
            }
            ctx.putImageData(out, 0, 0);
            return;
        }
    }

    // ── 내부 ─────────────────────────────────────────────────────

    _ease(t) {
        // ease-in-out cubic
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    _easeIn(t)  { return t * t * t; }           // 가속 (끝으로 갈수록 빨라짐)
    _easeOut(t) { return 1 - Math.pow(1 - t, 3); } // 감속 (끝에서 부드럽게 정착)

    // ── Convergence 픽셀 전환 ─────────────────────────────────────

    /**
     * drawOverlay에서 호출 — convergence 이펙트 전체 처리
     * OUT 첫 프레임: 현재 캔버스 픽셀 캡처 → 파티클 생성
     * IN  첫 프레임: 새 씬 캔버스 픽셀 캡처 → 파티클 생성 (역방향)
     */
    _drawPxTransition(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const t = this._tr.t;
        const phase = this._tr.phase;

        // ── OUT: 구 씬 픽셀 → 중앙으로 수렴 ───────────────────────
        if (phase === 'out') {
            if (!this._tr._pxOut) {
                this._tr._pxOut = this._capturePxParticles(canvas, 'in');
                // 'in' = 현재 위치→중앙 방향 (수렴)
            }
            const px = this._tr._pxOut;
            this._renderPxFrame(ctx, W, H, px, t, 'in');
            return;
        }

        // ── IN: 중앙→새 씬 픽셀 위치로 방산 ──────────────────────
        if (phase === 'in') {
            if (!this._tr._pxIn) {
                this._tr._pxIn = this._capturePxParticles(canvas, 'out');
                // 'out' = 중앙→현재 위치 방향 (방산)
            }
            const px = this._tr._pxIn;
            this._renderPxFrame(ctx, W, H, px, t, 'out');
        }
    }

    /**
     * 캔버스에서 픽셀 파티클 샘플링
     * @param {'in'|'out'} dir  — 'in': 수렴(출발=화면, 도착=중앙) / 'out': 방산(출발=중앙, 도착=화면)
     */
    _capturePxParticles(canvas, dir) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const cx = W * 0.5, cy = H * 0.5;
        const imgData = ctx.getImageData(0, 0, W, H);
        const data = imgData.data;

        // 화면 크기에 따라 샘플 간격 조정 (픽셀 수 ~10,000개 목표)
        const STRIDE = Math.max(2, Math.round(Math.sqrt(W * H / 10000)));

        const particles = [];
        for (let y = 0; y < H; y += STRIDE) {
            for (let x = 0; x < W; x += STRIDE) {
                const i = (y * W + x) * 4;
                const a = data[i + 3];
                if (a < 8) continue;  // 거의 투명한 픽셀 스킵

                const r = data[i], g = data[i + 1], b = data[i + 2];
                // 배경색(순수 검정) 픽셀은 일부만 포함 (희소성)
                if (r === 0 && g === 0 && b === 0 && Math.random() < 0.6) continue;

                // 각 파티클의 무작위 지연 + 속도 다양성 → 유기적 움직임
                const delay  = Math.random() * 0.35;
                const easeK  = 0.6 + Math.random() * 0.4;

                if (dir === 'in') {
                    // 수렴: 화면 위치 → 중앙
                    particles.push({ sx: x, sy: y, ex: cx, ey: cy, r, g, b, delay, easeK });
                } else {
                    // 방산: 중앙 → 화면 위치
                    particles.push({ sx: cx, sy: cy, ex: x, ey: y, r, g, b, delay, easeK });
                }
            }
        }
        return { particles, W, H, STRIDE };
    }

    /**
     * 파티클 현재 위치를 계산해 ImageData로 한 번에 그리기
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} W
     * @param {number} H
     * @param {{particles, W, H, STRIDE}} pxData
     * @param {number} t   — 0~1 진행도
     * @param {'in'|'out'} dir
     */
    _renderPxFrame(ctx, W, H, pxData, t, dir) {
        // ImageData 캐시 (매 프레임 재할당 방지)
        if (!pxData._imgBuf) pxData._imgBuf = ctx.createImageData(W, H);
        const imgData = pxData._imgBuf;
        const buf = imgData.data;

        // 검정 배경으로 초기화 (fill(0) + alpha=255 stride)
        buf.fill(0);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;

        const S = pxData.STRIDE;

        for (const p of pxData.particles) {
            // 지연 반영한 로컬 t
            const lt = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
            const eased = dir === 'in' ? this._easeIn(lt) : this._easeOut(lt);

            const px = Math.round(p.sx + (p.ex - p.sx) * eased);
            const py = Math.round(p.sy + (p.ey - p.sy) * eased);

            // STRIDE×STRIDE 블록으로 그려 픽셀 덩어리감 표현
            for (let dy = 0; dy < S; dy++) {
                for (let dx = 0; dx < S; dx++) {
                    const bx = px + dx, by = py + dy;
                    if (bx < 0 || bx >= W || by < 0 || by >= H) continue;
                    const bi = (by * W + bx) * 4;
                    buf[bi]     = p.r;
                    buf[bi + 1] = p.g;
                    buf[bi + 2] = p.b;
                    buf[bi + 3] = 255;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    _tickTransition(dt) {
        if (!this._tr) return;
        const tr = this._tr;

        // convergeOut: 마지막 프레임 렌더 후 콜백 (1프레임 지연으로 깜빡임 방지)
        if (tr._exitPending) {
            this._tr = null;
            return;
        }

        tr.t += dt / tr.duration;

        // palette_flash: 팔레트 교체는 out/in 경계에서 1회 실행
        if (tr.type === 'palette_flash' && tr.phase === 'out' && tr.t >= 0.5 && !tr._paletteSwapped) {
            tr._paletteSwapped = true;
            // 씬의 palette 설정 적용 (JsonScene 경우)
            const nextScene = this._scenes.get(tr.next);
            if (nextScene?.cfg?.palette && this._engine.palette_mgr) {
                // palette 필드가 트리거 이름이면 trigger, 아니면 swap
                this._engine.palette_mgr.trigger(nextScene.cfg.palette);
            }
        }

        if (tr.t >= 1) {
            tr.t = 1;
            if (tr.phase === 'out') {
                // convergeOut: 이번 프레임은 완전 수렴 상태로 렌더 후 다음 tick에 클리어
                if (tr._exitOnly) {
                    tr._exitPending = true;
                    tr._onComplete?.();  // 네비게이션 시작 (이번 render()는 아직 실행 전)
                    return;
                }

                if (tr.isPop) {
                    this.current?.onExit();
                    this._stack.pop();
                } else if (tr.next) {
                    if (tr.isPush) this._enter(tr.next);
                    else           this._activate(tr.next);
                }
                tr.phase = 'in';
                tr.t     = 0;
            } else {
                this._tr = null;
            }
        }
    }

    _activate(name) {
        this.current?.onExit();
        this._stack = [];
        this._enter(name);
    }

    _enter(name) {
        const scene = this._scenes.get(name);
        if (!this._inited.has(name)) {
            scene.onInit(this._engine);
            this._inited.add(name);
        }
        this._stack.push(scene);
        scene.onEnter(this._engine);
    }
}

// ── JSON 설정 기반 씬 (loadConfig 전용) ──────────────────────────
class JsonScene extends Scene {
    constructor(name, cfg) {
        super(name);
        this.cfg = cfg; // { palette, layers, bgm, transition, trigger }
    }

    onEnter(engine) {
        // 팔레트 적용
        if (this.cfg.palette && engine.palette_mgr) {
            engine.palette_mgr.trigger(this.cfg.palette);
        }
        // BGM 재생 (SoundManager 연결 후 활성화)
        // if (this.cfg.bgm && engine.sound) engine.sound.playBgm(this.cfg.bgm);
    }

    onExit() {
        // BGM 정지
        // if (this.engine?.sound) this.engine.sound.stopBgm();
    }
}
