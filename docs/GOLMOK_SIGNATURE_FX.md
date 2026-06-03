# 골목 시그니처 FX — 적용 효과 · 값 기록

> 원칙: **시그니처 = 엔진 기능**. 로직은 `engine/`에 박고, 게임(`GolmokGame.js`)은 수치/색만 설정한다.
> 이 문서는 현재 세로 모드(`main_portrait`)에 들어간 효과와 값을 기록한다. 값 바꿀 때마다 갱신.

최종 갱신: 2026-06-03

---

## ★ 배경마다 FX 톤 자동 매칭 (2026-06-03)
- `_sampleBgTone()`이 배경(L1) 밝은영역 평균색(`this._bgTone`)을 추출 → **key 라이트색·어둠색·림 floor**를 그 톤으로 도출.
- 배경 바뀌면(`_swapBg`) 재샘플. → 노을 배경=따뜻한 FX, 파란 밤 배경=파란 FX 등 4장+ 자동.
- 검증: 따뜻bg→key `#eba597` / 파란bg→key `#5889eb`. (림 픽셀별 env는 원래부터 자동)

## 현재 상태 한눈에 (2026-06-03 복구 완료)
- **낮↔밤 사이클: ON** — `k = 0.5 - 0.5*cos(dayT * 2π/60)`, 60초 주기.
- **세로 배경 4장 순환: ON** (`CYCLE_ENABLED=true`) — `BG_LIST=[1960_1,1970_1,1980_1,2020_1]`(pixels/objects, 1706×960). 화면 오른쪽 끝 도달 → **sandburst 전환** → 다음 배경으로 `_swapBg('bg_main')` + 플레이어 x=0 리셋. 배경 바뀌면 `_bgTone` 재샘플 → 림/조명 자동 매칭.
- **캐릭터 색상 reveal ★핵심 (캐릭터 안 비침 — 유지)**: 씬은 풀컬러 `ch01_player`. `_renderCharReveal`이 평균 배경밝기로 어둡게 + 배경색 15% 융합 + 알파 255 강제:
  - 낮(k=0) → **100%** 원본색 / 밤(k=1) → **20%(어두운 배경)~35%(밝은 배경 앞)**.
  - `reveal = 1 - (1-nightReveal)*k`, `nightReveal = 0.20 + 0.15*min(1, avgLum*1.6)`.
- 캐릭터 rim = **게임측 `_renderCharRim` 단일** (엔진 rim은 OFF — lightDir 반대측 엣지에도 그려 방향이 뭉개져서).
  - **방향**: 우상단 광원, `dir²` 가중(`0.08 + 0.92*dir*dir`) → 광원쪽만, 반대쪽 ~8%.
  - **env**: 픽셀별 뒤 배경색 ×**1.8** + 따뜻한 floor(90,70,50) `max()`. 검증: 어두운배경 rim(67,56,45) → 밝은배경 rim(190,186,139).
  - **림은 색상 곡선과 분리**: 캐릭터 밝기(`charBright = 1 - 0.8*k`)가 **60% 이하**일 때부터 페이드인. `rimF = clamp((0.60-charBright)/(0.60-0.20),0,1)`.
  - **두께 단계 증가**: 낮→밤 전환 시 `width = 3 + round(rimF)` → 황혼 3px → 깊은밤 **4px** (엔진 상한 6).
  - **은은하게(과포화 방지)**: 엔진 rim 세기 `0.5*rimF` + boost **1.3** / `_renderCharRim` PEAK `0.55*rimF` + 배경증폭 **1.4**.
    - (이전 boost 2.0~2.3은 밝은 배경 앞에서 형광 노란 줄무늬가 됨 → 낮춤)
  - 결과: 낮·황혼(밝음)엔 림 없음 → 깊은 밤(밝기 20%)에서만 은은한 역광. (캐릭터가 밝으면 림 없이도 보이므로)

---

## 1. 라이팅 (engine/fx/LightingSystem.js) — 엔진 기능
| 항목 | 값(k=1 기준) | 비고 |
|---|---|---|
| ambient 어둠 | **0.5** (×k) | color `#0a1428`. 화면 전체 multiply → 캐릭터도 어두워짐 |
| key 라이트 | x270 y300, radius **340**, intensity **0.95**(×k), fixed | 색은 낮↔밤 보간: k=1 → `#ffc85f`(255,200,95) / k=0 → `#b9d7ff`(185,215,255) |

## 2. 글로우/블룸 (engine/fx/GlowSystem.js) — 엔진 기능
| 항목 | 값 | 비고 |
|---|---|---|
| bloomStrength | **0.95** (×k) | 밝은 하늘 픽셀 번짐. 기본 threshold 140 / blur 12 |

## 3. 림 백라이트 (engine/fx/RimLightSystem.js) — 엔진 기능 ★시그니처
| 항목 | 값 | 비고 |
|---|---|---|
| enabled | true | |
| **envSample** | ON | 고정색 대신 가장자리 바깥 **배경 픽셀 색**을 림에 사용 |
| reach | 2 px | 배경 샘플 거리 |
| boost | **2.0** | 샘플색 밝기 배수 (배경샘플 RGB × boost). 클수록 빛 있는 쪽 림이 밝아짐 |
| floor | **`#5a4632`** (90,70,50) | 주변이 어두워도 보장되는 최소 따뜻한 가장자리. 최종림 = max(샘플×boost, floor) |
| intensity | **0.75** (×k) | 밤일수록 강해짐 |
| width | **3 px** | (엔진 상한 1~4) |
| lightDir | `top_right` (기본) | |
| 엣지 검출 | **렌더러 버퍼 알파** | indexMap 미활성/타이밍과 무관하게 동작 |
| 렌더 순서 | **조명 뒤** | 어둠 multiply에 안 먹힘 (SandEngine._render) |

## 4. 비네트 (engine/fx/VignetteSystem.js) — 엔진 기능
| 항목 | 값 | 비고 |
|---|---|---|
| preset | `warm` | |
| strength | **0.55** (×k) | 가장자리 어둡게 |

## 5. 안개 (engine/fx/FogSystem.js)
- **OFF** (`FOG_ENABLED = false`)

## 6. 모래 FX (GolmokGame.js) — ★시그니처 (아직 게임 스크립트에 있음, 엔진 승격 후보)
- `SAND_ENABLED = true`
- 이동 중 SandScroll 가장자리 띠(`onPostRender`/`_sandBand`): **폭 `SAND_BAND_MAX=0.022`(기존 0.065의 1/3)**, **검정만 사용**(모래색·반짝임 제거 — 이미지→검정 블렌드)
- 이동 모션 트레일(`_renderCharTrail`): **가산 합성(`lighter`) + 채도 낮춘 푸른 잔광**(`v = 14 + 휘도*0.16`, floor 14). 곱셈 darken은 어두운 배경에서 묻혀 안 보였고, 풀컬러 그대로는 밤에 캐릭터색이 튐 → 가산 중립 잔광으로 해결(어둠에서도 보이고 색 안 튐).
- 배경 모래알 상승(`_updateBgMotes`): ON
- **캐릭터 외곽 디졸브(`_updateAmbientSand`): OFF** (`CHAR_DISSOLVE_ENABLED=false` — 요청으로 가림)
- 상수: SAND_GRAIN 4, SAND_BUILDUP_MS 2000, BG_MOTE_RATE 32 (FALL_* 는 디졸브 OFF로 미사용)

## 7. 꺼진 것
- 낮↔밤 사이클 애니메이션 (k 고정 1.0)
- `CYCLE_ENABLED=false` (배경 끝-도달 순환)
- `DIGITAL_ENABLED=false` (디지털 회로 오버레이)
- `FOG_ENABLED=false`

---

## 캐릭터 / 이동 / 씬 (참고)
- 캐릭터: `ch01_player_black.json` (**원본 색 ×20% 밝기** — 고유색이 은은히 비치는 어두운 톤), idle 48@5fps + walk 16@12fps, 149×259
  - 팔레트 = `ch01_player.json` 팔레트 × 0.20 (재생성 시 동일 방식)
  - 컬러 원본 보존: `ch01_player.json` (낮용, 100%)
- 이동: `MOVE_SPEED = 180` px/s (1.5배↑), walk **18fps**(속도 동기화)/idle 5fps, `flipX = dx > 0`
- 씬: `main_portrait` 540×960, world 1706×960, 배경 `1960_1`(1706×960, 4장 cycle 후보 1960/1970/1980/2020)

## 렌더 순서 (engine/SandEngine.js)
Glow → Fog → Lighting → **Rim(백라이트)** → Vignette → 씬 오버레이 → 씬 postRender(모래) → FX
