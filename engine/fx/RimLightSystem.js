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

        this._enabled    = false;   // 기본 OFF — 씬이 engine.rim.enable()로 켤 때만 동작 (매 프레임 indexMap 스캔 비용 방지)
        this._color      = '#f8d080';    // 따뜻한 노란빛 (CH.01 골목 분위기)
        this._width      = 1;            // 림 두께 픽셀
        this._intensity  = 0.55;         // 강도 0~1
        this._lightDir   = 'top_right';  // 빛 방향
        this._onlyLayer  = 2;            // 림 적용 레이어 (기본: 게임 오브젝트)

        // 환경색 샘플 모드 — 고정색 대신 가장자리 바깥(배경) 픽셀 색을 림에 사용
        this._envSample  = false;
        this._envReach   = 2;            // 배경 쪽 샘플 거리 (px)
        this._envBoost   = 1.3;          // 샘플색 밝기 부스트
        this._envFloor   = { r: 0, g: 0, b: 0 };  // 최소 림 색 (주변이 어두워도 이만큼은 보장 → 실루엣 항상 분리)

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

    /** 림 두께 (1~4 px) */
    setWidth(w) { this._width = Math.max(1, Math.min(6, w)); }

    /** 강도 0~1 */
    setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); }

    /**
     * 환경색 샘플 모드 on/off. on이면 림 색을 고정값 대신 가장자리 바깥 배경에서 떠옴.
     * @param {boolean} on
     * @param {object}  [opts]
     * @param {number}  [opts.reach=2]  배경 샘플 거리(px)
     * @param {number}  [opts.boost=1.3] 샘플색 밝기 배수
     */
    setEnvSample(on, { reach = 2, boost = 1.3, floor = '#000000' } = {}) {
        this._envSample = !!on;
        this._envReach  = reach;
        this._envBoost  = boost;
        this._envFloor = this._parseColor(floor);
    }

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
        // 엣지 검출 = 렌더러 픽셀 버퍼의 알파 채널 (indexMap 활성/타이밍과 무관하게 항상 동작)
        const buf = renderer?.buf;
        if (!renderer || !buf) return;

        const W    = renderer.width;
        const H    = renderer.height;
        const offsets = LIGHT_DIR_OFFSETS[this._lightDir] ?? [[0, 1]];
        const op = (i) => buf[(i << 2) + 3] > 0;   // 불투명(알파>0) 여부

        // 엣지 픽셀 수집
        this._edgePixels.length = 0;

        const N = W * H;
        for (let i = 0; i < N; i++) {
            if (!op(i)) continue;   // 투명 스킵

            const x = i % W;
            const y = (i / W) | 0;

            // 지정 방향 쪽이 투명이면 엣지. 투명(=배경) 방향 offset도 기록(환경색 샘플용).
            let isEdge = false, edx = 0, edy = 0;
            for (const [dx, dy] of offsets) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
                    isEdge = true; edx = dx; edy = dy;
                    break;
                }
                if (!op(ny * W + nx)) {
                    isEdge = true; edx = dx; edy = dy;
                    break;
                }
            }

            if (isEdge) this._edgePixels.push([x, y, edx, edy]);
        }

        if (!this._edgePixels.length) return;

        // 메인 캔버스에 직접 그리기 (screen 블렌드)
        const ctx    = mainCanvas.getContext('2d');
        const alpha  = this._intensity;
        const s      = this._width;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha;

        if (this._envSample) {
            // 환경색 샘플 모드 — 각 가장자리에서 투명(배경) 쪽 픽셀 색을 떠와 그 색으로 림.
            // 노을·창문 등 주변 빛 색을 실루엣 가장자리가 받아 어두운 배경에서 분리됨.
            const cw = mainCanvas.width, ch = mainCanvas.height;
            const src = ctx.getImageData(0, 0, cw, ch).data;
            const reach = this._envReach;           // 배경 쪽으로 몇 px 떨어진 곳을 샘플할지
            const boost = this._envBoost;            // 샘플색 밝기 부스트
            for (const [px, py, edx, edy] of this._edgePixels) {
                let sx = px + edx * reach, sy = py + edy * reach;
                if (sx < 0) sx = 0; else if (sx >= cw) sx = cw - 1;
                if (sy < 0) sy = 0; else if (sy >= ch) sy = ch - 1;
                const si = (sy * cw + sx) * 4;
                const fl = this._envFloor;
                const r = Math.min(255, Math.max(src[si]     * boost, fl.r));
                const g = Math.min(255, Math.max(src[si + 1] * boost, fl.g));
                const b = Math.min(255, Math.max(src[si + 2] * boost, fl.b));
                ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
                ctx.fillRect(px, py, s, s);
            }
        } else {
            // 고정색 모드
            const { r, g, b } = this._rimRGB;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            for (const [px, py] of this._edgePixels) {
                ctx.fillRect(px, py, s, s);
            }
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
