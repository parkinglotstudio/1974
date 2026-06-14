/**
 * Sand Engine — CSV 데이터 로더 v1.0
 * (2026-06-03)
 *
 * 게임 데이터를 코드 상수가 아닌 CSV 테이블에서 읽기 위한 범용 유틸.
 * 엔진은 로직(코드), 게임 데이터(맵·캐릭터·애니·FX 수치)는 CSV로 분리한다.
 * → 나중에 에디터 툴에서 CSV만 편집하면 게임이 바뀐다.
 *
 * 두 가지 테이블 형태 지원:
 *   1) CsvTable  — 행 = 레코드 (maps.csv, characters.csv, animations.csv)
 *                  헤더 첫 줄 = 열 이름. 각 행은 {열이름: 값(문자열)} 객체.
 *   2) ParamTable — key,value 형 (fx_params.csv). num()/bool()/str() 타입 접근.
 *
 * CSV 규칙:
 *   - 첫 비주석 줄 = 헤더(열 이름)
 *   - '#' 로 시작하는 줄 = 주석 (무시)
 *   - 빈 줄 무시
 *   - 쉼표 구분. 값에 쉼표가 있으면 "큰따옴표"로 감쌈 (설명 열 등)
 */

// ── 파서 ──────────────────────────────────────────────────────────
// 한 줄을 필드 배열로 (큰따옴표 안의 쉼표는 보존, "" → ")
function splitLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }   // 이스케이프된 따옴표
                else inQ = false;
            } else cur += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

/** CSV 텍스트 → { header:[], rows:[{col:val}] } */
export function parseCsv(text) {
    const lines = text.split(/\r?\n/);
    let header = null;
    const rows = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;       // 빈 줄/주석 skip
        const cells = splitLine(raw);
        if (!header) { header = cells; continue; }
        // 전부 빈 칸인 줄 skip
        if (cells.every(c => c === '')) continue;
        const obj = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = cells[i] ?? '';
        rows.push(obj);
    }
    return { header: header ?? [], rows };
}

// ── CsvTable: 행 = 레코드 ────────────────────────────────────────
export class CsvTable {
    constructor(parsed) {
        this.header = parsed.header;
        this.rows   = parsed.rows;
    }
    /** 전체 행 */
    all() { return this.rows; }
    /** idField 열 값이 val 인 첫 행 */
    byId(idField, val) { return this.rows.find(r => r[idField] === String(val)) ?? null; }
    /** idField 기준 Map<value, row> */
    indexBy(idField) {
        const m = new Map();
        for (const r of this.rows) m.set(r[idField], r);
        return m;
    }
    /** idField 열 값이 val 인 모든 행 */
    filter(field, val) { return this.rows.filter(r => r[field] === String(val)); }
}

// ── ParamTable: key,value 형 ─────────────────────────────────────
export class ParamTable {
    constructor(parsed, { keyCol = 'key', valCol = 'value' } = {}) {
        this._map = new Map();
        this._meta = new Map();   // {min,max,desc} — 툴(슬라이더)용
        for (const r of parsed.rows) {
            const k = r[keyCol];
            if (k == null || k === '') continue;
            this._map.set(k, r[valCol]);
            this._meta.set(k, { min: r.min, max: r.max, desc: r.desc });
        }
    }
    has(key) { return this._map.has(key); }
    /** 숫자. 없거나 NaN이면 def */
    num(key, def = 0) {
        const v = this._map.get(key);
        if (v == null || v === '') return def;
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }
    /** 불리언. 1/true/on/yes = true */
    bool(key, def = false) {
        const v = this._map.get(key);
        if (v == null || v === '') return def;
        return /^(1|true|on|yes)$/i.test(String(v).trim());
    }
    /** 문자열 */
    str(key, def = '') {
        const v = this._map.get(key);
        return (v == null || v === '') ? def : String(v);
    }
    /** 툴용 메타 {min,max,desc} */
    meta(key) { return this._meta.get(key) ?? null; }
    keys() { return [...this._map.keys()]; }
}

// ── 로더 ──────────────────────────────────────────────────────────
async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`CSV load failed ${r.status}: ${url}`);
    return r.text();
}

/** URL → CsvTable */
export async function loadCsvTable(url) {
    return new CsvTable(parseCsv(await fetchText(url)));
}

/** URL → ParamTable */
export async function loadParamTable(url, opts) {
    return new ParamTable(parseCsv(await fetchText(url)), opts);
}
