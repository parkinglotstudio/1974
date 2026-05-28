/**
 * Sand Engine — RimLightSystem v1.0
 * (2026-05-27)
 *
 * Layer 2 엔티티의 가장자리(실루엣 경계) 픽셀에 림 라이트 효과 적용.
 * 인물·오브젝트가 배경에서 분리돼 보이게 하는 픽셀 아트 기법.
 *
 * 동작 원리:
 *   1. EntitySystem Layer 2 PixelRenderer.indexMap 스캔
 *   2. 불투명 픽셀 중 인접(상/하/좌/우) 4방향 중 하나라도 투명(=0)인 픽셀 → "엣지"
 *   3. 빛이 오는 방향(lightDir)의 반대쪽 엣지만 선택 (= 림 라이트 방향)
 *   4. 메인 캔버스에 해당 픽셀을 rim 색상으로 덧그림 (screen 블렌드)
 *
 * 사용법:
 *   engine.rim.setColor('#f8d080');       // 림 라이트 색상 (따뜻한 노란빛)
 *   engine.rim.setWidth(1);               // 엣지 두께 (픽셀, 1 또는 2)
 *   engine.rim.setLightDir('top_right');  // 빛 방향 → 반대쪽(왼쪽 하단)에 림
 *   engine.rim.setIntensity(0.6);         // 강도 0~1
 *
 * 빛 방향 옵션:
 *   'top'        — 위에서 빛 → 아래쪽 엣지에 림
 *   'top_right'  — 오른쪽 위 → 왼쪽 아래 엣지에 림
 *   'right'      — 오른쪽 → 왼쪽 엣지에 림
 *   'top_left'   — 왼쪽 위 → 오른쪽 아래 엣지에 림
 */

// 빛 방향 → 림이 생기는 오프셋 (반대 방향 가장자리에 림)
const LIGHT_DIR_OFFSETS = {
    'top':       [[ 0,  1]],                          // 빛이 위 → 아래쪽 픽셀이 림
    'bottom':    [[ 0, -1]],
    'left':      [[ 1,  0]],
    'right':     [[-1,  0]],
    'top_right': [[-1,  0], [ 0,  1], [-1,  1]],     // 빛이 오른쪽 위 → 왼쪽 + 아래 엣지
    'top_left':  [[ 1,  0], [ 0,  1], [ 1,  1]],
    'bottom_right': [[-1,  0], [ 0, -1], [-1, -1]],
    'bottom_left':  [[ 1,  0], [ 0, -1], [ 1, -1]],
};

export default class RimLightSystem {
    /**
     * @param {number} viewWidth
     * @param {number} viewHeight
     */
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        this._enabled    = true;
        this._color      = '#f8d080';    // 따뜻한 노란빛 (CH.01 골목 분위기)
        this._width      = 1;            // 림 두께 픽셀
        this._intensity  = 0.55;         // 강도 0~1
        this._lightDir   = 'top_right';  // 빛 방향
        this._onlyLayer  = 2;            // 림 적용 레이어 (기본: 게임 오브젝트)

        // 엣지 픽셀 버퍼 (매 프레임 재계산)
        this._edgePixels  = [];
        // 파싱된 rim 색상 캐시 {r,g,b}
        this._rimRGB      = this._parseColor(this._color);
    }

    // ── 설정 ─────────────────────────────────────────────────────────

    enable()  { this._enabled = true; }
    disable() { this._enabled = false; }

    /** 림 라이트 색상 hex */
    setColor(hex) {
        this._color   = hex;
        this._rimRGB  = this._parseColor(hex);
    }

    /** 림 두께 (1 또는 2) */
    setWidth(w) { this._width = Math.max(1, Math.min(2, w)); }

    /** 강도 0~1 */
    setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); }

    /**
     * 빛 방향 설정.
     * 'top' | 'bottom' | 'left' | 'right' |
     * 'top_right' | 'top_left' | 'bottom_right' | 'bottom_left'
     */
    setLightDir(dir) {
        if (LIGHT_DIR_OFFSETS[dir]) this._lightDir = dir;
        else console.warn(`[RimLightSystem] 알 수 없는 방향: "${dir}"`);
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * 메인 캔버스 위에 림 라이트 픽셀 덧그림.
     * @param {HTMLCanvasElement} mainCanvas
     * @param {EntitySystem}      entities
     * @param {number}            cameraX
     */
    render(mainCanvas, entities, cameraX = 0) {
        if (!this._enabled) return;

        const renderer = entities?.getRenderer(this._onlyLayer);
        if (!renderer || !renderer._indexMap) return;

        const imap = renderer._indexMap;
        const W    = renderer.width;
        const H    = renderer.height;
        const offsets = LIGHT_DIR_OFFSETS[this._lightDir] ?? [[0, 1]];

        // 엣지 픽셀 수집
        this._edgePixels.length = 0;

        for (let i = 0; i < imap.length; i++) {
            if (imap[i] === 0) continue;   // 투명 스킵

            const x = i % W;
            const y = Math.floor(i / W);

            // 지정 방향 쪽이 투명이면 엣지
            let isEdge = false;
            for (const [dx, dy] of offsets) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
                    isEdge = true;
                    break;
                }
                if (imap[ny * W + nx] === 0) {
                    isEdge = true;
                    break;
                }
            }

            if (isEdge) this._edgePixels.push([x, y]);
        }

        if (!this._edgePixels.length) return;

        // 메인 캔버스에 직접 그리기 (screen 블렌드)
        const ctx    = mainCanvas.getContext('2d');
        const { r, g, b } = this._rimRGB;
        const alpha  = this._intensity;
        const s      = this._width;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${r},${g},${b})`;

        for (const [px, py] of this._edgePixels) {
            ctx.fillRect(px, py, s, s);
        }

        ctx.restore();
    }

    // ── 내부 유틸 ─────────────────────────────────────────────────────

    _parseColor(hex) {
        const h = (hex ?? '#ffffff').replace('#', '');
        if (h.length < 6) return { r: 255, g: 255, b: 255 };
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
    }
}
