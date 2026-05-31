import SandEngine   from '../../engine/SandEngine.js';
import GolmokGame   from './scripts/GolmokGame.js';
import TitleScene   from './scripts/TitleScene.js';
import ResultScene  from './scripts/ResultScene.js';

// ── 채널 API ────────────────────────────────────────────────
const isEmbed = window !== window.top;

const game = {
    _engine: null,
    _paused: false,
    start()  { this._engine?.start(); },
    pause()  { this._engine?.stop();  this._paused = true; },
    resume() { if (this._paused) { this._engine?.start(); this._paused = false; } },
    complete(result) {
        if (isEmbed) window.parent.postMessage({ type: 'complete', result }, '*');
    },
    score(value) {
        if (isEmbed) window.parent.postMessage({ type: 'score', value }, '*');
    },
    exit() {
        if (isEmbed) window.parent.postMessage({ type: 'exit' }, '*');
    },
};
window._game = game;

window.addEventListener('message', (e) => {
    if (!e.data?.type) return;
    if (e.data.type === 'start')  game.start();
    if (e.data.type === 'pause')  game.pause();
    if (e.data.type === 'resume') game.resume();
});

// ── 헬퍼: flat 1D 픽셀 배열 → [[x, y, idx], ...] ──────────
function flatToTriples(flat, width) {
    const out = [];
    for (let i = 0; i < flat.length; i++) {
        const idx = flat[i];
        if (idx === 0) continue;
        out.push([i % width, Math.floor(i / width), idx]);
    }
    return out;
}

// ── asset 필드 기반 씬 로더 ─────────────────────────────────
// PrefabSystem.applyScene() 대신 사용 — asset/assetCategory 직접 처리
async function applyAssetScene(sceneJSON, assetBase) {
    const engine   = game._engine;
    const CATS     = ['backgrounds', 'characters', 'objects', 'items'];

    // 레이어 설정
    if (sceneJSON.layers) {
        if (Array.isArray(sceneJSON.layers)) {
            engine.layers.applySceneTree(sceneJSON.layers);
        } else {
            engine.layers.applyConfig(sceneJSON.layers);
        }
    }

    // 씬 경계 (없으면 뷰포트 기본값)
    if (sceneJSON.bounds) {
        engine.bounds.fromJSON(sceneJSON.bounds);
    } else {
        engine.bounds.setSceneBounds(engine.gameWidth, engine.gameHeight);
    }

    const entities = sceneJSON.entities ?? [];
    let loaded = 0;

    for (const def of entities) {
        // prefab 필드 — 레거시 PrefabSystem 경로
        if (def.prefab) {
            try {
                await engine.prefabs.loadScene({ entities: [def] }, './', engine.entities);
                loaded++;
            } catch (e) {
                console.warn('[golmok] prefab load failed:', def.id, e);
            }
            continue;
        }

        // asset 필드 — 에디터 저장 씬 형식
        if (def.asset) {
            const assetName = def.asset;
            let pixelData   = null;

            // 1. 카테고리 힌트 직접 시도
            if (def.assetCategory) {
                try {
                    const r = await fetch(
                        `${assetBase}/${def.assetCategory}/${assetName}.json`,
                        { cache: 'no-store' }
                    );
                    if (r.ok) pixelData = await r.json();
                } catch {}
            }

            // 2. 전체 카테고리 순서 탐색
            if (!pixelData) {
                for (const cat of CATS) {
                    if (cat === def.assetCategory) continue;
                    try {
                        const r = await fetch(
                            `${assetBase}/${cat}/${assetName}.json`,
                            { cache: 'no-store' }
                        );
                        if (r.ok) { pixelData = await r.json(); break; }
                    } catch {}
                }
            }

            // 3. 레거시 assets/pixels/ 폴백
            if (!pixelData) {
                try {
                    const r = await fetch(`/assets/pixels/${assetName}.json`, { cache: 'no-store' });
                    if (r.ok) pixelData = await r.json();
                } catch {}
            }

            if (!pixelData) {
                console.warn(`[golmok] asset not found: ${assetName}`);
                continue;
            }

            // 엔진 전역 팔레트에도 반영 (마지막 로드된 에셋 팔레트)
            if (pixelData.palette?.length) engine.palette_mgr.load(pixelData.palette);

            // 포맷 감지: scanline / pixels (top-level) / frames[]
            const cfg = {
                x:       def.x       ?? 0,
                y:       def.y       ?? 0,
                pw:      def.pw      ?? pixelData.width  ?? 16,
                ph:      def.ph      ?? pixelData.height ?? 16,
                layer:   def.layer   ?? 2,
                visible: def.visible ?? true,
                scale:   def.scale   ?? 1,
                flipX:   def.flipX   ?? false,
                flipY:   def.flipY   ?? false,
                rotate:  def.rotate  ?? 0,
                _palette: pixelData.palette ?? null,
            };

            if (pixelData.scanline) {
                // 배경 고속 경로 — 1D 팔레트 인덱스 배열
                cfg._scanline = pixelData.scanline;
                // 패럴랙스 레이어(L0/L1/L3): 에셋이 화면폭 이하일 때만 타일 반복.
                // (와이드 배경 = 화면폭보다 넓은 단일 그림은 반복하지 않고 그대로 스크롤)
                if ([0, 1, 3].includes(cfg.layer) && (pixelData.width ?? 0) <= engine.gameWidth) {
                    cfg.tileX = true;
                }
            } else if (pixelData.pixels) {
                // 인라인 픽셀 [[x,y,idx], ...]
                const raw = pixelData.pixels;
                cfg.pixels = (raw.length > 0 && Array.isArray(raw[0]))
                    ? raw
                    : flatToTriples(raw, pixelData.width ?? 16);
            } else if (pixelData.frames?.length) {
                // 프레임 애니메이션
                cfg.frames = pixelData.frames.map(f => {
                    const raw = f.pixels ?? [];
                    const pixels = (raw.length > 0 && Array.isArray(raw[0]))
                        ? raw
                        : flatToTriples(raw, pixelData.width ?? 16);
                    return { pixels };
                });
                // AnimationStateMachine 연결 — stateDef가 있으면 전달
                if (pixelData.stateDef) {
                    cfg.stateDef = pixelData.stateDef;
                }
            }

            const entity   = engine.entities.add(def.id, cfg);
            entity.type    = def.type ?? def.id;
            loaded++;
            continue;
        }

        console.warn('[golmok] entity has no asset/prefab:', def.id);
    }

    console.log(`[golmok] scene loaded: ${loaded}/${entities.length} entities`);
}

// ── 초기화 ──────────────────────────────────────────────────
async function init() {
    const canvas = document.getElementById('game-canvas');

    // game.json 로드
    const gj           = await fetch('./game.json', { cache: 'no-store' }).then(r => r.json());
    const { width, height } = gj.resolution;
    // 자급자족 폴더: 에셋은 게임 폴더 내부(./pixels). game.json 에서 assetBase 로 재정의 가능.
    const assetBase    = gj.assetBase ?? './pixels';

    game._engine = new SandEngine({ canvas, gameWidth: width, gameHeight: height });
    await game._engine.init();

    // 팔레트
    if (gj.palette) {
        await game._engine.loadPalette(
            gj.palette.startsWith('/') ? gj.palette : './' + gj.palette
        );
    }

    // 기본 씬 로드 (?scene= 파라미터로 특정 씬 지정 가능 — 에디터 씬 플레이용)
    const urlScene     = new URLSearchParams(location.search).get('scene');
    const defaultScene = urlScene || gj.defaultScene || 'main';
    const E = game._engine;

    // ── 씬 흐름: 타이틀 → 메인 → 결과 ─────────────────────────────
    // 메인 씬 엔티티(배경+캐릭터)는 메인 진입 시 로드
    let _mainSceneJSON = null;
    async function _loadMainEntities() {
        const sd = gj.scenes?.main;
        if (!_mainSceneJSON && sd?.src) {
            const src = sd.src.startsWith('/') ? sd.src : './' + sd.src;
            _mainSceneJSON = await fetch(src, { cache: 'no-store' }).then(r => r.json());
        }
        if (_mainSceneJSON) await applyAssetScene(_mainSceneJSON, assetBase);
    }

    E.scenes.register('golmok_title',  new TitleScene());
    E.scenes.register('golmok_main',   new GolmokGame());
    E.scenes.register('golmok_result', new ResultScene());

    let _cur = 'golmok_title';
    async function goScene(id) {
        if (id === 'golmok_main') await _loadMainEntities();
        else E.entities._entities.clear();
        E.scenes.change(id);
        _cur = id;
    }

    // 시작 씬: ?scene= (main|golmok_title|golmok_result), 기본 = 타이틀
    const _map = {
        main: 'golmok_main', golmok_main: 'golmok_main',
        title: 'golmok_title', golmok_title: 'golmok_title',
        result: 'golmok_result', golmok_result: 'golmok_result',
    };
    await goScene(_map[defaultScene] || 'golmok_title');

    E.start();

    // 클릭/터치 → 씬 전환 (타이틀→메인, 결과→타이틀). 메인 클릭은 GolmokGame이 처리.
    canvas.addEventListener('pointerdown', () => {
        if (_cur === 'golmok_title')       goScene('golmok_main');
        else if (_cur === 'golmok_result') goScene('golmok_title');
    });
    // 메인에서 Enter → 결과
    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && _cur === 'golmok_main') goScene('golmok_result');
    });

    // 준비 완료 알림
    if (isEmbed) window.parent.postMessage({ type: 'ready' }, '*');
}

init().catch(e => console.error('[golmok]', e));
