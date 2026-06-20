// MessageSystem.js — 트리거 기반 화면 상단 메시지(경고/안내/힌트) 출력
const STYLE_COLOR = { warning: [255, 160, 60], info: [180, 220, 255], hint: [160, 255, 180] };

export default class MessageSystem {
    constructor(engine) {
        this._msgMap    = new Map();
        this._activeMsg = null;   // { text, style, duration, remaining }
        const tbl = engine.data?.messages;
        if (!tbl) return;
        for (const row of tbl.all()) {
            if (!row.trigger) continue;
            this._msgMap.set(row.trigger, {
                text:     row.text_ko,
                duration: Number(row.duration_ms) || 2000,
                style:    row.style || 'info',
            });
        }
    }

    show(trigger) {
        const cfg = this._msgMap.get(trigger);
        if (!cfg) return;
        this._activeMsg = { text: cfg.text, style: cfg.style, duration: cfg.duration, remaining: cfg.duration };
    }

    update(dt) {
        if (!this._activeMsg) return;
        this._activeMsg.remaining -= dt;
        if (this._activeMsg.remaining <= 0) this._activeMsg = null;
    }

    render(ctx, W, H) {
        const msg = this._activeMsg;
        if (!msg) return;

        const elapsed  = msg.duration - msg.remaining;
        const fadeIn   = Math.min(1, elapsed / 250);
        const fadeOut  = Math.min(1, msg.remaining / 250);
        const alpha    = Math.min(fadeIn, fadeOut);
        if (alpha <= 0.01) return;

        const [r, g, b] = STYLE_COLOR[msg.style] ?? STYLE_COLOR.info;
        const fontSize = Math.round(H * 0.03);

        ctx.save();
        ctx.globalAlpha = alpha * 0.95;
        ctx.font        = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor   = `rgba(0,0,0,0.8)`;
        ctx.shadowBlur    = 8;
        ctx.fillStyle     = `rgb(${r},${g},${b})`;
        ctx.fillText(msg.text, W / 2, H * 0.12);

        ctx.restore();
    }
}
