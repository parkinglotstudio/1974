import { Scene } from '../../../engine/scene/SceneManager.js';

// 골목길의 하루 — 타이틀 씬 (클릭/Enter → 메인)
export default class TitleScene extends Scene {
    constructor() {
        super('golmok_title');
        this._t = 0;
    }

    onEnter(engine) {
        this.engine = engine;
        engine.entities._entities.clear();      // 타이틀은 빈 화면 + 텍스트
        this._t = 0;
    }

    onUpdate(now, dt) { this._t += dt / 1000; }

    onPostRender(canvas) {
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const ctx = canvas.getContext('2d');
        ctx.save();
        // 배경 (어두운 모래/밤 톤)
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#141018');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        // 타이틀
        ctx.fillStyle = '#e8e0c8';
        ctx.font = 'bold 42px "Courier New",monospace';
        ctx.fillText('골목길의', W / 2, H * 0.36);
        ctx.fillText('하루', W / 2, H * 0.36 + 50);
        // 부제
        ctx.fillStyle = '#8a7a4a';
        ctx.font = '14px "Courier New",monospace';
        ctx.fillText('A Day in the Alley', W / 2, H * 0.36 + 92);
        // 시작 안내 (깜빡임)
        const blink = Math.sin(this._t * 3) * 0.5 + 0.5;
        ctx.globalAlpha = 0.35 + 0.65 * blink;
        ctx.fillStyle = '#c2b280';
        ctx.font = '16px "Courier New",monospace';
        ctx.fillText('클릭하여 시작', W / 2, H * 0.62);
        ctx.restore();
    }
}
