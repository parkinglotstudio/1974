# 핸드오프 — 엔진툴 "씬 캔버스(B)" 작업

작성 2026-05-31. **이 파일만 읽으면 (B) 작업을 이어갈 수 있게** 정리. 다른 로그: `docs/CLAUDE_WORK_LOG_20260531.md`, `docs/PROJECT_STRUCTURE.md`.

---

## 0. 한 줄 요약
엔진툴(`sand_engine/sand_engine.html`)에 **피그마식 "씬 캔버스"를 새로 만들어, 선택한 씬만 라이브 렌더**하고 나머지는 정지 프레임으로 두며, 기존 **"씬 비포함"(레퍼런스 이미지)** 기능을 보존하는 것. 골목(games/golmok)은 타이틀/메인/결과 3씬 정상 구조 완료됨.

## 1. 사용자 확정 사항 (반드시 지킬 것)
- **선택 씬만 라이브**, 나머지 씬은 정지(프레임/스냅샷).
- **저장 없음**: 인스펙터에서 값은 라이브로 바꿔보되 **저장 기능은 만들지 않음**. 확정 수치는 사용자가 불러주면 **코드(GolmokGame.js 등)에 직접 반영**.
- **모래엔진 시그니처 FX(모토)는 빼라기 전까지 제거 금지.** 전부 `games/golmok/scripts/GolmokGame.js`에 코드 상수로 있음.
- 라이브로 못 바꾸는 값(코드 상수: 속도/Sand*/rim폭/디졸브 등, 그리고 골목 onUpdate가 매 프레임 덮어쓰는 조명/글로우/비네트/y/flip)은 **인스펙터에서 잠금(🔒, 편집 불가)**.
- 손대지 말 것: `.claude/worktrees/*`, `backup/`(읽기 전용).

## 2. 핵심 진단 — 왜 지금 "버그 화면"이 보이나
- 엔진툴 중앙의 "씬 에디터"는 **사실 스프라이트(픽셀) 멀티프레임 편집기**다. 거대한 `#work-canvas`(약 4060×4944) 위에 **프레임 칸(박스)**을 그린다. 씬과 무관하게 항상 보임. (씬 전환해도 `engine.entities` 비어도 박스 그대로 → `entCount:0` 확인됨)
- **실제 씬 렌더는 `#sand-canvas`** (폰 목업 안, `#phoneCanvasWrap`). 엔진은 여기에 렌더. 현재 `_relayoutEditor()`가 폰을 `display:none` 처리 → 실제 씬이 안 보이고 픽셀편집기 프레임만 남아 "버그 화면"처럼 보임.
- 즉 **중앙=픽셀편집기**, 실제 씬뷰는 숨겨진 폰. 이 불일치가 B의 핵심. 크래시는 아님(콘솔 클린).

## 3. (B) 설계 방향
선택 씬을 **진짜로 렌더**하는 별도 씬 캔버스가 필요. 두 가지 접근:
- **(권장) 기존 라이브 아트보드 시스템 재사용**: `buildLiveArtboards()` / `.live-artboard` (sand_engine.html ~8203). 'live' 타입 씬은 이미 아트보드 DOM에 미니엔진을 돌림(`artboardPlay`/`artboardStop`). → 메인/타이틀/결과를 아트보드로 만들고 **선택된 아트보드만 미니엔진 가동**, 나머지 정지. 골목의 실제 씬 스크립트(GolmokGame/TitleScene/ResultScene)를 아트보드 엔진에 로드해야 함.
- **(대안) sand-canvas를 선택 아트보드 안에 배치**: 폰의 라이브 캔버스를 workStage의 선택 씬 프레임 위치에 끼워넣고 pan/zoom 동기화. 좌표/스케일 작업 큼.
- **씬 비포함(레퍼런스 이미지)**: workStage 위 자유 배치 요소로 보존. 아트보드와 공존.
- **픽셀편집기와 분리**: 현재 work-canvas(스프라이트 편집)와 씬 캔버스는 용도가 다름 → **모드 토글**(씬 캔버스 ↔ 스프라이트 편집) 또는 별도 뷰로 분리 권장.
- **최적화**: 비선택 씬은 1회 스냅샷/정지, 선택 씬만 라이브. 미니엔진 N개 동시 가동 금지.

### B 미해결 결정(다음 세션 사용자와)
- 비선택 씬 = 정지 스냅샷 이미지 vs 빈 라벨 프레임?
- 씬 캔버스와 기존 픽셀편집기 = 토글 전환 vs 영구 분리?
- 아트보드 클릭으로 씬 선택 + 좌측 레이어/우측 인스펙터 연동 범위.

## 4. 이번 세션 완료분 (이미 반영됨)
**에디터 (sand_engine.html)**
- 에셋 브라우저 **프로젝트별**: `_assetProject`, `syncAssetProjectSel()`(=`games/index.json`로 드롭다운), `loadAssets()`. loadProject 시 현재 프로젝트로 기본 설정. (커밋 이력 참조)
- 레이아웃: `_relayoutEditor()`(~7039) — 좌=레이어(`#layerPanel`)/우=인스펙터(`#workControl`)/폰(`#previewPanel`) 숨김. **주의: init 비동기 끝에 늦게 실행됨(읽기 타이밍 유의).**
- 인스펙터 확장: `selectEntity()`(~4165) → `renderInspectorExtra()` + `_golmokEffects()`, DOM `#inspExtra`(인스펙터 `#inspector` 내). 정보칩 + 라이브(scale/visible) + 효과 +/−(전부 🔒).
- 플레이 새 탭: `window.scenePlay()`(현재 씬, `?scene=`) / `window.projectPlay()`(전체). 상단 `.header-actions`에 `▶씬`/`▶프로젝트` 버튼. 에디터 안 구동 X.
- **현재 중앙은 피그마 캔버스(`#canvasPanel`) 복구 상태**(씬 비포함 보존). 폰만 숨김.

**게임 (games/golmok)**
- 3씬 정상 구조: `scripts/TitleScene.js`, `scripts/ResultScene.js`, `scripts/GolmokGame.js`(메인+모든 FX).
- `index.html`: 타이틀→(클릭)→메인→(Enter)→결과→(클릭)→타이틀. 메인 엔티티는 진입 시 `_loadMainEntities()`로 로드. `?scene=` 매핑(`main|golmok_title|golmok_result`).
- `game.json`: scenes main(json,`scenes/main.scene.json`)/golmok_title(script)/golmok_result(script), `defaultScene:"golmok_title"`, `assetBase:"./pixels"`.

## 5. 코드 지도 (sand_engine.html 주요 지점)
- 엔진 캔버스: `const canvas = #sand-canvas`(~2305), `new SandEngine`(~6632). 폰 `#phoneCanvasWrap`(~1666) 안.
- 중앙 픽셀편집기: `#canvasPanel`→`#workViewport`(~1740)→`#workStage`→`#work-canvas`(~1746).
- 씬 전환: `switchEditorScene()`(~6847). json 분기=`_loadEditorSceneJSON`, else=empty/script(현재 잔상 안 치움).
- 프로젝트 로드: `loadProject()`(~6624). 씬 탭 생성 `#sceneTabs`(~6785).
- 라이브 아트보드: `buildLiveArtboards()`(~8203), `.live-artboard`, `artboardPlay/Stop`(~8374~).
- 레이아웃: `_relayoutEditor()`(~7039), init 끝 호출(~7036).
- 씬 탭 바 DOM: `#sceneTabBar`/`#sceneTabs`(~1872), `.workspace` 하단.
- dev_server `/api/project-data`(~625): `games/<pid>/{pixels,palettes,samples}` 읽음(타 에이전트가 games/ 마이그레이션 완료). 레지스트리 `games/index.json`.

## 6. 실행/테스트
- 서버: `python dev_server.py 9191` → http://localhost:9191/ (preview 설정 `1974-dev`). ※ `dev_server.py`에 미커밋 변경 있음(타 에이전트 games/ 마이그레이션) — 건드리지 말 것.
- 엔진툴: `/sand_engine/sand_engine.html?project=golmok`
- 게임 단독: `/games/golmok/index.html` (▶프로젝트=타이틀부터), `?scene=main`(메인만)
- 검증 팁: relayout이 늦게 도니 미리보기 eval은 1.5~2.5s 후 읽기.

## 7. 주의/함정
- `_relayoutEditor` 비동기 타이밍 — 즉시 읽으면 미적용으로 보임.
- `switchEditorScene` else 분기에서 work-canvas 잔상 안 치워짐(매 프레임 픽셀편집 루프가 다시 그림) → 단순 clear로 안 됨. B에서 씬 캔버스 분리로 근본 해결.
- 골목 FX 값은 코드 상수 + onUpdate 매 프레임 덮어쓰기 → 라이브 편집 불가(잠금). 변경은 대화로.
