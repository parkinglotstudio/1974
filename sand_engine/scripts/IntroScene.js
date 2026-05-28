/**
 * 주판왕 — IntroScene (임시)
 * 3초 후 또는 탭/Enter → 로비로 전환
 */
import { Scene } from '../../engine/scene/SceneManager.js';

export default class IntroScene extends Scene {
    constructor() {
        super('intro');
        this._engine  = null;
        this._t       = 0;
        this._clicked = false;
        this._onClick = null;
    }

    async onEnter(engine) {
        this._engine  = engine;
        this._t       = 0;
        this._clicked = false;

        // 이전 씬 엔티티/레이어 정리
        engine.entities._entities.clear();
        engine.layers.clearAll();

        // 캔버스 클릭/탭으로도 전환 가능
        this._onClick = () => { this._clicked = true; };
        engine.canvas.addEventListener('click', this._onClick);
    }

    onUpdate(now, dt, input) {
        this._t += dt / 1000;
        if (this._t >= 3 || this._clicked || input.isJustPressed('confirm')) {
            this._engine.scenes.change('lobby', 'dither');
        }
    }

    onRender() {
        const eng = this._engine;
        const ctx = eng.layers.getCtx(3);
        const W   = eng.gameWidth;
        const H   = eng.gameHeight;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // 타이틀
        ctx.fillStyle   = '#fff';
        ctx.font        = 'bold 22px monospace';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('주판왕', W / 2, H / 2 - 20);

        // 副 타이틀
        ctx.font      = '9px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('ABACUS KING', W / 2, H / 2 + 4);

        // 힌트 (깜빡임)
        const blink = Math.floor(this._t * 2) % 2 === 0;
        if (blink) {
            ctx.fillStyle = '#aaa';
            ctx.font      = '8px monospace';
            ctx.fillText('탭하면 시작', W / 2, H / 2 + 30);
        }
    }

    onExit() {
        if (this._onClick) {
            this._engine?.canvas.removeEventListener('click', this._onClick);
            this._onClick = null;
        }
    }
}
