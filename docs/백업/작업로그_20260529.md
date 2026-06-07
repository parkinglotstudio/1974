# 🤖 Claude 작업 로그 & 현 상태 전체 기록
> Authored by: Claude Sonnet 4.5 (Anthropic)
> 기준일: 2026-05-29 | 세션: 2026-05-27 ~ 2026-05-29
> 프로젝트 루트: `C:\1974`

---

## 1. 프로젝트 전체 구조

```
C:\1974
├── engine/                  ← Sand Engine 코어 (범용 픽셀 게임 엔진)
├── sand_engine/             ← sand_engine.html (에디터 — 픽셀 작화+씬 편집)
├── content/                 ← 게임 콘텐츠
│   ├── 1974/                ← 메인 허브 (intro, showcase, ch1~ch3)
│   ├── golmok/              ← 미니게임: 골목길의 하루 (Ch01 전용)
│   ├── speedrun/            ← 미니게임: 네세동 (횡스크롤 러너)
│   └── avatarrun/           ← 미니게임: 아바타런
├── projects/                ← 에디터가 저장하는 픽셀 에셋 프로젝트
│   └── 1974/pixels/         ← golmok용 에셋 (backgrounds/, characters/)
├── assets/
│   ├── palettes/            ← 전역 팔레트 JSON
│   └── samples/프로젝트2/   ← 원본 샘플 PNG (변환 소스)
├── tools/
│   └── convert_pixels.py    ← PNG→pixels.json 변환 스크립트 (이번 세션 신규)
└── backup/docs/             ← 기획 문서 (GDD, 인트로 스크립트 등)
```

---

## 2. Sand Engine — 엔진 코어 상세

### 2-1. 렌더링 파이프라인 (SandEngine.js)

매 프레임 `_render()`는 다음 순서로 동작한다:

```
① layers.clearAll()         — 4개 레이어 캔버스 초기화
② scenes.render()           — 씬 커스텀 렌더 (onRender 훅)
③ entities.render()         — 엔티티 픽셀 렌더 + indexMap 갱신
④ particles.render()        — 파티클
⑤ text.render()             — 텍스트 타이핑
⑥ layers.composite()        — L0→L1→L2→L3 메인 캔버스 합성
⑦ glow.render()             — screen blend, emissive 픽셀 발광
⑧ rim.render()              — 엣지 라이팅
⑨ fog.render()              — 안개 오버레이
⑩ lighting.render()         — multiply blend, 어둠+포인트라이트
⑪ vignette.render()         — 화면 가장자리 어둠
⑫ scenes.drawOverlay()      — 씬 전환 오버레이 (dither, fade 등)
⑬ scenes.postRender()       — 씬 커스텀 포스트 렌더
⑭ fx.renderPost()           — 최상단 flash / colorShift
```

### 2-2. LayerSystem (4레이어 패럴랙스)

| 레이어 | 용도 | 패럴랙스 | 캔버스 너비 |
|--------|------|----------|-------------|
| L0 | 원경 (하늘, 먼 산) | 0.15 | viewport × 2 |
| L1 | 중경 (건물, 나무) | 0.60 | viewport × 4 |
| L2 | 게임 오브젝트 (캐릭터, 충돌) | 1.00 | viewport × 4 |
| L3 | 전경 (담벼락, 전면) | 1.40 | viewport × 4 |

- L2 렌더러에만 `indexMap` 활성화 → CollisionSystem, GlowSystem이 팔레트 인덱스 직접 읽음
- L0/L1/L3은 월드 좌표, L2는 스크린 좌표로 렌더 후 composite 시 parallax 적용

### 2-3. EntitySystem — 3가지 에셋 포맷

```javascript
// [A] scanline — 배경 전용 고속 경로 (1D 팔레트 인덱스 배열)
{ _scanline: [idx, idx, ...], pw: 540, ph: 960 }
// putScanline(scanline, rgbaCache, ox, oy, stride=entity.pw)
// ★ stride 버그 이번 세션 수정: renderer.width 대신 entity.pw 사용

// [B] pixels — 캐릭터/오브젝트 (sparse [[lx,ly,idx], ...])
{ pixels: [[10,20,3], [11,20,3], ...] }

// [C] frames[] — 프레임 애니메이션
{ frames: [{ pixels: [...] }, ...], asm: AnimationStateMachine }
```

**Per-entity 팔레트**: 각 엔티티는 `_palette` 배열을 가질 수 있어, 글로벌 PaletteManager와 독립적인 색상 세트를 사용. 배경 레이어마다 독립적인 132색 팔레트 보유 가능.

### 2-4. PaletteManager v2

- 팔레트 포맷: `{ id, colors: ['transparent', '#rrggbb', ...], special: {} }`
- 예약 인덱스 (전 챕터 공통):

| 인덱스 | 의미 | 연동 시스템 |
|--------|------|------------|
| 0 | 투명 | (렌더 스킵) |
| 1~8 | 일반 픽셀 | — |
| **9** | **충돌/땅** | CollisionSystem |
| **10** | **발광체** | GlowSystem (항상 true) |
| **11** | **위험** | CollisionSystem |
| **12** | **안개** | FogSystem |
| 13~ | 일반 색상 | — |

- `CHAPTER_PALETTES`: ch01(앰버 27색), ch02(아케이드 네온 23색) 코드 내 내장
- `SWAP_PRESETS`: bright_flash, dark_flash, neon_explosion, corrupt_mode, red_tint, white_out
- `swap('ch01')` / `restore()` / `trigger('scene_10')` API

### 2-5. FX 시스템 (전부 구현 완료)

| 시스템 | 기능 | 핵심 파라미터 |
|--------|------|--------------|
| **GlowSystem** | idx=10 픽셀에 screen blend 방사 발광 | radius(14px), intensity(0.75), 4가지 프리셋 |
| **LightingSystem** | multiply blend 어둠 + 포인트 라이트 구멍 | ambient, radius, flicker, 4가지 씬 프리셋 |
| **RimLightSystem** | 엔티티 엣지 발광 | — |
| **FogSystem** | 안개 오버레이 | — |
| **VignetteSystem** | 화면 가장자리 어둠 | strength, 5가지 프리셋(none/soft/cinema/warm/cold/horror) |
| **FXSystem** | flash, shake, colorShift | duration, intensity |

> **현재 golmok에서의 상태**: GlowSystem·LightingSystem이 항상 켜져 있으나 파라미터 미설정. 씬에서 `engine.glow.setPreset('warm_lamp')` 또는 `engine.lighting.setAmbient(0.6, '#1c2e50')` 를 호출해야 의도한 분위기 연출 가능.

### 2-6. SceneManager — 씬 전환 6종 (전부 구현 완료)

| 전환 | 효과 |
|------|------|
| `none` | 즉시 |
| `fade` | 검정 페이드 인/아웃 |
| `dither` | Bayer 8×8 디더 디졸브 |
| `palette_flash` | 화이트 플래시 + 팔레트 교체 |
| `slide_left` | 검정 패널 슬라이드 |
| `convergence` | 픽셀 수렴→방산 이펙트 (가장 화려) |

- `engine.scenes.transitionTo('씬이름', { effect: 'convergence', duration: 800 })`
- `engine.scenes.convergeOut(callback)` — 외부 URL 이동 전 수렴 연출
- TriggerSystem 내장: `engine.scenes.on('이벤트', callback)`

### 2-7. 기타 서브시스템 구현 상태

| 시스템 | 상태 | 비고 |
|--------|------|------|
| InputManager | ✅ 완료 | 키보드/마우스/터치 통합, action 추상화, Chapter 4 텍스트 모드 |
| CollisionSystem | ⚠️ **버그** | 생성자 인자 불일치 (아래 상세) |
| ParticleSystem | ✅ 완료 | 10가지 타입: vortex/stardust/sand_rain/burst/convergence/erosion/streak/wake/drift/text_form |
| PixelAnimator | ✅ 완료 | keyframe(팔레트 인덱스 보간) + direction(픽셀 이동) |
| AnimationStateMachine | ✅ 완료 | 상태별 프레임 재생 |
| Sequencer | ✅ 완료 | `.at(초, fn).start()` 타임라인 이벤트 |
| TextRenderer | ✅ 완료 | 타이핑 효과 + 즉시 렌더, cursor 깜빡임 |
| SoundManager | ✅ 완료 | Web Audio API, BGM/SFX 분리, 페이드, 크로스페이드 |
| SceneBoundsSystem | ✅ 완료 | 씬 경계 + 카메라 클램프 |
| PrefabSystem | ✅ 완료 | prefab 필드 기반 레거시 로딩 |
| DitherEngine | ⚠️ **미연동** | 파일만 존재, 엔진 import 없음 |
| AssetNormalizer | ✅ 완료 | 정적 유틸 |
| PaletteValidator | ✅ 완료 | 정적 유틸 |

---

## 3. 구조적 주의사항

### NOTE-01: golmok game.json 팔레트 불일치

```json
// content/golmok/game.json
"palette": "palettes/palette_1bit.json"  // 흑백 12색
```

`palette_ch01.json` (27색 앰버 팔레트)이 같은 폴더에 존재하나 미사용. 에셋이 per-entity 팔레트(136색)를 갖고 있어 렌더는 되지만, 에디터에서 "프로젝트 팔레트" 기준 임포트 시 흑백으로 변환될 수 있음.

---

## 4. 픽셀 에셋 현황 (projects/1974/pixels/)

### 이번 세션에서 전체 재변환 완료

변환 소스: `assets/samples/프로젝트2/*.png` → Python PIL MEDIANCUT 양자화

| 에셋 | 카테고리 | 크기 | 색상 수 | 주요 색상 |
|------|----------|------|---------|----------|
| `ch01_L0_sky.json` | backgrounds | 540×960 | 136색 | 주황 #c5673f, 보라 #4d2d4d (석양 노을) |
| `L0_sky_rainy.json` | backgrounds | 540×960 | 136색 | 짙은 남색 #14131b (비오는 밤) |
| `L1_alley_basic.json` | backgrounds | 540×960 | 136색 | 앰버 #815433 (등불), 석벽 갈색 |
| `L1_alley_arcade.json` | backgrounds | 540×960 | 136색 | 어두운 형광빛 (오락실 골목) |
| `L1_alley_chimney.json` | backgrounds | 540×960 | 136색 | 굴뚝 있는 야간 골목 |
| `L1_alley_rain.json` | backgrounds | 540×960 | 136색 | 빗속 골목 |
| `L1_alley_window.json` | backgrounds | 540×960 | 136색 | 창문 빛 있는 골목 |
| `L3_wall_basic.json` | backgrounds | 540×960 | 136색 | 담벼락 (전경용) |
| `L3_wall_stairs.json` | backgrounds | 540×960 | 136색 | 계단 담벼락 (전경용) |
| `ch01_char_70s.json` | characters | 365×654 | 69색 | 어두운 실루엣, 투명 배경 |

**변환 규칙 (tools/convert_pixels.py)**:
- 인덱스 0 = transparent, 1~8 = 색상, **9~12 = 예약 (건너뜀)**, 13~135 = 색상
- 예약 인덱스 건너뜀 이유: PaletteManager에서 idx 9~12는 항상 특수 처리 (충돌/발광/위험/안개)

**재변환 이유**: 이전 에셋은 팔레트 132 슬롯 전체가 #14131b 같은 극단적 흑계열로만 채워져 화면이 순수 블랙으로 보였음. 신규 변환 후 ch01_L0_sky에 #c5673f(주황) 등 원본 색상 13% 반영.

---

## 5. golmok 미니게임 현황 (content/golmok/)

### 5-1. 현재 동작하는 것

| 항목 | 상태 |
|------|------|
| `index.html` 독립 실행 | ✅ 정상 (http://localhost:9191/content/golmok/index.html) |
| 씬 3개 엔티티 로드 | ✅ 정상 (3/3 entities) |
| L0 하늘 배경 렌더 | ✅ 정상 (ch01_L0_sky — 석양 색상) |
| L1 골목 배경 렌더 | ✅ 정상 (앰버 등불 + 석벽 텍스처) |
| L2 캐릭터 렌더 | ✅ 정상 (70년대 실루엣 walking pose) |
| iframe 채널 API | ✅ 구현 (start/pause/resume/complete/score/exit) |

### 5-2. 현재 씬 구성 (main.scene.json)

```json
entities:
  bg_sky    → layer 0,  asset: ch01_L0_sky,    pos:(0,0),   size:540×960
  bg_alley  → layer 1,  asset: L1_alley_basic, pos:(0,0),   size:540×960
  player    → layer 2,  asset: ch01_char_70s,  pos:(88,276), size:365×654
```

> **주의**: 현재 `bg_sky`가 `ch01_L0_sky`(석양)로 설정됨. 원래 기획은 `L0_sky_rainy`(비오는 밤)이었을 가능성. 결정 필요.

### 5-3. 미구현 항목 (scripts/ 디렉토리가 완전 비어 있음)

| 항목 | 우선순위 | 필요 작업 |
|------|----------|----------|
| 캐릭터 이동 | 🔴 HIGH | InputManager 연동, 좌우 이동 로직 |
| 씬 조명 설정 | 🔴 HIGH | `engine.lighting.setAmbient(0.55, '#081828')` + 등불 포인트 라이트 |
| 캐릭터 걷기 애니메이션 | 🔴 HIGH | 현재 단일 정적 프레임, frames[] 에셋 추가 필요 |
| 충돌 감지 | 🟡 MED | CollisionSystem BUG-01 수정 후 `collision.init()` 연동 |
| 씬 전환 (타이틀→게임→결과) | 🟡 MED | `golmok_title`, `golmok_result` 씬 구현 |
| 게임 이벤트/점수 | 🟡 MED | Sequencer 연동, score postMessage |
| 사운드 | 🟡 MED | SoundManager로 BGM + 골목 효과음 |
| 미사용 배경 에셋 씬 배치 | 🟢 LOW | L3_wall_basic(전경), 날씨 변화 배경 등 |
| NO MEMORY 인트로 | 🟢 LOW | 기획 스크립트 있음 (backup/PLANDATA/) |

---

## 6. 에디터 (sand_engine.html) 현황

파일 크기: **6,371줄** — 단일 파일 풀스택 에디터

### 6-1. 이번 세션에서 수정한 항목

**① `_loadEditorSceneJSON` — 에셋 포맷 3종 감지 추가**
- 이전: `frames[]` 포맷만 처리 → scanline/pixels 에셋이 에디터에서 안 보임
- 이후: `scanline` → `pixels` → `frames[]` 우선순위 자동 감지

**② `loadProject()` — 프로젝트 팔레트 스냅샷**
- 이전: `palette_mgr.original`이 에셋 팔레트에 덮어씌어짐
- 이후: `engine.loadPalette()` 직후 `window._projectPaletteColors` 스냅샷 저장

**③ 이미지 임포트 패널 — CIE-LAB 색상 거리 알고리즘**
- 이전: RGB 유클리드 거리 (지각 정확도 낮음)
- 이후: sRGB → Linear → XYZ → LAB 변환 후 ΔE 거리로 최근접 팔레트색 탐색

**④ 임포트 패널 기본값 변경**
- `palette` 모드(프로젝트 팔레트 기준) 가 기본 선택

### 6-2. 에디터 주요 기능 현황

| 기능 | 상태 |
|------|------|
| 픽셀 직접 그리기 (펜/지우개/채우기) | ✅ |
| 팔레트 편집 | ✅ |
| 프레임/레이어 관리 | ✅ |
| scanline/pixels/frames[] 씬 로드 | ✅ |
| 이미지 PNG → pixels.json 임포트 | ✅ (CIE-LAB) |
| 프로젝트 팔레트 임포트 스냅샷 | ✅ |
| 씬 JSON 저장 | ✅ |
| 에셋 서버 저장 (`/api/projects/...`) | ✅ |
| **PixelJSON 파일명 리스트 뷰** | ✅ (2026-05-30) |
| **PixelJSON 파일명 클릭→미리보기 모달** | ✅ (2026-05-30) |
| **미리보기 모달 파일명 복사 버튼** | ✅ (2026-05-30) |
| **미리보기 모달 투명 마킹 편집** | ✅ (2026-05-30) |

### 6-3. 투명 마킹 편집 기능 상세 (2026-05-30 추가)

PixelJSON 미리보기 모달(`apOverlay`)에 픽셀 투명 마킹 편집 기능 추가.

| 기능 | 구현 |
|------|------|
| 편집 모드 토글 버튼 (`✏ 투명 마킹`) | ✅ |
| 편집 ON 시 캔버스 커서 crosshair | ✅ |
| 클릭/드래그 → 해당 픽셀 idx=0 처리 | ✅ |
| 브러시 크기 1/3/5/10px | ✅ |
| 실행취소 Ctrl+Z (최대 20단계) | ✅ |
| 저장 → `/api/save-pixel` POST | ✅ |
| 저장 성공 시 "저장됨!" 토스트 | ✅ |
| 예약 인덱스 9~12 투명화 차단 + 경고 | ✅ |
| scanline 포맷 지원 | ✅ |
| pixels / frames[0].pixels 포맷 지원 | ✅ |
| 작업 버퍼(`_apWorkData`) — Uint16Array | ✅ |

**주요 변수/함수:**
- `_apWorkData`: `Uint16Array(W×H)` — 편집 작업 버퍼 (편집 모드 진입 시 원본에서 복사)
- `_apUndoStack`: 스냅샷 배열 (최대 20)
- `_AP_RESERVED`: `Set([9,10,11,12])` — 투명화 불가 예약 인덱스
- `_apInitWorkData()`: 원본(scanline/pixels) → 평탄 버퍼로 변환
- `_apSave()`: 편집 버퍼 → 원본 포맷으로 재구성 후 `/api/save-pixel` POST
- 저장 경로: `projects/{pid}/pixels/{_category}/{name}.json`

---

## 7. 기타 콘텐츠 현황

### 7-1. content/1974/ (메인 허브)

해상도 180×320 (소형 — 에디터 프리뷰용?)

| 씬 | 파일 | 상태 |
|----|------|------|
| intro | `intro.html` | 존재 (규모 미확인) |
| showcase | `showcase.html` | 존재 |
| **ch1** | `ch1.html` + `Ch1Scene.js` (163줄) | 구현됨 — CRT 오버레이, palette_1bit, L0 배경 |
| **ch2** | `ch2.html` + `Ch2Scene.js` (73줄) | 스켈레톤 — palette_neon 로드만 |
| **ch3** | `ch3.html` + `Ch3Scene.js` (62줄) | 스켈레톤 — palette_night 로드만 |

### 7-2. content/speedrun/ (네세동)

해상도 480×270 (가로). fox 스프라이트 PNG 에셋 보유. SceneManager 기반 씬 구조. 구현 수준 미확인 (별도 세션 필요).

### 7-3. content/avatarrun/ (아바타런)

SamuraiCharacter, BanditEnemy 스크립트 보유. 별도 세션 필요.

---

## 8. 이번 세션 수정 파일 목록

```
[수정]  engine/SandEngine.js
          - CollisionSystem 생성자 인자 수정: (this.layers, this.palette_mgr) → (this.entities, 2)
          - DitherEngine import 추가
          - this.dither = new DitherEngine() 추가
          - this._frame 카운터 추가 (_tick에서 매 프레임 증가)
          - _render() 말미: palette_mgr.dithering=true 시 dither.apply() 호출

[수정]  engine/core/PixelRenderer.js
          putScanline: stride 파라미터 추가 (배경 찌그러짐 수정)

[수정]  engine/entity/EntitySystem.js
          scanline 렌더 시 entity.pw → stride 전달

[수정]  sand_engine/sand_engine.html
          _loadEditorSceneJSON: scanline/pixels/frames 3포맷 감지
          loadProject: _projectPaletteColors 스냅샷
          이미지 임포트: CIE-LAB 색상 거리 + palette 기본 모드

[수정]  content/golmok/index.html
          applyAssetScene() 전면 재작성 (PrefabSystem → 직접 asset 로드)
          iframe 채널 API 구현

[수정]  content/golmok/game.json
          assetProject: "1974" 추가

[수정]  content/golmok/scenes/main.scene.json
          bg_sky → ch01_L0_sky (석양 하늘, 이전: L0_sky_rainy)

[신규]  tools/convert_pixels.py
          PNG→pixels.json 배치 변환 (PIL MEDIANCUT, 예약 인덱스 보호)

[재생성] projects/1974/pixels/backgrounds/ (9개 JSON)
[재생성] projects/1974/pixels/characters/ch01_char_70s.json
          전체 재변환: 실제 소스 이미지 색상 보존, 예약 인덱스 9~12 공백 처리
```

---

## 9. 다음 세션 시작 시 권장 작업 순서

### ① 즉시 수정 필요 (버그)
```javascript
// SandEngine.js:66 — CollisionSystem 생성자 인자 수정
this.collision = new CollisionSystem(this.entities, 2);  // this.layers → this.entities
```

### ② golmok 게임 로직 1단계
```javascript
// content/golmok/scripts/GolmokGame.js (신규 작성 필요)
// - 캐릭터 이동 (input.isDown('left'/'right'))
// - 조명 설정: engine.lighting.setAmbient(0.55, '#081828')
//              engine.lighting.addLight({ id:'lamp', x:270, y:350, radius:200 })
// - SceneManager에 golmok씬 등록
```

### ③ golmok 씬 확정
- L0 하늘: `ch01_L0_sky`(석양) vs `L0_sky_rainy`(비오는 밤) — **기획 결정 필요**
- game.json 팔레트: `palette_1bit` → `palette_ch01` 교체 권장

### ④ 캐릭터 애니메이션
- `ch01_char_70s.png` 걷기 프레임 추가 (현재 단일 정적 프레임)
- `convert_pixels.py`에 frames[] 포맷 지원 추가

### ⑤ NO MEMORY 인트로 구현 (기획 완성)
- `backup/PLANDATA/no_memory_intro_animation_script.md` 참조
- Sequencer + TextRenderer + ParticleSystem 조합으로 10씬 구현 가능

---

## 10. 기획 문서 vs 구현 대조표

| 기획 항목 | 기획 위치 | 엔진 지원 | 구현 상태 |
|----------|-----------|----------|----------|
| Chapter 01 (1974~1980) 골목 씬 | GDD | ✅ | 🟡 씬 있음, 게임로직 없음 |
| NO MEMORY 인트로 10씬 | no_memory_intro_animation_script.md | ✅ | ❌ 미구현 |
| CRT 스캔라인 오버레이 | GDD | ✅ (Ch1Scene.js) | 🟡 1974/ 허브에만 있음 |
| 1-bit 흑백 씬 (Scene 01~09) | GDD | ✅ (palette_1bit) | ❌ 미연결 |
| 첫 컬러 등장 (Scene 09 네온) | no_memory script | ✅ (palette_flash) | ❌ 미구현 |
| Chapter 02 아케이드 (1981~85) | GDD | ✅ | 🟡 스켈레톤만 |
| Chapter 03 가정용 콘솔 | GDD | ✅ | 🟡 스켈레톤만 |
| Chapter 04 PC통신 KETEL | GDD + PC_COMM_GUIDE.md | ✅ (text input 모드) | ❌ 미구현 |
| 아바타 성장 시스템 | GDD | ❌ 엔진 없음 | ❌ |
| 서버 사이드 (골드, 랭킹) | GDD | ❌ 엔진 없음 | ❌ |
| 모바일 앱 (Flutter) | GDD | — | ❌ |
| 포인트 라이팅 (등불 분위기) | — | ✅ LightingSystem | ❌ golmok 미연결 |
| 씬 전환 convergence 이펙트 | — | ✅ SceneManager | ❌ golmok 미연결 |
| 파티클 sand_rain / text_form | — | ✅ ParticleSystem | ❌ golmok 미연결 |

---

*Authored by Claude Sonnet 4.5 — 이 문서는 소스코드를 직접 읽어 작성한 현황 기록입니다.*
*다음 세션 시작 시 이 파일과 함께 `backup/docs/GAME_DESIGN_DOCUMENT.md`를 먼저 읽으세요.*

---

## 11. 세션 2 추가 작업 (2026-05-29 오후)

### 11-1. 엔진 버그 수정 (완료)

| 버그 | 수정 파일 | 내용 |
|------|----------|------|
| CollisionSystem 생성자 인자 오류 | `engine/SandEngine.js` | `(this.layers, this.palette_mgr)` → `(this.entities, 2)` |
| DitherEngine 미연동 | `engine/SandEngine.js` | import 추가, `this.dither = new DitherEngine()`, `_frame` 카운터, `palette_mgr.dithering=true` 시 적용 |

---

### 11-2. ch01_char_70s 걷기 애니메이션 (완료)

**변환 파이프라인:**
```
스프라이트시트 PNG (5열×2행, 9포즈, Photoroom RGBA 투명배경)
  → tools/convert_spritesheet.py
  → projects/1974/pixels/characters/ch01_char_70s.json
```

**결과물 spec:**
- 9프레임 × 182×327px
- 팔레트 69색 (예약 인덱스 9~12 공백)
- `stateDef: { walk: { frames:[0..8], loop:true, fps:8 } }`
- AnimationStateMachine 자동 연결 (`stateDef` 있으면 ASM 생성)

**신규 파일:** `tools/convert_spritesheet.py`
- Photoroom RGBA PNG (투명배경) 기준
- 전체 프레임 공통 바운딩박스 크롭 → 통일된 크기로 리사이즈
- 9프레임 합산으로 공통 팔레트 양자화 (MEDIANCUT)
- CIE-LAB 최근접색 매핑

---

### 11-3. golmok 게임 로직 구현 (완료)

**신규 파일:** `content/golmok/scripts/GolmokGame.js`

```javascript
const GROUND_Y    = 490;   // 발끝 y = 490+327 = 817 (골목 포장도로)
const WORLD_WIDTH = 2160;  // 배경 타일 4× (540 × 4)
const MOVE_SPEED  = 80;    // px/sec
```

기능:
- 좌우 이동 (←→ 키), 카메라 플레이어 중앙 추적
- 야간 골목 조명 (LightingSystem ambient 0.55 + 가로등 4개 깜빡임)
- GlowSystem `warm_lamp` 프리셋, VignetteSystem `warm` 프리셋

---

### 11-4. golmok index.html 수정

| 항목 | 수정 내용 |
|------|----------|
| `stateDef` 전달 | `frames[]` 감지 시 `cfg.stateDef = pixelData.stateDef` 추가 → ASM 연결 |
| scene.json 캐시 방지 | `engine.assets.load()` → `fetch(src, { cache:'no-store' }).then(r=>r.json())` |

---

### 11-5. scene.json 업데이트

`content/golmok/scenes/main.scene.json`:
- player 위치: `x=179, y=490, pw=182, ph=327` (새 캐릭터 크기 반영)
- GROUND_Y=490으로 일치

---

### 11-6. showcase_transition.html 제작 (진행 중)

**파일:** `content/golmok/showcase_transition.html`

**구조 (최종):**
- **씬 1개** (`ShowcaseScene`) — SceneManager 씬 전환 없음
- L0 원경 제거, L1 근경 + L3 전경만 사용
- 매 프레임 메인 캔버스 흰색 클리어 (`onRender`에서 처리)
- 배경 세트 교체 즉시 실행 → `onPostRender`에서 구 배경 스냅샷 효과 적용
- 캐릭터 (L2) 전환 효과 위에 항상 표시 (`ctx.drawImage(l2canvas)` 마지막 실행)
- 자동 3초 + ←→ 키 + 터치 좌/우

**5가지 전환 효과:**

| 세트 전환 | 효과 | 구현 방식 |
|----------|------|---------|
| 1→2 | fade | 구 스냅 alpha 1→0 |
| 2→3 | dither | 블록 Bayer + destination-out (GPU 가속) |
| 3→4 | palette_flash | 흰빛 플래시 + 스냅 크로스페이드 |
| 4→5 | slide_left | 구 스냅 x 오프셋 (-W×t) |
| 5→1 | convergence | 구 스냅 scale(1→0.55) + alpha 1→0 |

**HUD:**
- 상단: `SCENE N/5 · 효과명` | `NEXT: 다음효과 →`
- 하단: `← 이전 | 자동 3초 | 다음 →`
- 야간 씬 파랑(#70b8f0) / 주간 씬 앰버(#e8c870) 색상 분기

---

### 11-7. 발견된 에셋 명명 오류 ⚠️

| 파일명 | 실제 내용 | 예상 내용 |
|--------|----------|----------|
| `L3_wall_basic.png` | **노을 하늘** (ch01_L0_sky와 동일) | 담벼락/전경 |
| `L3_wall_stairs.png` | 네온 오락실 골목 (L1_alley_arcade 유사) | 계단 담벼락 |

→ `L3_wall_*` 파일들이 전경 에셋이 아닌 배경 이미지. **파일명 재정의 또는 올바른 전경 이미지 교체 필요.**

---

### 11-8. 주요 기술 발견 사항

**메인 캔버스 클리어 문제:**
- `LayerSystem.composite()`는 메인 캔버스를 클리어하지 않음
- scanline 에셋의 투명 픽셀(index=0) 영역에 이전 프레임 잔상이 누적됨
- 해결: `Scene.onRender()`에서 매 프레임 `ctx.fillStyle='#fff'; ctx.fillRect(...)` 선실행

**Dither 퍼포먼스 문제:**
- 첫 구현: `getImageData/putImageData` 518,400 픽셀 루프 → 프레임당 수백ms → auto-timer 차단
- 해결: `destination-out` 블록 방식으로 교체 → 32,400 fillRect 호출 → GPU 가속 16배 빠름

---

### 11-9. 수정된 파일 목록 (세션 2)

```
[수정]  engine/SandEngine.js
          CollisionSystem 인자 수정, DitherEngine 연결

[신규]  tools/convert_spritesheet.py
          스프라이트시트 PNG → frames[] JSON 변환

[재생성] projects/1974/pixels/characters/ch01_char_70s.json
          9프레임 걷기 애니메이션 (182×327, 69색, stateDef 포함)

[신규]  content/golmok/scripts/GolmokGame.js
          캐릭터 이동 + 조명 + 카메라 추적

[수정]  content/golmok/index.html
          stateDef 전달, scene.json 캐시 방지

[수정]  content/golmok/scenes/main.scene.json
          player 위치/크기 업데이트 (pw=182, ph=327, y=490)

[신규]  content/golmok/showcase_transition.html
          씬 전환 쇼케이스 데모 (5종 효과, 캐릭터 고정)
```

---

### 11-10. 다음 세션 우선 작업

| 우선순위 | 항목 | 내용 |
|---------|------|------|
| 🔴 HIGH | L3 에셋 교체 | `L3_wall_basic/stairs.png` → 실제 전경 담벼락 이미지 필요 |
| 🔴 HIGH | showcase_transition L3 처리 | L3 제거 or 올바른 전경으로 교체 후 쇼케이스 완성 |
| 🟡 MED | golmok 씬 배경 확정 | L0 하늘 선택 (ch01_L0_sky vs L0_sky_rainy) |
| 🟡 MED | 캐릭터 애니메이션 프레임 추가 | 안티그래비티 12프레임 GIF/PNG 제작 후 재변환 |
| 🟡 MED | golmok game.json 팔레트 교체 | `palette_1bit` → `palette_ch01` |
| 🟢 LOW | NO MEMORY 인트로 구현 | `backup/PLANDATA/no_memory_intro_animation_script.md` |

---

*세션 2 업데이트: Claude Sonnet 4.5 — 2026-05-29*
