# 🤖 Claude 작업 로그 & 현 상태 전체 기록
> Authored by: Claude Sonnet 4.5 (Anthropic)
> 기준일: 2026-05-30 | 세션: 2026-05-30 (세션 3)
> 프로젝트 루트: `C:\1974`

---

## 1. 프로젝트 전체 구조

```
C:\1974
├── engine/                  ← Sand Engine 코어 (범용 픽셀 게임 엔진)
├── sand_engine/             ← sand_engine.html (에디터 — 픽셀 작화+씬 편집)
├── content/                 ← 게임 콘텐츠
│   ├── 1974/                ← 메인 허브 (intro, showcase, ch1~ch3)
│   ├── golmok/              ← 미니게임: 골목길의 하루 (Ch01 전용)
│   ├── speedrun/            ← 미니게임: 네세동 (횡스크롤 러너)
│   └── avatarrun/           ← 미니게임: 아바타런
├── projects/                ← 에디터가 저장하는 픽셀 에셋 프로젝트
│   └── 1974/pixels/         ← golmok용 에셋 (backgrounds/, characters/)
├── assets/
│   ├── palettes/            ← 전역 팔레트 JSON
│   └── samples/프로젝트2/   ← 원본 샘플 PNG (변환 소스)
├── tools/
│   ├── convert_pixels.py    ← PNG→pixels.json 변환 스크립트
│   └── convert_spritesheet.py ← 스프라이트시트 PNG → frames[] JSON 변환
└── docs/
    ├── CLAUDE_WORK_LOG_20260529.md ← 이전 세션 작업 로그
    └── CLAUDE_WORK_LOG_20260530.md ← 이번 세션 작업 로그 (본 문서)
```

---

## 2. 이번 세션 수정 및 구현 항목 (2026-05-30)

에디터(`sand_engine.html`)의 픽셀 임포트 비교 모달과 백엔드(`dev_server.py`)의 이미지 처리 프로세스를 한층 더 전문적이고 콤팩트하게 보완했습니다.

### 2-1. 임포트 비교 모달 실시간 재계산 및 콤팩트화 (`sand_engine.html`)
- **실시간 비교/제어 패널 구현**: 픽셀 임포트 모달(`pixelImportModal`) 내부에서 실시간으로 저장할 파일명 변경, 스케일(%), 좌우 자르기(px), 상하 자르기(px) 수치를 조절할 수 있는 인풋 폼 연동.
- **실시간 크롭 및 프리뷰**: 수치가 변경될 때마다 프론트엔드 연산(또는 백엔드 GIF API 요청)을 실시간으로 트리거하여 원본의 크롭 영역(CSS 마스크 기반)과 픽셀화된 최종 캔버스 변환 결과를 실시간 동기화.
- **디스플레이 크기 제약 (200×150px) 적용**: 해상도가 거대하거나 종횡비가 길쭉한 원본 이미지도 화면을 과도하게 가리지 않도록 원본/변환본 미리보기 창의 최대 크기를 `200×150px`로 콤팩트하게 축소 조정. 이에 따라 모달의 전체 레이아웃이 화면에 깔끔하게 맞도록 최적화.

### 2-2. GIF 크롭 및 스케일링 백엔드 지원 (`dev_server.py`)
- **API 파라미터 연동**: `/api/convert-gif` POST 요청 바디에 `trimLR` (좌우 여백 자르기) 및 `trimTB` (상하 여백 자르기)를 반영하도록 수정.
- **Pillow 프레임 전처리**: GIF 애니메이션의 각 프레임을 처리할 때, 원본 `img` 객체에서 지정된 자르기 픽셀만큼 `crop`을 적용하고 지정된 `scale` 배율로 `resize` 처리하도록 Pillow 기반 전처리 알고리즘 보완.

### 2-3. 변환 중 로딩 오버레이 구현 (`sand_engine.html`)
- **로딩 오버레이 UI 구현**: 변환 연산(특히 프레임이 많은 GIF 파일의 서버 요청 및 인공지능 매칭 등) 중에 화면이 갑자기 꺼지거나 무반응으로 대기하지 않도록, 백그라운드 연산 진행 상태를 명시적으로 가려주는 세련된 **로딩 오버레이**(`convertLoadingOverlay`) HTML/CSS 추가.
- **로딩 상태 관리**: `_runPreviewImport`와 `_runGifConvert`가 비동기로 호출될 때 로딩 화면을 시작하며, 완료(성공/실패 모두) 시점에 깔끔하게 닫히도록 JS 제어 로직을 바인딩.

---

## 3. 이번 세션 수정 파일 목록

```
[수정]  sand_engine/sand_engine.html
          - 변환 진행 중 로딩 화면을 구성하는 HTML 오버레이 추가
          - 로딩 오버레이용 CSS 애니메이션 및 스타일 규칙 반영
          - showConvertLoading / hideConvertLoading 헬퍼 JS 함수 추가
          - _runGifConvert: 변환 중 로딩 띄우기/닫기 처리 및 미리보기 박스 maxW=200, maxH=150 적용
          - _runPreviewImport: 이미지 로드 및 변환 시작/실패/완료 시 로딩 노출 처리, 미리보기 박스 maxW=200, maxH=150 적용

[수정]  dev_server.py
          - /api/convert-gif: trimLR, trimTB 바디 파라미터 적용
          - Pillow 프레임 분석 단계에서 crop 및 resize 전처리 파이프라인 완성
```

---

## 4. 다음 세션 우선 작업 권장사항

| 우선순위 | 항목 | 내용 |
|---------|------|------|
| 🔴 HIGH | L3 에셋 교체 | `L3_wall_basic/stairs.png` -> 실제 전경 담벼락 이미지로 교체 필요 |
| 🔴 HIGH | showcase_transition L3 처리 | 쇼케이스 데모에서 L3 레이어 정리 또는 교체하여 전환 연출 완성 |
| 🟡 MED | golmok 씬 배경 확정 | L0 하늘 이미지 선택 및 game.json의 팔레트를 ch01 앰버 전용 팔레트로 완전 교체 |
| 🟡 MED | 캐릭터 걷기 애니메이션 보강 | 안티그래비티 12프레임 걷기 모션 에셋 업데이트 시 스프라이트시트 재분석 적용 |
| 🟢 LOW | NO MEMORY 인트로 구현 | `backup/PLANDATA/no_memory_intro_animation_script.md` 스크립트를 기반으로 타이포그래피 및 파티클 연동 씬 제작 |

### 2-4. GIF 다듬기 편집기 구현 및 듀얼 게이지 & 휠 줌 고도화 (9292 포트)
- **듀얼 슬라이더(Tolerance + Softness) 배경 제거:**
  - 기존 픽셀 분석 오프셋(+15) 대신 포토샵 스타일의 임계값(Tolerance: 0~150)과 경계면 부드러움(Softness: 0~50) 듀얼 게이지를 도입했습니다.
  - 두 값을 모두 `0`으로 두면 정확히 일치하는 배경색 `(253, 253, 251)`만 투명화되어 100% 원본 캐릭터 컬러가 완벽 보존되며, Softness를 올려 원하는 만큼 부드러운 그라데이션 전이를 줄 수 있도록 예외 처리를 완료했습니다.
- **마우스 휠 위치 기준 스마트 줌(Smart Wheel Zoom):**
  - 기존 크게 보기 줌 슬라이더를 전면 제거하고, 캔버스 스크롤 뷰포트 내에서 마우스 휠을 굴렸을 때 마우스 포인터가 가리키는 픽셀 위치를 중심으로 크리스피하게 확대/축소(`1x ~ 15x`)되는 연산 오프셋 공식(scrollLeft/scrollTop 역산 보정)을 탑재했습니다.
  - 캔버스 이너 패딩 컨테이너를 신설하여 줌이 커져도 창 상하좌우가 잘려 보이지 않고 휠 스크롤로 구석구석 정교하게 확인하며 다듬을 수 있도록 UX를 개편했습니다.
- **URL 404 & Base64/Blob 원시 데이터 다중 로딩 예외 처리:**
  - GIF 소스가 풀 URL(`http://...`)로 로딩되어 404가 나거나 `Unexpected end of JSON input`을 뱉던 버그를 정밀 분석하여, 클라이언트(`new URL().pathname`)와 서버(`urlparse & unquote`) 양측에서 로컬 상대 경로로 변환 및 정규화되도록 패치했습니다.
  - 에셋 소스가 Base64(data:)나 Blob(blob:) 원시 데이터일 때도 자동 감지하여 Base64 binary 바이츠 형태로 변환하여 서버(`/api/extract-gif-frames`)로 보내도록 보완하여, 로딩 오류가 나는 현상을 완벽 차단했습니다.
- **9292 클린 포트 이전 및 start.bat 자동 실행 연동:**
  - 기존 좀비 소켓 프로세스(PID 3832)가 9191 포트를 계속 점유하던 충돌을 회피하기 위해, 9292 포트로 파이썬 개발 서버를 마이그레이션했습니다.
  - `start.bat`을 더블클릭할 때 자동으로 9292 좀비를 처단하고 9292 포트 서버 구동 및 크롬 브라우저 접속이 원스톱으로 일어나도록 배치 스크립트를 정비했습니다.

---

## 3. 이번 세션 수정 파일 목록

```
[수정]  sand_engine/sand_engine.html
          - gifEditorModal 팝업창 최소 폭을 440px로 늘리고, 캔버스 스크롤 뷰포트를 반응형(최대 420px)으로 확장
          - 줌 슬라이더 제거 및 휠 줌(Wheel Zoom) 제어 휠 리스너와 캔버스 리사이징 헬퍼 함수 구현
          - openGifEditor: Base64/Blob URL 우회 로직 및 4배 줌 기본 셋업
          - 모달 헤더 타이틀 우측에 실시간 Zoom 배율 인디케이터 구성

[수정]  dev_server.py
          - /api/extract-gif-frames 및 /api/convert-gif: gifPath에 프로토콜이나 퍼센트 인코딩이 포함된 풀 URL이 올 경우 urlparse/unquote를 거치도록 경로 정규화 적용

[수정]  start.bat
          - 실행 포트를 9191에서 9292로 수정하여 9292 좀비 처단 및 9292 브라우저 즉시 팝업 연동
```

---
*Authored by Claude Sonnet 4.5 — 이 문서는 소스코드를 직접 읽고 수정한 최종 개발 결과 보고 로그입니다.*
