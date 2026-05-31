# 🛰️ 안티그래비티 핸드오프 — 프로젝트별 에셋 격리 작업

> 작성: Claude (Opus) · 기준일 2026-05-30
> 작업 대상 디렉토리: **`C:\1974` (main 브랜치)** — 반드시 여기서만 작업
> 목표: 프로젝트 간 에셋(샘플 이미지 + 픽셀 JSON)을 `projects/<pid>/` 아래로 격리

---

## ✅ 출발점 (Claude가 미리 정리해 둠)

- **트리 깨끗함**: 모든 변경이 커밋됨. 아래 2개 커밋이 추가됨.
  - `0b71cfe` 세션 작업 (엔진 최적화 + golmok + bg_1~4/sample1 풀컬러 배경)
  - `0efb3d2` 이전 세션 루트 정리 스냅샷 (문서 → `backup/` 이전)
- **롤백 앵커**: 브랜치 **`backup-pre-cleanup`** (= 커밋 596a9b6, 세션 이전 전체 상태). 무슨 일이 생기면 여기서 파일 복구 가능.
- 작업 시작 전 권장: `git checkout -b asset-isolation` (새 브랜치에서 작업).

---

## 🚫 절대 건드리지 말 것 (NO-TOUCH)

1. **`.claude/` 및 `.claude/worktrees/*`** — git 워크트리 4개가 들어있음. 이동/삭제/정리 금지. (다른 브랜치의 작업본 + node_modules)
2. **`.claire/`** — 건드리지 말 것.
3. **`backup/`** — 이전 세션이 백업해 둔 원본 보관소. 읽기만, 수정 금지.
4. **`backup-pre-cleanup` 브랜치** — 롤백용. 삭제 금지.
5. `node_modules/`, 다른 워크트리 디렉토리.

---

## ⚠️ 원래 계획의 오류 — 반드시 반영

1. **"기존 `/assets/samples/` 서빙 프록시"는 존재하지 않음.**
   `dev_server.py`는 정적 파일을 `SimpleHTTPRequestHandler`(URL 디코딩 자동)로 서빙하며 한글/공백 파일명도 이미 정상 동작함. `/api/proxy-image`는 9192 CORS 우회 전용.
   → **불필요한 프록시 신설 금지.** 굳이 추가하면 `..` 경로탈출 차단 + 올바른 Content-Type 필수.

2. **샘플 수집 코드가 세 군데임 — 전부 통일.**
   - `dev_server.py` `/api/project-data` (sampleFiles 수집, 라인 ~488)
   - `dev_server.py` `/api/data` (sampleFiles 수집, 라인 ~577)
   - `dev_server.py` `/api/list-pixels`, `/api/list-project-pixels`
   → `/api/project-data` 한 곳만 고치면 `/api/data`가 옛 경로를 가리켜 깨짐. **세 곳 일관 처리.**

3. **샘플은 "이동(move)" 말고 "복사(copy)" 하거나, 이동 시 변환 도구도 같이 수정.**
   `tools/convert_pixels.py` 에 `SAMPLES_DIR = r'C:\1974\assets\samples\프로젝트2'` **하드코딩**. `convert_spritesheet.py` 등도 확인.
   → 샘플 위치를 옮기면 이 스크립트들이 깨짐. 옮길 거면 해당 경로 상수도 함께 수정.

4. **`assets/pixels/` → `projects/1974/pixels/` 자동 "추측 배분" 금지.**
   카테고리(backgrounds/characters/objects/items)를 추측 이동하면 오분류·해석 깨짐 위험.
   기존 `projects/1974/pixels/backgrounds/` 에는 이미 `bg_1~4.json`, `sample1.json`, `ch01_*` 등이 있음 → **이름 충돌 시 덮어쓰기 위험.**
   → 이동 전 **(a) 충돌 파일 목록, (b) 카테고리 매핑표** 를 먼저 출력해 사용자 검토 받은 뒤 진행. 자동 일괄 이동 ❌.

---

## 🧭 경로 계약 (런타임이 의존하는 경로 — 깨지면 게임/에디터 멈춤)

- 게임 에셋 해석: `content/golmok/index.html` → `/projects/<pid>/pixels/<category>/<name>.json`
  - **`projects/<pid>/pixels/` 구조는 유지.** (pixels는 그대로 두면 됨)
- 엔진 import: 콘텐츠에서 `../../../engine/...` 상대경로 (깊이 의존). `engine/` 위치 이동 금지.
- 에디터: `/sand_engine/sand_engine.html`, 저장 API `/api/save-pixel`, `/api/save-scene` 경로 의존.

---

## 📋 권장 작업 순서

1. `git checkout -b asset-isolation`
2. **샘플 이동 전 dry-run**: 무엇을 어디로 옮길지 목록만 출력 → 사용자 확인.
3. `assets/samples/{배경이미지,참고도트이미지,프로젝트2}` → `projects/1974/samples/` **복사**.
4. `dev_server.py` 3개 수집 지점 모두 `projects/<pid>/samples` 기준으로 수정 + `/api/create-project`에 `samples/` 스캐폴딩 추가.
5. `convert_pixels.py` / `convert_spritesheet*.py` 의 `SAMPLES_DIR` 갱신.
6. `assets/pixels/` 잔여분: 충돌/매핑표 출력 → 검토 후 이동.
7. **검증**: 서버 재시작 → 에디터에서 1974 로드 → 샘플 썸네일 표시 + 드래그앤드롭 변환 동작 확인. **+ `content/golmok/index.html` 실행해 배경/캐릭터 정상 렌더 확인(회귀 테스트).**
8. 단계별 커밋 (한 번에 몰아치지 말 것).

---

## 🧪 회귀 체크 (작업 후 반드시)

- [ ] `http://localhost:9191/content/golmok/index.html` — bg_1 배경 + 캐릭터 정상, ←→ 이동 OK
- [ ] 에디터 샘플 탭에 한글 카테고리 썸네일 표시
- [ ] `projects/1974/pixels/` 기존 에셋(bg_1~4, sample1, ch01_char_70s) 그대로 존재·로드
- [ ] `dev_server.py` 콘솔 에러 없음
