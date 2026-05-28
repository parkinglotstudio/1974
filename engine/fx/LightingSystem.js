/**
 * Sand Engine — LightingSystem v1.0
 * (2026-05-27)
 *
 * 포인트 라이트 + 앰비언트 조명 시뮬레이션.
 * 어두운 오버레이 위에 라이트 소스마다 radial gradient 구멍을 뚫어
 * 조명 영역만 밝게 표현. Canvas multiply 블렌드 사용.
 *
 * 동작 원리:
 *   1. darkness 캔버스: 씬 전체를 어두운 색으로 채움 (ambient)
 *   2. 각 포인트 라이트 위치에 radial gradient (투명 → 어두움)로 구멍
 *   3. globalCompositeOperation = 'multiply' 로 메인 캔버스에 합성
 *      (multiply = 어두운 영역만 씬을 어둡게 만듦)
 *
 * 사용법:
 *   engine.lighting.setAmbient(0.6, '#1c2e50');   // 60% 어둠, 밤하늘 색
 *   engine.lighting.addLight({
 *       id: 'street_lamp_1',
 *       x: 200, y: 300,
 *       radius: 180, color: '#e8a850', intensity: 0.9
 *   });
 *   engine.lighting.removeLight('street_lamp_1');
 *   engine.lighting.clearLights();
 *
 *   // 동적 깜빡임
 *   engine.lighting.flickerLight('street_lamp_1', { speed: 3, amplitude: 0.15 });
 */

export default class LightingSystem {
    /**
     * @param {number} viewWidth
     * @param {number} viewHeight
     */
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        this._enabled       = true;
        this._ambientDark   = 0.0;          // 0 = 완전 밝음, 1 = 완전 어둠
        this._ambientColor  = '#000820';    // 어둠 색상
        this._lights        = new Map();    // id → LightDef
        this._flickerState  = new Map();    // id → { speed, amplitude, t }

        this._offscreen     = null;
        this._offCtx        = null;
        this._dirty         = true;         // 라이트 변경 시 재생성 필요

        this._initOffscreen();
    }

    _initOffscreen() {
        this._offscreen        = document.createElement('canvas');
        this._offscreen.width  = this._vw;
        this._offscreen.height = this._vh;
        this._offCtx           = this._offscreen.getContext('2d');
    }

    // ── 설정 ─────────────────────────────────────────────────────────

    enable()  { this._enabled = true; }
    disable() { this._enabled = false; }

    /**
     * 앰비언트(주변) 조명 설정.
     * @param {number} darkness  0(없음) ~ 1(완전 어둠)
     * @param {string} [color]   어둠 색상 hex (기본: 밤하늘 남색)
     */
    setAmbient(darkness, color = '#000820') {
        this._ambientDark  = Math.max(0, Math.min(1, darkness));
        this._ambientColor = color;
        this._dirty = true;
    }

    /**
     * 포인트 라이트 추가/갱신.
     * @param {object}  light
     * @param {string}  light.id         고유 식별자
     * @param {number}  light.x          월드 X (Layer 2 기준)
     * @param {number}  light.y          월드 Y
     * @param {number}  light.radius     빛 반지름 (픽셀)
     * @param {string}  [light.color]    빛 색상 (기본: 따뜻한 노란빛)
     * @param {number}  [light.intensity] 빛 강도 0~1 (기본: 1.0)
     * @param {boolean} [light.fixed]    true = 스크린 좌표 (UI 오버레이용)
     */
    addLight({ id, x, y, radius, color = '#e8a850', intensity = 1.0, fixed = false }) {
        this._lights.set(id, { id, x, y, radius, color, intensity, fixed });
        this._dirty = true;
    }

    removeLight(id) {
        this._lights.delete(id);
        this._flickerState.delete(id);
        this._dirty = true;
    }

    updateLight(id, props) {
        const l = this._lights.get(id);
        if (l) {
            Object.assign(l, props);
            this._dirty = true;
        }
    }

    clearLights() {
        this._lights.clear();
        this._flickerState.clear();
        this._dirty = true;
    }

    /**
     * 깜빡임 효과 등록.
     * @param {string} id
     * @param {object} opts
     * @param {number} [opts.speed=2]       주기 (Hz)
     * @param {number} [opts.amplitude=0.1] 강도 진폭 (±)
     * @param {number} [opts.radiusAmp=0]   반지름 진폭 (±픽셀)
     */
    flickerLight(id, { speed = 2, amplitude = 0.1, radiusAmp = 0 } = {}) {
        this._flickerState.set(id, { speed, amplitude, radiusAmp, t: 0 });
    }

    stopFlicker(id) { this._flickerState.delete(id); }

    /**
     * 씬 프리셋 적용.
     *   'day'     — 낮 (조명 없음)
     *   'dusk'    — 해질녘
     *   'night'   — 밤
     *   'rain'    — 비오는 밤
     */
    setScenePreset(name) {
        this.clearLights();
        switch (name) {
            case 'day':
                this.setAmbient(0.0);
                break;
            case 'dusk':
                this.setAmbient(0.35, '#3a2810');
                break;
            case 'night':
                this.setAmbient(0.65, '#0a1020');
                break;
            case 'rain':
                this.setAmbient(0.55, '#081828');
                break;
        }
        this._dirty = true;
    }

    // ── 업데이트 ─────────────────────────────────────────────────────

    /**
     * 깜빡임 상태 업데이트.
     * @param {number} dt  밀리초
     */
    update(dt) {
        if (!this._flickerState.size) return;
        const dtSec = dt / 1000;
        for (const [id, state] of this._flickerState) {
            state.t += dtSec;
            const light = this._lights.get(id);
            if (!light) continue;
            // sin 기반 깜빡임 — 원래 값 기준
            const base = light._baseIntensity ?? light.intensity;
            light._baseIntensity  = base;
            const noise  = state.amplitude * Math.sin(2 * Math.PI * state.speed * state.t);
            const noise2 = state.amplitude * 0.5 * Math.sin(2 * Math.PI * state.speed * 2.7 * state.t);
            light.intensity = Math.max(0, Math.min(1, base + noise + noise2));

            if (state.radiusAmp > 0) {
                const baseR  = light._baseRadius ?? light.radius;
                light._baseRadius = baseR;
                light.radius = baseR + Math.round(state.radiusAmp * Math.sin(2 * Math.PI * state.speed * 0.9 * state.t));
            }

            this._dirty = true;
        }
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * 메인 캔버스 위에 조명 오버레이 합성.
     * @param {HTMLCanvasElement} mainCanvas
     * @param {number}            cameraX
     */
    render(mainCanvas, cameraX = 0) {
        if (!this._enabled) return;
        if (this._ambientDark <= 0 && !this._lights.size) return;

        const ctx = this._offCtx;
        const W   = this._vw;
        const H   = this._vh;

        // 어둠 기본 레이어
        ctx.clearRect(0, 0, W, H);
        if (this._ambientDark > 0) {
            ctx.globalAlpha     = this._ambientDark;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle       = this._ambientColor;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha     = 1;
        }

        // 각 포인트 라이트 — 구멍 뚫기 (destination-out)
        for (const light of this._lights.values()) {
            // 스크린 좌표 계산
            const sx = light.fixed ? light.x : light.x - cameraX;
            const sy = light.y;

            const r   = Math.max(1, light.radius);
            const alp = light.intensity * this._ambientDark;
            if (alp <= 0) continue;

            // 라이트 색상 gradient (빛 색으로 칠한 후 어둠을 지움)
            // 방법: 어둠 레이어에 destination-out으로 반투명 원 그리기
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0,   `rgba(0,0,0,${alp.toFixed(3)})`);
            grad.addColorStop(0.5, `rgba(0,0,0,${(alp * 0.6).toFixed(3)})`);
            grad.addColorStop(1,   'rgba(0,0,0,0)');

            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 빛 색상 tint (선택) — 램프 색을 씬에 더하기
            const lightColor = light.color;
            if (lightColor && lightColor !== '#ffffff') {
                const tintGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.7);
                tintGrad.addColorStop(0,   lightColor + '40');
                tintGrad.addColorStop(1,   lightColor + '00');
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = tintGrad;
                ctx.beginPath();
                ctx.arc(sx, sy, r * 0.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // 메인 캔버스에 multiply 합성
        const mainCtx = mainCanvas.getContext('2d');
        mainCtx.save();
        mainCtx.globalCompositeOperation = 'multiply';
        mainCtx.drawImage(this._offscreen, 0, 0);
        mainCtx.restore();

        this._dirty = false;
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
        if (this._offscreen) {
            this._offscreen.width  = viewWidth;
            this._offscreen.height = viewHeight;
        }
        this._dirty = true;
    }
}
