# 1974 채널 — 규칙 및 현황
> 전체 계약 및 API: `CLAUDE.md` 참조
> 엔진 규칙: `ENGINE.md` 참조

---

## 역할

1974 채널은 **플랫폼**이다.
- 플레이어가 1974년생 캐릭터가 되어 인생 챕터를 진행하는 그릇
- 챕터별 미니게임을 GameRunner를 통해 실행
- Digital Evolution Avatar 진화 시스템 관리
- 진입점: `index.html`

---

## 아키텍처

```
채널 (index.html)
├── IntroScene              ← 인트로 + [채널 / 엔진] 분기
├── ChapterScene            ← 챕터 선택, 아바타 갤러리, 상점
├── GameRunner              ← 게임 실행 (iframe + postMessage)
├── PCCommunicationScene    ← Ch.4 KETEL 시뮬레이션
├── PacmanScene             ← 팩맨 미니게임
└── PixelToolScene          ← 픽셀 아트 툴 v6.0
```

### GameRunner (핵심)
채널이 게임을 실행하는 유일한 방법.

```js
// GameRunner 역할
// 1. games/{id}/game.json 로드 → 게임 메타 확인
// 2. iframe 생성 → games/{id}/index.html 로드
// 3. postMessage 수신 → 채널 상태 업데이트
// 4. 게임 complete 수신 → 챕터 진행 반영, 아바타 진화 트리거

class GameRunner {
    run(gameId)      // 게임 실행
    pause()          // 일시정지
    resume()         // 재개
    exit()           // 게임 종료 → 챕터로 복귀
}
```

통신 API는 `CLAUDE.md`의 postMessage 계약 참조.

---

## 10챕터 구조

| Ch | 기간 | 나이 | 대표 미니게임 | 상태 |
|----|------|------|-------------|------|
| 1 | 1974~1980 | 0~6세 | 달고나, 딱지치기, 구슬치기 | 미개발 |
| 2 | 1981~1986 | 7~12세 | **주판왕**, 갤러그 오마주 | 엔진 프로토타입 ✅ |
| 3 | 1987~1989 | 13~15세 | 올림픽 종목 메들리 | 미개발 |
| 4 | 1990~1992 | 16~18세 | 스트파 오마주, 학력고사 OMR | PCCommScene ✅ |
| 5 | 1993~1996 | 19~22세 | 워크래프트 오마주, 삐삐 해독 | 미개발 |
| 6 | 1997~1998 | 23~24세 | IMF 생존기, 스타크래프트 오마주 | 미개발 |
| 7 | 1999~2002 | 25~28세 | 월드컵 승부차기, 닷컴 창업 | 미개발 |
| 8 | 2003~2010 | 29~36세 | 리니지 혈맹전, 게임PD 경영 | 미개발 |
| 9 | 2011~2020 | 37~46세 | 스타트업 생존기, 코로나 대피소 | 미개발 |
| 10 | 2021~현재 | 47~51세 | AI와 한판, 인생 최종 보스 | 미개발 |

---

## Digital Evolution Avatar (14단계)

챕터 클리어 시 아바타가 해당 시대 스타일로 진화.
이전 단계 열람 가능, 재활성화 불가 (인생 progression 메타포).

| 단계 | 이름 | 기억 트리거 |
|------|------|-----------|
| 01 | Analog Birth | 종이, 연필, 낙서 |
| 02 | Arcade Pixel | 오락실, CRT, 코인 |
| 03 | Console Sprite | 패미컴, 슈퍼패미컴 |
| 04 | DOS / Floppy | C:\>, 플로피 |
| 05 | KETEL Connect | 케텔, 다이얼업, 모뎀 |
| 06 | Portal Explorer | Lycos, Yahoo Korea |
| 07 | Community Era | 프리챌, 다음카페 |
| 08 | Messenger Identity | MSN, 버디버디, 네이트온 |
| 09 | Avatar Economy | 싸이월드, 도토리 |
| 10 | MMORPG Awakening | 리니지, 바람의나라 |
| 11 | Battle.net / PC Bang | 스타크래프트, PC방 |
| 12 | 3D Online World | 와우, 리니지2 |
| 13 | Mobile / Steam Hybrid | 스마트폰, Steam |
| 14 | AI Evolution | ChatGPT, Prompt |
| FINAL | From Analog to AI | 모든 시대 융합 |

---

## 개발 현황

### ✅ 완료
- `IntroScene.js` — 픽셀 애니메이션 인트로
- `ChapterScene.js` — 타임라인, 아바타 갤러리, 상점
- `PCCommunicationScene.js` — Ch.4 KETEL PC통신 시뮬레이션
- `PacmanScene.js` — 팩맨 미니게임
- `PixelToolScene.js` — 픽셀 아트 툴 v6.0
- `data/` — chapters_config.csv, avatars.json

### 🔲 다음 작업
1. **GameRunner 구현** — iframe + postMessage 채널 API
2. **인트로 분기** — 채널 / 엔진 선택 화면
3. **Ch.2 연결** — 주판왕 프로토타입을 채널에 연결
4. **챕터 진행 저장** — localStorage 스키마 확정

---

## 개발 규칙

1. 씬 전환은 반드시 `SceneManager`를 통한다
2. 게임 실행은 반드시 `GameRunner`를 통한다 (직접 iframe 생성 금지)
3. 챕터 진행/아바타 데이터는 `localStorage`에 저장
4. 아바타 진화는 챕터 클리어 이벤트로만 트리거
5. 채널은 게임 내부 로직을 알 필요가 없다 — postMessage API만 사용

---

*1974 채널 규칙 — 2026-05-23*
