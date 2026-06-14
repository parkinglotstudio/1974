/**
 * Sand Engine — UISystem
 * 데이터 드리븐 픽셀 UI 위젯 시스템 (L3 전용).
 *
 * 원칙:
 *   - UI 레이아웃 = JSON 데이터 (게임은 ui JSON만 작성, 로직은 엔진)
 *   - 색 = 팔레트 인덱스 또는 컬러 램프(skin) — 팔레트 스왑/테마에 자동 반응
 *   - dirty 렌더 — 상태가 바뀔 때만 오프스크린 버퍼 재래스터,
 *     매 프레임은 drawImage 1회 (정적 배경 최적화와 동일 사상)
 *   - 화면 등장은 크로스페이드 금지 → 모래 reveal (시그니처)
 *
 * 컬러 램프 (캐주얼 모바일 톤의 핵심 — 글로시 베벨):
 *   ui.setRamps({ gold: ['#FFE08A','#FFC23E','#D98A1F','#7A4A12'], ... })
 *   램프 = [하이라이트, 본색, 베벨(어두움), 아웃라인] 4톤.
 *   위젯에 "skin": "gold" 지정 시 베벨 버튼/패널로 렌더되고,
 *   라벨은 자동으로 흰 글자 + 램프 아웃라인.
 *
 * 위젯 JSON 포맷 (children 좌표는 부모 기준 상대):
 *   { "type":"panel",  "x":0,"y":0,"w":540,"h":84, "skin":"navy", "children":[...] }
 *   { "type":"button", "id":"btn_start", "x":210,"y":716,"w":280,"h":110,
 *     "skin":"green", "label":"게임 시작", "size":26, "action":"start" }
 *   { "type":"label",  "id":"t", "x":270,"y":150, "text":"1. 야생 거리", "size":30,
 *     "color":"#fff", "outline":"#1B2A4A", "align":"center", "bold":true }
 *   { "type":"gauge",  "x":76,"y":120,"w":452,"h":14, "ratio":0.3, "skin":"green" }
 *   { "type":"rect",   "x":0,"y":0,"w":540,"h":960, "bg":"#2C4E8C" }
 *   { "type":"image",  "x":8,"y":8,"w":40,"h":40, "src":"ui/icon_gem.png" }
 *     → 사용자 제공 그림(아이콘/버튼 아트)을 그대로 사용. 로드 완료 시 자동 재래스터.
 *   (skin 없는 panel/button은 bg/border 팔레트 인덱스 플랫 렌더 — 하위 호환)
 *
 * 주스(juice): 버튼 액션 발화 시 해당 위젯이 1→1.08→1로 160ms 팝 (자동).
 *
 * 사용 (게임 씬에서):
 *   engine.ui.setRamps(paletteJSON.ramps);
 *   engine.ui.load(def, { transition: 'sand', duration: 600 });
 *   engine.ui.onAction = (action, widget) => { ... };
 *   engine.ui.set('gold', { text: '15.2K' });   // 변경 → 자동 dirty
 *   engine.ui.clear();                          // 씬 퇴장 시
 */
import PixelFont from './PixelFont.js';

// 모래 reveal용 의사난수 (좌표 기반 결정적 — SceneManager.sandNoise와 동일 계열)
function sandNoise(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

export default class UISystem {

    /** UI 전용 레이어 (L3) */
    static LAYER = 3;

    /** 모래 reveal 블록 크기(px) — 클수록 굵은 모래 결 */
    static REVEAL_BLOCK = 6;

    /** 버튼 팝 트윈 시간(ms) */
    static POP_MS = 160;

    constructor(layers, paletteMgr, gameWidth, gameHeight) {
        this._layers  = layers;
        this._palette = paletteMgr;
        this.W = gameWidth;
        this.H = gameHeight;

        this.font = new PixelFont();

        this._root    = null;    // 위젯 트리 (def 그대로 보관 — set()으로 라이브 수정)
        this._flat    = [];      // 래스터 시 해석된 평탄 목록 [{def, x, y, w, h}]
        this._byId    = new Map();
        this._dirty   = false;
        this._ramps   = {};      // name → [hi, base, dark, outline]

        // UI 오프스크린 버퍼 (dirty 시에만 재래스터)
        this._buf  = document.createElement('canvas');
        this._buf.width  = gameWidth;
        this._buf.height = gameHeight;
        this._bctx = this._buf.getContext('2d');

        // 모래 reveal 전환 상태
        this._reveal = null;     // { t, dur }
        this._mask   = null;     // 블록 해상도 마스크 캔버스
        this._tmp    = null;     // 마스킹 합성용 임시 캔버스

        // 입력/주스 상태
        this._pressedId = null;  // 눌림 중인 버튼 id
        this._pops      = new Map();   // id → { t }  (팝 트윈)

        // 사용자 제공 이미지 (아이콘/버튼 아트)
        this._images = new Map();      // src → HTMLImageElement

        /** 게임이 설정: (action, widgetDef) => void */
        this.onAction = null;
    }

    // ── 공개 API ─────────────────────────────────────────────────────

    /** 컬러 램프 등록 — 팔레트 JSON의 ramps 블록을 그대로 전달 */
    setRamps(ramps) {
        this._ramps = ramps ?? {};
        this.markDirty();
    }

    /**
     * 위젯 트리 로드 (기존 트리 교체)
     * @param {object} rootDef — { children:[...] } 또는 위젯 배열
     * @param {object} [opt]   — { transition:'sand'|null, duration:ms }
     */
    load(rootDef, opt = {}) {
        this._root = Array.isArray(rootDef) ? { children: rootDef } : rootDef;
        this._pressedId = null;
        this._pops.clear();
        this.markDirty();
        if (opt.transition === 'sand') {
            this._reveal = { t: 0, dur: opt.duration ?? 600 };
        } else {
            this._reveal = null;
        }
    }

    /** UI 제거 (씬 퇴장 시) */
    clear() {
        this._root = null;
        this._flat = [];
        this._byId.clear();
        this._reveal = null;
        this._pressedId = null;
        this._pops.clear();
    }

    /** id로 위젯 def 조회 */
    get(id) { return this._byId.get(id)?.def ?? null; }

    /** 위젯 속성 라이브 갱신 (텍스트/ratio/색 등) → 자동 dirty */
    set(id, props) {
        const w = this._byId.get(id);
        if (!w) return;
        Object.assign(w.def, props);
        this.markDirty();
    }

    /** 다음 render에서 버퍼 재래스터 (폰트 로드 완료 시 등 외부 호출 가능) */
    markDirty() { this._dirty = true; }

    /** 웹폰트 로드 완료 후 호출 — 글리프 캐시 비우고 재래스터 */
    refreshFont() {
        this.font.clearCache();
        this.markDirty();
    }

    // ── 게임 루프 (SandEngine이 호출) ────────────────────────────────

    /**
     * 입력 처리 — engine._update에서 input.update() 직후 호출.
     * UI가 포인터를 소비하면 input.pointer.consumed = true 로 표시(씬이 참조 가능).
     */
    update(input, dt) {
        if (this._reveal) {
            this._reveal.t += dt;
            if (this._reveal.t >= this._reveal.dur) this._reveal = null;
        }
        // 팝 트윈 진행 — 활성 동안 매 프레임 재래스터
        if (this._pops.size) {
            for (const [id, p] of this._pops) {
                p.t += dt;
                if (p.t >= UISystem.POP_MS) this._pops.delete(id);
            }
            this.markDirty();
        }
        if (!this._root) return;

        const p = input.pointer;
        p.consumed = false;

        if (p.justDown) {
            const hit = this._hitButton(p.x, p.y);
            if (hit) {
                this._pressedId = hit.def.id ?? null;
                p.consumed = true;
                this.markDirty();
            }
        }
        if (p.justUp && this._pressedId) {
            const hit = this._hitButton(p.x, p.y);
            const fired = hit && (hit.def.id ?? null) === this._pressedId;
            const def = fired ? hit.def : null;
            this._pressedId = null;
            this.markDirty();
            if (def) {
                p.consumed = true;
                if (def.id) this._pops.set(def.id, { t: 0 });
                if (def.action && this.onAction) this.onAction(def.action, def);
            }
        }
    }

    /** 렌더 — engine._render에서 entities/text 렌더 후 호출 */
    render() {
        if (!this._root) return;
        const ctx = this._layers.getCtx(UISystem.LAYER);
        if (!ctx) return;

        if (this._dirty) {
            this._raster();
            this._dirty = false;
        }

        if (this._reveal) {
            this._renderSandReveal(ctx);
        } else {
            ctx.drawImage(this._buf, 0, 0);
        }
    }

    resize(w, h) {
        this.W = w;
        this.H = h;
        this._buf.width  = w;
        this._buf.height = h;
        this._mask = null;
        this._tmp  = null;
        this.markDirty();
    }

    // ── 래스터 ───────────────────────────────────────────────────────

    _raster() {
        const c = this._bctx;
        c.clearRect(0, 0, this.W, this.H);
        c.imageSmoothingEnabled = false;

        this._flat = [];
        this._byId.clear();
        if (this._root?.children) {
            for (const def of this._root.children) this._walk(def, 0, 0, c);
        }
    }

    _walk(def, px, py, c) {
        if (def.visible === false) return;
        const x = px + (def.x ?? 0);
        const y = py + (def.y ?? 0);
        const w = def.w ?? 0;
        const h = def.h ?? 0;

        const item = { def, x, y, w, h };
        this._flat.push(item);
        if (def.id) this._byId.set(def.id, item);

        // 팝 트윈 — 위젯+children을 중심 기준 스케일
        const pop = def.id ? this._pops.get(def.id) : null;
        let popped = false;
        if (pop && w > 0 && h > 0) {
            const k = Math.sin(Math.PI * Math.min(1, pop.t / UISystem.POP_MS));
            const s = 1 + 0.08 * k;
            c.save();
            c.translate(x + w / 2, y + h / 2);
            c.scale(s, s);
            c.translate(-(x + w / 2), -(y + h / 2));
            popped = true;
        }

        const ramp = def.skin ? this._ramps[def.skin] : null;
        const pressed = def.type === 'button' && def.id && def.id === this._pressedId;
        const oy = pressed ? 2 : 0;   // 눌림 = 2px 침하 (픽셀 버튼 관용구)

        switch (def.type) {
            case 'rect':
                this._fillRect(c, x, y + oy, w, h, def.bg);
                break;

            case 'panel':
            case 'button': {
                if (ramp) this._drawBevel(c, x, y + oy, w, h, ramp, pressed);
                else      this._drawFlatPanel(c, x, y + oy, w, h, def, pressed);
                if (def.label != null) {
                    const size = def.size ?? 12;
                    this.font.draw(c, def.label, x + w / 2, y + oy + Math.round((h - size * 1.25) / 2) + 1, {
                        size,
                        color:    def.color != null ? this._color(def.color) : (ramp ? '#FFFFFF' : this._color(1)),
                        outline:  def.outline != null ? this._color(def.outline) : (ramp ? ramp[3] : null),
                        outlineW: def.outlineW ?? (size >= 18 ? 2 : 1),   // 작은 글씨는 1px (가독성)
                        align: 'center',
                        bold:  def.bold ?? !!ramp,
                    });
                }
                break;
            }

            case 'label': {
                const size = def.size ?? 12;
                this.font.draw(c, def.text ?? '', x, y, {
                    size,
                    color:    this._color(def.color ?? 1),
                    outline:  def.outline != null ? this._color(def.outline) : null,
                    outlineW: def.outlineW ?? (size >= 18 ? 2 : 1),   // 작은 글씨는 1px (가독성)
                    align: def.align ?? 'left',
                    bold:  def.bold ?? false,
                });
                break;
            }

            case 'gauge': {
                const r = Math.max(0, Math.min(1, def.ratio ?? 0));
                if (ramp) {
                    // 트랙 = 아웃라인색 박스 + 깊은 어둠(빈 상태가 명확히 보이게), 필 = 본색 + 상단 하이라이트 라인
                    this._rr(c, x, y, w, h, ramp[3]);
                    this._rr(c, x + 2, y + 2, w - 4, h - 4, def.track ? this._color(def.track) : this._shade(ramp[3], 0.45));
                    const fw = Math.round((w - 4) * r);
                    if (fw > 2) {
                        this._rr(c, x + 2, y + 2, fw, h - 4, ramp[1]);
                        c.fillStyle = ramp[0];
                        c.fillRect(x + 4, y + 3, Math.max(0, fw - 4), 2);
                    }
                } else {
                    this._fillRect(c, x, y, w, h, def.bg ?? 3);
                    if (r > 0) this._fillRect(c, x + 1, y + 1, Math.round((w - 2) * r), h - 2, def.fill ?? 5);
                    this._strokePixelBorder(c, x, y, w, h, def.border ?? 1);
                }
                break;
            }

            case 'image': {
                const img = this._getImage(def.src);
                if (img) {
                    c.imageSmoothingEnabled = false;
                    c.drawImage(img, x, y + oy, w || img.naturalWidth, h || img.naturalHeight);
                }
                break;
            }
        }

        if (def.children) {
            for (const ch of def.children) this._walk(ch, x, y + oy, c);
        }

        if (popped) c.restore();
    }

    // ── 베벨 스킨 (글로시 픽셀 버튼/패널) ────────────────────────────
    // 구성: 아웃라인(램프[3]) → 본색(램프[1]) → 상단 하이라이트 밴드(램프[0])
    //       → 하단 베벨 밴드(램프[2]). 눌림 = 하이라이트 제거 + 본색을 베벨색으로.

    _drawBevel(c, x, y, w, h, ramp, pressed) {
        const [hi, base, dark, line] = ramp;
        this._rr(c, x, y, w, h, line);                          // 아웃라인
        this._rr(c, x + 2, y + 2, w - 4, h - 4, pressed ? dark : base);  // 본색
        if (!pressed) {
            const bandH = Math.max(4, Math.round(h * 0.26));
            const bevH  = Math.max(3, Math.round(h * 0.14));
            c.fillStyle = hi;                                    // 상단 하이라이트
            c.fillRect(x + 4, y + 3, w - 8, bandH);
            c.fillStyle = dark;                                  // 하단 베벨
            c.fillRect(x + 4, y + h - 3 - bevH, w - 8, bevH);
        }
    }

    /** skin 없는 구형 플랫 패널 (하위 호환) */
    _drawFlatPanel(c, x, y, w, h, def, pressed) {
        if (def.bg != null) {
            c.fillStyle = this._color(def.bg);
            c.fillRect(x + 2, y, w - 4, h);
            c.fillRect(x, y + 2, w, h - 4);
            if (pressed) {
                c.fillStyle = 'rgba(0,0,0,0.22)';
                c.fillRect(x + 2, y, w - 4, h);
                c.fillRect(x, y + 2, w, h - 4);
            }
        }
        if (def.border != null) this._strokePixelBorder(c, x, y, w, h, def.border);
    }

    /** 모서리 3px 노치 라운드 픽셀 사각형 채움 */
    _rr(c, x, y, w, h, color) {
        c.fillStyle = color;
        c.fillRect(x + 3, y, w - 6, h);
        c.fillRect(x, y + 3, w, h - 6);
        c.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    /** 2px 픽셀 보더 (모서리 2×2 노치) */
    _strokePixelBorder(c, x, y, w, h, palIdx) {
        c.fillStyle = this._color(palIdx);
        c.fillRect(x + 2, y,         w - 4, 2);
        c.fillRect(x + 2, y + h - 2, w - 4, 2);
        c.fillRect(x,         y + 2, 2, h - 4);
        c.fillRect(x + w - 2, y + 2, 2, h - 4);
    }

    _fillRect(c, x, y, w, h, v) {
        if (v == null) return;
        c.fillStyle = this._color(v);
        c.fillRect(x, y, w, h);
    }

    /** 팔레트 인덱스 → CSS 색. 문자열('#...')이면 그대로 */
    _color(v) {
        if (typeof v === 'string') return v;
        return this._palette.original?.[v] ?? '#ffffff';
    }

    /** 색 밝기 배율 (게이지 트랙 등 파생색) */
    _shade(hex, mul) {
        const h = String(hex).replace('#', '');
        if (h.length < 6) return hex;
        const f = (i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * mul)));
        return `rgb(${f(0)},${f(2)},${f(4)})`;
    }

    // ── 사용자 제공 이미지 ───────────────────────────────────────────

    _getImage(src) {
        if (!src) return null;
        const hit = this._images.get(src);
        if (hit) return hit.complete && hit.naturalWidth ? hit : null;
        const img = new Image();
        img.onload = () => this.markDirty();
        img.src = src;
        this._images.set(src, img);
        return null;
    }

    // ── 입력 히트테스트 ──────────────────────────────────────────────

    _hitButton(px, py) {
        // 뒤에 그려진 것이 위 — 역순 탐색
        for (let i = this._flat.length - 1; i >= 0; i--) {
            const it = this._flat[i];
            if (it.def.type !== 'button' || it.def.disabled) continue;
            if (px >= it.x && px < it.x + it.w && py >= it.y && py < it.y + it.h) return it;
        }
        return null;
    }

    // ── 모래 reveal (시그니처 전환) ──────────────────────────────────
    // 위→아래로 모래가 쌓이듯 블록이 채워지며 UI가 드러난다.
    // 블록 임계 = 세로 진행 70% + 노이즈 30% → 결이 있는 낙하 모래.

    _renderSandReveal(ctx) {
        const B  = UISystem.REVEAL_BLOCK;
        const bw = Math.ceil(this.W / B);
        const bh = Math.ceil(this.H / B);

        if (!this._mask) {
            this._mask = document.createElement('canvas');
            this._mask.width  = bw;
            this._mask.height = bh;
        }
        if (!this._tmp) {
            this._tmp = document.createElement('canvas');
            this._tmp.width  = this.W;
            this._tmp.height = this.H;
        }

        const t  = Math.min(1, this._reveal.t / this._reveal.dur);
        const mc = this._mask.getContext('2d');
        const img = mc.createImageData(bw, bh);
        const data = img.data;
        for (let by = 0; by < bh; by++) {
            const prog = by / bh;
            for (let bx = 0; bx < bw; bx++) {
                const thr = prog * 0.7 + sandNoise(bx, by) * 0.3;
                if (t >= thr) data[((by * bw + bx) << 2) + 3] = 255;
            }
        }
        mc.putImageData(img, 0, 0);

        const tc = this._tmp.getContext('2d');
        tc.clearRect(0, 0, this.W, this.H);
        tc.drawImage(this._buf, 0, 0);
        tc.globalCompositeOperation = 'destination-in';
        tc.imageSmoothingEnabled = false;
        tc.drawImage(this._mask, 0, 0, bw, bh, 0, 0, bw * B, bh * B);
        tc.globalCompositeOperation = 'source-over';

        ctx.drawImage(this._tmp, 0, 0);
    }
}
