# 1974 프로젝트 — 마스터 규칙
> Claude Code가 이 프로젝트에서 작업할 때 반드시 먼저 읽는 파일.
> 하위 규칙: `CHANNEL.md` / `ENGINE.md` 참조.

---

## 프로젝트 정체성

**1974 범띠 — 주판에서 AI까지**
대한민국 1974년생이 겪어온 디지털 문명의 역정을 직접 플레이하는 인터랙티브 경험.

**개발자:** Oppa (기획/디자인) + Dani (AI 어시스턴트)
**경로:** `C:\1974\`

---

## 두 서브 프로젝트

이 프로젝트는 두 개의 독립적인 서브 프로젝트로 구성된다.

### 1. 1974 채널 (Channel)
- **역할:** 플랫폼 — 챕터/아바타/게임을 담는 그릇
- **진입점:** `index.html`
- **상세 규칙:** `CHANNEL.md`

### 2. Sand Engine (Engine)
- **역할:** 콘텐츠 제작 툴 — 채널에 들어갈 게임을 만드는 엔진+에디터
- **진입점:** `sand_engine.html`
- **상세 규칙:** `ENGINE.md`

```
인트로 화면
     ↓
┌────┴────┐
▼         ▼
채널      엔진
(플레이)  (제작)
```

---

## 채널 ↔ 게임 API 계약 (postMessage)

**모든 Sand Engine 게임은 이 계약을 반드시 구현해야 한다.**
채널이 게임을 iframe으로 실행할 때 유일한 통신 수단.

### embed 모드 감지
```js
const isEmbed = window !== window.top;
```

### 게임 → 채널
```js
// 게임 준비 완료
window.parent.postMessage({ type: 'ready' }, '*');

// 점수 전달
window.parent.postMessage({ type: 'score', value: 100 }, '*');

// 게임 완료
window.parent.postMessage({ type: 'complete', result: { score, time, grade } }, '*');

// 게임 종료 요청 (뒤로가기 등)
window.parent.postMessage({ type: 'exit' }, '*');
```

### 채널 → 게임
```js
// 게임 시작
iframe.contentWindow.postMessage({ type: 'start' }, '*');

// 일시정지
iframe.contentWindow.postMessage({ type: 'pause' }, '*');

// 재개
iframe.contentWindow.postMessage({ type: 'resume' }, '*');
```

---

## 폴더 구조

### 현재 상태
```
C:\1974\
├── CLAUDE.md               ← 이 파일
├── CHANNEL.md              ← 채널 규칙
├── ENGINE.md               ← 엔진 규칙
│
├── index.html              ← 채널 진입점
├── js/ css/ data/          ← 채널 코드
│
├── sand_engine.html        ← 엔진 에디터
├── engine/                 ← 엔진 코어
├── game/                   ← 게임 로직
├── games/                  ← 게임 매니페스트
│
├── assets/                 ← 공유 에셋
├── runner.html             ← 러너 게임 (standalone)
│
├── PLAN/                   ← 구 기획 문서 (참고용)
└── unsanity-runner/        ← 구 러너 프로젝트 (레거시)
```

### 목표 구조 (정리 후)
```
C:\1974\
├── CLAUDE.md
├── CHANNEL.md
├── ENGINE.md
│
├── engine/                 ← 엔진 코어 (채널·에디터·콘텐츠 공유)
│
├── channel/                ← 채널 프로젝트
│   ├── index.html
│   ├── js/
│   ├── css/
│   └── data/
│
├── sand_engine/            ← 에디터
│   ├── sand_engine.html
│   └── scripts/            ← 에디터 전용 씬 (IntroScene, LobbyScene)
│
├── content/                ← 게임 콘텐츠 (엔진으로 제작)
│   ├── index.json          ← 게임 목록
│   ├── abacus/             ← 주판왕 (Ch.2)
│   └── runner/             ← 네모세모동그라미
│
└── assets/                 ← 공유 에셋 (팔레트, 픽셀아트 등)
```

---

## 핵심 개발 원칙

1. **채널과 엔진은 독립 실행 가능** — 서로 없어도 각자 동작한다
2. **게임은 단독 실행 + embed 양쪽 지원** — isEmbed로 자동 감지
3. **게임-채널 통신은 postMessage만** — 직접 DOM 접근 금지
4. **새 게임은 ENGINE.md 프로젝트 생성 규칙을 따른다**
5. **PLAN/ 폴더 MD들은 구 문서** — 이 파일 세트가 기준

---

## 구 문서 안내

| 파일 | 상태 | 대체 |
|------|------|------|
| `PLAN/CLAUDE.md` | 구 문서 (참고용) | `ENGINE.md` |
| `PLAN/ENGINE_INSIGHTS.md` | 구 문서 (참고용) | `ENGINE.md` |
| `PLAN/README.md` | 구 문서 (참고용) | 이 파일 |

---

*1974 프로젝트 — Parkinglot Studio*
*규칙 기준: 2026-05-23*
