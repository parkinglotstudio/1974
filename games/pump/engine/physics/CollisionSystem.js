/**
 * Sand Engine — CollisionSystem
 * 비주얼이 곧 충돌맵. Layer 2 픽셀 인덱스가 물리 속성을 가짐.
 *
 * 팔레트 인덱스 → 물리 속성:
 *   0      = transparent (통과)
 *   1~8    = 배경 (통과)
 *   9      = 땅 (충돌 — 착지)
 *   10     = 물 (슬로우)
 *   11     = 위험 (데미지)
 *
 * 사용 예:
 *   const col = new CollisionSystem(entitySystem);
 *   col.init();   // 첫 render() 이후 1회 호출
 *   // 게임 루프에서:
 *   col.setCamera(cameraX);
 *   const idx = col.checkFoot(entity);
 *   if (col.isGround(entity.x + 8, entity.y + entity.ph)) { ... }
 */
export default class CollisionSystem {
    static GROUND = 9;
    static WATER  = 10;
    static DANGER = 11;

    constructor(entitySystem, layerIdx = 2) {
        this._es       = entitySystem;
        this._layerIdx = layerIdx;
        this._renderer = null;
        this._cameraX  = 0;
    }

    // EntitySystem 첫 render() 이후 1회 호출.
    // Layer 2 렌더러에 인덱스맵을 활성화.
    init() {
        this._renderer = this._es.getRenderer(this._layerIdx);
        if (!this._renderer) {
            console.warn('[CollisionSystem] Layer 2 renderer 없음. entities.add() 후 init() 호출할 것.');
            return;
        }
        this._renderer.enableIndexMap();
        console.log('[CollisionSystem] 인덱스맵 활성화 완료.');
    }

    // 매 프레임 cameraX 동기화 (월드 좌표 → 스크린 좌표 변환용)
    setCamera(cameraX) {
        this._cameraX = cameraX;
    }

    // ── 기본 조회 ──────────────────────────────────────────────────

    // 월드 좌표로 팔레트 인덱스 조회
    getPixelIndex(worldX, worldY) {
        if (!this._renderer) return 0;
        const sx = Math.round(worldX - this._cameraX);
        const sy = Math.round(worldY);
        return this._renderer.getPixelIndex(sx, sy);
    }

    isGround(worldX, worldY) { return this.getPixelIndex(worldX, worldY) === CollisionSystem.GROUND; }
    isWater(worldX, worldY)  { return this.getPixelIndex(worldX, worldY) === CollisionSystem.WATER;  }
    isDanger(worldX, worldY) { return this.getPixelIndex(worldX, worldY) === CollisionSystem.DANGER; }
    isSolid(worldX, worldY)  { return this.getPixelIndex(worldX, worldY) >= CollisionSystem.GROUND;  }

    // ── 엔티티 단위 충돌 ───────────────────────────────────────────

    // 엔티티 발 중앙점 1픽셀 체크
    // entity: { x, y, pw, ph } — 월드 좌표
    checkFoot(entity) {
        const fx = entity.x + Math.floor(entity.pw / 2);
        const fy = entity.y + entity.ph;
        return this.getPixelIndex(fx, fy);
    }

    // 엔티티 발 라인 샘플링 (더 정확한 착지 판정)
    // samples: 발 너비를 몇 포인트로 나눌지 (기본 4)
    checkFeet(entity, samples = 4) {
        const fy   = entity.y + entity.ph;
        const step = Math.max(1, Math.floor(entity.pw / samples));
        for (let px = entity.x; px <= entity.x + entity.pw; px += step) {
            const idx = this.getPixelIndex(px, fy);
            if (idx >= CollisionSystem.GROUND) return idx;
        }
        return 0;
    }

    // 엔티티 머리 (위쪽) 충돌 체크
    checkHead(entity) {
        const hx = entity.x + Math.floor(entity.pw / 2);
        const hy = entity.y - 1;
        return this.getPixelIndex(hx, hy);
    }

    // 좌/우 벽 충돌 체크
    checkLeft(entity) {
        const lx = entity.x - 1;
        const ly = entity.y + Math.floor(entity.ph / 2);
        return this.getPixelIndex(lx, ly);
    }

    checkRight(entity) {
        const rx = entity.x + entity.pw;
        const ry = entity.y + Math.floor(entity.ph / 2);
        return this.getPixelIndex(rx, ry);
    }

    // ── 물리 속성 헬퍼 ────────────────────────────────────────────

    // 인덱스 → 물리 속성 이름 반환
    static propertyOf(idx) {
        if (idx === 0 || idx <= 8) return 'none';
        if (idx === 9)  return 'ground';
        if (idx === 10) return 'water';
        if (idx === 11) return 'danger';
        return 'solid';
    }
}
