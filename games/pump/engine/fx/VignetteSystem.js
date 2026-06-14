/**
 * Sand Engine — VignetteSystem v1.0
 * (2026-05-27)
 *
 * 화면 가장자리를 어둡게 하는 비네트 효과.
 * 영화적 분위기, 집중도 향상, 시선 중앙 유도.
 *
 * 사용법:
 *   engine.vignette.setStrength(0.6);     // 비네트 강도 0~1
 *   engine.vignette.setColor('#000000');  // 비네트 색 (기본: 검정)
 *   engine.vignette.setShape('oval');     // 'oval' | 'rect'
 *   engine.vignette.setPreset('cinema');  // 프리셋
 *
 * 프리셋:
 *   'none'     — 비네트 없음
 *   'soft'     — 부드러운 (강도 0.4)
 *   'cinema'   — 영화 스타일 (강도 0.65, 검정)
 *   'warm'     — 따뜻한 색조 비네트 (강도 0.5, 어두운 앰버)
 *   'cold'     — 차가운 색조 비네트 (강도 0.5, 어두운 남색)
 *   'horror'   — 공포 (강도 0.8, 붉은 기운)
 */

export default class VignetteSystem {
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw       = viewWidth;
        this._vh       = viewHeight;

        this._enabled  = true;
        this._strength = 0.5;       // 0~1
        this._color    = '#000000';
        this._shape    = 'oval';    // 'oval' | 'rect'

        // 내부 캐시 — 강도/색/크기가 바뀔 때만 재생성
        this._cache    = null;       // 마지막으로 적용한 설정 키
        this._offscreen = null;
        this._offCtx    = null;
        this._initOffscreen();
    }

    _initOffscreen() {
        this._offscreen        = document.createElement('canvas');
        this._offscreen.width  = this._vw;
        this._offscreen.height = this._vh;
        this._offCtx           = this._offscreen.getContext('2d');
        this._cache            = null;
    }

    // ── 설정 ─────────────────────────────────────────────────────────

    enable()  { this._enabled = true; }
    disable() { this._enabled = false; }

    /** 비네트 강도 0(없음) ~ 1(강함) */
    setStrength(v) { this._strength = Math.max(0, Math.min(1, v)); this._cache = null; }

    /** 비네트 색상 hex */
    setColor(hex) { this._color = hex; this._cache = null; }

    /** 비네트 모양 'oval' | 'rect' */
    setShape(shape) { this._shape = shape; this._cache = null; }

    /**
     * 비네트 프리셋
     */
    setPreset(name) {
        switch (name) {
            case 'none':    this._enabled = false; break;
            case 'soft':    this._enabled = true; this._strength = 0.40; this._color = '#000000'; this._shape = 'oval'; break;
            case 'cinema':  this._enabled = true; this._strength = 0.65; this._color = '#000000'; this._shape = 'oval'; break;
            case 'warm':    this._enabled = true; this._strength = 0.50; this._color = '#2a1200'; this._shape = 'oval'; break;
            case 'cold':    this._enabled = true; this._strength = 0.50; this._color = '#001428'; this._shape = 'oval'; break;
            case 'horror':  this._enabled = true; this._strength = 0.80; this._color = '#1a0000'; this._shape = 'oval'; break;
        }
        this._cache = null;
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * 메인 캔버스 위에 비네트 오버레이 합성.
     * @param {HTMLCanvasElement} mainCanvas
     */
    render(mainCanvas) {
        if (!this._enabled || this._strength <= 0) return;

        const cacheKey = `${this._strength}_${this._color}_${this._shape}_${this._vw}_${this._vh}`;
        if (this._cache !== cacheKey) {
            this._buildVignette();
            this._cache = cacheKey;
        }

        const ctx = mainCanvas.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(this._offscreen, 0, 0);
        ctx.restore();
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    _buildVignette() {
        const ctx    = this._offCtx;
        const W      = this._vw;
        const H      = this._vh;
        const cx     = W / 2;
        const cy     = H / 2;

        ctx.clearRect(0, 0, W, H);

        // 흰색 배경 (multiply에서 1=투명 효과)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // 비네트 gradient
        let grad;
        if (this._shape === 'oval') {
            // 타원형 — 화면 비율에 맞게 scale
            const rx = W * 0.7;
            const ry = H * 0.6;
            const r  = Math.max(rx, ry);
            grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        } else {
            // 직사각형 코너 — 대각선 거리 기준
            const r = Math.sqrt(cx * cx + cy * cy);
            grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        }

        // 중심: 흰색(영향 없음) → 가장자리: 비네트 색
        grad.addColorStop(0,                     '#ffffffff');
        grad.addColorStop(1 - this._strength * 0.6, '#ffffffff');
        grad.addColorStop(1,                     this._color + 'ff');

        ctx.save();
        if (this._shape === 'oval') {
            // 타원 클립
            ctx.scale(1, H / W);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy * (W / H), W * 0.85, 0, Math.PI * 2);
            ctx.restore();
            ctx.save();
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
        this._offscreen.width  = viewWidth;
        this._offscreen.height = viewHeight;
        this._cache = null;
    }
}
