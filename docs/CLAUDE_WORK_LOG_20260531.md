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
- **(보류) 엔진툴(5번)**: 에디터(`sand_engine.html`+`dev_server.py`)가 아직 옛 `content/`·`projects/`·글로벌 `assets/samples`를 봄 → `games/` 모델로 재배선. 에셋 브라우저 게임별 분리/폴더 진입. 사용자와 함께.
- **(보류) FX 공용화**: 골목 FX를 `engine/fx/` 모듈로 승격 → 신규 게임 자동 상속.
- 신규 프로젝트는 골목 완성까지 보류.

## 5. 실행 방법 (각 프로젝트)
**① 개발 서버 띄우기** (정적 파일 서버, 캐시 no-store)
- 표준: `python dev_server.py 9191`  → `http://localhost:9191/`
  - dev_server.py 포트 = argv[1], 미지정 시 기본 9193.
  - Claude preview 설정 이름 `1974-dev` (`.claude/launch.json`) = 위와 동일(9191).
- `start.bat` 도 있으나 포트 9292 사용(불일치, 정리 대상).

**② 엔진툴(에디터) 실행**
- `http://localhost:9191/sand_engine/sand_engine.html`
- 프로젝트 로드/프리뷰. ※ 하단 에셋 브라우저는 아직 옛 글로벌 `assets/`·`projects/1974` 참조(5번에서 `games/` 재배선).

**③ 게임 단독 실행** (에디터 불필요, 권장)
- 형식: `http://localhost:9191/games/<id>/index.html`
- 골목: `http://localhost:9191/games/golmok/index.html`
- 각 게임은 자기 폴더만으로 동작(엔진은 `/engine/`에서 로드). 신규 게임도 `games/<id>/index.html`.

**④ 조작**: ←/→ 또는 화면 클릭 이동. 맵 오른쪽 끝 도달 시 파도 전환으로 다음 배경.

## 6. 미해결/주의
- 골목 디졸브 "블러 형태로" 추가 요청 — 현재 디지털 블록 형태. 더 부드럽게 갈지 사용자 확인 대기.
