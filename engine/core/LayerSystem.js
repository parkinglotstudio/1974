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

    /** 월드 캔버스 폭 상한 — 배경 월드폭(수천)이면 충분. 넓은 뷰(가로 시네마)에서 과대 캔버스/성능저하 방지.
     *  배경 월드폭이 이보다 크면 이 값을 올릴 것(스크롤이 잘리지 않게). */
    static MAX_CW = 5120;

    /** 레이어 이름 (디버그/에디터용) */
    static NAMES = ['원경', '중경', '게임', '전경'];

    constructor(viewWidth, viewHeight) {
        this.viewWidth  = viewWidth;
        this.viewHeight = viewHeight;
        this.layers     = [];

        // 캔버스 너비 = 뷰포트 × 배율
        // L0/L1/L3: 월드 좌표 배경 → 넓게 (정적이라 1회만 래스터, 과대해도 프레임당 비용 없음)
        // L2: 게임 오브젝트 — 스크린 좌표(worldX - cameraX)로 렌더되므로 뷰포트폭(×1)이면 충분.
        //     (과거 ×8은 매 프레임 clear/flush가 8배 픽셀을 처리해 동적 레이어 병목의 주원인이었음)
        const widthMults = [4, 8, 1, 8];

        for (let i = 0; i < 4; i++) {
            // 캔버스 폭 = viewWidth×mult 이되 상한 캡(가로 시네마처럼 뷰가 넓으면 14080폭 등 과대 → 성능 저하).
            // 배경 월드폭(~수천)이면 충분하므로 LayerSystem.MAX_CW로 제한.
            const cWidth = Math.min(viewWidth * widthMults[i], LayerSystem.MAX_CW);
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
                static:   false, // true면 정적 레이어 — clearAll()이 건너뜀 (EntitySystem이 설정)
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
        // 정적 레이어(static=true)는 1회 래스터된 픽셀을 유지하기 위해 건너뜀.
        // (EntitySystem이 매 프레임 정적 여부를 갱신; 동적 레이어만 비움)
        for (let i = 0; i < 4; i++) {
            if (this.layers[i].static) continue;
            this.clear(i);
        }
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
            // 캔버스 범위를 넘어 검은 공백이 나오는 것을 막기 위해 maxSrcX 클램프 적용
            const maxSrcX = Math.max(0, layer.canvas.width - W);
            const srcX = (i === 2)
                ? 0
                : Math.min(maxSrcX, Math.max(0, Math.floor(cameraX * layer.parallax)));

            ctx.drawImage(layer.canvas, srcX, 0, W, H, 0, 0, W, H);
        }

        if (hasShake) ctx.restore();
    }

    // ── 리사이즈 ────────────────────────────────────────────────────

    resize(viewWidth, viewHeight) {
        this.viewWidth  = viewWidth;
        this.viewHeight = viewHeight;
        const widthMults = [4, 8, 1, 8];   // L2는 스크린 좌표 → ×1 (constructor와 동일)
        for (let i = 0; i < 4; i++) {
            const cWidth = Math.min(viewWidth * widthMults[i], LayerSystem.MAX_CW);   // 상한 캡(과대 캔버스 방지)
            const l      = this.layers[i];
            l.cWidth        = cWidth;
            l.canvas.width  = cWidth;   // 캔버스 크기 변경 → 내용 비워짐
            l.canvas.height = viewHeight;
            l.static        = false;    // 재래스터 필요 (EntitySystem.resize도 무효화)
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
