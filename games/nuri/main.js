import SandEngine from '../../engine/SandEngine.js';
import NuriGame   from './scripts/NuriGame.js?v=2.7';
import { loadCsvTable, loadParamTable } from '../../engine/data/Csv.js';

// ── flat 1D → [[x,y,idx], ...] ──────────────────────────────
function flatToTriples(flat, width) {
    const out = [];
    for (let i = 0; i < flat.length; i++) {
        const idx = flat[i];
        if (idx === 0) continue;
        out.push([i % width, Math.floor(i / width), idx]);
    }
    return out;
}

// ── 에셋 기반 씬 로더 ────────────────────────────────────────
async function applyScene(sceneJSON, assetBase, engine) {
    const CATS = ['backgrounds', 'characters', 'objects', 'items'];

    if (sceneJSON.layers) {
        Array.isArray(sceneJSON.layers)
            ? engine.layers.applySceneTree(sceneJSON.layers)
            : engine.layers.applyConfig(sceneJSON.layers);
    }
    if (sceneJSON.bounds) {
        engine.bounds.fromJSON(sceneJSON.bounds);
    } else {
        engine.bounds.setSceneBounds(engine.gameWidth, engine.gameHeight);
    }

    for (const def of sceneJSON.entities ?? []) {
        if (!def.asset) { console.warn('[nuri] entity has no asset:', def.id); continue; }

        let pixelData = null;
        if (def.assetCategory) {
            try {
                const r = await fetch(`${assetBase}/${def.assetCategory}/${def.asset}.json`, { cache: 'no-store' });
                if (r.ok) pixelData = await r.json();
            } catch {}
        }
        if (!pixelData) {
            for (const cat of CATS) {
                if (cat === def.assetCategory) continue;
                try {
                    const r = await fetch(`${assetBase}/${cat}/${def.asset}.json`, { cache: 'no-store' });
                    if (r.ok) { pixelData = await r.json(); break; }
                } catch {}
            }
        }
        if (!pixelData) { console.warn('[nuri] asset not found:', def.asset); continue; }

        if (pixelData.palette?.length) engine.palette_mgr.load(pixelData.palette);

        const cfg = {
            x: def.x ?? 0, y: def.y ?? 0,
            pw: def.pw ?? pixelData.width ?? 16,
            ph: def.ph ?? pixelData.height ?? 16,
            layer: def.layer ?? 2,
            visible: def.visible ?? true,
            scale: def.scale ?? 1,
            flipX: def.flipX ?? false,
            _palette: pixelData.palette ?? null,
        };

        if (pixelData.scanline) {
            cfg._scanline = pixelData.scanline;
            if ([0,1,3].includes(cfg.layer) && (pixelData.width ?? 0) <= engine.gameWidth) cfg.tileX = true;
        } else if (pixelData.pixels) {
            const raw = pixelData.pixels;
            cfg.pixels = (raw.length > 0 && Array.isArray(raw[0])) ? raw : flatToTriples(raw, pixelData.width ?? 16);
        } else if (pixelData.frames?.length) {
            cfg.frames = pixelData.frames.map(f => {
                const raw = f.pixels ?? [];
                return { pixels: (raw.length > 0 && Array.isArray(raw[0])) ? raw : flatToTriples(raw, pixelData.width ?? 16) };
            });
            if (pixelData.stateDef) cfg.stateDef = pixelData.stateDef;
        }

        const entity = engine.entities.add(def.id, cfg);
        entity.type  = def.type ?? def.id;
    }
}

// ── 초기화 ───────────────────────────────────────────────────
async function init() {
    const canvas = document.getElementById('game-canvas');
    const gj     = await fetch('./game.json', { cache: 'no-store' }).then(r => r.json());
    const { width, height } = gj.resolution;
    const assetBase = gj.assetBase ?? './pixels';

    const engine = new SandEngine({ canvas, gameWidth: width, gameHeight: height });
    await engine.init();

    // CSV 데이터 로드
    try {
        const [chapters, characters, fx] = await Promise.all([
            loadCsvTable('./data/chapters.csv'),
            loadCsvTable('./data/characters.csv'),
            loadParamTable('./data/fx_params.csv'),
        ]);
        engine.data = { chapters, characters, fx };
        console.log('[nuri] data loaded:', chapters.all().length, 'chapters,', characters.all().length, 'chars');
    } catch (e) {
        console.warn('[nuri] data load failed:', e);
        engine.data = null;
    }

    // 씬 로드
    const sceneKey = gj.mainScene ?? 'nuri_main';
    const sceneSrc = gj.scenes?.[sceneKey]?.src;
    if (sceneSrc) {
        const sj = await fetch('./' + sceneSrc, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
        if (sj) await applyScene(sj, assetBase, engine);
    }

    // NuriGame 씬 등록 & 시작
    const nuriGame = new NuriGame();
    engine.scenes.register('nuri_main', nuriGame);
    engine.scenes.change('nuri_main');
    engine.start();

    window._game = { _engine: engine };
    if (window !== window.top) window.parent.postMessage({ type: 'ready' }, '*');
}

init().catch(e => console.error('[nuri]', e));
