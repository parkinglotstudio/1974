/**
 * Sand Engine — SceneBoundsSystem v1.0
 * (2026-05-27)
 *
 * 씬 경계(Bounds) 관리 + 카메라 클램프 + 엔티티 뷰포트 컬링.
 *
 * 기능:
 *   1. setSceneBounds(worldWidth, worldHeight) — 씬 월드 크기 설정
 *   2. clampCamera(cameraX, cameraY) — 카메라가 씬 밖으로 나가지 않도록 제한
 *   3. isVisible(entity, cameraX, viewW, viewH) — 뷰포트 내 엔티티 여부 (컬링)
 *   4. wrapX(x) — 수평 무한 스크롤 씬에서 X 좌표 랩핑
 *   5. getScrollRatio(cameraX) — 씬 내 카메라 위치 비율 (0.0 ~ 1.0) — 패럴랙스 계산용
 *
 * 사용법 (SandEngine / Scene 에서):
 *   const bounds = new SceneBoundsSystem(540, 960);
 *   bounds.setSceneBounds(2160, 960);  // 4배 수평 스크롤
 *
 *   // 카메라 이동 시
 *   engine.cameraX = bounds.clampCamera(rawCameraX);
 *
 *   // 렌더 전 컬링 (optional — EntitySystem은 자체 렌더를 하지만 게임 로직 업데이트 스킵 가능)
 *   for (const entity of engine.entities.getAll()) {
 *       entity.visible = bounds.isVisible(entity, engine.cameraX);
 *   }
 */

export default class SceneBoundsSystem {
    /**
     * @param {number} viewWidth   뷰포트 너비 (논리 해상도 — 보통 gameWidth = 540)
     * @param {number} viewHeight  뷰포트 높이 (보통 gameHeight = 960)
     */
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        // 씬 월드 크기 (기본: 뷰포트와 동일 — 스크롤 없음)
        this._worldW = viewWidth;
        this._worldH = viewHeight;

        this._loop = false;   // 수평 무한 루프 여부
        this._margin = 32;    // 컬링 마진 (픽셀) — 이 범위 밖이면 invisible
    }

    // ── 씬 설정 ──────────────────────────────────────────────────────

    /**
     * 씬 월드 크기 설정.
     * @param {number} worldWidth   월드 너비 (뷰포트보다 크면 스크롤 가능)
     * @param {number} [worldHeight] 월드 높이 (기본: 뷰포트 높이)
     * @param {object} [options]
     * @param {boolean} [options.loop=false]   수평 무한 루프
     * @param {number}  [options.margin=32]    컬링 마진 (픽셀)
     */
    setSceneBounds(worldWidth, worldHeight = this._vh, { loop = false, margin = 32 } = {}) {
        this._worldW  = Math.max(worldWidth,  this._vw);
        this._worldH  = Math.max(worldHeight, this._vh);
        this._loop    = loop;
        this._margin  = margin;
    }

    /** 씬 월드 너비 */
    get worldWidth()  { return this._worldW; }
    /** 씬 월드 높이 */
    get worldHeight() { return this._worldH; }
    /** 뷰포트 너비 */
    get viewWidth()   { return this._vw; }
    /** 뷰포트 높이 */
    get viewHeight()  { return this._vh; }
    /** 최대 카메라 X (끝에서 뷰포트 딱 맞는 위치) */
    get maxCameraX()  { return Math.max(0, this._worldW - this._vw); }
    /** 최대 카메라 Y */
    get maxCameraY()  { return Math.max(0, this._worldH - this._vh); }

    // ── 카메라 클램프 ─────────────────────────────────────────────────

    /**
     * 카메라 X 좌표를 씬 경계 내로 제한.
     * loop=true 이면 월드 너비로 랩핑.
     * @param {number} x  원하는 카메라 X
     * @returns {number}  제한된 카메라 X
     */
    clampCamera(x, y = 0) {
        let cx = x;
        let cy = y;

        if (this._loop) {
            cx = ((cx % this._worldW) + this._worldW) % this._worldW;
        } else {
            cx = Math.max(0, Math.min(cx, this.maxCameraX));
        }

        cy = Math.max(0, Math.min(cy, this.maxCameraY));

        return { x: cx, y: cy };
    }

    /**
     * 카메라 X 만 클램프 (2D 수평 스크롤 전용 단축)
     */
    clampCameraX(x) {
        if (this._loop) {
            return ((x % this._worldW) + this._worldW) % this._worldW;
        }
        return Math.max(0, Math.min(x, this.maxCameraX));
    }

    // ── 컬링 ─────────────────────────────────────────────────────────

    /**
     * 엔티티가 현재 뷰포트에 보이는지 검사 (Layer 2 엔티티 기준).
     * Layer 0/1/3 은 항상 visible (패럴랙스 / UI).
     *
     * @param {Entity} entity     EntitySystem Entity
     * @param {number} cameraX    현재 카메라 X
     * @param {number} [margin]   컬링 마진 (기본: this._margin)
     * @returns {boolean}
     */
    isVisible(entity, cameraX, margin = this._margin) {
        // Layer 0,1,3 은 항상 렌더
        if (entity.layer !== 2) return true;

        const screenX = entity.x - cameraX;
        const screenY = entity.y;
        const w = entity.pw * (entity.scale ?? 1);
        const h = entity.ph * (entity.scale ?? 1);

        return (
            screenX + w + margin >= 0 &&
            screenX - margin < this._vw &&
            screenY + h + margin >= 0 &&
            screenY - margin < this._vh
        );
    }

    /**
     * 씬 내 모든 엔티티 visible 갱신 (일괄 컬링).
     * 매 프레임 전체 엔티티에 적용하면 비용이 있으므로
     * 엔티티가 많은 씬에서만 사용 권장.
     *
     * @param {Iterable<Entity>} entities  EntitySystem.getAll()
     * @param {number}           cameraX
     */
    cullAll(entities, cameraX) {
        for (const entity of entities) {
            entity.visible = this.isVisible(entity, cameraX);
        }
    }

    // ── 랩핑 / 유틸 ──────────────────────────────────────────────────

    /**
     * 수평 무한 루프 씬에서 X 좌표 랩핑.
     * entity.x 를 이 값으로 설정하면 씬 경계를 넘어도 반대편에서 등장.
     */
    wrapX(x) {
        return ((x % this._worldW) + this._worldW) % this._worldW;
    }

    /**
     * 현재 카메라 X 위치 비율 (0.0 = 시작, 1.0 = 끝).
     * 패럴랙스 오브젝트 배치, 미니맵 등에 활용.
     */
    getScrollRatio(cameraX) {
        const max = this.maxCameraX;
        if (max <= 0) return 0;
        return Math.max(0, Math.min(1, cameraX / max));
    }

    /**
     * 월드 X → 스크린 X 변환 (Layer 2 기준)
     */
    worldToScreen(worldX, cameraX) {
        return worldX - cameraX;
    }

    /**
     * 스크린 X → 월드 X 변환 (마우스/터치 좌표 → 게임 좌표)
     */
    screenToWorld(screenX, cameraX) {
        return screenX + cameraX;
    }

    // ── 직렬화 / 복원 ────────────────────────────────────────────────

    /** 현재 씬 경계 설정을 JSON으로 직렬화 (scene.json 저장용) */
    toJSON() {
        return {
            worldWidth:  this._worldW,
            worldHeight: this._worldH,
            loop:        this._loop,
            margin:      this._margin,
        };
    }

    /** scene.json bounds 블록에서 복원 */
    fromJSON(data) {
        if (!data) return this;
        this.setSceneBounds(
            data.worldWidth  ?? this._vw,
            data.worldHeight ?? this._vh,
            { loop: data.loop ?? false, margin: data.margin ?? 32 },
        );
        return this;
    }
}
