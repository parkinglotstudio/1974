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
- (2026-06-11: 좌우 이동 중 SandScroll 가장자리 띠 효과(`_renderSandScroll`/`_sandBand`)는 **완전히 삭제**. 좌우 가장자리 FX는 아래 `_renderEdgeFrame`(항상 켜진 검정 침식 프레임)만 남음.)
- 이동 모션 트레일(`_renderCharTrail`): **가산 합성(`lighter`) + 채도 낮춘 푸른 잔광**(`v = 14 + 휘도*0.16`, floor 14). 곱셈 darken은 어두운 배경에서 묻혀 안 보였고, 풀컬러 그대로는 밤에 캐릭터색이 튐 → 가산 중립 잔광으로 해결(어둠에서도 보이고 색 안 튐).
- 배경 모래알 상승(`_updateBgMotes`): ON
- **캐릭터 외곽 디졸브(`_updateAmbientSand`): OFF** (`CHAR_DISSOLVE_ENABLED=false` — 요청으로 가림)
- 상수: SAND_GRAIN 4, SAND_BUILDUP_MS 2000, BG_MOTE_RATE 32 (FALL_* 는 디졸브 OFF로 미사용)

## 6.5 원경(L0) 전용 모래 전환 ★시그니처 (2026-06-10 신규 · 가로+세로)
> **가로(main_landscape)·세로(main_portrait) 둘 다 2021 도시 적용** (동일 에셋). 원본 2021 이미지가 와이드라 가로 기준으로 변환, 세로는 같은 에셋을 세로 뷰에 배치.
- **목적**: 월드 진행 중 **원경(하늘/스카이라인)만** 모래 시그니처로 교체. 근경(L1 실루엣)·캐릭터(L2)는 불변.
- **트리거**: `cameraX >= (worldW − viewW) × FAR_SWAP_AT`(기본 0.5 = 월드 중간). 1회 래치(`_farSwapped`). 인트로 끝난 뒤만. **`onEnter`에서 래치 리셋** → 씬 재진입/새로고침마다 다시 동작.
- **씬 한정(중요)**: `_prepareFarSwap`이 **현재 `bg_far`의 asset이 `2021_far`일 때만** 무장. → 가로 2020 등 다른 씬에 2021 원경이 끼어들지 않음(이전 버그).
- **구현 위치**: `GolmokGame.onRender(cameraX)` — composite **이전**(`scenes.render`)에 호출되므로 **L0 캔버스에 직접 그림**. 정적 L0라 `entities.render`가 덮어쓰지 않음 → 근경·캐릭터 합성은 그대로.
  - 가시 윈도우(W×H)만 처리, far2/far7은 **사전 래스터 후 ImageData 1회 캐시**(`_prepareFarSwap`) → 프레임당 `getImageData`(스톨) 없음.
  - **원경 y 시프트 반영**: L0 행 `y` ↔ 원경 행 `y − _bgFarY`(`offY`). 가로는 원경 y-100 시프트라 이걸 안 하면 세로 위치 어긋남 + 하단 검정 생김.
  - **2단계 블렌드**(sandburst와 동일): `shown = t<0.5 ? 1−t/0.5 : (t−0.5)/0.5`, 소스 `sd = t≥0.5 ? far7 : far2`. `shown > thr`(=`sweep×0.55+hash×0.45`)면 그림, 아니면 모래알. → **전반=구 원경이 모래로 소멸, 후반=새 원경이 모래에서 생성**. 옛 그림과 새 그림이 겹쳐 보이지 않음(이전 단일패스 와이프 버그 수정).
  - 완료 시 `_applyFar7`: 원경 엔티티를 far7로 교체(y=`_bgFarY`, dims=far7) + `_bloomReady=false`(원경 블룸 재빌드) + `_bgTone=null`(톤 재샘플 → 림/조명 자동 재매칭).
- **상수**(GolmokGame.js): `FAR_SWAP_ENABLED=true`, `FAR_SWAP_AT=0.5`, `FAR_SWAP_MS=1600`, `FAR_SWAP_OLD='2021_far'`(원경2), `FAR_SWAP_NEW='2021_far7'`(원경7).
- **에셋**: 원경 `2021_far`(원경2, 청색 야경)/`2021_far7`(원경7, 노을) **3748×960** — `tools/convert_2021_bg.py`로 생성. 맵 `2021`(maps.csv, world 3119, near_rim 0.3).
  - 씬 배치 — 가로: 근경 y-540(하단740 노출), 원경 y-100 / 세로: 근경 y-320(하단960 노출), 원경 y0. world 3119(둘 다, 근경폭).
  - **근경 `2021_near` (3119×1280, scanline, 팔레트160, 색보존)**: 사용자가 직접 제작한 `2021_NEW_1.json`(frames/pixels 포맷, 4898×2010, 팔레트129, 색보존)을 `tools/convert_near_new1.py`로 변환해 적용(2026-06-11).
    - 변환: sparse `frames[].pixels`+팔레트 → RGBA 복원 → 월드폭 3119×1280로 리사이즈(원본과 동일 종횡비) → `fill_large_holes(min_area=1)`로 내부 투명 구멍 전부 메움(91,816px) → `quantize_scanline(max_colors=160)`으로 scanline 재양자화(엔진 정적 렌더 fast path용).
    - 불투명 36.8%, 평균RGB (8,10,12) — 어둡지만 창문 불빛/하이라이트 등 디테일 유지.
    - ※근경 변환 시행착오 history: 검정 강제(`black_silhouette_scanline`)→디테일 소실 / 자동 색보존(`color_alpha_scanline`)→배경제거 구멍으로 far 비침 / 검정+전체구멍메움(임시 복귀) → **최종: 사용자 제작 색보존 원본(2021_NEW_1) + 전체구멍메움 + scanline 재양자화**.
- **컨트롤러**(index.html): 가로=기본 크기, **세로=`#pad.portrait` 작게+반투명(opacity .42)**. 둘 다 `pad.show`.

## 7. 꺼진 것
- 낮↔밤 사이클 애니메이션 (k 고정 1.0)
- `CYCLE_ENABLED=false` (배경 끝-도달 순환)
- `DIGITAL_ENABLED=false` (디지털 회로 오버레이)
- `FOG_ENABLED=false`

---

## 캐릭터 / 이동 / 씬 (참고)
- 캐릭터: 씬은 **풀컬러 `ch01_player.json`** 사용 (어둡게는 런타임 `_renderCharReveal`이 처리). idle 48@5fps + walk 16@18fps, 149×259
  - `ch01_player_black.json`(원본×20%)은 현재 미사용(보관용).
- 이동: `MOVE_SPEED = 180` px/s, walk **18fps**(속도 동기화)/idle 5fps, `flipX = dx > 0`
- 씬: `main_portrait` 540×960, world 1706×960, 배경 4장 순환 `1960/1970/1980/2020`(1706×960)

## 렌더 순서 (engine/SandEngine.js)
Glow → Fog → Lighting → **Rim(백라이트)** → Vignette → 씬 오버레이 → 씬 postRender(모래) → FX

## 최적화 완료 (2026-06-03)
- `_readCharRegion()`: 캐릭터 영역 L1+L2를 **1회만** getImageData → `_renderCharTrail`·`_renderCharReveal`·`_renderCharRim`이 **공유** (호출 4~5회 → 2회).
- 트레일: 전체화면 → **캐릭터 bbox만** 읽음.
- 죽은 코드 제거: `_renderCharEdge`, `_spawnIdleParticles`, `_updateIdleParticles`, 비활성 엔진 rim의 no-op 호출.

## 캐시 관리 (2026-06-03)
- 배경 **[현재+다음]만 캐시 보유** (`_manageCache`) — 4장 전부 X. 배경 전환 시 이전 캐시 해제 + 다음 미리 로드(`_ensureBg`).
- 배경 전환 시 **오브젝트 전부 해제**(`_swapBg`, bg_main·player 제외).

## 게임 진입 인트로 연출 (2026-06-03)
- `onEnter`에서 `this._intro={t:0}`, `INTRO_MS=1500`. 진행 중 이동 정지.
- `_renderIntro`: **배경 = 시그니처 모래-로딩 픽셀**(위→아래 생성, 0~0.7) + **캐릭터 = 픽셀이 사방에서 모여 형성**(`_renderCharGather`, 0.4~1.0, 모이는 동안 신비로운 푸른빛 → 정착 시 실제색).

---

# 🔜 나중에 작업 (문서화만 — 구현 보류)

## TODO-A. 하드코딩 값 → 파라미터화 (조절 가능하게)
목표: 아래 흩어진 튜닝값을 **`GolmokGame.js` 상단 `FX` 설정 객체 하나**로 모으고, 최종적으로 **에디터 인스펙터 "효과" 패널에 스크롤 + 라이브 슬라이더**로 노출. (게임이 에디터 iframe에서 돌아 game↔editor 값 연결 필요 → 작업량 큼)

현재 하드코딩 위치/값 (engine은 게임이 호출만):
| 분류 | 값 | 위치 |
|---|---|---|
| 이동속도 | `MOVE_SPEED=180` | 상수 |
| 낮밤 주기 | `60`초 (`cos(dayT*2π/60)`) | onUpdate |
| 캐릭터 reveal | 밤 `0.20 + 0.15*avgLum*1.6`, 배경융합 `0.15*k` | `_renderCharReveal` |
| rim 임계 | `charBright=1-0.8k`, 시작 `0.60`, 최대 `0.20` | onUpdate rimF |
| rim | PEAK `0.55*rimF`, 두께 `3+round(rimF)`(3~4), env boost `1.8`, floor `bgTone*0.55`, 방향 `0.08+0.92*dir²`, 광원 `top_right` | `_renderCharRim` |
| 라이팅 | ambient `0.5*k`, key radius `340`/intensity `0.95*k`, 밤톤 정규화 `235` | onUpdate |
| 글로우 | `bloomStrength=0.95*k` | onUpdate |
| 비네트 | `0.55*k` | onUpdate |
| 배경톤 샘플 | lum임계 `90`, ambient계수 `0.12/0.13/0.16`, floor `0.55` | `_sampleBgTone`/onUpdate |
| 트레일 | 가산, `v=14+lum*0.16` | `_renderCharTrail` |
| 배경순환 | `BG_LIST`, `BG_TRANS_MS=2000`, sandburst | 상수/onUpdate |

## TODO-B. 스케일 최적화 — 엔진 FX 패스 (애니 5배·오브젝트 10마리 대비)
- **병목**: 프레임 수(5배)는 메모리/로딩만 → 압축·프레임 공유로 대응. **렌더 병목은 오브젝트별 매 프레임 `getImageData`**(GPU 스톨) → 10마리에서 불가.
- **방향**: 시그니처 FX(reveal·rim·env매칭)를 **엔진 시스템**으로 옮겨, layer-2 렌더러의 **CPU 버퍼(`imageData.data`, 읽기비용 0)**를 **레이어 전체 1회 패스**로 처리 → 오브젝트 수와 무관(N마리 ~동일 비용). (엔진 `RimLightSystem`이 이미 버퍼 방식 = 모델)
- 트레일은 주요 오브젝트만, 같은 종류 오브젝트는 프레임 데이터 1벌 공유.
- 이 작업과 **TODO-A(값을 엔진 config로)**를 같이 하면 파라미터화+스케일+시그니처 엔진화가 한 번에 정리됨.
