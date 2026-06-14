/**
 * Sand Engine — 메인 진입점
 * 모든 서브시스템을 조립하고 게임 루프를 구동한다.
 *
 * 사용법 (index.html):
 *   <canvas id="sand-canvas"></canvas>
 *   <script type="module">
 *     import SandEngine from './engine/SandEngine.js';
 *     const engine = new SandEngine({ canvas: document.getElementById('sand-canvas') });
 *     await engine.init();
 *     engine.start();
 *   </script>
 *
 * 씬 추가:
 *   engine.scenes.register('my_scene', new MyScene());
 *   engine.scenes.change('my_scene', 'dither');
 */

import ScaleManager          from './core/ScaleManager.js';
import PaletteManager        from './core/PaletteManager.js';
import LayerSystem           from './core/LayerSystem.js';
import PixelAnimator         from './core/PixelAnimator.js';
import EntitySystem          from './entity/EntitySystem.js';
import AssetLoader           from './assets/AssetLoader.js';
import AssetNormalizer       from './assets/AssetNormalizer.js';
import PaletteValidator      from './assets/PaletteValidator.js';
import CollisionSystem       from './physics/CollisionSystem.js';
import ParticleSystem        from './particle/ParticleSystem.js';
import SceneManager          from './scene/SceneManager.js';
import SceneBoundsSystem     from './scene/SceneBoundsSystem.js';
import InputManager          from './input/InputManager.js';
import SoundManager          from './sound/SoundManager.js';
import PrefabSystem          from './prefab/PrefabSystem.js';
import Sequencer             from './scene/Sequencer.js';
import TextRenderer          from './text/TextRenderer.js';
import GlowSystem            from './fx/GlowSystem.js';
import LightingSystem        from './fx/LightingSystem.js';
import RimLightSystem        from './fx/RimLightSystem.js';
import FogSystem             from './fx/FogSystem.js';
import VignetteSystem        from './fx/VignetteSystem.js';
import FXSystem              from './fx/FXSystem.js';
import DitherEngine          from './assets/DitherEngine.js';
import UISystem              from './ui/UISystem.js';

export default class SandEngine {
    /**
     * @param {object} options
     * @param {HTMLCanvasElement} options.canvas  — 메인 합성 캔버스 (index.html의 #sand-canvas)
     * @param {number}  [options.gameWidth=540]   — 논리 해상도 너비 (픽셀) · 기본 540×960 세로
     * @param {number}  [options.gameHeight=960]  — 논리 해상도 높이 (픽셀)
     * @param {number}  [options.fps=60]          — 목표 프레임레이트 (참고용, rAF 기반)
     */
    constructor({ canvas, gameWidth = 540, gameHeight = 960, fps = 60 } = {}) {
        this.canvas     = canvas;
        this.gameWidth  = gameWidth;
        this.gameHeight = gameHeight;
        this.targetFps  = fps;

        // ── 서브시스템 ────────────────────────────────────────────────
        this.scale       = new ScaleManager(gameWidth, gameHeight);
        this.palette_mgr = new PaletteManager();
        this.layers      = new LayerSystem(gameWidth, gameHeight);
        this.animator    = new PixelAnimator();
        this.assets      = new AssetLoader();
        this.prefabs     = new PrefabSystem(this.assets);
        this.entities    = new EntitySystem(this.layers, this.palette_mgr);
        this.particles   = new ParticleSystem(this.entities, this.palette_mgr);
        this.collision   = new CollisionSystem(this.entities, 2);
        this.scenes      = new SceneManager(this);
        this.bounds      = new SceneBoundsSystem(gameWidth, gameHeight);
        this.input       = new InputManager(canvas, this.scale);
        this.sound       = new SoundManager();
        this.seq         = new Sequencer();
        this.text        = new TextRenderer(this.layers, this.palette_mgr);
        this.ui          = new UISystem(this.layers, this.palette_mgr, gameWidth, gameHeight);

        // ── FX 시스템 (Phase 4~5) ────────────────────────────────────
        this.glow        = new GlowSystem(gameWidth, gameHeight);
        this.lighting    = new LightingSystem(gameWidth, gameHeight);
        this.rim         = new RimLightSystem(gameWidth, gameHeight);
        this.fog         = new FogSystem(gameWidth, gameHeight);
        this.vignette    = new VignetteSystem(gameWidth, gameHeight);
        this.fx          = new FXSystem(gameWidth, gameHeight);
        this.dither      = new DitherEngine();     // 1-bit 흑백 포스트프로세스 (palette_mgr.dithering=true 시 활성)

        // ── 보조 시스템 (직접 사용) ───────────────────────────────────
        this.AssetNormalizer  = AssetNormalizer;   // 정적 클래스 — engine.AssetNormalizer.normalize(...)
        this.PaletteValidator = PaletteValidator;  // 정적 클래스 — engine.PaletteValidator.validate(...)

        // ── 게임 상태 ─────────────────────────────────────────────────
        this.cameraX    = 0;
        this._running   = false;
        this._rafId     = null;
        this._lastTime  = 0;
        this._frame     = 0;   // DitherEngine 체커보드 애니메이션 프레임 카운터
    }

    // ── 초기화 ───────────────────────────────────────────────────────

    // 엔진 초기화. 씬 등록 전에 반드시 호출.
    async init() {
        // 캔버스 내부 해상도 고정 (논리 해상도)
        this.canvas.width  = this.gameWidth;
        this.canvas.height = this.gameHeight;

        // 스케일 계산 + 픽셀 퍼펙트 적용
        this.scale
            .calculate(window.innerWidth, window.innerHeight)
            .applyToCanvas(this.canvas);

        // 입력 이벤트 바인딩
        this.input.attach();

        // 리사이즈 대응
        window.addEventListener('resize', () => this._onResize());

        console.log(`[SandEngine] init — ${this.gameWidth}×${this.gameHeight} @ ×${this.scale.scale.toFixed(2)}`);
    }

    // ── 게임 루프 ─────────────────────────────────────────────────────

    start() {
        if (this._running) return;
        this._running  = true;
        this._lastTime = performance.now();
        this._tick     = this._tick.bind(this);
        this._rafId    = requestAnimationFrame(this._tick);
        console.log('[SandEngine] started');
    }

    stop() {
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        console.log('[SandEngine] stopped');
    }

    _tick(now) {
        if (!this._running) return;
        this._rafId = requestAnimationFrame(this._tick);

        const dt = Math.min(now - this._lastTime, 50); // 50ms 상한 (탭 포커스 복귀 보호)
        this._lastTime = now;
        this._frame++;

        this._update(now, dt);
        this._render();
    }

    _update(now, dt) {
        this.input.update();
        this.ui.update(this.input, dt);     // UI 히트테스트 먼저 — 소비 시 pointer.consumed=true
        this.entities.update(now);
        this.animator.update(dt);           // PixelAnimator — animations 픽셀 보간
        this.particles.update(dt);
        this.scenes.update(now, dt, this.input);
        this.seq.update(dt);
        this.text.update(dt);
        this.lighting.update(dt);           // LightingSystem — 깜빡임 상태 갱신
        this.fx.update(dt);                 // FXSystem — flash/shake/colorShift 타이머
    }

    _render() {
        // 매 프레임 레이어 캔버스 초기화
        this.layers.clearAll();

        // 씬 커스텀 렌더 (선택)
        this.scenes.render(this.cameraX);

        // 엔티티 렌더 (항상 실행) — Layer별 indexMap도 이 시점에 갱신됨
        this.entities.render(this.cameraX);
        this.particles.render(this.cameraX);

        // 텍스트 렌더
        this.text.render();

        // UI 렌더 (L3 버퍼 — dirty 시에만 재래스터)
        this.ui.render();

        // shake 오프셋 적용 후 레이어 합성 → 메인 캔버스
        const shake = this.fx.getShakeOffset();
        this.layers.composite(this.canvas, this.cameraX, shake.x, shake.y);

        // ── FX 패스 (합성 이후, 메인 캔버스 위에 직접) ───────────────
        // 렌더 순서: Glow(빛) → Fog(안개) → Lighting(어둠) → Rim(백라이트, 어둠 위) → Vignette(가장자리) → FX(최상단)
        this.glow.render(this.canvas, this.entities, this.cameraX);
        this.fog.render(this.canvas, this.entities, this.cameraX);
        this.lighting.render(this.canvas, this.cameraX);
        // Rim(백라이트)은 조명 '뒤'에 — 어둠 multiply에 먹히지 않고 실루엣 가장자리를 밝힘
        this.rim.render(this.canvas, this.entities, this.cameraX);
        this.vignette.render(this.canvas);

        // 씬 전환 오버레이 (dither, fade 등)
        this.scenes.drawOverlay(this.canvas);

        // 씬 고유 포스트 오버레이 (flash, vignette 등 — 최상단)
        this.scenes.postRender(this.canvas);

        // FX 최상단 (flash, colorShift)
        this.fx.renderPost(this.canvas);

        // 1-bit 디더링 포스트프로세스 — palette_mgr.dithering=true 시 활성
        // 씬 전환/FX 포함 전체 프레임을 흑백 Bayer 디더로 변환
        if (this.palette_mgr.dithering) {
            const ctx = this.canvas.getContext('2d');
            this.dither.apply(ctx, this.gameWidth, this.gameHeight, this._frame);
        }
    }

    // ── 유틸 ─────────────────────────────────────────────────────────

    // 팔레트 파일 로드 + PaletteManager에 적용
    async loadPalette(path) {
        const data = await this.assets.load(path);
        this.palette_mgr.load(data.palette ?? data);
    }

    // 씬 JSON 설정 파일 로드 + SceneManager에 등록
    async loadSceneConfig(path) {
        const data = await this.assets.load(path);
        this.scenes.loadConfig(data);
    }

    // 프리펩 맵 로드 { NAME: 'path' }
    async loadPrefabs(prefabMap) {
        await this.prefabs.loadPrefabs(prefabMap);
    }

    // scene.json 로드 + entities 배치 (씬 진입 시 호출)
    async applyScene(sceneJSON, assetBasePath = 'assets/') {
        // 기존 animator 초기화 (씬 전환 시 이전 애니메이션 정리)
        this.animator.clear();

        // 레이어 설정
        if (sceneJSON.layers) {
            // 신규 트리 방식 (배열) vs 구형 flat 방식 (객체)
            if (Array.isArray(sceneJSON.layers)) {
                this.layers.applySceneTree(sceneJSON.layers);
            } else {
                this.layers.applyConfig(sceneJSON.layers);
            }
        }

        // 씬 경계 설정 (bounds 블록 있을 때)
        if (sceneJSON.bounds) {
            this.bounds.fromJSON(sceneJSON.bounds);
        } else {
            // 기본값: 뷰포트 크기와 동일 (스크롤 없음)
            this.bounds.setSceneBounds(this.gameWidth, this.gameHeight);
        }

        // 팔레트 교체
        if (sceneJSON.palette) {
            await this.loadPalette(assetBasePath + 'palettes/' + sceneJSON.palette);
        }
        // BGM
        if (sceneJSON.bgm) {
            this.sound.playBgm(assetBasePath + 'sounds/' + sceneJSON.bgm);
        }
        // 엔티티 배치
        await this.prefabs.loadScene(sceneJSON, assetBasePath, this.entities);

        // PixelAnimator 자동 부착 — animations 필드가 있는 엔티티에
        for (const entity of this.entities.getAll()) {
            if (entity._animations?.length) {
                const basePixels = entity.getPixels();
                this.animator.attach(entity.id, {
                    pixels:     basePixels ?? [],
                    animations: entity._animations,
                    width:      entity.pw,
                    height:     entity.ph,
                }, entity);
            }
        }
    }

    // 카메라 X 좌표 설정 (씬 경계 클램프 적용)
    setCamera(x, y = 0) {
        const clamped  = this.bounds.clampCamera(x, y);
        this.cameraX   = clamped.x;
        this.cameraY   = clamped.y ?? 0;
    }

    // 카메라 X 만 이동 (단축)
    moveCameraX(x) {
        this.cameraX = this.bounds.clampCameraX(x);
    }

    // 논리 해상도(가로/세로 등) 런타임 변경. 씬 전환 시 호출.
    // 캔버스 내부 해상도 + 스케일 + 모든 서브시스템 버퍼를 새 치수로 재구성.
    setResolution(w, h) {
        if (w === this.gameWidth && h === this.gameHeight) return;
        this.gameWidth  = w;
        this.gameHeight = h;
        this.canvas.width  = w;
        this.canvas.height = h;
        this.scale.gameW = w;
        this.scale.gameH = h;
        this._onResize();
        console.log(`[SandEngine] resolution → ${w}×${h}`);
    }

    _onResize() {
        this.scale.update(window.innerWidth, window.innerHeight, this.canvas);
        this.layers.resize(this.gameWidth, this.gameHeight);
        this.entities.resize(this.gameWidth, this.gameHeight);
        // FX 시스템 리사이즈 동기화
        this.glow.resize(this.gameWidth, this.gameHeight);
        this.lighting.resize(this.gameWidth, this.gameHeight);
        this.rim.resize(this.gameWidth, this.gameHeight);
        this.fog.resize(this.gameWidth, this.gameHeight);
        this.vignette.resize(this.gameWidth, this.gameHeight);
        this.fx.resize(this.gameWidth, this.gameHeight);
        this.ui.resize(this.gameWidth, this.gameHeight);
        this.bounds.setSceneBounds(this.gameWidth, this.gameHeight);
        // InputManager는 canvas 참조를 생성자에서 보유 — 별도 업데이트 불필요
    }
}
