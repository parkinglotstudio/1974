# 모래엔진 — 폴더 구조 (2026-05-31)

## 대원칙
- **엔진은 엔진, 게임은 게임.** 엔진 코드는 `engine/`, 게임은 `games/`.
- **게임 하나 = `games/<id>/` 한 폴더에 전부.** 로직·에셋·샘플 모두 그 안.
- **픽셀JSON·샘플 사진은 게임 간 절대 공유하지 않는다.** 공유 폴더 없음.
- **모래엔진 시그니처 기본 효과(모토)는 모든 신규 게임에 기본 탑재.** 명시 요청 전까지 제거 금지.

## 한 게임 폴더 구조 (`games/<id>/`)
```
games/<id>/
  game.json                 # 매니페스트 (해상도/레이어/씬/assetBase)
  index.html                # 단독 실행 진입점 (엔진은 ../../engine/ 에서 import)
  scenes/<scene>.scene.json # 씬 정의
  scripts/*.js              # 게임 스크립트 (모토 기본 효과 포함)
  palettes/*.json           # 이 게임 팔레트
  pixels/backgrounds/*.json # 배경 픽셀JSON (이 게임 전용)
  pixels/characters/*.json  # 캐릭터 픽셀JSON
  pixels/<category>/*.json  # 기타 카테고리
  samples/                  # 변환 전 원본 사진/GIF (이 게임 소스)
  project.json              # 에셋 매니페스트(카테고리/기본팔레트)
```
- `game.json` 의 `"assetBase": "./pixels"` → 에셋은 **자기 폴더 안**에서만 로드. = 자동 격리.
- `index.html` 은 엔진을 `../../engine/SandEngine.js` 로 import → 엔진과 분리, 게임은 독립.
- **단독 실행**: 개발서버에서 `/games/<id>/index.html` 열면 그대로 돈다 (에디터 불필요).

## 현재 게임 (`games/index.json`)
- `golmok` (골목길의 하루) — 유일한 활성 게임, **모래엔진 기준 테스트베드**. 실행: `/games/golmok/index.html`
- `_template` — 신규 게임 견본 (미등록, 복사용)

## 신규 게임 만들 때
1. `games/<id>/` 폴더 생성 (`_template` 복사).
2. `pixels/`·`samples/` 는 **빈 폴더로 새로** — 타 게임 참조 절대 금지.
3. `game.json` 의 `id`·`assetBase` 설정.
4. 게임 스크립트에 모래엔진 모토 기본 효과 탑재.
5. `games/index.json` 에 등록.

## 보관 / 정리됨
- `_archive/deregistered_20260531/` — 1974 / speedrun / avatarrun 구 프로젝트 보관 (삭제 아님, git 이력 보존).

## 손대지 않는 것
- `.claude/worktrees/*` (git worktree) — 절대 건드리지 않음.
- `backup/` — 읽기 전용.

## 아직 남은 것 (엔진툴=5번에서)
- **에디터(`sand_engine.html` + `dev_server.py`)**는 옛 `content/` + `projects/` 분리 + 글로벌 `assets/samples`
  구조를 본다. 에셋 브라우저가 게임별로 안 나뉘는 원인. → 엔진툴 작업 때 `games/<id>/` 모델로 재배선.
- 골목 시그니처 FX는 현재 `games/golmok/scripts/GolmokGame.js` 에 있음 → 공용 `engine/fx/` 모듈로
  승격하면 신규 게임이 자동 상속. (엔진툴과 함께)
- `content/` 는 에디터 재배선 전까지 레거시로 남겨둠.
