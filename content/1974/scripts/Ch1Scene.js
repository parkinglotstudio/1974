/**
 * 1974 — Chapter 1: Analog Birth (1974~1980)
 *
 * 배경: game.json scenes.ch1.layers 에 지정된 픽셀 JSON → L0 레이어 캔버스에 렌더
 * 오버레이: CRT 스캔라인 + 롤링 바 (onPostRender → 메인 캔버스 직접)
 * UI:  HTML 오버레이 (#ov)
 *
 * ── 엔진 fix 이후 구조 ──────────────────────────────────────────────────
 * SandEngine._render() 최초에 clearAll() → 레이어 캔버스 클리어
 * PixelRenderer.flush() → offscreen putImageData + drawImage(source-over)
 *   → 투명 엔티티 픽셀이 레이어 배경을 덮어쓰지 않음
 * 따라서 onRender() 에서 레이어 캔버스에 배경을 그려도 안전하다.
 */
import { Scene } from '../../../engine/scene/SceneManager.js';

export default class Ch1Scene extends Scene {
    constructor() {
        super('ch1');
        this._engine  = null;
        this._W       = 180;
        this._H       = 320;
        // 레이어 인덱스 → pre-rendered OffscreenCanvas
        this._bgCache = {};
    }

    async onInit(engine) {
        this._engine = engine;
        this._W      = engine.gameWidth;
        this._H      = engine.gameHeight;
        await engine.loadPalette('/assets/palettes/palette_1bit.json');
        await this._loadLayerAssets();
    }

    async onEnter(engine) {
        this._engine = engine;
        engine.particles.clear();
        // 씬 진입 시 에셋 재로드 (에디터에서 변경 반영)
        await this._loadLayerAssets();
    }

    // ── 레이어 에셋 로드 ────────────────────────────────────────────
    async _loadLayerAssets() {
        const W = this._W;
        const H = this._H;
        this._bgCache = {};

        try {
            const r  = await fetch('/content/1974/game.json', { cache: 'no-store' });
            const gj = await r.json();
            const layersCfg = gj.scenes?.ch1?.layers ?? {};

            for (const [idxStr, conf] of Object.entries(layersCfg)) {
                if (!conf.asset || conf.visible === false) continue;
                const li = parseInt(idxStr, 10);

                try {
                    const ar = await fetch(
                        `/assets/pixels/${conf.asset}.json`, { cache: 'no-store' }
                    );
                    if (!ar.ok) continue;
                    const data      = await ar.json();
                    const frameData = data.frames?.[0];
                    if (!frameData) continue;

                    // 첫 프레임을 오프스크린 캔버스에 사전 렌더
                    const oc  = document.createElement('canvas');
                    oc.width  = data.width  ?? W;
                    oc.height = data.height ?? H;
                    const oct = oc.getContext('2d');
                    oct.imageSmoothingEnabled = false;

                    const palette = data.palette ?? [];
                    for (const [px, py, ci] of (frameData.pixels ?? [])) {
                        const c = palette[ci];
                        if (!c || c === 'transparent') continue;
                        oct.fillStyle = c;
                        oct.fillRect(px, py, 1, 1);
                    }

                    this._bgCache[li] = oc;
                    console.log(`[Ch1] L${li} 배경 로드: ${conf.asset} (${oc.width}×${oc.height})`);
                } catch (e) {
                    console.warn(`[Ch1] L${li} 에셋 로드 실패`, e);
                }
            }
        } catch (e) {
            console.warn('[Ch1] game.json 로드 실패', e);
        }
    }

    onUpdate(now, dt, input) {}

    // ── 배경을 레이어 캔버스에 직접 렌더 ──────────────────────────────
    // 엔진 fix (clearAll + offscreen flush) 덕분에 onRender()에서
    // 레이어 캔버스에 배경을 그려도 entity putImageData에 덮이지 않는다.
    onRender(cameraX) {
        const engine = this._engine;
        if (!engine) return;
        const W = this._W;
        const H = this._H;

        // 각 레이어 캔버스에 해당 배경 에셋 그리기
        for (const [liStr, oc] of Object.entries(this._bgCache)) {
            const li     = parseInt(liStr, 10);
            const layer  = engine.layers.layers[li];
            if (!layer || !layer.visible) continue;

            const lCtx = layer.ctx;
            lCtx.imageSmoothingEnabled = false;

            if (li <= 1) {
                // L0/L1: 캔버스가 W×4 너비 — 뷰포트(W) 단위로 반복 타일
                const cw = layer.cWidth;
                for (let tx = 0; tx < cw; tx += W) {
                    lCtx.drawImage(oc, 0, 0, oc.width, oc.height, tx, 0, W, H);
                }
            } else {
                // L2/L3: 뷰포트 크기로 스트레치
                lCtx.drawImage(oc, 0, 0, oc.width, oc.height, 0, 0, W, H);
            }
        }

        // 배경 에셋이 없는 L0 → 웜 다크 CRT 기본 색
        if (!this._bgCache[0]) {
            const l0 = engine.layers.layers[0];
            if (l0) {
                const cw = l0.cWidth;
                l0.ctx.fillStyle = '#2A2520';
                l0.ctx.fillRect(0, 0, cw, H);
            }
        }
    }

    // ── CRT 오버레이 (메인 캔버스 최상단) ──────────────────────────────
    onPostRender(canvas) {
        const W   = this._W;
        const H   = this._H;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // ── CRT 스캔라인: 홀수 행에 반투명 검정 띠 ─────────────────
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        for (let y = 1; y < H; y += 2) {
            ctx.fillRect(0, y, W, 1);
        }

        // ── 롤링 바: 전자빔 스캔 (위→아래 5초 주기) ────────────────
        const period = 5000;
        const t      = performance.now() % period;
        const barCY  = (t / period) * (H + 80) - 40;
        const barH   = 50;
        const grad   = ctx.createLinearGradient(0, barCY - barH * 0.5, 0, barCY + barH * 0.5);
        grad.addColorStop(0,   'rgba(255, 248, 220, 0)');
        grad.addColorStop(0.5, 'rgba(255, 248, 220, 0.06)');
        grad.addColorStop(1,   'rgba(255, 248, 220, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, Math.floor(barCY - barH * 0.5), W, barH);
    }

    onExit() {
        this._engine?.particles?.clear();
    }
}
