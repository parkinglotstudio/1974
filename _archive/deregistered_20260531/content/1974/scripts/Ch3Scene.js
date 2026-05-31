/**
 * 1974 — Chapter 3: Console Sprite (1986~1991)
 * 비주얼: 나이트 / 멀티컬러 / PC통신 터미널 감성
 * 컨셉: PC통신 시대 — 데이터 흐름, 픽셀 캐릭터
 */
import { Scene } from '../../../engine/scene/SceneManager.js';

export default class Ch3Scene extends Scene {
    constructor() {
        super('ch3');
        this._engine = null;
        this._timer  = 0;
    }

    async onInit(engine) {
        this._engine = engine;
        await engine.loadPalette('/assets/palettes/palette_night.json');
    }

    async onEnter(engine) {
        this._engine = engine;
        engine.particles.clear();

        // 배경 stardust (깊은 우주/통신망 느낌)
        engine.particles.emit('stardust', {
            count: 80, layer: 0,
            screenW: engine.gameWidth, screenH: engine.gameHeight,
            palIdx: 1,
        });

        // 멀티컬러 drift (16비트 픽셀 부유)
        for (let i = 2; i <= 5; i++) {
            engine.particles.emit('drift', {
                count: 10, layer: 1,
                screenW: engine.gameWidth, screenH: engine.gameHeight,
                palIdx: i, speedMult: 0.8, wrap: true,
            });
        }
    }

    onUpdate(now, dt, input) {
        if (!this._engine) return;
        this._timer += dt / 1000;

        // 데이터 스트림 — 세로 선형 파티클
        if (this._timer > 0.08) {
            this._timer = 0;
            this._engine.particles.emit('sand_rain', {
                count: 1, layer: 1,
                screenW:  this._engine.gameWidth,
                groundY:  this._engine.gameHeight - 4,
                minSpeed: 40, maxSpeed: 100,
                gravity:  30,
                palIdxRange: [2, 7],
            });
        }
    }

    onExit() {
        this._engine?.particles?.clear();
    }
}
