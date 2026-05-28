/**
 * Sand Engine — LayerSystem v2.0
 * 4레이어 고정 + children 트리 구조 (2026-05-27 재설계)
 *
 * Layer 0 : 원경 배경    — parallax 0.15  (하늘, 먼 산, 구름)
 * Layer 1 : 중경 배경    — parallax 0.6   (건물, 나무)
 * Layer 2 : 게임 오브젝트 — parallax 1.0  (캐릭터, 충돌 판정)
 * Layer 3 : 전경         — parallax 1.4   (담벼락, 전면 오브젝트 — 가장 빠름)
 *
 * 렌더 순서: L0 → L1 → L2 → L3
 *
 * composite 규칙:
 *   L0 / L1 / L3 — world 좌표 캔버스에 렌더 → composite 시 srcX 적용
 *   L2           — EntitySystem이 screen 좌표로 렌더 → composite 시 srcX = 0
 *
 * scene.json 트리 구조 (applySceneTree):
 *   { "layers": [
 *       { "id": "L0", "parallax": 0.15,
 *         "children": [{ "type": "BACKGROUND_FAR", "file": "bg_sky.json" }] }
 *   ]}
 */

export default class LayerSystem {
    /** 레이어별 기본 패럴랙스 계수 */
    static PARALLAX = [0.15, 0.6, 1.0, 1.4];

    /** 레이어 이름 (디버그/에디터용) */
    static NAMES = ['원경', '중경', '게임', '전경'];

    constructor(viewWidth, viewHeight) {
        this.viewWidth  = viewWidth;
        this.viewHeight = viewHeight;
        this.layers     = [];

        // 캔버스 너비 = 뷰포트 × 배율
        // L0(0.15): 거의 고정 → ×2 충분
        // L1(0.6):  중간 스크롤 → ×4
        // L2(1.0):  게임 월드 → ×4
        // L3(1.4):  전경 빠름 → ×4 (SceneBoundsSystem에서 정밀 계산 예정)
        const widthMults = [2, 4, 4, 4];

        for (let i = 0; i < 4; i++) {
            const cWidth = viewWidth * widthMults[i];
            const canvas = document.createElement('canvas');
            canvas.width  = cWidth;
            canvas.height = viewHeight;

            this.layers.push({
                index:    i,
                name:     LayerSystem.NAMES[i],
                canvas,
                ctx:      canvas.getContext('2d'),
                visible:  true,
                parallax: LayerSystem.PARALLAX[i],
                cWidth,
                children: [],   // scene.json 트리 메타데이터 (에디터/파서용)
            });
        }
    }

    // ── 레이어 접근 ─────────────────────────────────────────────────

    get(index)            { return this.layers[index]         ?? null; }
    getCanvas(index)      { return this.layers[index]?.canvas ?? null; }
    getCtx(index)         { return this.layers[index]?.ctx    ?? null; }
    getLayerWidth(index)  { return this.layers[index]?.cWidth ?? this.viewWidth; }
    getLayerHeight(index) { return this.viewHeight; }

    /** PixelRenderer 생성 기준 (viewWidth/Height) */
    get width()  { return this.viewWidth; }
    get height() { return this.viewHeight; }

    // ── 가시성 ──────────────────────────────────────────────────────

    setVisible(index, visible) {
        const l = this.layers[index];
        if (l) l.visible = visible;
    }

    // ── 클리어 ──────────────────────────────────────────────────────

    clear(index) {
        const l = this.layers[index];
        if (l) l.ctx.clearRect(0, 0, l.cWidth, this.viewHeight);
    }

    clearAll() {
        for (let i = 0; i < 4; i++) this.clear(i);
    }

    // ── children 관리 (에디터 / 씬 파서용) ─────────────────────────

    /**
     * 레이어에 child 메타데이터 추가
     * @param {number} layerIndex  0~3
     * @param {object} child       { id?, type, file?, content?, ... }
     */
    addChild(layerIndex, child) {
        const l = this.layers[layerIndex];
        if (l) l.children.push({ _layerIndex: layerIndex, ...child });
    }

    removeChild(layerIndex, childId) {
        const l = this.layers[layerIndex];
        if (!l) return;
        l.children = l.children.filter(c => c.id !== childId);
    }

    getChildren(layerIndex) {
        return this.layers[layerIndex]?.children ?? [];
    }

    /** 특정 레이어 children 전체 삭제 */
    clearChildren(layerIndex) {
        const l = this.layers[layerIndex];
        if (l) l.children = [];
    }

    /** 전체 레이어 children 삭제 */
    clearAllChildren() {
        for (let i = 0; i < 4; i++) this.clearChildren(i);
    }

    // ── scene.json 설정 적용 ────────────────────────────────────────

    /**
     * [구형] flat 설정 적용 — 하위 호환
     * layersConfig: { "0": { parallax, visible }, "1": { ... }, ... }
     */
    applyConfig(layersConfig = {}) {
        for (const [idxStr, cfg] of Object.entries(layersConfig)) {
            const i = parseInt(idxStr, 10);
            const l = this.layers[i];
            if (!l) continue;
            if (cfg.parallax != null) l.parallax = cfg.parallax;
            if (cfg.visible  != null) l.visible  = cfg.visible;
        }
    }

    /**
     * [신규] scene.json 트리 구조 적용
     * layersArray: [
     *   { "id": "L0", "parallax": 0.15,
     *     "children": [{ "type": "BACKGROUND_FAR", "file": "bg_sky.json" }] },
     *   { "id": "L1", ... },
     *   ...
     * ]
     */
    applySceneTree(layersArray = []) {
        this.clearAllChildren();
        for (const layerDef of layersArray) {
            const i = this._parseLayerId(layerDef.id);
            if (i < 0 || i > 3) continue;
            const l = this.layers[i];

            if (layerDef.parallax != null) l.parallax = layerDef.parallax;
            if (layerDef.visible  != null) l.visible  = layerDef.visible;

            for (const child of (layerDef.children ?? [])) {
                l.children.push({ _layerIndex: i, ...child });
            }
        }
    }

    // ── 합성 ────────────────────────────────────────────────────────

    /**
     * 모든 레이어를 targetCanvas에 패럴랙스 합성 (L0 → L1 → L2 → L3)
     *
     * @param {HTMLCanvasElement} targetCanvas
     * @param {number} cameraX  게임 월드 카메라 X
     *
     * L0/L1/L3: srcX = cameraX × parallax  (world 캔버스에서 슬라이싱)
     * L2:       srcX = 0                    (EntitySystem이 screen 좌표로 렌더)
     */
    /**
     * shakeX/shakeY: FXSystem.shake() 적용 오프셋.
     * 모든 레이어를 동일하게 translate → 씬 전체가 흔들리는 느낌.
     */
    composite(targetCanvas, cameraX = 0, shakeX = 0, shakeY = 0) {
        const ctx = targetCanvas.getContext('2d');
        const W   = this.viewWidth;
        const H   = this.viewHeight;
        ctx.clearRect(0, 0, W, H);

        const hasShake = shakeX !== 0 || shakeY !== 0;
        if (hasShake) ctx.save();
        if (hasShake) ctx.translate(shakeX, shakeY);

        for (let i = 0; i < 4; i++) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            // L2는 entity가 이미 screen 좌표로 렌더됨 → srcX = 0
            const srcX = (i === 2)
                ? 0
                : Math.max(0, Math.floor(cameraX * layer.parallax));

            ctx.drawImage(layer.canvas, srcX, 0, W, H, 0, 0, W, H);
        }

        if (hasShake) ctx.restore();
    }

    // ── 리사이즈 ────────────────────────────────────────────────────

    resize(viewWidth, viewHeight) {
        this.viewWidth  = viewWidth;
        this.viewHeight = viewHeight;
        const widthMults = [2, 4, 4, 4];
        for (let i = 0; i < 4; i++) {
            const cWidth = viewWidth * widthMults[i];
            const l      = this.layers[i];
            l.cWidth        = cWidth;
            l.canvas.width  = cWidth;
            l.canvas.height = viewHeight;
        }
    }

    // ── 내부 유틸 ───────────────────────────────────────────────────

    /** "L0"→0, "L1"→1, "L3"→3, 0→0 등 파싱 */
    _parseLayerId(id) {
        if (typeof id === 'number') return id;
        const s = String(id).replace(/^L/i, '');
        const n = parseInt(s, 10);
        return isNaN(n) ? -1 : n;
    }
}
