/**
 * Sand Engine — PaletteManager v2.0
 * 풀컬러 팔레트(64~256색) 기반 색상 관리 (2026-05-27 확장)
 *
 * 변경 사항 (v1 → v2):
 *   - 1-bit 흑백 폐기 → 64~128색 풀컬러 지원
 *   - 팔레트 포맷: { id, colors: ["#rrggbb", ...], special: {} }
 *   - 구형 배열 포맷 하위 호환 유지
 *   - dithering on/off 플래그 (scene.json 선언, DitherEngine 참조용)
 *   - 특수 인덱스 헬퍼: isCollision / isEmissive / isDanger / isFog
 *
 * 팔레트 인덱스 예약 (전 챕터 공통):
 *   0  = 투명 (transparent)
 *   1  = 실루엣 (캐릭터 기본 검정)
 *   2~8 = 일반 픽셀
 *   9  = 충돌/땅 (CollisionSystem 자동)
 *   10 = 발광체  (GlowSystem 자동 글로우)
 *   11 = 위험    (데미지 처리)
 *   12 = 반투명/안개 (FogSystem 자동)
 *
 * 사용법:
 *   pm.load({ id: 'ch01', colors: [...], special: { 9: 'collision' } });
 *   pm.load(['transparent', '#ffffff', ...]);  // 구형 배열도 OK
 *   pm.swap('bright_flash');   // 순간 이펙트용 교체
 *   pm.restore();              // 원본 복원
 *   pm.trigger('scene_10');    // 이벤트 트리거
 *   pm.isEmissive(10);         // → true
 */

// ── 챕터별 기본 팔레트 ────────────────────────────────────────────────
// 픽셀 파일에 palette 지정이 없을 때, 또는 swap('ch01') 호출 시 사용
const CHAPTER_PALETTES = {
    ch01: {
        id:   'ch01_warm_amber',
        era:  '1974~1980',
        desc: '따뜻한 앰버 — 햇빛, 저녁 노을, 연탄불',
        colors: [
            'transparent',   // 0: 투명
            '#12080a',       // 1: 실루엣 (거의 검정)
            '#2a1a0e',       // 2: 어두운 갈색
            '#5c3820',       // 3: 갈색
            '#9a6030',       // 4: 황갈색
            '#c8843a',       // 5: 앰버
            '#e8a850',       // 6: 밝은 앰버
            '#f8d080',       // 7: 황금
            '#8c5828',       // 8: 흙갈색
            '#1e1008',       // 9: 땅 / 충돌 (진한 흑갈색)
            '#ffd044',       // 10: 발광 (가로등, 연탄불)
            '#cc2800',       // 11: 위험
            '#c8b09070',     // 12: 안개 / 반투명 (alpha hex)
            '#3a5c2a',       // 13: 어두운 녹색 (이끼, 나무 그늘)
            '#6a9448',       // 14: 녹색 (나무, 풀)
            '#98c468',       // 15: 밝은 녹색
            '#1c2e50',       // 16: 어두운 남색 (밤하늘)
            '#2e4870',       // 17: 남색
            '#4a70a0',       // 18: 파랑 (낮 하늘)
            '#7aa8cc',       // 19: 밝은 파랑 (하늘 하이라이트)
            '#b8d8e8',       // 20: 연한 하늘색
            '#706050',       // 21: 회갈색 (시멘트, 담벼락)
            '#908070',       // 22: 회색 (아스팔트)
            '#b0a898',       // 23: 밝은 회색
            '#e8e0d0',       // 24: 베이지 (흰벽, 천장)
            '#d04820',       // 25: 주황빨강 (지붕, 벽돌)
            '#b83820',       // 26: 진한 빨강 (벽돌 그늘)
            '#f07840',       // 27: 연한 주황 (저녁 노을)
        ],
        special: {
            9:  'collision',
            10: 'emissive',
            11: 'danger',
            12: 'fog',
        },
    },

    ch02: {
        id:   'ch02_arcade_neon',
        era:  '1981~1986',
        desc: '아케이드 형광 — CRT 그린/앰버, 네온',
        colors: [
            'transparent',   // 0
            '#080810',       // 1: 실루엣 (짙은 남색 검정)
            '#101828',       // 2: 어두운 배경
            '#1a2840',       // 3: 어두운 파랑
            '#0a1a0a',       // 4: 어두운 초록 배경
            '#1a3a1a',       // 5: CRT 그린 어두움
            '#2a6a2a',       // 6: CRT 그린
            '#40c040',       // 7: CRT 밝은 그린
            '#80ff80',       // 8: CRT 그린 하이라이트
            '#0c1208',       // 9: 땅 / 충돌
            '#ffee44',       // 10: 발광 (네온, 형광등)
            '#ff2200',       // 11: 위험
            '#2040c080',     // 12: CRT 스캔라인 반투명
            '#ff4488',       // 13: 핑크 네온
            '#ff8800',       // 14: 주황 네온 (CRT 앰버)
            '#44aaff',       // 15: 파랑 네온
            '#aa44ff',       // 16: 보라 네온
            '#00ffff',       // 17: 시안 네온
            '#ffffff',       // 18: 흰색 하이라이트
            '#c8c8c8',       // 19: 밝은 회색 (기기 플라스틱)
            '#808080',       // 20: 회색
            '#404040',       // 21: 어두운 회색
            '#281008',       // 22: 어두운 적갈색 (오래된 플라스틱)
        ],
        special: {
            9:  'collision',
            10: 'emissive',
            11: 'danger',
            12: 'fog',
        },
    },
};

// ── 씬 전환 / 이벤트용 스왑 프리셋 ──────────────────────────────────
// swap()에서만 사용. 원본 팔레트 인덱스 구조 유지, 색상만 교체.
const SWAP_PRESETS = {
    bright_flash:   ['transparent', '#ffffff', '#ffffee', '#ffffd0'],
    dark_flash:     ['transparent', '#000000', '#111111', '#222222'],
    neon_explosion: ['transparent', '#00ffff', '#ff00ff', '#ffff00', '#ff4400', '#00ff44'],
    corrupt_mode:   ['transparent', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'],
    red_tint:       ['transparent', '#cc0000', '#880000', '#440000'],
    white_out:      ['transparent', '#ffffff'],
};

// 이벤트 이름 → 스왑 프리셋 매핑
const SWAP_TRIGGERS = {
    scene_10:     'neon_explosion',
    correct:      'bright_flash',
    wrong:        'dark_flash',
    danger:       'red_tint',
    glitch:       'corrupt_mode',
    palette_flash:'white_out',
};

// ── PaletteManager ───────────────────────────────────────────────────
export default class PaletteManager {
    constructor() {
        this.original     = [];        // 원본 색상 배열 (string[])
        this.rgbaCache    = new Map(); // index → [r,g,b,a] | null(투명)
        this._special     = {};        // index → 'collision'|'emissive'|'danger'|'fog'
        this.dithering    = false;     // scene.json 선언값 — DitherEngine이 참조
        this.activePreset = null;      // 현재 적용 중인 스왑 프리셋 이름
        this._id          = null;      // 현재 팔레트 ID
    }

    // ── 로드 ──────────────────────────────────────────────────────────

    /**
     * 팔레트 데이터 로드
     *
     * 포맷 A (신규 권장):
     *   { id: 'ch01', colors: ['transparent', '#rrggbb', ...],
     *     special: { 9: 'collision', 10: 'emissive', 11: 'danger', 12: 'fog' } }
     *
     * 포맷 B (구형 배열, 하위 호환):
     *   ['transparent', '#ffffff', '#000000', ...]
     *
     * 포맷 C (AssetLoader 감싼 형태):
     *   { palette: [...] }
     */
    load(data) {
        if (!data) return;

        // 포맷 C → 재귀
        if (!Array.isArray(data) && data.palette) {
            return this.load(data.palette);
        }

        let colors, special = {};

        if (Array.isArray(data)) {
            // 포맷 B: 구형 배열
            colors = data;
        } else if (data.colors) {
            // 포맷 A: 신규 객체
            colors  = data.colors;
            special = data.special ?? {};
            this._id = data.id ?? null;
        } else {
            console.warn('[PaletteManager] 알 수 없는 팔레트 포맷:', data);
            return;
        }

        this.original     = colors;
        this._special     = typeof special === 'object' ? special : {};
        this.activePreset = null;
        this._buildCache(colors);
    }

    // ── 팔레트 교체 ───────────────────────────────────────────────────

    /**
     * 이름으로 팔레트 교체
     *   - 챕터 팔레트 이름 (ch01, ch02 ...): 팔레트 전체 교체
     *   - 스왑 프리셋 이름 (bright_flash 등): 색상만 교체, 인덱스 유지
     */
    swap(name) {
        // 챕터 팔레트
        const chPalette = CHAPTER_PALETTES[name];
        if (chPalette) {
            this.load(chPalette);
            return;
        }
        // 스왑 프리셋
        const preset = SWAP_PRESETS[name];
        if (preset) {
            this.activePreset = name;
            this._buildCacheFromPreset(preset);
            return;
        }
        console.warn(`[PaletteManager] 알 수 없는 팔레트: "${name}"`);
    }

    /** 원본 팔레트로 복원 */
    restore() {
        this.activePreset = null;
        this._buildCache(this.original);
    }

    /** 이벤트 이름으로 트리거 */
    trigger(event) {
        const name = SWAP_TRIGGERS[event];
        if (name) this.swap(name);
        else      this.restore();
    }

    /** 커스텀 스왑 프리셋 등록 */
    addPreset(name, colors) {
        SWAP_PRESETS[name] = colors;
    }

    // ── 특수 인덱스 조회 ──────────────────────────────────────────────

    /** 예약 인덱스 여부 */
    isSpecial(index)   { return this._special[index] != null || (index >= 9 && index <= 12); }
    /** 인덱스 9 = 충돌/땅 */
    isCollision(index) { return this._special[index] === 'collision'  || index === 9;  }
    /** 인덱스 10 = 발광체 (GlowSystem 자동 처리) */
    isEmissive(index)  { return this._special[index] === 'emissive'   || index === 10; }
    /** 인덱스 11 = 위험 */
    isDanger(index)    { return this._special[index] === 'danger'     || index === 11; }
    /** 인덱스 12 = 반투명/안개 (FogSystem 자동 처리) */
    isFog(index)       { return this._special[index] === 'fog'        || index === 12; }

    /** 팔레트 총 색상 수 */
    get size() { return this.original.length; }

    /** 현재 팔레트 ID */
    get id() { return this._id; }

    // ── 내부 ──────────────────────────────────────────────────────────

    _buildCache(colors) {
        this.rgbaCache.clear();
        for (let i = 0; i < colors.length; i++) {
            this.rgbaCache.set(i, PaletteManager.parseHex(colors[i]));
        }
    }

    /**
     * 스왑 프리셋: 원본 인덱스 수 유지, 색상만 교체
     * 인덱스 0은 항상 transparent 고정
     */
    _buildCacheFromPreset(preset) {
        this.rgbaCache.clear();
        const nonTransparent = preset.filter(c => c && c !== 'transparent');

        for (let i = 0; i < this.original.length; i++) {
            if (i === 0) {
                this.rgbaCache.set(i, null);
                continue;
            }
            const color = nonTransparent[(i - 1) % nonTransparent.length];
            this.rgbaCache.set(i, PaletteManager.parseHex(color));
        }
    }

    /**
     * 색상 문자열 → [r, g, b, a] | null
     * 지원 포맷: '#rrggbb', '#rgb', '#rrggbbaa'
     */
    static parseHex(color) {
        if (!color || color === 'transparent') return null;

        // rgba(r,g,b,a) 포맷 지원
        if (color.startsWith('rgba(') || color.startsWith('rgb(')) {
            const m = color.match(/[\d.]+/g);
            if (!m) return null;
            return [
                parseInt(m[0]),
                parseInt(m[1]),
                parseInt(m[2]),
                m[3] != null ? Math.round(parseFloat(m[3]) * 255) : 255,
            ];
        }

        if (!color.startsWith('#')) return null;
        const hex = color.slice(1);

        if (hex.length === 8) {  // #rrggbbaa
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16),
                parseInt(hex.slice(6, 8), 16),
            ];
        }
        if (hex.length === 6) {  // #rrggbb
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16),
                255,
            ];
        }
        if (hex.length === 3) {  // #rgb
            return [
                parseInt(hex[0] + hex[0], 16),
                parseInt(hex[1] + hex[1], 16),
                parseInt(hex[2] + hex[2], 16),
                255,
            ];
        }
        return null;
    }
}
