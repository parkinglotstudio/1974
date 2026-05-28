# Sand Engine — 규칙 및 현황
> 전체 계약 및 API: `CLAUDE.md` 참조
> 채널 규칙: `CHANNEL.md` 참조
> 구 문서: `PLAN/CLAUDE.md`, `PLAN/ENGINE_INSIGHTS.md` (참고용, 기준 아님)

---

## 역할

Sand Engine은 **콘텐츠 제작 툴**이다.
1974 채널에 들어갈 게임(미니게임)을 만드는 엔진 + 비주얼 에디터.

- 에디터 진입점: `sand_engine.html`
- 핵심 원칙: **데이터 드리븐** — scene.json + prefab.json + pixels.json
- 완성된 게임은 채널의 GameRunner를 통해 실행된다

---

## 아키텍처

```
Sand Engine
├── sand_engine.html        ← 비주얼 에디터 UI
├── engine/                 ← 엔진 코어 (공유)
│   ├── SandEngine.js       ← 메인 엔진 클래스
│   ├── core/               ← PixelRenderer, PaletteManager, LayerSystem, ScaleManager
│   ├── entity/             ← EntitySystem, AnimationStateMachine
│   ├── assets/             ← AssetLoader, DitherEngine
│   ├── physics/            ← CollisionSystem
│   ├── particle/           ← ParticleSystem
│   ├── scene/              ← SceneManager, TriggerSystem
│   ├── prefab/             ← PrefabSystem
│   ├── input/              ← InputManager
│   └── sound/              ← SoundManager
├── game/                   ← 게임별 JS 로직
│   ├── abacus/             ← 주판왕 로직
│   └── runner/             ← 네모세모동그라미 로직
└── games/                  ← 게임 매니페스트
    ├── index.json          ← 전체 게임 목록
    ├── abacus/game.json
    └── runner/game.json
```

---

## 게임 프로젝트 생성 규칙

**새 게임을 만들 때 반드시 이 구조를 따른다.**

```
games/{game-id}/
├── game.json               ← 매니페스트 (필수)
├── index.html              ← 게임 진입점 (필수)
├── scenes/                 ← scene.json 파일들
├── prefabs/                ← prefab.json 파일들
├── palettes/               ← 팔레트 JSON
├── pixels/                 ← 픽셀 데이터 JSON (단이(안티그래비티) 전담)
└── scripts/                ← 게임 로직 JS
```

### game.json 필수 필드
```json
{
  "id": "game-id",
  "name": "게임 이름",
  "version": "0.1",
  "chapter": 2,
  "resolution": { "width": 480, "height": 270 },
  "aspectLabel": "가로 16:9",
  "palette": "palettes/palette_main.json",
  "layers": {
    "0": { "name": "원경", "parallax": 0.15 },
    "1": { "name": "근경", "parallax": 0.6 },
    "2": { "name": "게임", "parallax": 1.0 },
    "3": { "name": "UI",   "parallax": 0.0 }
  },
  "scenes": {
    "main": { "type": "json", "src": "scenes/main.scene.json", "label": "메인" }
  },
  "defaultScene": "main"
}
```

**`chapter` 필드는 반드시 지정한다** — 어느 챕터 콘텐츠인지 명시.

---

## 채널 API 구현 규칙

**모든 게임의 `index.html`은 아래를 반드시 구현한다.**

```js
// 1. embed 모드 감지
const isEmbed = window !== window.top;

// 2. 채널 명령 수신
window.addEventListener('message', (e) => {
    if (!e.data?.type) return;
    if (e.data.type === 'start')   game.start();
    if (e.data.type === 'pause')   game.pause();
    if (e.data.type === 'resume')  game.resume();
});

// 3. 준비 완료 알림
window.addEventListener('load', () => {
    if (isEmbed) window.parent.postMessage({ type: 'ready' }, '*');
});

// 4. 결과 전송
function onGameComplete(result) {
    if (isEmbed) {
        window.parent.postMessage({ type: 'complete', result }, '*');
    }
}
```

전체 API 계약은 `CLAUDE.md` 참조.

---

## 3파일 시스템 (핵심 원칙)

모래 철학: JSON 픽셀은 모래다. 언제든 다시 그릴 수 있다.

| 파일 | 역할 | 담당 |
|------|------|------|
| `pixels.json` | 픽셀 데이터 (모래) | **단이(안티그래비티) 전담** |
| `prefab.json` | 동작 정의 (규칙) | **Claude Code 전담** |
| `scene.json` | 씬 조립 (설계도) | **Claude Code 전담** |

**Claude Code는 pixels.json 내부 픽셀 데이터를 임의로 수정하지 않는다.**

---

## 4레이어 시스템

```
Layer 3 : UI / HUD          — Parallax 0    (고정)
Layer 2 : 게임 오브젝트     — Parallax 1.0  (충돌 판정)
Layer 1 : 근경 배경         — Parallax 0.6
Layer 0 : 원경 배경         — Parallax 0.15
```

---

## 현재 게임 현황

| 게임 | 챕터 | 타입 | 채널 API | 상태 |
|------|------|------|---------|------|
| 주판왕 (abacus) | Ch.2 | json | 미구현 | 개발중 |
| 네모세모동그라미 (runner) | 미정 | json으로 전환 필요 | 부분구현 | 프로토타입 |

---

## 에디터 기능 현황

### ✅ 완료
- 작업 캔버스 (체커 배경, 레터박스)
- 레이어 패널 L0~L3 토글/솔로 뷰 + children 접힘/펼침 + 등록 상태 표시
- 엔티티 클릭/이동/리사이즈
- 인스펙터 (x/y/w/h 직접 편집)
- 씬 탭 전환 (json=초록, live=주황, empty=회색)
- 드래그앤드롭 에셋 배치
- **씬 저장** — `/api/save-scene` → `content/{id}/scenes/*.scene.json`
- 팔레트 교체
- 씬 뷰 (play 버튼 → 폰 프레임 iframe 미리보기)
- **에셋 패널 프로젝트 분리** — `projects/{id}/pixels/{category}/`
- **게임 프로젝트 생성 플로우** — chapter 필드, 팔레트 선택, json 타입 씬
- **채널 API 자동 생성** — `/api/create-project` 시 `index.html` 템플릿 자동 생성
- **ControlSystem.js** — 에셋 타입별 컨트롤 패널 (TYPE_CONTROLS 맵 기반)
- **FX 시스템** — GlowSystem, LightingSystem, RimLightSystem, FogSystem, VignetteSystem, FXSystem
- **SceneBoundsSystem** — 카메라 클램프, 스크롤 비율
- **AssetNormalizer / PaletteValidator** — 정적 유틸리티 클래스
- **`_loadEditorSceneJSON()`** — 에디터 전용 씬 로더 (entity.asset 필드 직접 해석, 프리펩 없이도 로드)
- **엔티티 에셋 추적** — `entity._asset` / `entity._assetCategory` 저장 → 씬 저장·복원 완전 지원
- **인스펙터 에셋 배지** — 선택 엔티티에 에셋명 녹색 배지 표시
- **`/api/save-game`** — game.json만 갱신 (폴더 재생성 없음)
- **`assignSceneLayerAsset` 수정** — `/api/create-project` 대신 `/api/save-game` 사용
- **`content/index.json` 수정** — 1974 해상도 설명 `180×320` 으로 정정

### 🔧 Phase 7 — 검수 & 추가 작업 (진행 중)
> Oppa가 직접 확인하고 추가 요청사항 반영하는 단계.
> 내용이 확정되면 Phase 8 Vercel 배포 진행.

- ✅ 씬 에디터 동작 확인 (json 씬 로드/저장/복원 정상)
- ✅ 에셋 패널 프로젝트 구조 검수 (카테고리 분류 정상)
- 🔲 추가 콘텐츠/기능 — Oppa 검수 후 반영

### 🔲 Phase 8 — Vercel 배포
- `sand_engine.html` + `engine/` static hosting

---

## 개발 규칙

1. 모든 게임은 **데이터 드리븐** (scene.json 기반) — A안
2. live 타입 씬은 사용하지 않는다 — 모든 게임은 json 타입
3. 채널 API(postMessage)는 반드시 구현
4. 게임은 단독 실행 + 채널 embed 양쪽 지원
5. 새 게임은 `game.json`의 `chapter` 필드를 반드시 지정
6. 픽셀 데이터는 단이(안티그래비티) 전담 — Claude Code 수정 금지

---

*Sand Engine 규칙 — 2026-05-28*
