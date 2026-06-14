/**
 * Sand Engine — PrefabSystem
 * prefab.json 로드 → 픽셀 에셋 바인딩 → EntitySystem 자동 배치
 *
 * 3-파일 시스템:
 *   pixels.json   — 모래 (픽셀 좌표 + 팔레트 인덱스)
 *   prefab.json   — 규칙 (타입 + 애니 + 충돌 + 레이어)
 *   scene.json    — 설계도 (어디에 어떤 프리펩을 배치)
 *
 * 사용법:
 *   const ps = new PrefabSystem(assetLoader);
 *   await ps.loadPrefabs({ ABACUS_BEAD: 'assets/prefabs/ABACUS_BEAD.prefab.json' });
 *   await ps.loadScene(sceneJSON, 'assets/', entitySystem);
 */

// 타입 ID → 기본 레이어/패럴랙스 매핑 (CLAUDE.md 에셋 타입 정의 기준)
const TYPE_DEFAULTS = {
    BACKGROUND_FAR:    { layer: 0, parallax: 0.15 },
    BACKGROUND_NEAR:   { layer: 1, parallax: 0.6  },
    BACKGROUND_TILE:   { layer: 1, parallax: 0.6  },

    CHARACTER_PLAYER:  { layer: 2, parallax: 1.0  },
    CHARACTER_NPC:     { layer: 2, parallax: 1.0  },
    CHARACTER_ENEMY:   { layer: 2, parallax: 1.0  },

    ABACUS_FRAME:      { layer: 2, parallax: 1.0  },
    ABACUS_ROD:        { layer: 2, parallax: 1.0  },
    ABACUS_BEAD:       { layer: 2, parallax: 1.0  },

    OBJECT_STATIC:     { layer: 2, parallax: 1.0  },
    OBJECT_ITEM:       { layer: 2, parallax: 1.0  },
    OBJECT_PLATFORM:   { layer: 2, parallax: 1.0  },
    OBJECT_PROJECTILE: { layer: 2, parallax: 1.0  },

    UI_PROBLEM:        { layer: 3, parallax: 0    },
    UI_TIMER:          { layer: 3, parallax: 0    },
    UI_SCORE:          { layer: 3, parallax: 0    },
    UI_LEVEL:          { layer: 3, parallax: 0    },
    UI_RESULT:         { layer: 3, parallax: 0    },
    UI_HUD_BUTTON:     { layer: 3, parallax: 0    },

    PARTICLE_STAR:     { layer: 2, parallax: 1.0  },
    PARTICLE_VORTEX:   { layer: 2, parallax: 1.0  },
    PARTICLE_SHAKE:    { layer: 2, parallax: 1.0  },
    PARTICLE_LEVELUP:  { layer: 2, parallax: 1.0  },
    PARTICLE_STARDUST: { layer: 0, parallax: 0.15 },
};

export default class PrefabSystem {
    constructor(assetLoader) {
        this._loader     = assetLoader;  // AssetLoader 인스턴스
        this._prefabs    = new Map();    // name → prefabJSON
        this._pixelCache = new Map();    // assetPath → { frames, pw, ph }
    }

    // ── 프리펩 등록 ──────────────────────────────────────────────────

    // 이미 파싱된 prefabJSON 직접 등록 (코드 내 인라인 정의용)
    register(name, prefabJSON) {
        this._prefabs.set(name, prefabJSON);
    }

    // 단일 prefab.json 파일 로드 후 등록
    async loadPrefab(name, path) {
        const data = await this._loader.load(path);
        this._prefabs.set(name, data);
        return data;
    }

    // 여러 prefab.json 병렬 로드. { NAME: 'assets/prefabs/NAME.prefab.json' }
    async loadPrefabs(prefabMap) {
        await Promise.all(
            Object.entries(prefabMap).map(([name, path]) => this.loadPrefab(name, path))
        );
    }

    get(name) { return this._prefabs.get(name) ?? null; }
    has(name) { return this._prefabs.has(name); }

    // ── 씬 로딩 ──────────────────────────────────────────────────────

    // scene.json entities[] 전체를 EntitySystem에 배치
    // assetBasePath: 픽셀 에셋 경로 prefix (예: 'assets/')
    async loadScene(sceneJSON, assetBasePath, entitySystem) {
        const entities = sceneJSON.entities ?? [];

        // 병렬 인스턴스 생성
        const configs = await Promise.all(
            entities.map(def => this.instantiate(def, assetBasePath))
        );

        // EntitySystem에 등록 + 게임 데이터 부착
        for (const cfg of configs) {
            if (!cfg) continue;
            const entity = entitySystem.add(cfg.id, cfg);

            // EntitySystem Entity가 직접 저장하지 않는 Sand Engine 전용 데이터
            entity.type           = cfg.type           ?? null;
            entity.prefabName     = cfg.prefabName     ?? null;
            entity.collider       = cfg.collider       ?? null;
            entity.props          = cfg.props          ?? {};
            entity._prefabControls = cfg.controls      ?? null;
        }

        console.log(`[PrefabSystem] scene "${sceneJSON.scene}" — ${configs.length} entities placed`);
    }

    // ── 인스턴스 생성 ─────────────────────────────────────────────────

    // scene.json 엔티티 정의 → Entity config 객체
    // entityDef: { id, prefab, x?, y?, layer?, props?, flipX?, flipY?, scale?, rotate? }
    async instantiate(entityDef, assetBasePath = '') {
        const prefabName = entityDef.prefab;
        const prefabDef  = this._prefabs.get(prefabName);

        if (!prefabDef) {
            console.warn(`[PrefabSystem] unknown prefab "${prefabName}" (id: "${entityDef.id}")`);
            return null;
        }

        // 레이어: scene entity 우선 → prefab.layer → TYPE_DEFAULTS 기본값
        const typeMeta = TYPE_DEFAULTS[prefabDef.type] ?? { layer: 2, parallax: 1.0 };
        const layer    = entityDef.layer ?? prefabDef.layer ?? typeMeta.layer;

        // 픽셀 에셋 로드
        let frames = null;
        let pw = 0, ph = 0;

        let palette = null;
        let nativePw = 0;     // PixelJSON 원본 너비 (auto-scale 계산용)
        let animations = null; // pixels.json animations 배열 (PixelAnimator 용)
        let scanline   = null; // 배경 레이어 고속 렌더 1-D 팔레트 인덱스 배열

        if (prefabDef.asset) {
            // 외부 PixelJSON 파일 참조
            const pixelData = await this._loadPixelAsset(assetBasePath + prefabDef.asset);
            frames     = pixelData.frames;
            pw         = pixelData.pw;
            ph         = pixelData.ph;
            nativePw   = pixelData.pw;
            palette    = pixelData.palette    ?? null;
            animations = pixelData.animations ?? null;
            scanline   = pixelData.scanline   ?? null;

            // animations 방식: pixels 필드가 있으면 frames[0]로 감싸기 (하위 호환)
            if (!frames?.length && pixelData.pixels) {
                frames = [{ pixels: pixelData.pixels }];
            }
        } else if (prefabDef.pixels) {
            // 인라인 픽셀 (단일 프레임)
            frames   = [{ pixels: prefabDef.pixels }];
            pw       = prefabDef.pw ?? 0;
            ph       = prefabDef.ph ?? 0;
            nativePw = pw;
        }

        // scene entity에 pw/ph가 명시돼 있으면 표시 크기를 오버라이드 + 자동 스케일 계산
        if (entityDef.pw != null) pw = entityDef.pw;
        if (entityDef.ph != null) ph = entityDef.ph;

        // 명시적 scale 없을 때 pw/nativePw 비율로 자동 스케일 결정
        const autoScale = (nativePw > 0 && pw > nativePw)
            ? Math.round(pw / nativePw)
            : 1;

        // 애니메이션 상태 정의 → AnimationStateMachine 포맷
        // 프레임이 2개 이상이고 animation 블록이 있을 때만 활성화
        let stateDef = null;
        if (prefabDef.animation && frames && frames.length > 1) {
            stateDef = { states: prefabDef.animation };
        }

        // props: prefab 기본값 + scene 오버라이드 (scene이 덮어씀)
        const props = Object.assign({}, prefabDef.props ?? {}, entityDef.props ?? {});

        return {
            // 식별
            id:        entityDef.id,
            prefabName,
            type:      prefabDef.type ?? null,

            // 공간
            x:      entityDef.x  ?? 0,
            y:      entityDef.y  ?? 0,
            layer,
            pw, ph,

            // 픽셀 데이터 (EntitySystem Entity 포맷)
            frames,
            _palette:   palette,
            _scanline:  scanline,   // 배경 레이어 scanline 포맷 (PixelRenderer.putScanline용)
            stateDef,

            // PixelAnimator 연동 — animations 있으면 SandEngine.applyScene이 부착
            _animations: animations,

            // 트랜스폼: scene 우선 → prefab → auto-scale (pw/native 비율) → 기본값
            flipX:   entityDef.flipX   ?? prefabDef.flipX   ?? false,
            flipY:   entityDef.flipY   ?? prefabDef.flipY   ?? false,
            scale:   entityDef.scale   ?? prefabDef.scale   ?? autoScale,
            rotate:  entityDef.rotate  ?? prefabDef.rotate  ?? 0,
            visible: entityDef.visible ?? true,

            // 게임 로직 데이터
            collider: prefabDef.collider ?? null,
            props,
            controls: prefabDef.controls ?? null,
        };
    }

    // ── 픽셀 에셋 로드 (내부) ─────────────────────────────────────────

    // PixelJSON Sparse v0.1 파일 → { frames:[{pixels}], pw, ph }
    // 404 또는 로드 실패 시 빈 에셋으로 graceful 처리 (개발 중 누락 에셋 허용)
    async _loadPixelAsset(path) {
        if (this._pixelCache.has(path)) return this._pixelCache.get(path);

        let json;
        try {
            json = await this._loader.load(path);
        } catch (e) {
            console.warn(`[PrefabSystem] 픽셀 에셋 없음 (스킵): ${path}`);
            const empty = { frames: null, pw: 0, ph: 0 };
            this._pixelCache.set(path, empty);
            return empty;
        }

        const pw         = json.width      ?? 0;
        const ph         = json.height     ?? 0;
        const palette    = json.palette    ?? null;
        const frames     = (json.frames ?? []).map(f => ({ pixels: f.pixels ?? [] }));

        // Sand Engine v2: animations 방식 지원
        // { pixels: [...], animations: [...] }  — 기본 픽셀 1장 + 움직이는 픽셀 정의
        const pixels     = json.pixels     ?? null;   // 기본 픽셀 (animations 방식)
        const animations = json.animations ?? null;   // 애니메이션 정의 배열

        // Sand Engine v2: scanline 포맷 지원 (배경 레이어 전용)
        // { scanline: [idx, idx, ...] }  — row-major 1-D 팔레트 인덱스 배열
        // PixelRenderer.putScanline() 으로 고속 렌더
        const scanline   = json.scanline   ?? null;

        const result = { frames, pixels, scanline, animations, pw, ph, palette };
        this._pixelCache.set(path, result);
        return result;
    }
}
