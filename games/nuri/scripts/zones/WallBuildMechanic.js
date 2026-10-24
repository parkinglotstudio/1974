// WallBuildMechanic.js — 1번 구역 메커니즘:
//   맵 전체에 여러 개의 독립된 생성 지점(spot)이 있고, 각 지점은
//     - 자기만의 리젠 주기(blockIntervalMs)
//     - 자기만의 중력 방향(gravity: down/up/left/right) — 데이터로 따로 관리.
//       중력 방향이 "쌓이는 면 + 진입(생성) 위치 + 하드드롭 방향"을 모두 결정한다.
//     - 화면 사방에서 원소들이 무리로 날아와 공기처럼 떠도는 자기 풀(field)
//   을 갖고 독립적으로 테트로미노를 쌓는다.
// ─────────────────────────────────────────────────────────────
// 블록 주기: drift(대기) → gather(풀에서 끌어모아 진입 가장자리에 형성) → bind(묶임) → fall(중력방향 슬라이드·고정).
// 벽이 가득 차면(choosePlacement===null) 생성을 멈춘다(_full). 추후 블록이 부서지면 notifyCleared()로 재개.
// 다양한 모양 + 빈틈 최소: 7종×4회전×lane 을 평가해 새 구멍 최소 자리를 솔버(WallGrid)로 선택.
// 모든 좌표 월드 기준. render(ctx)의 ctx는 translate(-cameraX) 안에서 전달됨.

import ZoneMechanic from './ZoneMechanic.js';
import WallGrid     from './WallGrid.js';

const ELEM_COLORS = ['#FFD93D', '#A2A8D3', '#FF5722', '#00E676', '#E040FB']; // 떠도는 원소색
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn    = t => t * t;

// ── 회전 유틸 (셀 오프셋 90° CW + 정규화) ──
function normalize(cells) {
    const minC = Math.min(...cells.map(p => p[0])), minR = Math.min(...cells.map(p => p[1]));
    return cells.map(([c, r]) => [c - minC, r - minR]);
}
function rotateCW(cells) { return normalize(cells.map(([c, r]) => [r, -c])); }
function rotationsOf(base) {
    const seen = new Set(), out = [];
    let cur = normalize(base.map(p => p.slice()));
    for (let i = 0; i < 4; i++) {
        const key = cur.map(p => p.join(',')).sort().join(';');
        if (!seen.has(key)) { seen.add(key); out.push(cur); }
        cur = rotateCW(cur);
    }
    return out;
}

// ── 단일 지점(spot) — 자기만의 grid/field/중력/주기를 가진 벽쌓기 유닛 ──
class WallSpot {
    constructor(mech, spotCfg) {
        this.mech = mech;
        const cfg = mech.cfg;
        this.gatherMs      = cfg.gatherMs      ?? 1800;
        this.bindMs        = cfg.bindMs        ?? 300;
        this.fallMs        = cfg.fallMs        ?? 700;
        this.blockInterval = spotCfg.blockIntervalMs ?? 10000;
        this.driftMs       = Math.max(0, this.blockInterval - this.gatherMs - this.bindMs - this.fallMs);
        this.fieldCount    = cfg.fieldCount    ?? 16;
        this.fieldBurst    = cfg.fieldBurst    ?? 3;
        this.fieldSpawnMs  = cfg.fieldSpawnMs  ?? 650;
        this.flashMs       = cfg.lineFlashMs   ?? 360;

        const cell = cfg.cell ?? 34, cols = cfg.cols ?? 15, rows = cfg.rows ?? 15;
        const ceilY   = cfg.ceilY   ?? 30;
        const groundY = cfg.groundY ?? 600;
        // 중력별 격자 월드 배치: down=바닥면에 붙음 / up=천장면에 붙음 / left·right=세로 가운데
        const gravity = ['down', 'up', 'left', 'right'].includes(spotCfg.gravity) ? spotCfg.gravity : 'down';
        this.gravity = gravity;
        const topY = spotCfg.topY != null ? spotCfg.topY
                   : gravity === 'down' ? groundY - rows * cell
                   : gravity === 'up'   ? ceilY
                   : Math.round((ceilY + groundY) / 2 - rows * cell / 2);
        this.originX = spotCfg.originX ?? 0;
        this.grid = new WallGrid({ originX: this.originX, topY, cols, rows, cell, gravity });

        this.rotations = mech.rotations; this.colors = mech.colors;

        this.field  = [];     // 떠도는 원소들(이 지점 소속)
        this.active = null;   // 형성/낙하 중인 블록
        this.cycleT = 0;
        this._fieldAcc = 0;
        this._full = false;   // 가득 참 → 생성 정지(=게임오버)
        this.spawnedLines = new Set();   // 이미 몬스터 뽑은 줄(중복 방지) — collapse 안 하므로 줄번호 고정
        this.clears = [];     // 줄 완성 강조 플래시 시퀀스(끝나면 몬스터 출현)
        this.fx     = [];     // 출현 폭발 이펙트(링/스파크)
        for (let i = 0; i < 3; i++) this._spawnBurst();
    }

    // 추후 블록 파괴 시 호출 — 생성 재개
    notifyCleared() { this._full = false; }

    // ── 떠도는 원소 필드 ───────────────────────────────────────
    _spawnBurst() {
        const g = this.grid;
        const cx = g.originX + g.pxWidth / 2, cy = g.topY + g.pxHeight / 2;
        const dir = ['top', 'left', 'right', 'bottom'][(Math.random() * 4) | 0];   // 사방
        let bx, by;
        if      (dir === 'top')    { bx = g.originX + Math.random() * g.pxWidth; by = g.topY - 60; }
        else if (dir === 'bottom') { bx = g.originX + Math.random() * g.pxWidth; by = g.topY + g.pxHeight + 60; }
        else if (dir === 'left')   { bx = g.originX - 24;                        by = g.topY + Math.random() * g.pxHeight; }
        else                       { bx = g.originX + g.pxWidth + 24;            by = g.topY + Math.random() * g.pxHeight; }
        for (let i = 0; i < this.fieldBurst; i++) {
            const px = bx + (Math.random() - 0.5) * 48, py = by + (Math.random() - 0.5) * 48;
            const dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy) || 1, sp = 40 + Math.random() * 40;
            this.field.push({ x: px, y: py, vx: dx / d * sp, vy: dy / d * sp, col: ELEM_COLORS[(Math.random() * ELEM_COLORS.length) | 0] });
        }
    }

    _drift(f, dtSec) {
        const g = this.grid;
        f.vx += (Math.random() - 0.5) * 60 * dtSec;
        f.vy += (Math.random() - 0.5) * 60 * dtSec;
        const sp = Math.hypot(f.vx, f.vy), max = 56;
        if (sp > max) { f.vx = f.vx / sp * max; f.vy = f.vy / sp * max; }
        f.x += f.vx * dtSec; f.y += f.vy * dtSec;
        const x0 = g.originX - 80, x1 = g.originX + g.pxWidth + 80, y0 = g.topY - 80, y1 = g.topY + g.pxHeight + 80;
        if (f.x < x0) { f.x = x0; f.vx = Math.abs(f.vx); }
        if (f.x > x1) { f.x = x1; f.vx = -Math.abs(f.vx); }
        if (f.y < y0) { f.y = y0; f.vy = Math.abs(f.vy); }
        if (f.y > y1) { f.y = y1; f.vy = -Math.abs(f.vy); }
    }

    // 풀에서 원소를 끌어모아 블록 형성 시작 (중력 방향 기준 진입 가장자리에 형성)
    _startBlock() {
        // down(화면벽)은 줄 자주 완성되게 테트리스 AI, 그 외 중력은 구멍최소 솔버
        const pick = this.grid.gravity === 'down'
            ? this.grid.chooseBest(this.rotations)
            : this.grid.choosePlacement(this.rotations);
        if (!pick) {   // 벽 가득 = 블록 무리 완성 → 보스로 일어선다 (게임오버 아님)
            if (!this._full) {
                this._full = true;
                const g = this.grid, cx = g.originX + g.pxWidth / 2, cy = g.topY + g.pxHeight / 2;
                this._emitBossBurst(cx, cy);
                this.mech.game.onWallComplete?.(cx, cy);
                this._resetWall();   // 블록은 보스가 되어 사라짐 → 다음 웨이브 재축조
            }
            this.cycleT = 0; return;
        }
        const need = pick.cells.length;
        while (this.field.length < need) this._spawnBurst();
        for (let i = this.field.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.field[i], this.field[j]] = [this.field[j], this.field[i]]; }
        const chosen = this.field.splice(0, need);

        const g = this.grid, cell = g.cell;
        const lane  = g.G.axis === 'v' ? pick.col : pick.row;
        const entry = g.entryOrigin(pick.cells, lane);   // 진입(생성) 가장자리 좌표
        const particles = pick.cells.map(([c, r], i) => {
            const f = chosen[i];
            return { x: f.x, y: f.y, gx: f.x, gy: f.y,
                tx: g.originX + (entry.col + c) * cell + cell / 2,
                ty: g.topY    + (entry.row + r) * cell + cell / 2, col: f.col };
        });
        this.active = {
            phase: 'gather', cells: pick.cells, color: this.colors[pick.key],
            sc: entry.col, sr: entry.row, col: pick.col, row: pick.row,
            curCol: entry.col, curRow: entry.row, particles, phaseT: 0,
        };
    }

    update(dt, dtSec) {
        this._fieldAcc += dt;
        if (this.field.length < this.fieldCount && this._fieldAcc >= this.fieldSpawnMs) { this._fieldAcc = 0; this._spawnBurst(); }
        for (const f of this.field) this._drift(f, dtSec);

        // 줄 완성 강조 플래시 → 끝나는 순간 폭발 + 몬스터 출현(타이밍 동기화)
        for (let i = this.clears.length - 1; i >= 0; i--) {
            const cl = this.clears[i];
            cl.t += dt;
            if (cl.t >= cl.dur) {
                this._emitBurst(cl.cx, cl.cy, cl.tier);
                this.mech.game.spawnWallEnemy?.(cl.cx, cl.cy, cl.tier);
                this.clears.splice(i, 1);
            }
        }
        // 출현 이펙트(링/스파크) 진행
        for (let i = this.fx.length - 1; i >= 0; i--) {
            const f = this.fx[i];
            f.t += dt;
            if (f.kind === 'spark') { f.x += f.vx * dtSec; f.y += f.vy * dtSec; f.vx *= 0.9; f.vy *= 0.9; }
            if (f.t >= f.dur) this.fx.splice(i, 1);
        }

        if (!this.active) {
            if (this._full) return;                    // 가득 → 더 안 만듦
            this.cycleT += dt;
            if (this.cycleT >= this.driftMs) this._startBlock();
            return;
        }
        const a = this.active;
        a.phaseT += dt;
        if (a.phase === 'gather') {
            const u = easeInOut(Math.min(a.phaseT / this.gatherMs, 1));
            for (const p of a.particles) { p.x = p.gx + (p.tx - p.gx) * u; p.y = p.gy + (p.ty - p.gy) * u; }
            if (a.phaseT >= this.gatherMs) { a.phase = 'bind'; a.phaseT = 0; }
        } else if (a.phase === 'bind') {
            if (a.phaseT >= this.bindMs) { a.phase = 'fall'; a.phaseT = 0; }
        } else if (a.phase === 'fall') {
            const u = easeIn(Math.min(a.phaseT / this.fallMs, 1));   // 진입→안착, 중력 방향 슬라이드
            a.curCol = a.sc + (a.col - a.sc) * u;
            a.curRow = a.sr + (a.row - a.sr) * u;
            if (a.phaseT >= this.fallMs) {
                this.grid.placeAt(a.cells, a.col, a.row, a.color);   // 고정
                this.active = null; this.cycleT = 0;
                this._resolveLines();                                 // 줄 완성 → 적 출현
            }
        }
    }

    // 완성된 줄 → 적군. 1줄=일반(cell_basic), 2줄+=정예(cell_elite).
    // 블록은 제거하지 않고 그대로 남긴다(화면이 점점 차오름). 이미 뽑은 줄은 spawnedLines로 중복 방지.
    // 연출: 줄 흰빛 강조 플래시(flashMs) → 끝나는 순간 폭발+몬스터 출현.
    _resolveLines() {
        const lines = this.grid.fullLines().filter(l => !this.spawnedLines.has(l));
        if (!lines.length) return;
        for (const l of lines) this.spawnedLines.add(l);
        const tier = lines.length >= 2 ? 'elite' : 'normal';
        const g = this.grid, cell = g.cell;
        const cells = [];   // 플래시용 셀(월드 좌상단 + 색)
        if (g.G.axis === 'v') {
            for (const r of lines) for (let c = 0; c < g.cols; c++) cells.push({ x: g.originX + c * cell, y: g.topY + r * cell, color: g.grid[r][c] });
        } else {
            for (const c of lines) for (let r = 0; r < g.rows; r++) cells.push({ x: g.originX + c * cell, y: g.topY + r * cell, color: g.grid[r][c] });
        }
        let sx = 0, sy = 0;
        for (const idx of lines) { const c = g.lineCenter(idx); sx += c.x; sy += c.y; }
        sx /= lines.length; sy /= lines.length;
        this.clears.push({ cells, t: 0, dur: this.flashMs, cx: sx, cy: sy, tier, spawned: false });
    }

    _emitBurst(cx, cy, tier) {
        const baseCol = tier === 'elite' ? '#FFB300' : '#00E676';
        const cell = this.grid.cell;
        // 충격파 링 2겹
        this.fx.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 460, r0: cell * 0.4, r1: cell * (tier === 'elite' ? 4.2 : 2.8), w: 3.5, col: '#fff' });
        this.fx.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 560, r0: cell * 0.2, r1: cell * (tier === 'elite' ? 5.4 : 3.6), w: 2, col: baseCol });
        // 스파크 방사
        const n = tier === 'elite' ? 30 : 18;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 220;
            this.fx.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, dur: 360 + Math.random() * 280, col: Math.random() < 0.5 ? baseCol : '#fff' });
        }
    }

    // 벽 완성 → 보스 변신 대폭발 (큰 링 3겹 + 모래색 스파크 다발)
    _emitBossBurst(cx, cy) {
        const cell = this.grid.cell;
        for (let i = 0; i < 3; i++)
            this.fx.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 700 + i * 160, r0: cell * 0.5, r1: cell * (7 + i * 2.5), w: 5 - i, col: i === 0 ? '#fff' : '#C2B280' });
        for (let i = 0; i < 56; i++) {
            const a = Math.random() * Math.PI * 2, sp = 180 + Math.random() * 340;
            this.fx.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, dur: 480 + Math.random() * 420, col: Math.random() < 0.4 ? '#fff' : (Math.random() < 0.5 ? '#C2B280' : '#FFFCE9') });
        }
    }

    // 보스가 되어 블록 무리 소멸 → 다음 웨이브를 위해 격자 초기화
    _resetWall() {
        this.grid.grid = Array.from({ length: this.grid.rows }, () => new Array(this.grid.cols).fill(null));
        this.spawnedLines.clear();
        this.active = null;
        this._full = false;
        this.cycleT = 0;
    }

    render(ctx) {
        this.grid.render(ctx);
        const g = this.grid, cell = g.cell;

        const fs = cell * 0.42;
        ctx.globalAlpha = 0.78;
        for (const f of this.field) { ctx.fillStyle = f.col; ctx.fillRect(f.x - fs / 2, f.y - fs / 2, fs, fs); }
        ctx.globalAlpha = 1;

        this._renderClears(ctx, cell);
        this._renderFx(ctx);

        const a = this.active;
        if (!a) return;

        if (a.phase === 'gather') {
            ctx.globalAlpha = 0.14;
            ctx.strokeStyle = a.color; ctx.lineWidth = 1.5;
            for (const [c, r] of a.cells) {
                const x = g.originX + (a.sc + c) * cell, y = g.topY + (a.sr + r) * cell;
                ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
            }
            ctx.globalAlpha = 1;
            const s = cell * 0.5;
            for (const p of a.particles) { ctx.fillStyle = p.col; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }

        } else if (a.phase === 'bind') {
            ctx.save();
            ctx.globalAlpha = 0.55 + 0.45 * Math.sin((a.phaseT / this.bindMs) * Math.PI);
            for (const [c, r] of a.cells) {
                const x = g.originX + (a.sc + c) * cell, y = g.topY + (a.sr + r) * cell;
                ctx.fillStyle = a.color; ctx.fillRect(x, y, cell, cell);
            }
            ctx.restore();

        } else if (a.phase === 'fall') {
            for (const [c, r] of a.cells) {
                const x = g.originX + (a.curCol + c) * cell, y = g.topY + (a.curRow + r) * cell;
                ctx.fillStyle = a.color; ctx.fillRect(x, y, cell, cell);
            }
        }
    }

    // 줄 완성 강조 플래시 — 흰빛 펄스 + 색 테두리 + 발광
    _renderClears(ctx, cell) {
        for (const cl of this.clears) {
            const u = Math.min(cl.t / cl.dur, 1);
            const pulse = 0.5 + 0.5 * Math.sin(u * Math.PI * 4);   // 빠른 깜빡임
            ctx.save();
            ctx.shadowColor = cl.tier === 'elite' ? '#FFB300' : '#fff';
            ctx.shadowBlur  = 16 + 14 * pulse;
            ctx.globalAlpha = 0.45 + 0.55 * pulse;
            for (const c of cl.cells) { ctx.fillStyle = '#fff'; ctx.fillRect(c.x, c.y, cell, cell); }
            ctx.globalAlpha = 0.9;
            for (const c of cl.cells) { ctx.strokeStyle = c.color || '#fff'; ctx.lineWidth = 2; ctx.strokeRect(c.x + 1, c.y + 1, cell - 2, cell - 2); }
            ctx.restore();
        }
    }

    // 출현 폭발 — 충격파 링 + 스파크
    _renderFx(ctx) {
        for (const f of this.fx) {
            const u = Math.min(f.t / f.dur, 1);
            if (f.kind === 'ring') {
                const r = f.r0 + (f.r1 - f.r0) * (1 - Math.pow(1 - u, 2));   // ease-out 확장
                ctx.globalAlpha = (1 - u) * 0.9;
                ctx.strokeStyle = f.col; ctx.lineWidth = f.w;
                ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
            } else {
                const s = 5 * (1 - u) + 1.5;
                ctx.globalAlpha = 1 - u;
                ctx.fillStyle = f.col; ctx.fillRect(f.x - s / 2, f.y - s / 2, s, s);
            }
        }
        ctx.globalAlpha = 1;
    }
}

export default class WallBuildMechanic extends ZoneMechanic {
    constructor(game, cfg = {}) {
        super(game, cfg);
        const shapes = cfg.shapes || {};
        this.rotations = {}; this.colors = {};
        for (const k of Object.keys(shapes)) {
            if (k[0] === '_') continue;
            this.rotations[k] = rotationsOf(shapes[k].cells);
            this.colors[k]    = shapes[k].color || '#C8102E';
        }

        // 지점 설정이 없으면(구버전 호출 호환) 단일 지점으로 동작
        const spotCfgs = cfg.spots?.length ? cfg.spots : [{
            blockIntervalMs: cfg.blockIntervalMs ?? 10000,
            gravity: cfg.gravity ?? 'down',
            originX: (game._cameraX | 0) + (cfg.marginX ?? 360),
        }];
        this.spots = spotCfgs.map(sc => new WallSpot(this, sc));
        this.fragments = [];   // 기억 결정 — 망각세포 처치 시 생겨 벽으로 날아가 재료가 됨
    }

    onEnter() {}
    onExit()  { this.spots.length = 0; this.fragments.length = 0; }

    // 망각세포 처치 → 기억 결정(네모) n개 생성 → 벽(field)으로 날아감
    spawnFragments(x, y, n) {
        const spot = this.spots[0];
        if (!spot) return;
        const g = spot.grid;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const tx = g.originX + (0.15 + 0.7 * Math.random()) * g.pxWidth;
            const ty = g.topY    + (0.05 + 0.35 * Math.random()) * g.pxHeight;
            this.fragments.push({
                x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, tx, ty,
                // 솟는 듯 잠깐 바깥으로 튄 뒤 벽으로 호밍
                vx: Math.cos(a) * (120 + Math.random() * 120), vy: Math.sin(a) * (120 + Math.random() * 120) - 60,
                t: 0, col: '#BFE9FF',
            });
        }
    }

    _updateFragments(dtSec) {
        const spot = this.spots[0];
        for (let i = this.fragments.length - 1; i >= 0; i--) {
            const f = this.fragments[i];
            f.t += dtSec;
            // 초반 튕김(관성) → 이후 벽으로 가속 호밍
            const homing = Math.min(f.t / 0.35, 1);
            f.vx *= (1 - 0.06); f.vy *= (1 - 0.06);
            const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1;
            const pull = 1400 * homing;
            f.vx += dx / d * pull * dtSec; f.vy += dy / d * pull * dtSec;
            const sp = Math.hypot(f.vx, f.vy), max = 640;
            if (sp > max) { f.vx = f.vx / sp * max; f.vy = f.vy / sp * max; }
            f.x += f.vx * dtSec; f.y += f.vy * dtSec;
            if (d < 14 && f.t > 0.3 && spot) {   // 도착 → 벽 재료(field)로 합류
                spot.field.push({ x: f.tx, y: f.ty, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, col: f.col });
                this.fragments.splice(i, 1);
            }
        }
    }

    update(dt) {
        const dtSec = dt / 1000;
        this._updateFragments(dtSec);
        for (const s of this.spots) s.update(dt, dtSec);
    }

    render(ctx) {
        for (const s of this.spots) s.render(ctx);
        // 기억 결정 (네모, 옅은 청백 발광)
        if (this.fragments.length) {
            const s = (this.spots[0]?.grid.cell ?? 44) * 0.42;
            ctx.save();
            ctx.shadowColor = '#BFE9FF'; ctx.shadowBlur = 8;
            for (const f of this.fragments) {
                ctx.globalAlpha = 0.95;
                ctx.fillStyle = f.col;
                ctx.fillRect(f.x - s / 2, f.y - s / 2, s, s);
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }
}
