import PaletteManager  from '../engine/core/PaletteManager.js';
import LayerSystem     from '../engine/core/LayerSystem.js';
import ScaleManager    from '../engine/core/ScaleManager.js';
import AssetLoader     from '../engine/assets/AssetLoader.js';
import DitherEngine    from '../engine/assets/DitherEngine.js';
import EntitySystem    from '../engine/entity/EntitySystem.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import ParticleSystem  from '../engine/particle/ParticleSystem.js';
import SceneManager, { Scene } from '../engine/scene/SceneManager.js';
import InputManager    from '../engine/input/InputManager.js';
import SoundManager    from '../engine/sound/SoundManager.js';

// ── IntroScene ────────────────────────────────────────────────────
class IntroScene extends Scene {
    constructor() { super('intro'); }

    onInit(engine) {
        const { entities, loader } = engine;
        // 에셋은 main에서 이미 로드됨 — engine.introData 로 접근
        const { frames, width, height, fps } = engine.introData;

        entities.add('intro', {
            x: 0, y: 0,
            layer: 2,
            pw: width, ph: height,
            frames,
            stateDef: {
                entity: 'intro',
                states: {
                    idle: { frames: [0, 1, 2], loop: true, fps: fps ?? 4 },
                },
            },
        });
    }

    onEnter(engine) {
        engine.collision.init();
    }

    onUpdate(now, dt, input) {
        // 데모: 스페이스 누르면 스타더스트 방출
        if (input.isPressed('action')) {
            const { particles, introData } = this.engine;
            const cx = introData.width  / 2;
            const cy = introData.height / 2;
            particles.emit('stardust', { count: 60, cx, cy, layer: 0, wrap: true });
            particles.emit('vortex',   { count: 30, cx, cy, layer: 1 });
        }
    }

    onRender(cameraX) {
        const { entities, particles } = this.engine;
        entities.update(this.engine._now);
        entities.render(cameraX);
        particles.render(cameraX);
    }
}

// ── 부트스트랩 ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Engine] Booting...');

    // ── 1. 에셋 로드 ──────────────────────────────────────────────
    const loader = new AssetLoader();
    const data   = await loader.load('/assets/pixelart/intro.json');
    const { width, height, palette } = data;

    console.log(`[Engine] intro.json — ${width}x${height} / ${palette.length} colors / ${data.frames.length} frames`);

    // ── 2. 컨테이너 + 캔버스 설정 ────────────────────────────────
    const container  = document.getElementById('game-container');
    const mainCanvas = document.getElementById('main-canvas');
    container.style.background = '#ffffff';
    mainCanvas.width  = width;
    mainCanvas.height = height;

    // ── 3. 코어 시스템 ────────────────────────────────────────────
    const scale       = new ScaleManager(width, height);
    const layers      = new LayerSystem(width, height);
    const palette_mgr = new PaletteManager();
    const dither      = new DitherEngine();
    palette_mgr.load(palette);
    scale.calculate(container.clientWidth, container.clientHeight);
    scale.applyToCanvas(mainCanvas);

    // ── 4. 게임 시스템 ────────────────────────────────────────────
    const entities  = new EntitySystem(layers, palette_mgr);
    const collision = new CollisionSystem(entities, 2);
    const particles = new ParticleSystem(entities, palette_mgr);

    // ── 5. 사운드 시스템 ─────────────────────────────────────────
    const sound = new SoundManager();
    // 첫 사용자 제스처에서 AudioContext resume
    document.addEventListener('pointerdown', () => sound.resume(), { once: true });
    document.addEventListener('keydown',     () => sound.resume(), { once: true });

    // ── 6. 엔진 컨텍스트 (씬에서 접근) ───────────────────────────
    const engine = {
        scale, layers, palette_mgr, loader, dither,
        entities, collision, particles, sound,
        introData: data,
        _now: 0,
    };

    // ── 7. InputManager ───────────────────────────────────────────
    const input = new InputManager(mainCanvas, scale);
    input.attach();

    // ── 8. SceneManager + IntroScene 등록 ─────────────────────────
    const scenes = new SceneManager(engine);
    scenes.register('intro', new IntroScene());
    scenes.change('intro');

    // ── 9. 게임 루프 ──────────────────────────────────────────────
    let cameraX  = 0;
    let lastTime = 0;

    function loop(now) {
        requestAnimationFrame(loop);

        const deltaMs  = lastTime ? Math.min(now - lastTime, 50) : 16;
        lastTime       = now;
        engine._now    = now;

        input.update();
        particles.update(deltaMs);

        scenes.update(now, deltaMs, input);
        scenes.render(cameraX);

        layers.composite(mainCanvas, cameraX);
        scenes.drawOverlay(mainCanvas);

        collision.setCamera(cameraX);
    }

    requestAnimationFrame(loop);

    // ── 10. 반응형 리사이즈 ───────────────────────────────────────
    window.addEventListener('resize', () => {
        scale.update(container.clientWidth, container.clientHeight, mainCanvas);
        layers.resize(scale.dispW, scale.dispH);
        entities.resize(scale.dispW, scale.dispH);
    });

    // 전역 노출 (디버그용)
    window._engine = { ...engine, scenes, input };
    window._camera = { get x() { return cameraX; }, set x(v) { cameraX = v; } };
    console.log('[Engine] Ready.');
    console.log('  Space / 터치                          — 스타더스트 + 보텍스');
    console.log('  _camera.x = 200                       — 패럴랙스 스크롤');
    console.log('  _engine.scenes.change("intro","dither",500) — 디더 전환');
    console.log('  _engine.sound.playBgm("key")          — BGM 재생');
    console.log('  _engine.sound.playSfx("key")          — SFX 재생');
    console.log('  _engine.input.enableTextInput()       — 텍스트 입력 모드');
});
