# 모래엔진 — 프로젝트 폴더 구조 (2026-05-31 정리)

## 원칙
- **프로젝트별 완전 격리.** 게임을 만들면 그 게임의 모든 파일이 자기 폴더 안에만 존재한다.
- **픽셀JSON·샘플 사진은 프로젝트 간 절대 공유하지 않는다.** 공유 폴더 없음.
- 다른 프로젝트의 에셋을 보고 싶으면 → 해당 프로젝트 폴더로 들어가서 본다. (에디터 기능, 추후)
- **모래엔진 시그니처 기본 효과(모토)는 모든 신규 프로젝트에 기본 탑재.** 명시 요청 전까지 제거 금지.

## 한 프로젝트 = 두 폴더 (엔진 규약)
프로젝트 `<id>` 는 아래 두 트리를 소유한다. 둘 다 그 프로젝트 전용이다.

```
content/<id>/                 # 게임 로직 (실행 단위)
  game.json                   # 매니페스트 (해상도/레이어/씬/assetProject)
  index.html                  # 실행 진입점
  scenes/<scene>.scene.json   # 씬 정의
  scripts/*.js                # 게임 스크립트 (모토 기본 효과 포함)
  palettes/*.json             # 이 프로젝트 팔레트

projects/<id>/                # 에셋 (이 프로젝트 전용, 공유 금지)
  project.json                # 에셋 매니페스트
  pixels/backgrounds/*.json   # 배경 픽셀JSON
  pixels/characters/*.json    # 캐릭터 픽셀JSON
  pixels/<category>/*.json    # 기타 카테고리
  samples/                    # 변환 전 원본 사진/GIF (이 프로젝트 소스)
  identity/*.json             # (선택) 전환용 팔레트 등
```

- `content/<id>/game.json` 의 `"assetProject": "<id>"` 가 에셋 경로를 가리킨다.
- 엔진은 에셋을 `/projects/<assetProject>/pixels/<category>/<name>.json` 에서 로드한다.
- 따라서 `assetProject` 를 자기 id 로 두면 자동으로 자기 에셋만 본다 = 격리.

## 현재 등록 프로젝트 (content/index.json)
- `golmok` (골목길의 하루) — **유일한 활성 프로젝트, 모래엔진 기준 테스트베드**

## 보관 (등록 해제 · 백업)
- `_archive/deregistered_20260531/` 에 1974 / speedrun / avatarrun + 구 projects/1974 이동.
- 삭제가 아니라 보관. git 이력에도 남아 복구 가능.

## 신규 프로젝트 생성 시 (견본: `_template`)
1. `content/<id>/` + `projects/<id>/` 두 폴더 생성 (위 구조대로).
2. `game.json` 의 `assetProject` 를 `<id>` 로.
3. `projects/<id>/pixels/`, `projects/<id>/samples/` 는 **새로 만든 빈 폴더** — 절대 타 프로젝트 참조 안 함.
4. 게임 스크립트에 모래엔진 모토 기본 효과 탑재.
5. `content/index.json` 에 등록.
- `_template` 견본은 구조 시연용이라 index.json 에 **미등록**.

## 손대지 않는 것
- `.claude/worktrees/*` (git worktree) — 절대 건드리지 않음.
- `backup/` — 읽기 전용.
- `assets/` (구 글로벌 공유 트리) — 레거시. 에디터 에셋 브라우저가 아직 여길 보지만,
  프로젝트별 분리는 엔진툴(에디터) 작업에서 마무리 예정.
