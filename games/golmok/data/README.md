# golmok 게임 데이터 테이블 (CSV)

**원칙: 엔진 = 로직(코드) / 게임 = 데이터(CSV).**
코드에 숫자를 박지 않고 이 표에서 읽는다. 나중에 에디터 툴이 이 CSV만 편집하면 게임이 바뀐다.

## 로딩 흐름
```
games/golmok/data/*.csv
   ↓ main.js init()  (engine/data/Csv.js 로더)
engine.data = { maps, characters, animations, fx }
   ↓ GolmokGame._loadConfig(engine)   ← onEnter에서 1회
모듈 상수(let) 덮어쓰기 + this._p(인라인 수치) 채움 + 애니 fps override
```
CSV 로드 실패 시 코드 내 fallback 기본값으로 동작(게임은 안 죽음).

## 파일

| 파일 | 행 = | 핵심 열 |
|---|---|---|
| `maps.csv` | 배경 1장 | id, asset, world_w/h, **cycle_order**(순환 순서, -1=제외), rim_color(빈칸=자동) |
| `characters.csv` | 캐릭터 1명 | id, asset, pw/ph, spawn_x/y, **move_speed**, layer |
| `animations.csv` | 캐릭터 상태 | char_id, state, frames, **fps**, loop |
| `fx_params.csv` | 파라미터 1개 | key, **value**, min, max(슬라이더용), desc |

## 역할 분담 (씬 vs 테이블)
- **테이블(CSV)** = 타입·스탯·튜닝 (이동속도, 애니 fps, FX 수치, 맵 순환)
- **씬(scene.json)** = 배치 (어떤 맵·캐릭터를 어디 좌표에 놓는가). 좌표는 씬이 우선.
- **픽셀 JSON(pixels/)** = 실제 그림 자산 (CSV 아님)

## fx_params.csv 그룹
- `daynight.*` 낮↔밤 사이클(주기, 최저 밝기)
- `rim.*` 림 라이트(페이드 임계, 세기, floor, 두께, 방향가중)
- `reveal.*` 캐릭터 색 리빌 곡선
- `light.*` 전역 조명 최대치(ambient/key/vignette/glow/fog)
- `bg.*` 배경 전환/모래알
- `intro.*` 진입 인트로
- `sand.*` 좌우 이동 모래 스크롤

## 값 바꾸는 법
CSV의 `value` 열만 수정 → 새로고침. 코드 수정 불필요.
(min/max는 현재 코드가 강제하진 않음 — 향후 에디터 슬라이더 범위용 메타.)

## 미연동(향후)
- `maps.csv` rim_color override (현재 배경색 자동추출만 사용)
- 가로 모드(19870_2) 별도 캐릭터/스폰 — 현재 세로 위주
- 에디터 인스펙터에서 이 CSV 라이브 편집(슬라이더)
