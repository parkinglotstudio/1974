/**
 * Sand Engine — PaletteValidator v1.0
 * (2026-05-27)
 *
 * pixels.json의 팔레트 인덱스가 실제 팔레트 범위를 벗어나거나
 * 예약 인덱스(9/10/11/12)와 충돌하는지 검사.
 *
 * 개발 중 에셋 품질 보증용. 프로덕션 빌드에서는 생략 가능.
 *
 * 사용법:
 *   import PaletteValidator from './assets/PaletteValidator.js';
 *
 *   // 씬 로드 시 자동 검사 (PrefabSystem 옵션)
 *   const report = PaletteValidator.validate(pixelsJSON, entityId);
 *   if (report.errors.length) console.error(report);
 *
 *   // 전체 씬 일괄 검사
 *   const reports = await PaletteValidator.validateScene(sceneJSON, assetLoader, 'assets/');
 */

/** 예약 인덱스 정의 (변경 금지) */
const RESERVED = {
    0:  'transparent',
    9:  'collision/ground',
    10: 'emissive/glow',
    11: 'danger',
    12: 'fog/반투명',
};

export default class PaletteValidator {

    // ── 단일 pixels.json 검사 ─────────────────────────────────────────

    /**
     * pixels.json 객체 검사.
     * @param {object}  pixelsJSON   _loadPixelAsset 결과 or raw pixels.json
     * @param {string}  [assetId]    로그 식별자 (파일명 등)
     * @returns {ValidationReport}
     */
    static validate(pixelsJSON, assetId = 'unknown') {
        const errors   = [];
        const warnings = [];
        const info     = [];

        const palette = pixelsJSON.palette ?? [];
        const palSize = palette.length;

        if (palSize === 0) {
            warnings.push('팔레트 없음 — 글로벌 PaletteManager 팔레트 사용');
        }

        // ── 팔레트 구조 검사 ─────────────────────────────────────
        if (palette[0] !== undefined && palette[0] !== 'transparent') {
            errors.push(`인덱스 0 는 "transparent" 이어야 합니다. 현재값: "${palette[0]}"`);
        }

        for (let i = 0; i < palette.length; i++) {
            const c = palette[i];
            if (c === null || c === undefined) {
                warnings.push(`인덱스 ${i}: null 팔레트 항목`);
                continue;
            }
            if (c === 'transparent') continue;
            if (typeof c !== 'string') {
                errors.push(`인덱스 ${i}: 팔레트 항목이 문자열이 아닙니다 (${typeof c})`);
                continue;
            }
            if (!c.match(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/) &&
                !c.match(/^rgba?\s*\(/)) {
                warnings.push(`인덱스 ${i}: 비표준 색상 포맷 "${c}"`);
            }
        }

        // ── 픽셀 데이터 인덱스 범위 검사 ─────────────────────────
        const pixelArrays = [];
        if (pixelsJSON.pixels)   pixelArrays.push(pixelsJSON.pixels);
        if (pixelsJSON.frames)   pixelArrays.push(...pixelsJSON.frames.map(f => f.pixels ?? []));
        if (pixelsJSON.scanline) {
            // scanline: 1-D 배열 검사
            const sl = pixelsJSON.scanline;
            const outOfRange = new Set();
            const reservedHit = new Set();
            for (const idx of sl) {
                if (idx === 0) continue;
                if (palSize > 0 && idx >= palSize) outOfRange.add(idx);
                if (idx !== 0 && RESERVED[idx] && idx !== 9) {
                    // 9(collision)은 배경에서 종종 사용 — 경고만
                    reservedHit.add(idx);
                }
            }
            for (const idx of outOfRange) {
                errors.push(`scanline: 인덱스 ${idx} 가 팔레트 범위(${palSize}) 초과`);
            }
            for (const idx of reservedHit) {
                warnings.push(`scanline: 예약 인덱스 ${idx}(${RESERVED[idx]}) 사용 — 엔진 특수 처리 대상`);
            }
        }

        for (const pixels of pixelArrays) {
            if (!Array.isArray(pixels)) continue;
            const outOfRange = new Set();
            const reservedHit = new Set();
            for (const [, , idx] of pixels) {
                if (idx === 0) continue;
                if (palSize > 0 && idx >= palSize) outOfRange.add(idx);
                if (RESERVED[idx] && idx !== 0) reservedHit.add(idx);
            }
            for (const idx of outOfRange) {
                errors.push(`픽셀 인덱스 ${idx} 가 팔레트 범위(${palSize}) 초과`);
            }
            for (const idx of reservedHit) {
                warnings.push(`예약 인덱스 ${idx}(${RESERVED[idx]}) 사용 — 엔진 특수 처리 대상`);
            }
        }

        // ── 통계 정보 ─────────────────────────────────────────────
        const totalPixels = pixelsJSON.scanline
            ? pixelsJSON.scanline.length
            : (pixelArrays.reduce((s, a) => s + a.length, 0));
        info.push(`팔레트 ${palSize}색 / 총 픽셀 ${totalPixels.toLocaleString()}`);

        const pass = errors.length === 0;
        if (pass && warnings.length === 0) {
            info.push('검사 통과 ✓');
        }

        return { assetId, pass, errors, warnings, info };
    }

    // ── 씬 전체 일괄 검사 ────────────────────────────────────────────

    /**
     * scene.json 의 모든 엔티티 에셋 검사.
     * @param {object}      sceneJSON
     * @param {AssetLoader} assetLoader
     * @param {string}      assetBasePath  예: 'assets/'
     * @returns {ValidationReport[]}
     */
    static async validateScene(sceneJSON, assetLoader, assetBasePath = 'assets/') {
        const reports = [];
        for (const entity of (sceneJSON.entities ?? [])) {
            // prefab → asset 경로 추출
            const assetPath = entity._assetPath ?? null;
            if (!assetPath) continue;

            let json;
            try {
                json = await assetLoader.load(assetBasePath + assetPath);
            } catch {
                reports.push({
                    assetId: assetPath,
                    pass: false,
                    errors: ['에셋 로드 실패'],
                    warnings: [],
                    info: [],
                });
                continue;
            }

            reports.push(PaletteValidator.validate(json, assetPath));
        }
        return reports;
    }

    // ── 리포트 출력 헬퍼 ─────────────────────────────────────────────

    /**
     * ValidationReport[] → 콘솔 출력
     * @param {ValidationReport[]} reports
     */
    static printReports(reports) {
        let totalErrors = 0;
        let totalWarns  = 0;
        for (const r of reports) {
            const mark = r.pass ? '✓' : '✗';
            const tag  = `[PaletteValidator] ${mark} ${r.assetId}`;
            if (r.errors.length) {
                console.error(tag);
                r.errors.forEach(e => console.error('  ERROR:', e));
                totalErrors += r.errors.length;
            } else if (r.warnings.length) {
                console.warn(tag);
                r.warnings.forEach(w => console.warn('  WARN:', w));
            } else {
                console.log(tag, `— ${r.info.join(' / ')}`);
            }
            totalWarns += r.warnings.length;
        }
        if (reports.length > 1) {
            console.log(`[PaletteValidator] 완료: ${reports.length}개 — 오류 ${totalErrors}, 경고 ${totalWarns}`);
        }
    }

    /**
     * 단일 리포트 콘솔 출력 (개발 편의)
     */
    static print(report) {
        PaletteValidator.printReports([report]);
    }
}

/**
 * @typedef {object} ValidationReport
 * @property {string}   assetId   에셋 식별자
 * @property {boolean}  pass      오류 없으면 true
 * @property {string[]} errors    오류 목록
 * @property {string[]} warnings  경고 목록
 * @property {string[]} info      통계 정보
 */
