import { Scene } from '../../../engine/scene/SceneManager.js';

// 골목길의 하루 — 결과 씬 (클릭/Enter → 타이틀)
export default class ResultScene extends Scene {
    constructor() {
        super('golmok_result');
        this._t = 0;
    }

    onEnter(engine) {
        this.engine = engine;
        engine.entities._entities.clear();
        this._t = 0;
    }

    onUpdate(now, dt) { this._t += dt / 1000; }

    onPostRender(canvas) {
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const ctx = canvas.getContext('2d');
        ctx.save();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#181014');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e8e0c8';
        ctx.font = 'bold 34px "Courier New",monospace';
        ctx.fillText('오늘 하루,', W / 2, H * 0.4);
        ctx.fillText('수고했어요', W / 2, H * 0.4 + 44);
        const blink = Math.sin(this._t * 3) * 0.5 + 0.5;
        ctx.globalAlpha = 0.35 + 0.65 * blink;
        ctx.fillStyle = '#c2b280';
        ctx.font = '15px "Courier New",monospace';
        ctx.fillText('클릭하여 처음으로', W / 2, H * 0.62);
        ctx.restore();
    }
}
