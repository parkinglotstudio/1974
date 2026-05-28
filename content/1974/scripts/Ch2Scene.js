/**
 * 1974 — Chapter 2: Arcade Pixel (1981~1986)
 * 비주얼: 네온 초록 / CRT 감성 / 빠른 스트릭 파티클
 * 연결 게임: 네모세모동그라미(runner), 주판왕(abacus)
 */
import { Scene } from '../../../engine/scene/SceneManager.js';

export default class Ch2Scene extends Scene {
    constructor() {
        super('ch2');
        this._engine   = null;
        this._timer    = 0;
        this._timer2   = 0;
    }

    async onInit(engine) {
        this._engine = engine;
        await engine.loadPalette('/assets/palettes/palette_neon.json');
    }

    async onEnter(engine) {
        this._engine = engine;
        engine.particles.clear();
        // 배경 stardust (CRT 스캔라인 느낌)
        engine.particles.emit('stardust', {
            count: 60, layer: 0,
            screenW: engine.gameWidth, screenH: engine.gameHeight,
            palIdx: 2,
        });
        // 빠른 streak (속도감)
        engine.particles.emit('streak', {
            count: 8, layer: 1,
            screenW: engine.gameWidth, screenH: engine.gameHeight,
            palIdx: 3,
        });
    }

    onUpdate(now, dt, input) {
        if (!this._engine) return;
        const dtSec = dt / 1000;
        this._timer  += dtSec;
        this._timer2 += dtSec;

        // 네온 모래비 (빠름)
        if (this._timer > 0.05) {
            this._timer = 0;
            this._engine.particles.emit('sand_rain', {
                count: 2, layer: 1,
                screenW:  this._engine.gameWidth,
                groundY:  this._engine.gameHeight - 4,
                minSpeed: 80, maxSpeed: 180,
                gravity:  60,
                palIdxRange: [2, 4],
            });
        }

        // 주기적 burst (오락실 폭발 효과)
        if (this._timer2 > 3.5) {
            this._timer2 = 0;
            this._engine.particles.emit('burst', {
                count: 12, layer: 2,
                cx: Math.random() * this._engine.gameWidth,
                cy: Math.random() * this._engine.gameHeight * 0.7,
                speed: 60,
                palIdx: 3,
            });
        }
    }

    onExit() {
        this._engine?.particles?.clear();
    }
}
