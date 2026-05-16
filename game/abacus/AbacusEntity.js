/**
 * 주판왕 — AbacusEntity
 * 주판 알 상태 관리 + 현재값 계산.
 *
 * 구조: 3열 (百十一) × 7알 = 21알
 *   upper[0..1]: 윗알 2개 (각 5의 자리)  — 0=위(비활성), 1=아래(활성=+5)
 *   lower[0..4]: 아랫알 5개 (각 1의 자리) — 0=아래(비활성), 1=위(활성=+1)
 *
 * 열 인덱스: 0=百(100), 1=十(10), 2=一(1)
 */
const COL_NAMES  = ['100', '10', '1'];
const COL_PLACES = [100, 10, 1];

export default class AbacusEntity {
    constructor() {
        this.state = Array.from({ length: 3 }, () => ({
            upper: [0, 0],
            lower: [0, 0, 0, 0, 0],
        }));
    }

    reset() {
        for (const col of this.state) {
            col.upper = [0, 0];
            col.lower = [0, 0, 0, 0, 0];
        }
    }

    getValue() {
        let total = 0;
        for (let c = 0; c < 3; c++) {
            total += this._getColValue(c) * COL_PLACES[c];
        }
        return total;
    }

    _getColValue(col) {
        const s = this.state[col];
        return (s.upper[0] + s.upper[1]) * 5 + s.lower.reduce((a, b) => a + b, 0);
    }

    // row: 0 or 1
    toggleUpper(col, row = 0) {
        if (col < 0 || col > 2 || row < 0 || row > 1) return;
        this.state[col].upper[row] ^= 1;
    }

    // row: 0~4 (0이 중간선에 가장 가까운 알)
    toggleLower(col, row) {
        if (col < 0 || col > 2 || row < 0 || row > 4) return;
        const lower = this.state[col].lower;
        const newVal = lower[row] ^ 1;
        lower[row] = newVal;

        // 주판 연동 규칙: 올릴 때 아래쪽 알도 올라옴, 내릴 때 위쪽 알도 내려옴
        if (newVal === 1) {
            for (let r = row + 1; r < 5; r++) lower[r] = 1;
        } else {
            for (let r = 0; r < row; r++) lower[r] = 0;
        }
    }

    setValue(value) {
        this.reset();
        let remaining = Math.min(Math.max(value, 0), 999);
        for (let c = 0; c < 3; c++) {
            const place = COL_PLACES[c];
            const digit = Math.floor(remaining / place);
            remaining  -= digit * place;

            const s = this.state[c];
            if (digit >= 10) {
                s.upper[0] = 1; s.upper[1] = 1;
                const ones = digit - 10;
                for (let r = 0; r < ones; r++) s.lower[r] = 1;
            } else if (digit >= 5) {
                s.upper[0] = 1;
                const ones = digit - 5;
                for (let r = 0; r < ones; r++) s.lower[r] = 1;
            } else {
                for (let r = 0; r < digit; r++) s.lower[r] = 1;
            }
        }
    }

    // EntitySystem과 동기화. entityIdMap 예: { 'bead_100_u1': entityId, ... }
    syncEntities(entitySystem, entityIdMap) {
        for (let c = 0; c < 3; c++) {
            const name = COL_NAMES[c];
            const s    = this.state[c];

            for (let u = 0; u < 2; u++) {
                const id = entityIdMap[`bead_${name}_u${u + 1}`];
                if (id) {
                    const e = entitySystem.get(id);
                    if (e) e.setState(s.upper[u] === 1 ? 'down' : 'up');
                }
            }

            for (let r = 0; r < 5; r++) {
                const id = entityIdMap[`bead_${name}_l${r + 1}`];
                if (id) {
                    const e = entitySystem.get(id);
                    if (e) e.setState(s.lower[r] === 1 ? 'up' : 'down');
                }
            }
        }
    }
}
