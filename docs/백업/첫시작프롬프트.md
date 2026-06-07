# Claude Code 시작 프롬프트
## Sand Engine 전체 분석 + 실행 계획서 작성

---

## 이걸 Claude Code에 그대로 붙여넣어라

---

```
안녕. 지금부터 Sand Engine 프로젝트를 분석하고
실행 계획서를 작성해줘.

## 1. 먼저 이 노션 문서를 읽어라

https://www.notion.so/36d4893f6eff81259a2fe13b68144a2a

이 문서가 전체 설계 방향이야.
반드시 처음부터 끝까지 다 읽어.
특히 맨 위 "핵심 철학 재정의" 섹션이 가장 중요해.

## 2. 프로젝트 코드를 전부 읽어라

프로젝트 경로: C:\1974\
실행 방법: python dev_server.py 9191 C:\1974
확인 URL: http://localhost:9191/sand_engine.html

다음을 파악해:
- engine/ 폴더 전체 파일 목록
- 각 모듈의 현재 구현 상태
- 실제로 동작하는 기능 vs 미완성 기능
- 코드 품질 문제 (꼬인 부분, 버그)
- 레이어 시스템 현재 구조
- pixels.json 현재 구조 (frames 방식인지 확인)

## 3. 핵심 철학을 반드시 이해해라

Sand Engine은 스프라이트시트 방식이 아니야.

[기존 방식 — 하지 않는 것]
frames 배열에 전체 픽셀을 여러 장 저장하는 것.

[Sand Engine 방식 — 해야 하는 것]
기본 픽셀은 1장.
움직이는 픽셀만 animations 배열에 따로 정의.

예시:
{
  "pixels": [ 기본 픽셀 1장 ],
  "animations": [
    {
      "name": "lamp_flicker",
      "loop": true,
      "keyframes": [
        { "pixel_index": 1234, "from": 10, "to": 5, "duration": 0.3 },
        { "pixel_index": 1234, "from": 5, "to": 10, "duration": 0.3 }
      ]
    },
    {
      "name": "smoke_rise",
      "pixels": [2100, 2101, 2102],
      "direction": "up",
      "speed": 0.5,
      "loop": true
    }
  ]
}

이 구조가 안 되어 있으면 이게 1순위 작업이야.

## 4. 노션 모듈 맵과 실제 코드를 대조해라

노션 15번 섹션 "전체 모듈 맵"에
✅ 완료 / 🔧 수정 필요 / ❌ 신규 로 표시되어 있어.

실제 코드를 보고:
- ✅ 완료가 실제로 완료인지 확인
- 🔧 수정 필요 부분이 얼마나 수정이 필요한지
- ❌ 신규 중 기존 코드 재활용 가능한 게 있는지
- pixels.json이 현재 frames 방식이면 animations 방식으로 마이그레이션 필요

## 5. 실행 계획서를 작성해라

다음 형식으로 작성:

### Phase 1 — [제목]
예상 소요: X시간
선행 조건: 없음 / Phase N 완료 후

STEP 1: [파일명] [작업 내용]
- 구체적으로 무엇을 수정/추가/삭제
- 기존 코드 중 재사용할 부분
- 주의사항

완료 조건:
- [ ] 구체적인 테스트 항목

리스크:
- 예상 문제점과 해결 방향

## 6. 이것도 함께 구현해야 해

### pixels.json animations 구조
- PixelAnimator.js 신규 구현
- animations 배열 파싱
- 매 프레임 keyframe 보간 계산
- 변경된 픽셀만 업데이트 (전체 재렌더링 X)
- Dirty Flag 시스템과 연동

### 레이어 시스템 재설계
- 4레이어 고정 (L0~L3)
- 각 레이어 children 배열 트리 구조
- scene.json 파서

### 씬 에디터 패널
- 레이어별 children 목록 트리로 표시
- 각 child 파일명/타입/등록 여부 표시
- TEXT 타입 클릭하면 인라인 수정 가능
- x/y 위치 숫자로 조절 가능
- 추가/삭제는 나중에 — 지금은 읽기+텍스트수정만

### Vercel 배포
- 배포 URL: https://1974-2jlqcky61-parkinglot-s-projects.vercel.app/
- 게임 허브 index.html 생성 (다크 테마, 게임 카드 그리드)
- 현재 있는 게임들 카드 형태로 표시
- 테스트 빌드 완성되면 카드 추가 후 git push

## 7. 절대 규칙

- Canvas only (PNG/GIF/SVG/WebGL 없음)
- 해상도: 540×960 고정
- pixels.json 구조에서 width/height/fps/palette 변경 금지
- 변경된 픽셀만 업데이트 (전체 재렌더링 최소화)
- UI는 Flutter 담당 — Sand Engine에서 구현 안 함
- 인덱스 9=땅 / 10=발광 / 11=위험 / 12=반투명 예약
- 최적화: Uint8Array, Dirty Flag, putImageData 1회, FX 패스 통합

## 8. 계획서 작성 후 나한테 확인받고 시작해라

계획서를 보여주면 내가 검토하고 승인할게.
승인 전에는 코드 수정 시작하지 마.
```

---

## 보내고 나서 할 것

```
1. Claude Code가 코드 분석 후 계획서 보여줌
2. 계획서 보고 이상한 부분 있으면 수정 요청
3. 승인하면 Phase 1 시작
4. 각 Phase 완료될 때마다 테스트 빌드 확인
5. 테스트 빌드 완성 → git push → Vercel 자동 배포
```

## 막히면

```
나(Claude)한테 와서:
"Claude Code가 이런 문제가 생겼어"
→ 내가 해결 프롬프트 만들어줄게
```

---

*Sand Engine · Claude Code 시작 프롬프트 v2.0 · 2026.05.27*
