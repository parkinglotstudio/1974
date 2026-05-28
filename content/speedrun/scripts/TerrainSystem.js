/**
 * TerrainSystem — 오르막/내리막 지형 무한 생성
 *
 * 공개 API:
 *   getGroundY(worldX) → 해당 월드 X의 지면 Y (px)
 *   getAngle(worldX)   → 경사 각도 (rad)
 *   scroll(dt, speed)  → 세그먼트 스크롤
 *   update(dt)         → 매 프레임 (세그먼트 생성/제거)
 *   reset()
 *   draw(ctx, camX)    → 지형 선 디버그 렌더 (선택)
 */
import { CFG } from './runner_config.js';

const W = CFG.GAME_W;

// 세그먼트 타입
// { startX, endX, startY, endY }
// startY/endY: 지면 Y (화면 좌표, 그 지점에서의 지면 높이)

export default class TerrainSystem {
    constructor() {
        this._segments  = [];   // 활성 세그먼트 배열
        this._worldX    = 0;    // 카메라 월드 X (스크롤 누적)
        this._nextGenX  = 0;    // 다음 세그먼트 생성 시작 X (월드 좌표)
        this._baseY     = CFG.GROUND_Y;  // 기준 지면 Y
        this.reset();
    }

    reset() {
        this._segments  = [];
        this._worldX    = 0;
        this._nextGenX  = 0;
        this._baseY     = CFG.GROUND_Y;
        // 초기 평지 세그먼트 (화면 너비 × 2)
        this._addFlat(0, W * 2, CFG.GROUND_Y);
        this._nextGenX = W * 2;
    }

    // ── 세그먼트 생성 ─────────────────────────────────────────────
    _addFlat(startX, length, y) {
        this._segments.push({
            startX, endX: startX + length,
            startY: y, endY: y,
            type: 'flat',
        });
        this._baseY = y;
    }

    _addSlope(startX, length, fromY, toY) {
        this._segments.push({
            startX, endX: startX + length,
            startY: fromY, endY: toY,
            type: toY < fromY ? 'uphill' : 'downhill',
        });
        this._baseY = toY;
    }

    _generateNext() {
        const x = this._nextGenX;
        const currentY = this._baseY;

        // 무작위로 평지 또는 경사 선택
        const roll = Math.random();
        if (roll < 0.5) {
            // 평지
            const len = CFG.TERRAIN_FLAT_LEN_MIN
                + Math.random() * (CFG.TERRAIN_FLAT_LEN_MAX - CFG.TERRAIN_FLAT_LEN_MIN);
            this._addFlat(x, len, currentY);
            this._nextGenX = x + len;
        } else {
            // 경사
            const len = CFG.TERRAIN_SLOPE_LEN_MIN
                + Math.random() * (CFG.TERRAIN_SLOPE_LEN_MAX - CFG.TERRAIN_SLOPE_LEN_MIN);

            // 방향: 위 or 아래
            const dir = Math.random() > 0.5 ? -1 : 1;  // -1 오르막, +1 내리막
            const dy  = (10 + Math.random() * CFG.TERRAIN_MAX_DY) * dir;
            // 지면 Y가 너무 높거나 낮아지지 않게 클램프
            const toY = Math.max(
                CFG.GROUND_Y - 50,
                Math.min(CFG.GROUND_Y + 20, currentY + dy)
            );
            this._addSlope(x, len, currentY, toY);
            this._nextGenX = x + len;

            // 경사 뒤에는 항상 평지 (착지 시간 확보)
            const flatLen = 80 + Math.random() * 100;
            this._addFlat(this._nextGenX, flatLen, toY);
            this._nextGenX += flatLen;
        }
    }

    // ── 스크롤 / 업데이트 ─────────────────────────────────────────
    scroll(dt, speed) {
        const dx = speed * dt;
        this._worldX    += dx;
        this._nextGenX  -= dx;   // 생성 기준점도 함께 이동

        for (const s of this._segments) {
            s.startX -= dx;
            s.endX   -= dx;
        }
    }

    update() {
        // 화면 밖으로 나간 세그먼트 제거
        this._segments = this._segments.filter(s => s.endX > -10);

        // 화면 앞쪽 버퍼가 부족하면 생성
        while (this._nextGenX < W + 200) {
            this._generateNext();
        }
    }

    // ── 조회 ──────────────────────────────────────────────────────
    // 화면 X 좌표 기준 지면 Y 반환
    getGroundY(screenX) {
        const seg = this._getSegmentAt(screenX);
        if (!seg) return CFG.GROUND_Y;
        if (seg.startY === seg.endY) return seg.startY;  // 평지
        // Lerp
        const t = Math.max(0, Math.min(1, (screenX - seg.startX) / (seg.endX - seg.startX)));
        return seg.startY + (seg.endY - seg.startY) * t;
    }

    // 경사 각도 반환 (rad)
    getAngle(screenX) {
        const seg = this._getSegmentAt(screenX);
        if (!seg || seg.startY === seg.endY) return 0;
        const len = seg.endX - seg.startX;
        if (len <= 0) return 0;
        return Math.atan2(seg.endY - seg.startY, len);
    }

    // 오르막/내리막 타입 반환
    getType(screenX) {
        const seg = this._getSegmentAt(screenX);
        return seg?.type ?? 'flat';
    }

    _getSegmentAt(x) {
        for (const s of this._segments) {
            if (x >= s.startX && x <= s.endX) return s;
        }
        return null;
    }

    // ── 디버그 렌더 ───────────────────────────────────────────────
    draw(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(200,146,42,0.6)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        let first = true;
        for (const s of this._segments) {
            if (first) { ctx.moveTo(s.startX, s.startY); first = false; }
            else        { ctx.lineTo(s.startX, s.startY); }
            ctx.lineTo(s.endX, s.endY);
        }
        ctx.stroke();
        ctx.restore();
    }
}
