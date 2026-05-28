/**
 * RunnerSpawner — 네모세모동그라미 아이템 스폰 관리
 *
 * 스폰 비율: 코인 70% / 빠름(동그라미) 15% / 느림(세모) 15%
 * 장애물 없음.
 *
 * coins 배열: { id, x, y, pw, ph, kind: 'coin'|'fast'|'slow', collected, entity }
 */
import { CFG } from './runner_config.js';

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

export default class RunnerSpawner {
    constructor() {
        this.coins   = [];   // 코인 + 아이템 통합 배열
        this._itemCD = 0;
        this._nextId = 1;
    }

    reset() {
        this.coins   = [];
        this._itemCD = rand(CFG.ITEM_CD_MIN, CFG.ITEM_CD_MAX);
    }

    // entities ID 목록 반환 후 배열 비우기
    clearAll() {
        const ids = this.coins.map(c => c.id);
        this.coins = [];
        return ids;
    }

    _id() { return `item_${this._nextId++}`; }

    // ── 업데이트 ──────────────────────────────────────────────────
    // getGroundY: (x) => number — TerrainSystem 조회 함수
    update(dt, prefabs, engine, spawnCb, getGroundY) {
        // 아이템 스폰 쿨다운
        this._itemCD -= dt;
        if (this._itemCD <= 0) {
            this._spawnItem(prefabs, spawnCb, getGroundY);
            this._itemCD = rand(CFG.ITEM_CD_MIN, CFG.ITEM_CD_MAX);
        }
    }

    scrollAll(dt, speed) {
        for (const c of this.coins) {
            if (!c.collected) {
                c.x -= speed * dt;
                if (c.entity) c.entity.x = Math.round(c.x);
            }
        }
    }

    pruneOffscreen() {
        const dead = [];
        this.coins = this.coins.filter(c => {
            if (c.x + c.pw < -8 || (c.collected && !c.entity?.visible)) {
                dead.push(c.id); return false;
            }
            return true;
        });
        return dead;
    }

    // ── 스폰 ──────────────────────────────────────────────────────
    _spawnItem(prefabs, spawnCb, getGroundY) {
        const roll = Math.random();
        const kind = roll < CFG.COIN_PROB         ? 'coin' :
                     roll < CFG.COIN_PROB + CFG.ITEM_FAST_PROB ? 'fast' : 'slow';

        if (kind === 'coin') {
            this._spawnCoinChain(prefabs, spawnCb, getGroundY);
        } else {
            this._spawnSingleItem(kind, prefabs, spawnCb, getGroundY);
        }
    }

    _spawnCoinChain(prefabs, spawnCb, getGroundY) {
        const len    = randInt(CFG.CHAIN_LEN_MIN, CFG.CHAIN_LEN_MAX);
        const isAir  = Math.random() < CFG.ITEM_AIR_PROB;
        const startX = CFG.GAME_W + 4;
        const groundY = getGroundY ? getGroundY(startX) : CFG.GROUND_Y;

        const baseY = isAir
            ? groundY - rand(CFG.ITEM_AIR_MIN, CFG.ITEM_AIR_MAX) - CFG.ITEM_H
            : groundY - CFG.ITEM_H - CFG.ITEM_BOTTOM_OFF;

        for (let i = 0; i < len; i++) {
            const id = this._id();
            const x  = startX + i * (CFG.ITEM_W + CFG.CHAIN_GAP);
            const entity = spawnCb(id, 'RUNNER_COIN', x, baseY);
            this.coins.push({
                id, x, y: baseY,
                pw: CFG.ITEM_W, ph: CFG.ITEM_H,
                kind: 'coin', collected: false, entity,
            });
        }
    }

    _spawnSingleItem(kind, prefabs, spawnCb, getGroundY) {
        const id     = this._id();
        const x      = CFG.GAME_W + 4;
        const isAir  = Math.random() < CFG.ITEM_AIR_PROB;
        const groundY = getGroundY ? getGroundY(x) : CFG.GROUND_Y;

        const size = CFG.ITEM_TRANSFORM_SIZE; // 12px 변신 아이템 적용
        const y = isAir
            ? groundY - rand(CFG.ITEM_AIR_MIN, CFG.ITEM_AIR_MAX) - size
            : groundY - size - CFG.ITEM_BOTTOM_OFF;

        // 아이템은 별도 렌더 (entity 없이 직접 오버레이에 그림)
        this.coins.push({
            id, x, y,
            pw: size, ph: size,
            kind, collected: false, entity: null,
        });
    }

    // ── 렌더 (아이템 오버레이 — entity 없는 fast/slow) ────────────
    drawItems(ctx) {
        for (const c of this.coins) {
            if (c.collected || c.entity) continue;  // entity 있으면 EntitySystem이 렌더
            const sz = c.pw; // 수집 아이템의 실제 크기 (12px) 적용
            const x  = Math.round(c.x);
            const y  = Math.round(c.y);
            ctx.save();
            if (c.kind === 'fast') {
                // 동그라미 (cyan)
                ctx.fillStyle   = '#20d0ff';
                ctx.strokeStyle = '#66ffcc';
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.arc(x + sz / 2, y + sz / 2, sz / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (c.kind === 'slow') {
                // 삼각형 (빨강)
                ctx.fillStyle = '#e03030';
                ctx.beginPath();
                ctx.moveTo(x + sz / 2, y);
                ctx.lineTo(x + sz,     y + sz);
                ctx.lineTo(x,          y + sz);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }
    }

}
