/**
 * 주판왕 — LobbyScene (임시)
 * 게임 시작 버튼 또는 Enter → 인게임으로 전환
 */
import { Scene } from '../../engine/scene/SceneManager.js';

export default class LobbyScene extends Scene {
    constructor() {
        super('lobby');
        this._engine  = null;
        this._clicked = false;
        this._onClick = null;
    }

    async onEnter(engine) {
        this._engine  = engine;
        this._clicked = false;

        engine.entities._entities.clear();
        engine.layers.clearAll();

        this._onClick = () => { this._clicked = true; };
        engine.canvas.addEventListener('click', this._onClick);
    }

    onUpdate(now, dt, input) {
        if (this._clicked || input.isJustPressed('confirm')) {
            this._engine.scenes.change('abacus_game', 'dither');
        }
    }

    onRender() {
        const eng = this._engine;
        const ctx = eng.layers.getCtx(3);
        const W   = eng.gameWidth;
        const H   = eng.gameHeight;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);

        // 타이틀
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 14px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('주판왕', W / 2, 60);

        ctx.font      = '8px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText('로비 (임시)', W / 2, 80);

        // 게임 시작 버튼
        const bx = W / 2 - 50, by = H / 2 - 14, bw = 100, bh = 28;
        ctx.fillStyle = '#1A4A1A';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#3A8A3A';
        ctx.lineWidth   = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

        ctx.fillStyle = '#7FE07F';
        ctx.font      = 'bold 10px monospace';
        ctx.fillText('▶  게임 시작', W / 2, H / 2);
    }

    onExit() {
        if (this._onClick) {
            this._engine?.canvas.removeEventListener('click', this._onClick);
            this._onClick = null;
        }
    }
}
