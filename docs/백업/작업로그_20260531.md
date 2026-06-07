# 모래엔진 작업 로그 — 2026-05-31

다음 토큰 타임 핸드오프. 이전: `docs/CLAUDE_WORK_LOG_20260530.md`, `docs/PROJECT_STRUCTURE.md`.

## 1. 큰 구조 변경 — games/<id>/ 단일 폴더 모델
**원칙: 엔진은 엔진(`engine/`), 게임은 게임(`games/<id>/`). 게임 하나 = 한 폴더에 전부. 픽셀JSON·샘플 게임 간 공유 절대 금지.**

- `content/golmok` + `projects/golmok` → **`games/golmok/` 하나로 통합** (commit `634eb1f`)
  ```
  games/golmok/
    game.json (assetBase:"./pixels")  index.html  showcase_transition.html
    scenes/  scripts/GolmokGame.js  palettes/
    pixels/{backgrounds,characters,fog}/   samples/   project.json
  ```
- 에셋 로드 = 상대경로 `./pixels/...` (index.html `assetBase`, GolmokGame.js fetch 모두 상대). 엔진은 `../../engine/`.
- **단독 실행**: 개발서버에서 `/games/golmok/index.html` 직접 열면 돔. 에디터 불필요.
- 1974/speedrun/avatarrun + 구 projects/1974 → `_archive/deregistered_20260531/` 보관 (commit `6a99ca5`).
- 레지스트리: `games/index.json` (신규), `content/index.json`은 비움(레거시).
- `_template` 견본도 `games/_template/`.

## 2. 손대지 않는 것 (계속 유지)
- `.claude/worktrees/*` 절대 금지. `backup/` 읽기 전용.
- **모래엔진 시그니처 FX(모토)는 빼라기 전까지 제거 금지.** 현재 전부 `games/golmok/scripts/GolmokGame.js`에 있음.

## 3. 이번 세션 골목 튜닝 (커밋순)
- `407d909`: 이동속도 440→260, rim 폭 7→3px, 모래 중력 도입, **화면 클릭 이동** 추가.
- `8eba8c4`: 모래를 **캐릭터 외곽 디지털 픽셀 디졸브**로 재설계(배경 파티클 제거), 속도 260→220.
- `a2c09b8`: **SandScroll 띠 = 모래(어두운 매질)→이미지 연속 블렌드** (이진 침식 제거, 안쪽 끝 이음새 제거).
- `6339b1e`: 디졸브 **이동량 비례** (idle 소량 `0.1`, 이동 시 `0.9`), idle 입자 48→14/s, 입자 제자리 유지 후 중력 낙하.
- `a59db2e`: **맵 끝 도달 → 파도(wave) 전환 → 배경 교체(bg_1↔bg_2) + 플레이어 왼쪽 시작점 순간이동.**

### 현재 주요 상수/값 (GolmokGame.js)
- `MOVE_SPEED=220`, `WORLD_WIDTH=2560`, `GROUND_Y=547`
- `BG_LIST=['bg_1','bg_2']`, 시작 배경 bg_1 (scene), `BG_TRANS_MS=2000`
- `SAND_BAND_MAX=0.065`, `SAND_GRAIN=4`, `SAND_BUILDUP_MS=2000`
- `SAND_FALL_RATE=70`, `SAND_FALL_G=4`, `SAND_GRAVITY=130`
- `CYCLE_ENABLED/DIGITAL_ENABLED/FOG_ENABLED=false`, `SAND_ENABLED=true`
- 디졸브 색: 실루엣 샘플 + (r+30,g+40,b+60) 청회색, 그리드 정렬 블록
- SandScroll 블렌드: thr=isLead?h*0.5:0.2+h*0.5, rev=(f-thr)/0.30, 매질 (14,12,9)+14% 모래알
- 클릭 이동: `_targetX`, onEnter에서 canvas pointerdown 바인딩, 키보드 우선

## 4. 다음 할 일
- **(보류) Vercel 배포 — 엔진 숨김 빌드.** 환경 확인 완료: Node24/npm11 OK, 엔진 30모듈 전부 정적 import(번들 OK), 런타임 동적 .js fetch 없음.
  - Phase1(≈30~45분): index.html 인라인 모듈→`src/main.js` 분리 → esbuild로 `app.min.js` 한 덩어리(소스맵 OFF) → `dist/golmok/`에 index.html+JSON(game/scenes/pixels/palettes)만 복사(engine/·samples 제외) → Vercel 배포.
  - Phase2(선택): javascript-obfuscator 난독화 + console 제거.
  - 한계: JSON 데이터는 노출(로직만 숨김), 100% 불가.
- **(완료) 엔진툴(5번)**: 에디터(`sand_engine.html`+`dev_server.py`)의 기존 `content/` 및 `projects/` 하드코딩 경로들을 `games/` 자급자족형 모델에 맞춰 전면 마이그레이션 완료. 
  - 각 프로젝트 폴더 내부의 `games/<pid>/palettes/` 스캔 및 `games/<pid>/samples/`를 스캔해 에셋 브라우저 내의 **[프로젝트샘플]** 카테고리로 자동 바인딩.
  - 다듬기 편집본을 `games/<pid>/samples/`에 세이브할 수 있도록 저장 경로 제어 로직 패치.
  - 브라우저 기동 시 `?project=golmok` 쿼리 파라미터를 사용해 지정된 프로젝트 데이터를 자동으로 셋업 및 로드하는 즉시 실행 기능 탑재.
- **(완료) GIF 다듬기 편집기 휠 줌 구현**: 팝업 뷰포트 레이아웃 개편 및 줌 슬라이더 제거. 마우스 포인터 중심 스마트 휠 줌(Smart Wheel Zoom) 로직 탑재 완료.
- **(보류) Vercel 배포 — 엔진 숨김 빌드.** 환경 확인 완료: Node24/npm11 OK, 엔진 30모듈 전부 정적 import(번들 OK), 런타임 동적 .js fetch 없음.
  - Phase1(≈30~45분): index.html 인라인 모듈→`src/main.js` 분리 → esbuild로 `app.min.js` 한 덩어리(소스맵 OFF) → `dist/golmok/`에 index.html+JSON(game/scenes/pixels/palettes)만 복사(engine/·samples 제외) → Vercel 배포.
  - Phase2(선택): javascript-obfuscator 난독화 + console 제거.
  - 한계: JSON 데이터는 노출(로직만 숨김), 100% 불가.
- **(보류) FX 공용화**: 골목 FX를 `engine/fx/` 모듈로 승격 → 신규 게임 자동 상속.
- 신규 프로젝트는 골목 완성까지 보류.

## 5. 실행 방법 (각 프로젝트)
**① 개발 서버 띄우기** (정적 파일 서버, 캐시 no-store)
- 표준: `python dev_server.py 9292` → `http://localhost:9292/`
  - dev_server.py 포트 = argv[1], 미지정 시 기본 9193.
  - `start.bat` 실행 시 9292 포트 좀비를 처단하고 9292로 기동하도록 통일 및 정비 완료.

**② 엔진툴(에디터) 실행 (골목길 프로젝트 즉시 로드)**
- `http://localhost:9292/?project=golmok`
- 프로젝트 지정 실행 시 로딩 모달을 뛰어넘고 해당 프로젝트로 즉시 바인딩되어 작업 시작 가능.

**③ 게임 단독 실행** (에디터 불필요, 권장)
- 형식: `http://localhost:9292/games/<id>/index.html`
- 골목: `http://localhost:9292/games/golmok/index.html`
- 각 게임은 자기 폴더만으로 동작(엔진은 `/engine/`에서 로드). 신규 게임도 `games/<id>/index.html`.

**④ 조작**: ←/→ 또는 화면 클릭 이동. 맵 오른쪽 끝 도달 시 파도 전환으로 다음 배경.

## 6. 미해결/주의
- 골목 디졸브 "블러 형태로" 추가 요청 — 현재 디지털 블록 형태. 더 부드럽게 갈지 사용자 확인 대기.

---

## 7. 추가 작업 (엔진툴 정리 · 골목 폴리시 · 버셀 배포) — 2026-05-31 후반

### 7-1. 엔진툴(sand_engine.html) 정리
- **에셋 브라우저 프로젝트별**: `_assetProject`, `syncAssetProjectSel()`(games/index.json로 드롭다운), loadProject 시 현재 프로젝트로 기본. 골목 픽셀JSON 정상 표시.
- **레이아웃 재배치**: 좌=레이어 / 중앙 / 우=인스펙터(`#workControl`), 폰 미리보기 숨김. `_relayoutEditor()`(init 끝, 비동기 늦게 실행).
- **인스펙터 확장**: 선택 시 정보칩(레이어/패럴랙스/크기/에셋/팔레트/프레임) + 라이브(scale/visible) + 효과 +/−(골목 시그니처는 코드값이라 전부 🔒). `renderInspectorExtra()`, `_golmokEffects()`, `#inspExtra`.
- **플레이 새 탭**: `scenePlay()`(?scene=), `projectPlay()`(전체). 상단 헤더에 `▶씬`/`▶프로젝트`. 에디터 안에서 엔진 구동 X.
- **(되돌림) 중앙=라이브 시도 → 피그마 캔버스(canvasPanel) 복구**: 중앙은 픽셀/스프라이트 멀티프레임 편집기(work-canvas 4060×4944)이고, 실제 씬 렌더는 숨긴 폰(sand-canvas). "씬 비포함"(레퍼런스 이미지) 기능 보존. **선택씬 라이브 아트보드(B)는 미완 → `docs/HANDOFF_editor_scene_canvas.md` 참조.**
- 비-json(script) 씬 클릭 시 중앙에 픽셀편집기 프레임 잔상 = "버그 화면" (크래시 아님). B에서 근본 해결 예정.

### 7-2. 골목 게임 폴리시 (배포 전)
- **3씬 정상 구조**: `TitleScene.js`/`ResultScene.js` 추가. 타이틀→(클릭)→메인→(Enter)→결과→(클릭)→타이틀. index.html 씬 흐름 재구성, 메인 엔티티는 진입 시 `_loadMainEntities()`. `?scene=` 매핑. game.json defaultScene=golmok_title, 타이틀/결과 type=script.
- **이펙트 정리**: idle 픽셀낙하 제거 / 전환 `wave→sandburst`(대각 모래 스윕+반짝임) / 배경 상승 모래알 `_bgMotes` 재도입 / 발밑 그림자 확대(rx 0.36, ry 12, G 4).
- **캐릭터 크기 = 1.5배**: 엔진이 픽셀 캐릭터를 **정수 배율만** 지원(pw/ph는 박스만) → **에셋 자체를 nearest 1.5배 리샘플**: `ch01_char_walk.json` 184×270 → **276×405**. scene pw/ph=276×405, **GROUND_Y=412**(발끝 817 유지). 원본 184×270은 git 이력에 보존.
- **배경 3개 순환**: `BG_LIST=['bg_1','bg_2','bg_4']`, 맵 끝 sandburst로 차례 전환.
- ※ 크기 재조정 시: 에셋을 같은 방식(Python nearest 리샘플)으로 재생성 + scene pw/ph + GROUND_Y(=817−ph) 맞추기.

### 7-3. 버셀 배포 (엔진 숨김 빌드) — **완료, 프로덕션 라이브**
- **빌드 파이프라인**: 인라인 스크립트 → `games/golmok/main.js` 분리(dev 유지), index.html 외부 참조.
  - `build.mjs`(esbuild): 엔진+게임 스크립트를 **한 파일로 번들+압축(소스맵 off)** → `dist/app.min.js`(~96KB). `dist/`에 index.html + game.json + scenes/ + pixels/ + palettes/만 복사. **engine/·scripts/·samples/ 미포함**.
  - `package.json`(esbuild devDep, `npm run build`), `vercel.json`(buildCommand=npm run build, outputDirectory=dist, framework=null), `.gitignore`(node_modules, dist).
- **GitHub**: origin = `github.com/parkinglotstudio/1974.git` (**private**). 로컬 28커밋이 origin보다 앞서 있었음 → `git push origin main` (596a9b6 → **2b5f85a**).
- **Vercel**: 팀 `parkinglot-s-projects`, 프로젝트 **1974**, GitHub main 자동배포 연동. 커밋 2b5f85a가 **Ready + Production**(9s 빌드). 프로덕션 도메인 `1974-six.vercel.app`(+ git-main 도메인).
  - **재배포**: main에 push하면 Vercel이 `npm run build`→dist 자동 빌드·배포.
  - **로컬 빌드 확인**: `npm run build` → `/dist/index.html` 열어 검증.
  - **주의**: 옛 배포(596a9b6)는 레포 전체(엔진·md 226개)를 정적 노출했음 → 새 빌드는 dist만 서빙(엔진 비공개). 옛 배포는 프로덕션 아님.
  - **공개 설정**: 현재 Vercel Deployment Protection ON(로그인해야 보임). 공개하려면 프로젝트 Settings → Deployment Protection 끄기.
  - (선택) 더 강한 비공개: javascript-obfuscator 한 겹 추가 가능(현재 minify까지). 또는 dist만 CLI 배포(`cd dist && npx vercel`)로 engine 소스 GitHub 미업로드.

### 7-4. 다음 채팅 이어갈 것
- **(B) 에디터 선택씬 라이브 아트보드** — `docs/HANDOFF_editor_scene_canvas.md` (제일 큰 미완).
- 골목 추가 폴리시(디졸브 블러감, 배경별 바닥 높이 보정 등).
- 배포 공개(Protection off) / 난독화 강화 / 미사용 에셋(dist의 bg_3·sample1) 정리.

