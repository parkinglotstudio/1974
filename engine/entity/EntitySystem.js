/**
 * Sand Engine — EntitySystem
 * 픽셀 그룹(엔티티)을 관리하고 LayerSystem에 렌더.
 *
 * 엔티티 포맷 (세 가지 모드):
 *   [인라인]    { x, y, layer, pw, ph, pixels:[[lx,ly,idx]...], rotate, flipX, flipY, scale }
 *   [프레임]    { x, y, layer, pw, ph, frames:[{pixels}...], stateDef, rotate, flipX, flipY, scale }
 *   [scanline]  { x, y, layer, pw, ph, _scanline:[idx,...], _palette:[...] }
 *               배경 레이어 전용 고속 경로 (PixelRenderer.putScanline 사용)
 *
 * 레이어 좌표 규칙:
 *   Layer 0/1 (패럴랙스 배경) — 월드 좌표로 렌더 (넓은 캔버스에 직접)
 *   Layer 2   (게임 오브젝트) — 스크린 좌표 = worldX - cameraX
 *   Layer 3   (UI/HUD)       — 스크린 좌표 (cameraX 무관)
 *
 * Per-entity 팔레트:
 *   _palette 가 있는 엔티티는 글로벌 PaletteManager 대신 자체 rgba 캐시를 사용.
 *   배경 레이어마다 독립적인 색상 세트 표현 가능.
 */
import PixelRenderer         from '../core/PixelRenderer.js';
import AnimationStateMachine from './AnimationStateMachine.js';

class Entity {
    constructor(id, config) {
        this.id      = id;
        this.x       = config.x       ?? 0;
        this.y       = config.y       ?? 0;
        this.layer   = config.layer   ?? 2;       // 0~3
        this.pw      = config.pw      ?? 0;       // 엔티티 픽셀 너비
        this.ph      = config.ph      ?? 0;       // 엔티티 픽셀 높이
        this.visible = config.visible ?? true;

        // 트랜스폼
        this.flipX  = config.flipX  ?? false;
        this.flipY  = config.flipY  ?? false;
        this.scale  = config.scale  ?? 1;
        this.rotate = config.rotate ?? 0;   // 0 / 90 / 180 / 270

        // 픽셀 데이터 (모드별 1개만 사용)
        this._pixels   = config.pixels    ?? null;  // 인라인 [[lx,ly,idx]...]
        this._frames   = config.frames    ?? null;  // PixelJSON frames[]
        this._scanline = config._scanline ?? null;  // 배경 1-D 팔레트 인덱스 배열
        this._palette  = config._palette  ?? null;  // PixelJSON 자체 팔레트 (per-entity)
        this._rgbaCache = null;                     // EntitySystem.add()에서 구축
        this._frameIdx = 0;

        this.asm = null;
        if (config.stateDef) {
            this.asm = new AnimationStateMachine();
            this.asm.load(config.stateDef);
        }
    }

    tick(now) {
        if (this.asm) this._frameIdx = this.asm.tick(now);
    }

    // 현재 렌더할 pixels 배열 반환 (scanline 엔티티는 null 반환 → 별도 경로)
    getPixels() {
        if (this._pixels) return this._pixels;
        if (this._frames) return this._frames[this._frameIdx]?.pixels ?? null;
        return null;
    }

    setState(name) { this.asm?.setState(name); }

    onStateEnd(cb) { if (this.asm) this.asm.onStateEnd = cb; }
}

export default class EntitySystem {
    constructor(layers, paletteMgr) {
        this._layers     = layers;
        this._paletteMgr = paletteMgr;
        this._entities   = new Map();   // id → Entity
        this._renderers  = new Map();   // layerIndex → PixelRenderer
    }

    // ── 엔티티 관리 ───────────────────────────────────────────────

    add(id, config) {
        const entity = new Entity(id, config);
        this._entities.set(id, entity);
        this._ensureRenderer(entity.layer);

        // per-entity 팔레트가 있으면 전용 rgbaCache 구축
        if (entity._palette) {
            entity._rgbaCache = this._buildRgbaCache(entity._palette);
        }

        return entity;
    }

    remove(id)   { this._entities.delete(id); }
    clearAll()   { this._entities.clear(); }
    get(id)      { return this._entities.get(id) ?? null; }
    has(id)      { return this._entities.has(id); }

    // CollisionSystem / ParticleSystem 이 직접 렌더러에 접근할 때 사용
    getRenderer(layerIdx) {
        this._ensureRenderer(layerIdx);
        return this._renderers.get(layerIdx) ?? null;
    }

    // ── 게임 루프 ─────────────────────────────────────────────────

    update(now) {
        for (const entity of this._entities.values()) entity.tick(now);
    }

    // cameraX: 카메라 월드 X (Layer 2 엔티티 스크린 변환에 사용)
    render(cameraX = 0) {
        const byLayer = new Map();
        for (const entity of this._entities.values()) {
            if (!entity.visible) continue;
            const li = entity.layer;
            if (!byLayer.has(li)) byLayer.set(li, []);
            byLayer.get(li).push(entity);
        }

        for (const [layerIdx, entities] of byLayer) {
            const renderer = this._getRenderer(layerIdx);
            if (!renderer) continue;

            renderer.clear();

            for (const entity of entities) {
                // Layer 2: 월드→스크린 변환. 나머지: 그대로
                const ox = (layerIdx === 2) ? entity.x - cameraX : entity.x;
                const oy = entity.y;

                // 팔레트 캐시: per-entity → 글로벌 순서
                const rgbaCache = entity._rgbaCache ?? this._paletteMgr.rgbaCache;

                // ── 렌더 경로 분기 ────────────────────────────────

                // [A] scanline 고속 경로 (배경 레이어 전용)
                // stride = entity.pw (asset 실제 너비) — renderer 캔버스와 다를 수 있음
                if (entity._scanline) {
                    renderer.putScanline(entity._scanline, rgbaCache, ox, oy, entity.pw || renderer.width);
                    continue;
                }

                // [B] PixelAnimator 연동
                //   _staticPixels — direction 픽셀 제외 base
                //   getPixels()   — 일반 픽셀
                const pixels = entity._ea
                    ? (entity._staticPixels ?? entity.getPixels())
                    : entity.getPixels();

                if (!pixels) continue;

                this._renderWithTransform(renderer, pixels, entity, ox, oy, rgbaCache);

                // PixelAnimator 오버레이
                if (entity._ea) {
                    const kf = entity._ea.getKeyframeOverrides();
                    if (kf) renderer.putPixels(kf, rgbaCache, ox, oy);

                    const dp = entity._ea.getDirectionPixels();
                    if (dp) renderer.putPixels(dp, rgbaCache, ox, oy);
                }
            }

            renderer.flush();
        }
    }

    /** 모든 엔티티 반복자 (applyScene 후 animator 연결 등에 사용) */
    getAll() { return this._entities.values(); }

    // ── 트랜스폼 렌더링 ───────────────────────────────────────────

    _renderWithTransform(renderer, pixels, entity, ox, oy, rgbaCache) {
        const { pw, ph, flipX, flipY, rotate, scale } = entity;
        const s = Math.max(1, Math.round(scale));
        const hasTransform = flipX || flipY || rotate || s > 1;

        if (!hasTransform) {
            // 트랜스폼 없음 → 고속 경로
            renderer.putPixels(pixels, rgbaCache, ox, oy);
            return;
        }

        for (const [lx, ly, idx] of pixels) {
            const rgba = rgbaCache.get(idx);
            if (!rgba) continue;

            const [tx, ty] = this._transform(lx, ly, pw, ph, flipX, flipY, rotate);

            if (s === 1) {
                renderer.putPixel(ox + tx, oy + ty, rgba, idx);
            } else {
                for (let dy = 0; dy < s; dy++) {
                    for (let dx = 0; dx < s; dx++) {
                        renderer.putPixel(ox + tx * s + dx, oy + ty * s + dy, rgba, idx);
                    }
                }
            }
        }
    }

    // 픽셀 좌표 (lx, ly) → 트랜스폼 후 (tx, ty)
    // flip 먼저, 그 다음 rotate
    _transform(lx, ly, pw, ph, flipX, flipY, rotate) {
        let tx = flipX ? pw - 1 - lx : lx;
        let ty = flipY ? ph - 1 - ly : ly;

        if (rotate === 90) {
            return [ph - 1 - ty, tx];
        } else if (rotate === 180) {
            return [pw - 1 - tx, ph - 1 - ty];
        } else if (rotate === 270) {
            return [ty, pw - 1 - tx];
        }
        return [tx, ty];
    }

    // ── Per-entity 팔레트 ─────────────────────────────────────────

    /**
     * 팔레트 배열 → rgbaCache Map (인덱스 → [r,g,b,a])
     * PaletteManager와 동일한 포맷 — EntitySystem 내부 전용
     */
    _buildRgbaCache(palette) {
        const cache = new Map();
        for (let i = 0; i < palette.length; i++) {
            const color = palette[i];
            if (!color || color === 'transparent') continue;
            const rgba = this._parseHex(color);
            if (rgba) cache.set(i, rgba);
        }
        return cache;
    }

    _parseHex(hex) {
        if (!hex || hex === 'transparent') return null;
        const h = hex.replace('#', '');
        if (h.length === 6) {
            return [
                parseInt(h.slice(0, 2), 16),
                parseInt(h.slice(2, 4), 16),
                parseInt(h.slice(4, 6), 16),
                255,
            ];
        }
        if (h.length === 8) {
            return [
                parseInt(h.slice(0, 2), 16),
                parseInt(h.slice(2, 4), 16),
                parseInt(h.slice(4, 6), 16),
                parseInt(h.slice(6, 8), 16),
            ];
        }
        return null;
    }

    // ── 내부 유틸 ─────────────────────────────────────────────────

    _ensureRenderer(layerIdx) {
        if (this._renderers.has(layerIdx)) return;
        const canvas = this._layers.getCanvas(layerIdx);
        if (!canvas) { console.warn(`[EntitySystem] unknown layer: ${layerIdx}`); return; }
        const lw = this._layers.getLayerWidth(layerIdx);
        const lh = this._layers.getLayerHeight(layerIdx);
        const renderer = new PixelRenderer(canvas, lw, lh);
        // Layer 2 는 GlowSystem / RimLightSystem / CollisionSystem 이 indexMap 읽음
        // → 자동으로 indexMap 활성화
        if (layerIdx === 2) renderer.enableIndexMap();
        this._renderers.set(layerIdx, renderer);
    }

    _getRenderer(layerIdx) {
        this._ensureRenderer(layerIdx);
        return this._renderers.get(layerIdx) ?? null;
    }

    // LayerSystem 리사이즈 후 동기화
    resize(viewWidth, viewHeight) {
        this._renderers.clear(); // 재생성 트리거 (다음 render()에서 _ensureRenderer 재호출)
    }
}
