/**
 * 주판왕 — AbacusEntity (한국식 주판)
 * 9열 × 5알 = 45알
 *   upper[0]: 윗알 1개 (5의 자리)  — 0=위(비활성), 1=아래(활성=+5)
 *   lower[0..3]: 아랫알 4개 (각 1의 자리) — 0=아래(비활성), 1=위(활성=+1)
 *
 * 열 인덱스: 0=億, 1=千万, 2=百万, 3=十万, 4=万, 5=千, 6=百, 7=十, 8=一
 */
const COL_NAMES  = ['億', '千万', '百万', '十万', '万', '千', '百', '十', '一'];
const COL_PLACES = [100000000, 10000000, 1000000, 100000, 10000, 1000, 100, 10, 1];
const NUM_COLS   = 9;

export default class AbacusEntity {
    constructor() {
        this.state = Array.from({ length: NUM_COLS }, () => ({
            upper: [0],
            lower: [0, 0, 0, 0],
        }));
    }

    reset() {
        for (const col of this.state) {
            col.upper = [0];
            col.lower = [0, 0, 0, 0];
        }
    }

    getValue() {
        let total = 0;
        for (let c = 0; c < NUM_COLS; c++) {
            total += this._getColValue(c) * COL_PLACES[c];
        }
        return total;
    }

    _getColValue(col) {
        const s = this.state[col];
        return s.upper[0] * 5 + s.lower.reduce((a, b) => a + b, 0);
    }

    toggleUpper(col) {
        if (col < 0 || col >= NUM_COLS) return;
        this.state[col].upper[0] ^= 1;
    }

    // row: 0~3 (0이 분리선에 가장 가까운 알)
    // 올릴 때(1): row보다 분리선 쪽(작은 index) 알도 같이 올라옴
    // 내릴 때(0): row보다 아래(큰 index) 알도 같이 내려옴
    toggleLower(col, row) {
        if (col < 0 || col >= NUM_COLS || row < 0 || row > 3) return;
        const lower = this.state[col].lower;
        const newVal = lower[row] ^ 1;
        lower[row] = newVal;

        if (newVal === 1) {
            for (let r = 0; r < row; r++) lower[r] = 1;
        } else {
            for (let r = row + 1; r < 4; r++) lower[r] = 0;
        }
    }

    setValue(value) {
        this.reset();
        let remaining = Math.min(Math.max(Math.round(value), 0), 999999999);
        for (let c = 0; c < NUM_COLS; c++) {
            const place = COL_PLACES[c];
            const digit = Math.floor(remaining / place);
            remaining  -= digit * place;

            const s = this.state[c];
            if (digit >= 5) {
                s.upper[0] = 1;
                const ones = digit - 5;
                for (let r = 0; r < ones && r < 4; r++) s.lower[r] = 1;
            } else {
                for (let r = 0; r < digit && r < 4; r++) s.lower[r] = 1;
            }
        }
    }

    syncEntities(entitySystem, entityIdMap) {
        for (let c = 0; c < NUM_COLS; c++) {
            const name = COL_NAMES[c];
            const s    = this.state[c];

            const uid = entityIdMap[`bead_${name}_u1`];
            if (uid) {
                const e = entitySystem.get(uid);
                if (e) e.setState(s.upper[0] === 1 ? 'down' : 'up');
            }

            for (let r = 0; r < 4; r++) {
                const id = entityIdMap[`bead_${name}_l${r + 1}`];
                if (id) {
                    const e = entitySystem.get(id);
                    if (e) e.setState(s.lower[r] === 1 ? 'up' : 'down');
                }
            }
        }
    }

    getActiveColRange(maxValue) {
        for (let c = 0; c < NUM_COLS; c++) {
            if (COL_PLACES[c] <= maxValue) return c;
        }
        return NUM_COLS - 1;
    }

    getColName(col)  { return COL_NAMES[col];  }
    getColPlace(col) { return COL_PLACES[col]; }
    getNumCols()     { return NUM_COLS; }
}
