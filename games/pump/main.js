/**
 * 스퀘어 — 엔진 부트스트랩
 * 로비/플레이 씬 등록 + 채널 API(postMessage) 구현.
 */
import SandEngine from './engine/SandEngine.js';
import LobbyScene from './scripts/LobbyScene.js';
import PlayScene  from './scripts/PlayScene.js';

(async () => {
    const canvas = document.getElementById('game-canvas');
    const engine = new SandEngine({ canvas, gameWidth: 540, gameHeight: 960 });
    await engine.init();
    await engine.loadPalette('palettes/palette_square.json');

    // UI 컬러 램프 (로얄매치 톤) — 팔레트 JSON의 ramps 블록
    const palData = await engine.assets.load('palettes/palette_square.json');
    engine.ui.setRamps(palData.ramps);

    // UI 레이어(L3)는 카메라와 무관 — parallax 0 고정
    engine.layers.applyConfig({ 0: { parallax: 0.3 }, 3: { parallax: 0 } });

    engine.scenes.register('square_lobby', new LobbyScene());
    engine.scenes.register('square_play',  new PlayScene());
    const startScene = new URLSearchParams(location.search).get('scene') || 'square_lobby';
    engine.scenes.change(startScene, 'none');
    engine.start();

    // 픽셀 한글 폰트(Galmuri) 로드 완료 시 UI 재래스터
    if (document.fonts?.ready) {
        document.fonts.ready.then(() => engine.ui.refreshFont());
    }

    // ── 채널 API (CLAUDE.md 계약) ────────────────────────────────
    const isEmbed = window !== window.top;
    window.addEventListener('message', (e) => {
        if (!e.data?.type) return;
        if (e.data.type === 'start')  engine.start();
        if (e.data.type === 'pause')  engine.stop();
        if (e.data.type === 'resume') engine.start();
    });
    if (isEmbed) window.parent.postMessage({ type: 'ready' }, '*');

    window._engine = engine;   // 디버그용
})();
