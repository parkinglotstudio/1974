/**
 * Sand Engine — GlowSystem v1.0
 * (2026-05-27)
 *
 * 팔레트 인덱스 10 (emissive) 픽셀에 발광 효과 적용.
 * LayerSystem composite 이후, 메인 캔버스 위에 screen 블렌드로 덧그림.
 *
 * 동작 원리:
 *   1. PixelRenderer.indexMap에서 emissive(idx=10) 픽셀 좌표 수집
 *   2. 오프스크린 캔버스에 픽셀별 radial gradient 그리기
 *   3. globalCompositeOperation = 'screen' 으로 메인 캔버스 위에 합성
 *      (screen = 밝은 부분만 더해짐, 배경을 태우지 않음)
 *
 * 사용법 (SandEngine 자동 호출):
 *   // engine._render() 안에서 layers.composite() 이후 자동 실행
 *   // 수동 설정:
 *   engine.glow.setPreset('warm_lamp');     // 따뜻한 등불
 *   engine.glow.setRadius(16);             // 발광 반지름
 *   engine.glow.setIntensity(0.8);         // 발광 강도 (0~1)
 *   engine.glow.addEmissiveIndex(15, '#ff6600');  // 커스텀 발광 인덱스
 */

export default class GlowSystem {
    /**
     * @param {number} viewWidth   게임 논리 해상도 너비
     * @param {number} viewHeight  게임 논리 해상도 높이
     */
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        // 발광 설정
        this._enabled    = true;
        this._radius     = 14;    // 발광 반지름 (픽셀)
        this._intensity  = 0.75;  // 발광 강도 (0~1)

        // 배경 레이어 블룸 (밝은 부분=네온/조명 자동 발광). 정적 배경 1회 빌드.
        this._layerBloom     = true;
        this._bloomThreshold = 140;   // value(max RGB) 임계 — 색 네온도 통과 (낮춰 더 포함)
        this._bloomBlur      = 12;    // 번짐 반경(px)
        this._bloomStrength  = 0.95;  // 블룸 강도 (강하게)
        this._bloomTmp       = null;

        // 발광 인덱스 맵 { paletteIdx → hex color }
        // 기본: 인덱스 10 = 따뜻한 노란 발광
        this._emissiveMap = new Map([
            [10, '#ffd044'],
        ]);

        // 오프스크린 캔버스 (glow 레이어 전용)
        this._offscreen        = null;
        this._offCtx           = null;
        this._gradientCache    = new Map();  // `${radius}_${color}` → CanvasGradient

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

    /** 발광 반지름 (픽셀) */
    setRadius(r) { this._radius = r; this._gradientCache.clear(); }

    /** 발광 강도 0~1 */
    setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); }

    /**
     * 추가 발광 인덱스 등록
     * @param {number} paletteIdx  팔레트 인덱스 (10=기본 emissive)
     * @param {string} color       발광 색상 hex
     */
    addEmissiveIndex(paletteIdx, color) {
        this._emissiveMap.set(paletteIdx, color);
    }

    removeEmissiveIndex(paletteIdx) {
        this._emissiveMap.delete(paletteIdx);
    }

    /**
     * 발광 프리셋
     *   'warm_lamp'   — 1970년대 등불  (노란 앰버, 넓게)
     *   'neon'        — 네온 간판      (파란 청백, 좁고 강하게)
     *   'embers'      — 연탄 불씨      (붉은 주황, 좁게)
     *   'moonlight'   — 달빛           (차가운 흰빛, 매우 넓게)
     */
    setPreset(name) {
        switch (name) {
            case 'warm_lamp':
                this._emissiveMap.set(10, '#ffd044');
                this._radius    = 18;
                this._intensity = 0.7;
                break;
            case 'neon':
                this._emissiveMap.set(10, '#88ddff');
                this._radius    = 10;
                this._intensity = 0.9;
                break;
            case 'embers':
                this._emissiveMap.set(10, '#ff5500');
                this._radius    = 8;
                this._intensity = 0.85;
                break;
            case 'moonlight':
                this._emissiveMap.set(10, '#c0d8ff');
                this._radius    = 30;
                this._intensity = 0.4;
                break;
        }
        this._gradientCache.clear();
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * 메인 캔버스 위에 glow 오버레이 합성.
     * SandEngine._render() 에서 layers.composite() 직후 호출.
     *
     * @param {HTMLCanvasElement} mainCanvas  메인 합성 캔버스
     * @param {EntitySystem}      entities    EntitySystem 인스턴스
     * @param {number}            cameraX     현재 카메라 X
     */
    render(mainCanvas, entities, cameraX = 0) {
        if (!this._enabled) return;
        if (this._emissiveMap.size) this._renderL2Glow(mainCanvas, entities, cameraX);   // L2 발광(idx10)
        if (this._layerBloom)       this._renderLayerBloom(mainCanvas, entities, cameraX); // 배경 밝은부분 블룸
    }

    // L2 게임 오브젝트 발광(idx10) — 픽셀별 radial glow
    _renderL2Glow(mainCanvas, entities, cameraX) {
        const ctx = this._offCtx, W = this._vw, H = this._vh;
        ctx.clearRect(0, 0, W, H);
        const emissivePixels = this._collectEmissivePixels(entities, cameraX);
        if (!emissivePixels.length) return;
        for (const [sx, sy, idx] of emissivePixels) {
            const color = this._emissiveMap.get(idx) ?? '#ffd044';
            const grad  = this._getGradient(ctx, color);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.fillStyle = grad;
            ctx.globalAlpha = this._intensity;
            ctx.fillRect(-this._radius, -this._radius, this._radius * 2, this._radius * 2);
            ctx.restore();
        }
        const mainCtx = mainCanvas.getContext('2d');
        mainCtx.save();
        mainCtx.globalCompositeOperation = 'screen';
        mainCtx.drawImage(this._offscreen, 0, 0);
        mainCtx.restore();
    }

    // 배경(정적) 레이어의 밝은 부분 블룸 — 네온/조명. 1회 빌드 후 슬라이스 합성.
    _renderLayerBloom(mainCanvas, entities, cameraX) {
        const layers = entities && entities._layers;
        if (!layers) return;
        const W = this._vw, H = this._vh;
        const mainCtx = mainCanvas.getContext('2d');
        for (const li of [0, 1, 3]) {                 // 배경 레이어만 (L2 제외)
            const layer = layers.get(li);
            if (!layer || !layer.static || !layer.visible) continue;
            if (!layer._bloomReady) { this._buildBloom(layer); layer._bloomReady = true; }
            if (!layer._bloomBuf) continue;
            const maxSrcX = Math.max(0, layer._bloomBuf.width - W);
            const srcX = Math.min(maxSrcX, Math.max(0, Math.floor(cameraX * layer.parallax)));
            mainCtx.save();
            mainCtx.globalCompositeOperation = 'lighter';   // 가산 → 밝게 번짐
            mainCtx.globalAlpha = this._bloomStrength;
            mainCtx.drawImage(layer._bloomBuf, srcX, 0, W, H, 0, 0, W, H);
            mainCtx.restore();
        }
    }

    // 밝기 임계 통과(bright-pass) + 블러 → 블룸 버퍼 (1회)
    _buildBloom(layer) {
        const src = layer.canvas, LW = src.width, LH = src.height;
        if (!this._bloomTmp) this._bloomTmp = document.createElement('canvas');
        const tmp = this._bloomTmp; tmp.width = LW; tmp.height = LH;
        const tctx = tmp.getContext('2d');
        tctx.clearRect(0, 0, LW, LH);
        tctx.drawImage(src, 0, 0);
        const id = tctx.getImageData(0, 0, LW, LH), d = id.data, TH = this._bloomThreshold;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            // value(밝기 최댓값) 기준 → 채도 높은 빨강/핑크/파랑 네온도 통과
            const v = r > g ? (r > b ? r : b) : (g > b ? g : b);
            if (v < TH || d[i + 3] < 10) {
                d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
            } else {
                // 채도 높을수록 더 세게 부스트 → 색 네온도 흰색만큼 빛남
                const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
                const sat = v > 0 ? (v - mn) / v : 0;     // 0(무채색)~1(순색)
                const boost = 1.4 + sat * 1.2;            // 흰색 ×1.4 ~ 순색 네온 ×2.6
                d[i]     = Math.min(255, r * boost);
                d[i + 1] = Math.min(255, g * boost);
                d[i + 2] = Math.min(255, b * boost);
            }
        }
        tctx.putImageData(id, 0, 0);
        if (!layer._bloomBuf) layer._bloomBuf = document.createElement('canvas');
        layer._bloomBuf.width = LW; layer._bloomBuf.height = LH;
        const g = layer._bloomBuf.getContext('2d');
        g.clearRect(0, 0, LW, LH);
        g.filter = `blur(${this._bloomBlur}px)`;    // 한 번만 블러 → 매 프레임은 plain draw
        g.drawImage(tmp, 0, 0);
        g.filter = 'none';
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    /**
     * EntitySystem의 모든 Layer 2 렌더러에서 emissive 픽셀 좌표 수집.
     * PixelRenderer.indexMap 을 통해 팔레트 인덱스를 읽음.
     * @returns {Array<[screenX, screenY, paletteIdx]>}
     */
    _collectEmissivePixels(entities, cameraX) {
        const result = [];
        const emissiveIndices = new Set(this._emissiveMap.keys());

        // EntitySystem에서 Layer 2 렌더러의 인덱스맵 접근
        if (!entities) return result;

        const renderer = entities.getRenderer(2);
        if (!renderer || !renderer._indexMap) return result;

        const imap = renderer._indexMap;
        const W    = renderer.width;
        const H    = renderer.height;

        for (let i = 0; i < imap.length; i++) {
            const idx = imap[i];
            if (!emissiveIndices.has(idx)) continue;
            const x = i % W;
            const y = Math.floor(i / W);
            result.push([x, y, idx]);
        }

        return result;
    }

    /** radial gradient 캐시 (translate 기준 중심 (0,0)) */
    _getGradient(ctx, color) {
        const key = `${this._radius}_${color}`;
        if (this._gradientCache.has(key)) return this._gradientCache.get(key);

        const r    = this._radius;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0,   color + 'ff');   // 중심: 불투명
        grad.addColorStop(0.4, color + 'aa');
        grad.addColorStop(1,   color + '00');   // 가장자리: 투명
        this._gradientCache.set(key, grad);
        return grad;
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
        if (this._offscreen) {
            this._offscreen.width  = viewWidth;
            this._offscreen.height = viewHeight;
        }
        this._gradientCache.clear();
    }
}
