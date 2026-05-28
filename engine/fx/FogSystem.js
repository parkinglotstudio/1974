/**
 * Sand Engine — FogSystem v1.0
 * (2026-05-27)
 *
 * 팔레트 인덱스 12 (fog) 픽셀에 반투명 안개 효과 적용.
 * 씬 전체에 레이어별 안개 농도 그라데이션도 지원.
 *
 * 두 가지 모드:
 *   [pixel]  — pixels.json 에서 idx=12 픽셀을 안개로 렌더 (반투명 흰색/회색)
 *   [layer]  — 씬 하단 or 전체에 안개 그라데이션 오버레이
 *
 * 사용법:
 *   engine.fog.setColor('#c8b090');        // 안개 색 (기본: 저녁 골목 회베이지)
 *   engine.fog.setOpacity(0.4);            // 픽셀 안개 불투명도
 *   engine.fog.enableLayerFog({            // 레이어 안개 그라데이션
 *       startY: 700, endY: 960,
 *       color: '#b8d8e8', maxOpacity: 0.5
 *   });
 *   engine.fog.setPreset('morning_mist');  // 프리셋
 *
 * 프리셋:
 *   'none'          — 안개 없음
 *   'morning_mist'  — 새벽 안개 (차가운 흰빛, 하단)
 *   'evening_haze'  — 저녁 황혼 안개 (따뜻한 앰버, 전체)
 *   'rain_fog'      — 빗속 안개 (차가운 회청, 짙게)
 *   'smoke'         — 연기 (회색, 퍼짐)
 */

export default class FogSystem {
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        this._enabled       = true;

        // ── 픽셀 안개 설정 (idx=12) ──────────────────────────────────
        this._pixelFog      = true;
        this._fogColor      = '#c8c0b0';  // 안개 색 (CH.01 골목 분위기)
        this._fogOpacity    = 0.45;       // 픽셀 안개 불투명도
        this._fogIndices    = new Set([12]); // 안개로 처리할 팔레트 인덱스

        // ── 레이어 안개 그라데이션 ────────────────────────────────────
        this._layerFog      = false;
        this._layerFogOpts  = {
            startY:     600,
            endY:       960,
            color:      '#c8c0b0',
            maxOpacity: 0.4,
            direction:  'bottom',  // 'bottom' | 'top' | 'full'
        };

        // ── 오프스크린 캔버스 ─────────────────────────────────────────
        this._offscreen = null;
        this._offCtx    = null;
        this._gradCache = null;   // 레이어 안개 gradient 캐시
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

    /** 픽셀 안개 색상 */
    setColor(hex) { this._fogColor = hex; this._gradCache = null; }

    /** 픽셀 안개 불투명도 0~1 */
    setOpacity(v) { this._fogOpacity = Math.max(0, Math.min(1, v)); }

    /**
     * 레이어 안개 그라데이션 활성화
     * @param {object} opts
     * @param {number}  [opts.startY=600]     그라데이션 시작 Y
     * @param {number}  [opts.endY=960]       그라데이션 끝 Y
     * @param {string}  [opts.color]          안개 색상 (기본: _fogColor)
     * @param {number}  [opts.maxOpacity=0.4] 최대 불투명도
     * @param {string}  [opts.direction='bottom'] 'bottom'|'top'|'full'
     */
    enableLayerFog(opts = {}) {
        this._layerFog = true;
        Object.assign(this._layerFogOpts, opts);
        if (!this._layerFogOpts.color) this._layerFogOpts.color = this._fogColor;
        this._gradCache = null;
    }

    disableLayerFog() { this._layerFog = false; }

    /**
     * 안개 프리셋
     */
    setPreset(name) {
        switch (name) {
            case 'none':
                this._enabled = false;
                break;
            case 'morning_mist':
                this._enabled    = true;
                this._fogColor   = '#d8e8f0';
                this._fogOpacity = 0.5;
                this.enableLayerFog({ startY: 500, endY: 960, color: '#c0d8e8', maxOpacity: 0.45, direction: 'bottom' });
                break;
            case 'evening_haze':
                this._enabled    = true;
                this._fogColor   = '#c89060';
                this._fogOpacity = 0.4;
                this.enableLayerFog({ startY: 400, endY: 960, color: '#c87840', maxOpacity: 0.35, direction: 'bottom' });
                break;
            case 'rain_fog':
                this._enabled    = true;
                this._fogColor   = '#8090a0';
                this._fogOpacity = 0.6;
                this.enableLayerFog({ startY: 300, endY: 960, color: '#708090', maxOpacity: 0.55, direction: 'bottom' });
                break;
            case 'smoke':
                this._enabled    = true;
                this._fogColor   = '#909090';
                this._fogOpacity = 0.5;
                this.enableLayerFog({ startY: 200, endY: 800, color: '#808080', maxOpacity: 0.4, direction: 'full' });
                break;
        }
        this._gradCache = null;
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * @param {HTMLCanvasElement} mainCanvas
     * @param {EntitySystem}      entities
     * @param {number}            cameraX
     */
    render(mainCanvas, entities, cameraX = 0) {
        if (!this._enabled) return;

        const mainCtx = mainCanvas.getContext('2d');

        // ── 픽셀 안개: idx=12 픽셀을 반투명 색으로 덮음 ─────────────
        if (this._pixelFog && entities) {
            this._renderPixelFog(mainCanvas, entities);
        }

        // ── 레이어 안개: 그라데이션 오버레이 ────────────────────────
        if (this._layerFog) {
            this._renderLayerFog(mainCtx);
        }
    }

    _renderPixelFog(mainCanvas, entities) {
        const renderer = entities.getRenderer(2);
        if (!renderer || !renderer._indexMap) return;

        const imap = renderer._indexMap;
        const W    = renderer.width;
        const H    = renderer.height;
        const ctx  = mainCanvas.getContext('2d');

        // 안개 픽셀 수집 및 그리기
        ctx.save();
        ctx.globalAlpha = this._fogOpacity;
        ctx.fillStyle   = this._fogColor;

        for (let i = 0; i < imap.length; i++) {
            if (!this._fogIndices.has(imap[i])) continue;
            const x = i % W;
            const y = Math.floor(i / W);
            ctx.fillRect(x, y, 1, 1);
        }

        ctx.restore();
    }

    _renderLayerFog(ctx) {
        const opts    = this._layerFogOpts;
        const W       = this._vw;
        const H       = this._vh;
        const color   = opts.color ?? this._fogColor;
        const maxAlph = opts.maxOpacity ?? 0.4;

        // gradient 캐시
        if (!this._gradCache) {
            let grad;
            if (opts.direction === 'bottom') {
                grad = ctx.createLinearGradient(0, opts.startY, 0, opts.endY);
                grad.addColorStop(0, color + '00');
                grad.addColorStop(1, color + Math.round(maxAlph * 255).toString(16).padStart(2, '0'));
            } else if (opts.direction === 'top') {
                grad = ctx.createLinearGradient(0, opts.startY, 0, opts.endY);
                grad.addColorStop(0, color + Math.round(maxAlph * 255).toString(16).padStart(2, '0'));
                grad.addColorStop(1, color + '00');
            } else {
                // full
                grad = ctx.createLinearGradient(0, 0, 0, H);
                grad.addColorStop(0,   color + '00');
                grad.addColorStop(0.5, color + Math.round(maxAlph * 255).toString(16).padStart(2, '0'));
                grad.addColorStop(1,   color + '00');
            }
            this._gradCache = grad;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this._gradCache;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
        if (this._offscreen) {
            this._offscreen.width  = viewWidth;
            this._offscreen.height = viewHeight;
        }
        this._gradCache = null;
    }
}
