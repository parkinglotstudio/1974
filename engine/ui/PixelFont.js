/**
 * Sand Engine — PixelFont
 * 시스템/웹폰트 텍스트를 오프스크린 캔버스에 래스터한 뒤 **1비트 임계처리**해
 * 픽셀아트 텍스트로 변환하는 렌더러. 한글 포함 모든 글리프 지원.
 *
 * 왜 비트맵 폰트 에셋이 아니라 런타임 래스터인가:
 *   - UI 텍스트는 동적(숫자/재화/타이머)이라 글리프 전수 에셋화가 비효율
 *   - 임계처리(antialiasing 제거)로 어떤 폰트든 픽셀 결로 통일됨
 *   - 색은 팔레트에서 받아 틴트 → 팔레트 스왑/낮밤 FX에 자동 반응
 *
 * 아웃라인 (캐주얼 모바일 UI 문법 — 흰 글자 + 두꺼운 다크 외곽선):
 *   font.draw(ctx, '게임 시작', x, y, { size:24, color:'#fff', outline:'#1B2A4A', outlineW:2 });
 *   마스크를 사각 오프셋으로 다중 스탬프 → 청키한 픽셀 아웃라인.
 *
 * 권장 폰트: Galmuri11 / DungGeunMo (픽셀 한글 폰트, index.html에서 CSS로 로드).
 * 미로드 시 시스템 폰트 fallback — document.fonts.ready 후 engine.ui.refreshFont() 호출.
 */
export default class PixelFont {

    /** 우선순위 폰트 스택 — 페이지에 로드돼 있으면 자동 사용 */
    static FAMILY = '"Galmuri11", "DungGeunMo", "NeoDunggeunmo", monospace';

    /** 알파 임계값 (이상=불투명, 미만=투명) — 1비트 픽셀화의 핵심 */
    static THRESHOLD = 120;

    /** 캐시 상한 — 초과 시 전체 비움 (UI는 dirty 시에만 재래스터라 비용 미미) */
    static MAX_CACHE = 400;

    constructor() {
        this._cache = new Map();   // key → { canvas, w, h, pad }   (최종 틴트+아웃라인)
        this._masks = new Map();   // key → canvas                  (임계처리 흰 글리프)
        this._mctx  = document.createElement('canvas').getContext('2d'); // measure 전용
    }

    /** 폰트 로드 완료 등 외부 변화 시 캐시 무효화 */
    clearCache() { this._cache.clear(); this._masks.clear(); }

    /** 텍스트 크기 측정 (래스터 없이, 아웃라인 미포함 face 기준) */
    measure(text, size = 12, bold = false) {
        this._mctx.font = this._fontStr(size, bold);
        const m = this._mctx.measureText(text);
        return { w: Math.ceil(m.width), h: Math.ceil(size * 1.25) };
    }

    /**
     * 픽셀화 텍스트를 ctx에 그림
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} x
     * @param {number} y       — 글자(face) 상단 기준
     * @param {object} [cfg]   — { size, color, align:'left'|'center'|'right', bold,
     *                             outline:색|null, outlineW:px(기본 2) }
     */
    draw(ctx, text, x, y, cfg = {}) {
        if (text == null || text === '') return;
        const size     = cfg.size     ?? 12;
        const color    = cfg.color    ?? '#ffffff';
        const bold     = cfg.bold     ?? false;
        const outline  = cfg.outline  ?? null;
        const outlineW = outline ? (cfg.outlineW ?? 2) : 0;

        const entry = this._raster(String(text), size, color, bold, outline, outlineW);
        if (!entry) return;

        let dx = Math.round(x);
        if (cfg.align === 'center') dx -= Math.round(entry.w / 2);
        else if (cfg.align === 'right') dx -= entry.w;

        // pad(아웃라인 여백)만큼 좌상단으로 — face가 (x,y)에 정렬되도록
        ctx.drawImage(entry.canvas, dx - entry.pad, Math.round(y) - entry.pad);
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    _fontStr(size, bold) {
        return `${bold ? 'bold ' : ''}${size}px ${PixelFont.FAMILY}`;
    }

    /** 임계처리된 흰 글리프 마스크 (틴트 전 단계 — 색 무관 공유 캐시) */
    _mask(text, size, bold) {
        const key = `${size}|${bold ? 1 : 0}|${text}`;
        const hit = this._masks.get(key);
        if (hit) return hit;

        const { w, h } = this.measure(text, size, bold);
        if (w <= 0 || h <= 0) return null;

        const cv  = document.createElement('canvas');
        cv.width  = w;
        cv.height = h;
        const c   = cv.getContext('2d', { willReadFrequently: true });
        c.font         = this._fontStr(size, bold);
        c.textBaseline = 'top';
        c.fillStyle    = '#ffffff';
        c.fillText(text, 0, 0);

        const img = c.getImageData(0, 0, w, h);
        const buf = img.data;
        const thr = PixelFont.THRESHOLD;
        for (let i = 0; i < buf.length; i += 4) {
            if (buf[i + 3] >= thr) {
                buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
            } else {
                buf[i + 3] = 0;
            }
        }
        c.putImageData(img, 0, 0);

        if (this._masks.size >= PixelFont.MAX_CACHE) this._masks.clear();
        this._masks.set(key, cv);
        return cv;
    }

    /** 마스크 → 단색 틴트 사본 */
    _tint(mask, color) {
        const cv  = document.createElement('canvas');
        cv.width  = mask.width;
        cv.height = mask.height;
        const c   = cv.getContext('2d');
        c.drawImage(mask, 0, 0);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = color;
        c.fillRect(0, 0, cv.width, cv.height);
        return cv;
    }

    /** 최종 텍스트 캔버스 (틴트 + 아웃라인, 캐시) */
    _raster(text, size, color, bold, outline, ow) {
        const key = `${size}|${bold ? 1 : 0}|${color}|${outline ?? ''}|${ow}|${text}`;
        const hit = this._cache.get(key);
        if (hit) return hit;

        const mask = this._mask(text, size, bold);
        if (!mask) return null;
        const w = mask.width;
        const h = mask.height;

        const cv  = document.createElement('canvas');
        cv.width  = w + ow * 2;
        cv.height = h + ow * 2;
        const c   = cv.getContext('2d');

        if (outline && ow > 0) {
            // 사각 오프셋 다중 스탬프 → 청키한 픽셀 아웃라인
            const oTint = this._tint(mask, outline);
            for (let dy = -ow; dy <= ow; dy++) {
                for (let dx = -ow; dx <= ow; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    c.drawImage(oTint, ow + dx, ow + dy);
                }
            }
        }
        c.drawImage(this._tint(mask, color), ow, ow);

        if (this._cache.size >= PixelFont.MAX_CACHE) this._cache.clear();
        const entry = { canvas: cv, w, h, pad: ow };
        this._cache.set(key, entry);
        return entry;
    }
}
