# 작업 로그 — 2026-06-04 (골목길 근경/원경 + 낮밤 + 데이터화 + 성능)

이어받기: 먼저 `docs/ENGINE_CAPABILITIES.md`(엔진 고유 능력·세팅 규칙) + 이 로그를 읽으면 바로 이어집니다.

## 이번 세션에 한 일 (요약)

### 1. 림/성능 초기 수정
- 캐릭터 역광 림이 어두운 배경 앞에서 안 보이던 것 → floor 밝기↑, PEAK↑, 방향가중 완화.
- 림 페이드인 임계 60%→**85%**(해질녘부터 약하게).
- `_sampleBgTone`이 전체 L1(4320×960) 읽어 11.6ms 프레임드랍 → 대표영역만(0.2ms).
- 캐릭터 y 660 / MOVE_SPEED 207 등 미세조정.

### 2. 게임 데이터 CSV화 (엔진=로직 / 게임=데이터)
- `engine/data/Csv.js` 추가: `parseCsv`, `CsvTable`(행=레코드), `ParamTable`(key,value+min/max/desc).
- `games/golmok/data/`: `maps.csv`, `characters.csv`, `animations.csv`, `fx_params.csv` + `README.md`.
- `main.js`가 로드 → `engine.data`. `GolmokGame._loadConfig()`가 상수 대신 테이블 값으로 덮어씀(없으면 fallback).
- 하드코딩 상수를 `let`으로 바꿔 사용처 수정 없이 데이터 주도화 + 인라인 수치는 `this._p`로.

### 3. 근경/원경 분리 (공간감)
- `tools/split_bg_layers.py`: PNG→레이어. **원경=메디안컷 풀컬러**(색 보존), **근경=검정+파일알파**(`#rrggbbaa`).
- 명명: `{era}_1_1_1`=근경, `{era}_1_1_1_1`=원경.
- 씬: L0=원경(parallax 0.30) / L1=근경 / L2=캐릭터.
- **변환기 색 버그 수정**: 빈도순 팔레트 → 메디안컷(노을·불빛 색 보존). 이전엔 파랑으로 뭉개짐.
- 배경 순환을 near+far **동시 교체**로 통합. `_sampleBgTone`은 원경(L0) 샘플.
- 림 env 소스를 근경(L1, 검정) → **원경(L0)** 로 변경(원경 색을 픽셀별로 받게).
- **1960·2020 2장만** 남기고 1970/1980·옛 합성본 삭제 (요청).

### 4. 낮/밤 설계 (콘트라스트)
- 중앙 key 라이트 제거(밝은 원경 wash 주범).
- ambient(곱하기 어둠)×k + glow(불빛)×k = 콘트라스트. 어둠색 = 원경 톤 깊은 버전.
- 글로우 halo 버그 수정: `removeEmissiveIndex(10)` (캐릭터 idx10 옷색이 예약 발광과 충돌).

### 5. 근경 입체감 = 근경 역광 림 (`_renderNearRim`)
- 원경 빛이 근경 실루엣 가장자리를 가산으로 감쌈. 반해상도+ImageData 1회 합성.
- **맵별 배율**(`maps.csv near_rim`): 1960=1.0(강), 2020=0.2(약 — 밝은 야경이라 네온윤곽 방지).

### 6. 성능 — 맵 전환 프레임 드랍 원인 규명·수정
- **원인①** 전환 중 캐릭터FX·근경림이 sandburst 위에 겹쳐 돎 → 6fps. **전환 중 스킵**(early return).
- **원인②** `_swapBg`가 모든 레이어 블룸을 풀해상도 재빌드 → ~737~899ms 한 프레임 프리징.
  - **수정**: 원경(L0)만 재빌드 + **블룸 저해상도(1/3) 빌드**(`GlowSystem._buildBloom`/`_renderLayerBloom`). 737→382ms. 평상시 렌더도 가벼워짐.
- sandburst 버퍼 재사용 + 입자 G 3→4.
- 우상단 **FPS 카운터**(`SHOW_FPS`) 추가 — 실기에서 전환 체감 확인용.

## 측정 환경 주의
프리뷰는 자동화(eval·스크린샷) 중 탭 throttle로 **rAF fps가 1~7로 왜곡**됨. sync 렌더시간(~50~100ms)이 신뢰값. **실제 fps는 실기 우상단 카운터로 확인**.

## 남은 일 (다음 세션)
- 전반적 베이스 fps 30+ 최적화 (getImageData 스톨 통합 — 캐릭터 림/리빌/근경림 readback 줄이기).
- 가로 모드(19870_2) 근경/원경·캐릭터 세팅.
- 에디터 인스펙터에서 `fx_params.csv` 라이브 슬라이더 편집.
- 인트로 연출(모래 모이기) 근경/원경 구조와 재정합.

## 파일 변경
- 신규: `engine/data/Csv.js`, `tools/split_bg_layers.py`, `games/golmok/data/*`, `pixels/objects/{1960_1,2020_1}_{near,far}.json`, `docs/ENGINE_CAPABILITIES.md`, 이 로그.
- 수정: `engine/fx/GlowSystem.js`(블룸 저해상도), `engine/SandEngine.js`(이전 setResolution 등), `games/golmok/{main.js,scripts/GolmokGame.js,scenes/main_portrait.scene.json}`, `build.mjs`(dist에 data/ 포함).
- 삭제: 1970/1980 샘플·픽셀, 옛 합성본 JSON.
