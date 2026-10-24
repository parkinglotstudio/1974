// WallGrid.js — 테트리스식 벽 격자 (월드좌표) — 4방향 중력 지원.
// ─────────────────────────────────────────────────────────────
// gravity = 조각이 떨어져 쌓이는 "바닥면"의 방향:
//   down  : 바닥(아래)에 쌓임 — 위에서 진입, 아래로 하드드롭 (클래식 테트리스)
//   up    : 천장(위)에 매달려 거꾸로 자람 — 아래에서 진입, 위로 하드드롭
//   left  : 좌벽에 쌓임 — 오른쪽에서 진입, 왼쪽으로 하드드롭
//   right : 우벽에 쌓임 — 왼쪽에서 진입, 오른쪽으로 하드드롭
// "생성(진입) 위치"는 항상 중력의 반대편 가장자리. 솔버/구멍계산도 중력 기준으로 동작.
// 좌표는 월드 기준 — 렌더 시 ctx가 이미 translate(-cameraX) 되어 들어옴.

// 중력 방향 벡터(dc,dr)와 축(v=세로/h=가로)
const GRAV = {
    down:  { dc: 0,  dr: 1,  axis: 'v' },
    up:    { dc: 0,  dr: -1, axis: 'v' },
    right: { dc: 1,  dr: 0,  axis: 'h' },
    left:  { dc: -1, dr: 0,  axis: 'h' },
};

export const pieceW = cells => Math.max(...cells.map(p => p[0])) + 1;
export const pieceH = cells => Math.max(...cells.map(p => p[1])) + 1;

export default class WallGrid {
    constructor({ originX, topY, cols, rows, cell, gravity = 'down' }) {
        this.originX = originX; this.topY = topY;
        this.cols = cols; this.rows = rows; this.cell = cell;
        this.gravity = GRAV[gravity] ? gravity : 'down';
        this.G = GRAV[this.gravity];
        // grid[row][col] = 색상 문자열 | null
        this.grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
    }

    _collides(cells, c0, r0) {
        for (const [c, r] of cells) {
            const cc = c0 + c, rr = r0 + r;
            if (cc < 0 || cc >= this.cols || rr < 0 || rr >= this.rows) return true;
            if (this.grid[rr][cc]) return true;
        }
        return false;
    }

    // lane(중력축에 수직인 위치) 에서 조각이 진입하는 시작 좌표(중력 반대편 가장자리).
    entryOrigin(cells, lane) {
        const G = this.G;
        if (G.axis === 'v') return { col: lane, row: G.dr > 0 ? 0 : this.rows - pieceH(cells) };
        return { col: G.dc > 0 ? 0 : this.cols - pieceW(cells), row: lane };
    }

    // 중력축에 수직인 lane 개수
    laneCount(cells) {
        return this.G.axis === 'v' ? this.cols - pieceW(cells) + 1 : this.rows - pieceH(cells) + 1;
    }

    // lane 에서 중력 방향으로 하드드롭한 최종 안착 좌표. 못 들어가면 null.
    landing(cells, lane) {
        const G = this.G;
        let { col, row } = this.entryOrigin(cells, lane);
        if (this._collides(cells, col, row)) return null;
        while (!this._collides(cells, col + G.dc, row + G.dr)) { col += G.dc; row += G.dr; }
        return { col, row };
    }

    // 후보 조각(extra: "c,r" Set) 포함, 격자 전체의 "덮인 빈칸(구멍)" 수 — 중력 진입 방향 기준.
    countHoles(extra = null) {
        const G = this.G;
        const filled = (c, r) => !!this.grid[r][c] || (extra && extra.has(c + ',' + r));
        let holes = 0;
        if (G.axis === 'v') {
            for (let c = 0; c < this.cols; c++) {
                let seen = false;
                if (G.dr > 0) for (let r = 0; r < this.rows; r++)        { if (filled(c, r)) seen = true; else if (seen) holes++; }
                else          for (let r = this.rows - 1; r >= 0; r--)    { if (filled(c, r)) seen = true; else if (seen) holes++; }
            }
        } else {
            for (let r = 0; r < this.rows; r++) {
                let seen = false;
                if (G.dc > 0) for (let c = 0; c < this.cols; c++)        { if (filled(c, r)) seen = true; else if (seen) holes++; }
                else          for (let c = this.cols - 1; c >= 0; c--)    { if (filled(c, r)) seen = true; else if (seen) holes++; }
            }
        }
        return holes;
    }

    // 회전셋(rotations: {key:[[[c,r]...]...]}) × lane 평가 → "새 구멍 최소" 자리 선택. 가득이면 null.
    choosePlacement(rotations) {
        let minHoles = Infinity; const cands = [];
        for (const key of Object.keys(rotations)) {
            for (const cells of rotations[key]) {
                const lanes = this.laneCount(cells);
                for (let lane = 0; lane < lanes; lane++) {
                    const pos = this.landing(cells, lane);
                    if (!pos) continue;
                    const extra = new Set(cells.map(([c, r]) => (pos.col + c) + ',' + (pos.row + r)));
                    const holes = this.countHoles(extra);
                    cands.push({ key, cells, col: pos.col, row: pos.row, holes });
                    if (holes < minHoles) minHoles = holes;
                }
            }
        }
        const pool = cands.filter(c => c.holes === minHoles);
        return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
    }

    // down-gravity 전용: 각 열의 높이(바닥부터 가장 높은 채움까지). 빈 열=0.
    _columnHeights(extra) {
        const h = new Array(this.cols).fill(0);
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                if (this.grid[r][c] || (extra && extra.has(c + ',' + r))) { h[c] = this.rows - r; break; }
            }
        }
        return h;
    }

    // 표준 테트리스 AI 휴리스틱(down 전용): 구멍 강회피 + 줄완성 선호 + 낮고 평평하게.
    // 줄이 꽉꽉 채워져 자주 완성되도록(=몬스터 생성) 만든다. clear 안 하므로 바닥부터 차올라감.
    chooseBest(rotations) {
        let best = null, bestScore = -Infinity;
        for (const key of Object.keys(rotations)) {
            for (const cells of rotations[key]) {
                const lanes = this.laneCount(cells);
                for (let lane = 0; lane < lanes; lane++) {
                    const pos = this.landing(cells, lane);
                    if (!pos) continue;
                    const extra = new Set(cells.map(([c, r]) => (pos.col + c) + ',' + (pos.row + r)));
                    const h = this._columnHeights(extra);
                    let aggH = 0, bump = 0;
                    for (let c = 0; c < this.cols; c++) aggH += h[c];
                    for (let c = 0; c < this.cols - 1; c++) bump += Math.abs(h[c] - h[c + 1]);
                    const holes = this.countHoles(extra);
                    let lines = 0;
                    for (let r = 0; r < this.rows; r++) {
                        let full = true;
                        for (let c = 0; c < this.cols; c++) if (!(this.grid[r][c] || extra.has(c + ',' + r))) { full = false; break; }
                        if (full) lines++;
                    }
                    const score = -0.5 * aggH + 6 * lines - 9 * holes - 0.25 * bump;
                    if (score > bestScore) { bestScore = score; best = { key, cells, col: pos.col, row: pos.row }; }
                }
            }
        }
        return best;
    }

    placeAt(cells, col, row, color) {
        for (const [c, r] of cells) {
            const rr = row + r, cc = col + c;
            if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) this.grid[rr][cc] = color;
        }
    }

    // 중력축에 수직인 "줄(line)" 중 가득 찬 것들의 인덱스. (down/up→행 / left/right→열)
    fullLines() {
        const out = [];
        if (this.G.axis === 'v') {
            for (let r = 0; r < this.rows; r++) if (this.grid[r].every(Boolean)) out.push(r);
        } else {
            for (let c = 0; c < this.cols; c++) {
                let full = true;
                for (let r = 0; r < this.rows; r++) if (!this.grid[r][c]) { full = false; break; }
                if (full) out.push(c);
            }
        }
        return out;
    }

    // 줄 인덱스 → 월드 중심 좌표(적 스폰 위치용)
    lineCenter(idx) {
        if (this.G.axis === 'v') return { x: this.originX + this.pxWidth / 2,  y: this.topY + idx * this.cell + this.cell / 2 };
        return                        { x: this.originX + idx * this.cell + this.cell / 2, y: this.topY + this.pxHeight / 2 };
    }

    // 주어진 줄들을 제거하고 나머지를 중력 방향으로 무너뜨림(collapse, 테트리스식).
    clearLines(idxList) {
        const set = new Set(idxList);
        const empty = () => new Array(this.cols).fill(null);
        if (this.G.axis === 'v') {
            const keep = [];
            for (let r = 0; r < this.rows; r++) if (!set.has(r)) keep.push(this.grid[r]);
            const pad = this.rows - keep.length, ng = [];
            if (this.G.dr > 0) { for (let i = 0; i < pad; i++) ng.push(empty()); for (const row of keep) ng.push(row); }  // down: 빈 줄을 위로
            else               { for (const row of keep) ng.push(row); for (let i = 0; i < pad; i++) ng.push(empty()); }  // up:   빈 줄을 아래로
            this.grid = ng;
        } else {
            const keepCols = [];
            for (let c = 0; c < this.cols; c++) if (!set.has(c)) keepCols.push(c);
            const pad = this.cols - keepCols.length;
            const ng = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
            keepCols.forEach((srcC, i) => {
                const dstC = this.G.dc > 0 ? pad + i : i;   // right: 우측으로 / left: 좌측으로 밀착
                for (let r = 0; r < this.rows; r++) ng[r][dstC] = this.grid[r][srcC];
            });
            this.grid = ng;
        }
    }

    render(ctx) {
        const cs = this.cell;
        for (let r = 0; r < this.rows; r++) {
            const rowArr = this.grid[r];
            for (let c = 0; c < this.cols; c++) {
                const col = rowArr[c];
                if (!col) continue;
                const x = this.originX + c * cs, y = this.topY + r * cs;
                ctx.fillStyle = col;                            // 전체 붉은색 채움(테두리 없음)
                ctx.fillRect(x, y, cs, cs);
            }
        }
    }

    get pxWidth()  { return this.cols * this.cell; }
    get pxHeight() { return this.rows * this.cell; }
}
