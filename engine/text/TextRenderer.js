/**
 * Sand Engine — TextRenderer
 * 타이핑 효과 + 즉시 텍스트 렌더링
 *
 * 사용법:
 *   // 타이핑 효과
 *   const handle = engine.text.type('hello world', {
 *       x: 10, y: 100, layer: 3, palIdx: 1,
 *       speed: 0.06,       // 글자당 간격 (초)
 *       center: true,      // 가운데 정렬
 *       onComplete: () => console.log('done'),
 *   });
 *   handle.cancel();       // 중단
 *
 *   // 즉시 그리기 (매 프레임 onRender에서 호출)
 *   engine.text.draw('SCORE: 0', { x: 8, y: 8, layer: 3, palIdx: 1 });
 *
 *   // 모든 타이핑 중단
 *   engine.text.clearAll();
 */
export default class TextRenderer {

    constructor(layers, paletteMgr) {
        this._layers  = layers;
        this._palette = paletteMgr;
        this._typing  = [];          // 진행 중인 타이핑 핸들 목록
    }

    // ── 타이핑 효과 ───────────────────────────────────────────────

    /**
     * 타이핑 효과 시작
     * @param {string} text
     * @param {object} cfg
     * @param {number}   cfg.x
     * @param {number}   cfg.y
     * @param {number}  [cfg.layer=3]
     * @param {number}  [cfg.palIdx=1]
     * @param {number}  [cfg.fontSize=7]
     * @param {number}  [cfg.speed=0.06]   — 글자 간격 (초)
     * @param {boolean} [cfg.center=false]
     * @param {boolean} [cfg.cursor=true]  — 커서 깜빡임
     * @param {Function}[cfg.onComplete]
     * @returns {{ cancel:Function, skip:Function, done:boolean }}
     */
    type(text, cfg = {}) {
        const h = {
            text,
            x:          cfg.x         ?? 0,
            y:          cfg.y         ?? 0,
            layer:      cfg.layer     ?? 3,
            palIdx:     cfg.palIdx    ?? 1,
            fontSize:   cfg.fontSize  ?? 7,
            speed:      cfg.speed     ?? 0.06,
            center:     cfg.center    ?? false,
            cursor:     cfg.cursor    ?? true,
            onComplete: cfg.onComplete ?? null,
            _current:   '',
            _idx:       0,
            _timer:     0,
            _fired:     false,
            done:       false,
            // 외부 제어
            cancel: ()  => { h.done = true; },
            skip:   ()  => { h._current = text; h._idx = text.length; },
        };
        this._typing.push(h);
        return h;
    }

    // ── 즉시 텍스트 ──────────────────────────────────────────────

    /**
     * 즉시 그리기 — onRender 내에서 매 프레임 호출
     * @param {string} text
     * @param {object} cfg
     */
    draw(text, cfg = {}) {
        const ctx = this._layers.getCtx(cfg.layer ?? 3);
        if (!ctx) return;
        const color = this._getColor(cfg.palIdx ?? 1);
        ctx.save();
        ctx.font          = `${cfg.fontSize ?? 7}px "Courier New",monospace`;
        ctx.fillStyle     = color;
        ctx.textBaseline  = 'top';
        ctx.textAlign     = cfg.center ? 'center' : (cfg.align ?? 'left');
        ctx.fillText(text, cfg.x ?? 0, cfg.y ?? 0);
        ctx.restore();
    }

    /** 진행 중인 타이핑 전체 취소 */
    clearAll() {
        this._typing.forEach(h => h.done = true);
    }

    // ── 내부 — engine에서 자동 호출 ─────────────────────────────

    /** engine._update에서 호출 (dt: ms) */
    update(dt) {
        const sec = dt / 1000;
        for (const h of this._typing) {
            if (h.done) continue;
            if (h._idx >= h.text.length) {
                if (!h._fired) { h._fired = true; h.onComplete?.(); }
                continue;
            }
            h._timer += sec;
            while (h._timer >= h.speed && h._idx < h.text.length) {
                h._current += h.text[h._idx++];
                h._timer   -= h.speed;
            }
        }
        // 완료된 핸들 제거
        this._typing = this._typing.filter(h => !h.done);
    }

    /** engine._render에서 호출 */
    render() {
        for (const h of this._typing) {
            const ctx = this._layers.getCtx(h.layer);
            if (!ctx) continue;
            const color  = this._getColor(h.palIdx);
            const blink  = h.cursor && Math.floor(Date.now() / 450) % 2 === 0;
            const show   = h._current + (h._idx < h.text.length && blink ? '_' : '');
            ctx.save();
            ctx.font         = `${h.fontSize}px "Courier New",monospace`;
            ctx.fillStyle    = color;
            ctx.textBaseline = 'top';
            ctx.textAlign    = h.center ? 'center' : 'left';
            ctx.fillText(show, h.x, h.y);
            ctx.restore();
        }
    }

    // ── 내부 유틸 ────────────────────────────────────────────────

    _getColor(palIdx) {
        return this._palette.original?.[palIdx] ?? '#E8E4D8';
    }
}
