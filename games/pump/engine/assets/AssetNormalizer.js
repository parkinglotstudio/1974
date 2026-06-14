/**
 * Sand Engine — AssetNormalizer v1.0
 * (2026-05-27)
 *
 * pixels.json / prefab.json 로드 시 구버전 포맷을 최신 Sand Engine v2 포맷으로
 * 자동 정규화. AssetLoader에 후처리로 연결하거나 단독으로 호출 가능.
 *
 * 지원 변환:
 *   [pixels.json]
 *   - v0 (1-bit 단일 픽셀 배열)  → { pixels:[], width, height }
 *   - v1 frames 배열             → { frames:[], width, height }
 *   - 최상위 palette 배열 string[] → { palette:[] }  (이미 처리돼 있어도 멱등)
 *   - scanline 배열              → { scanline:[], width, height }
 *
 *   [prefab.json]
 *   - type 없을 때 OBJECT_STATIC 기본값
 *   - layer 없을 때 TYPE_DEFAULTS 자동 채움
 *   - pixels 배열이 있지만 frames 형식이면 frames로 변환
 *
 * 사용법:
 *   import AssetNormalizer from './assets/AssetNormalizer.js';
 *
 *   // AssetLoader 후처리 연결 (SandEngine.init에서)
 *   engine.assets.addPostProcessor(AssetNormalizer.normalize);
 *
 *   // 단독 호출
 *   const normalized = AssetNormalizer.normalize(rawJson, 'pixels');
 */

const TYPE_DEFAULTS = {
    BACKGROUND_FAR:    { layer: 0 },
    BACKGROUND_NEAR:   { layer: 1 },
    BACKGROUND_TILE:   { layer: 1 },
    CHARACTER_PLAYER:  { layer: 2 },
    CHARACTER_NPC:     { layer: 2 },
    CHARACTER_ENEMY:   { layer: 2 },
    ABACUS_FRAME:      { layer: 2 },
    ABACUS_ROD:        { layer: 2 },
    ABACUS_BEAD:       { layer: 2 },
    OBJECT_STATIC:     { layer: 2 },
    OBJECT_ITEM:       { layer: 2 },
    OBJECT_PLATFORM:   { layer: 2 },
    OBJECT_PROJECTILE: { layer: 2 },
    UI_PROBLEM:        { layer: 3 },
    UI_TIMER:          { layer: 3 },
    UI_SCORE:          { layer: 3 },
    UI_LEVEL:          { layer: 3 },
    UI_RESULT:         { layer: 3 },
    UI_HUD_BUTTON:     { layer: 3 },
    PARTICLE_STAR:     { layer: 2 },
    PARTICLE_VORTEX:   { layer: 2 },
    PARTICLE_SHAKE:    { layer: 2 },
    PARTICLE_LEVELUP:  { layer: 2 },
    PARTICLE_STARDUST: { layer: 0 },
};

export default class AssetNormalizer {

    // ── 공개 API ─────────────────────────────────────────────────────

    /**
     * 자동 타입 감지 후 정규화.
     * @param {object} raw   파싱된 JSON 객체
     * @param {string} [hint]  'pixels' | 'prefab' | 'scene' | 'palette' (생략 시 자동 감지)
     * @returns {object}  정규화된 객체 (원본 변형 없음 — 복사본 반환)
     */
    static normalize(raw, hint = null) {
        if (!raw || typeof raw !== 'object') return raw;
        const type = hint ?? AssetNormalizer._detectType(raw);
        switch (type) {
            case 'pixels':  return AssetNormalizer._normalizePixels(raw);
            case 'prefab':  return AssetNormalizer._normalizePrefab(raw);
            case 'palette': return AssetNormalizer._normalizePalette(raw);
            case 'scene':   return raw;   // scene.json은 SceneManager에서 처리
            default:        return raw;
        }
    }

    // ── 타입 감지 ────────────────────────────────────────────────────

    static _detectType(raw) {
        if (raw.schema?.startsWith('PixelJSON'))    return 'pixels';
        if (raw.pixels || raw.frames || raw.scanline) {
            // pixels.json vs prefab.json 구분: prefab은 'type', 'asset', 'collider' 보유
            if (raw.type || raw.asset || raw.collider) return 'prefab';
            return 'pixels';
        }
        if (raw.colors || (Array.isArray(raw.palette) && raw.id)) return 'palette';
        if (raw.scene !== undefined) return 'scene';
        if (raw.asset || raw.type) return 'prefab';
        return 'unknown';
    }

    // ── pixels.json 정규화 ────────────────────────────────────────────

    static _normalizePixels(raw) {
        const out = Object.assign({}, raw);

        // schema 보장
        if (!out.schema) out.schema = 'PixelJSON Sparse v0.1';

        // width/height 숫자 보장
        out.width  = Number(out.width  ?? 0);
        out.height = Number(out.height ?? 0);

        // ── 팔레트 정규화 ─────────────────────────────────────────
        if (out.palette) {
            out.palette = AssetNormalizer._normalizePaletteArray(out.palette);
        }

        // ── frames 정규화 ─────────────────────────────────────────
        if (out.frames) {
            out.frames = out.frames.map(f => {
                if (!f || typeof f !== 'object') return { pixels: [] };
                // 구버전: { pixel_map: [...] } → { pixels: [] }
                if (f.pixel_map && !f.pixels) {
                    return { pixels: AssetNormalizer._pixelMapToSparse(f.pixel_map) };
                }
                return { pixels: f.pixels ?? [] };
            });
        }

        // ── v0 pixel_map 최상위 → pixels 변환 ───────────────────
        if (out.pixel_map && !out.pixels && !out.frames) {
            out.pixels = AssetNormalizer._pixelMapToSparse(out.pixel_map);
            delete out.pixel_map;
        }

        // ── pixels 배열이 숫자 flat 형식이면 [[x,y,idx]] 로 복원 ──
        if (Array.isArray(out.pixels) && out.pixels.length > 0) {
            const first = out.pixels[0];
            if (typeof first === 'number') {
                // flat: [x,y,idx, x,y,idx,...] → [[x,y,idx],...]
                out.pixels = AssetNormalizer._flatToSparse(out.pixels);
            }
        }

        return out;
    }

    // ── prefab.json 정규화 ────────────────────────────────────────────

    static _normalizePrefab(raw) {
        const out = Object.assign({}, raw);

        // type 기본값
        if (!out.type) out.type = 'OBJECT_STATIC';

        // layer 기본값
        if (out.layer == null) {
            out.layer = TYPE_DEFAULTS[out.type]?.layer ?? 2;
        }

        // pixels가 frames 포맷이면 변환 (하위 호환)
        if (Array.isArray(out.pixels) && out.pixels.length > 0) {
            const first = out.pixels[0];
            // { pixels: [...] } 형식이면 frames로 올리기
            if (first && typeof first === 'object' && 'pixels' in first) {
                out.frames = out.pixels;
                delete out.pixels;
            }
        }

        return out;
    }

    // ── palette.json 정규화 ──────────────────────────────────────────

    static _normalizePalette(raw) {
        const out = Object.assign({}, raw);

        // { palette: [] } 래핑 형식
        if (!out.colors && Array.isArray(out.palette)) {
            out.colors = out.palette;
        }

        if (out.colors) {
            out.colors = AssetNormalizer._normalizePaletteArray(out.colors);
        }

        return out;
    }

    // ── 공통 유틸 ─────────────────────────────────────────────────────

    /**
     * 팔레트 배열 정규화:
     *   - 첫 번째 항목이 없거나 null → 'transparent' 보장
     *   - 색상 문자열 소문자 정규화 (#RRGGBB → #rrggbb)
     *   - null/undefined 항목 → 'transparent'
     */
    static _normalizePaletteArray(arr) {
        if (!Array.isArray(arr)) return arr;
        const out = arr.map((c, i) => {
            if (!c || c === 'transparent') return i === 0 ? 'transparent' : null;
            if (typeof c !== 'string') return null;
            const trimmed = c.trim();
            if (trimmed === 'transparent') return 'transparent';
            // #RRGGBB → #rrggbb
            if (trimmed.startsWith('#')) return trimmed.toLowerCase();
            return trimmed;
        });
        // 인덱스 0 = transparent 보장
        if (out[0] !== 'transparent') out[0] = 'transparent';
        return out;
    }

    /**
     * 2D pixel_map [[idx,...],...]  → sparse [[x,y,idx],...]
     */
    static _pixelMapToSparse(pixelMap) {
        const sparse = [];
        for (let y = 0; y < pixelMap.length; y++) {
            const row = pixelMap[y];
            for (let x = 0; x < row.length; x++) {
                const idx = row[x];
                if (idx) sparse.push([x, y, idx]);
            }
        }
        return sparse;
    }

    /**
     * flat 배열 [x,y,idx, x,y,idx,...] → [[x,y,idx],...]
     */
    static _flatToSparse(flat) {
        const sparse = [];
        for (let i = 0; i < flat.length - 2; i += 3) {
            sparse.push([flat[i], flat[i+1], flat[i+2]]);
        }
        return sparse;
    }
}
