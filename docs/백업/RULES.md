# Sand Engine — 피그마식 게임 개발 룰

> 이 문서는 Sand Engine 위에서 1974 플랫폼을 개발할 때 따르는 설계 규약이다.
> 모든 결정은 이 룰을 기준으로 한다.

---

## 0. 전체 개발 파이프라인

```
① 기획자가 이미지/그림 제작
        ↓
② 에셋 브라우저 — 이미지 업로드 → PixelJSON 변환 (해상도 맞춤)
        ↓
③ assets/pixels/ 에 저장 → prefab.json 등록
        ↓
④ 에디터에서 씬 레이어(L0~L3)에 배치 · 확인
        ↓
⑤ AI가 PixelJSON을 직접 보고 → 의도에 맞게 구현
        ↓
⑥ Live 씬(게임)으로 실행 · 검증
```

**② 단계(이미지→픽셀 변환)가 핵심 커뮤니케이션 채널이다.**
기획자의 시각적 의도를 AI가 직접 확인할 수 있어야
추론 오차가 줄고 구현 결과가 의도에 가까워진다.

---

## 1. 프로젝트 계층 구조

```
Sand Engine          ← 도구 (engine/)
└── 1974             ← 플랫폼 · UI 껍데기 (content/1974/)
    ├── UI 화면들    ← JSON 씬 (에디터에서 디자인)
    └── 게임들       ← Live 씬 (iframe으로 실행)
        ├── Ch1
        ├── Ch2
        └── Ch3 ...
```

**원칙:** 1974는 게임이 아니라 **UI 플랫폼**이다.
게임(챕터)은 1974 안에서 실행되는 독립 모듈이다.

---

## 2. 씬 타입 규약

Sand Engine의 `game.json`에서 씬은 세 가지 타입을 가진다.

| 타입 | 역할 | 에디터 표시 | 예시 |
|------|------|------------|------|
| `json` | 정적 UI 화면 디자인 | 전체 씬 멀티프레임 | 타이틀, 로비, 챕터셀렉트 |
| `live` | 실제 게임 실행 | 게임 씬 탭 (재생 버튼) | Ch1, Ch2, Ch3 |
| `empty` | 설계 예정 플레이스홀더 | 빈 프레임 | 미완성 화면 |

### 2-1. JSON 씬 (UI 화면)

- 픽셀아트 에디터에서 **직접 디자인**하는 화면
- 엔티티, 레이어, 텍스트 등 에디터 도구로 제작
- 멀티프레임 캔버스에서 **피그마 프레임처럼** 나란히 보임
- 파일 위치: `content/1974/scenes/씬이름.json`

### 2-2. Live 씬 (게임 실행)

- 독립 HTML + JS로 구현된 실제 게임
- 에디터에서 ▶ 플레이 버튼으로 iframe 실행
- **멀티프레임에 나오지 않음** — 실행 전용
- 반드시 **씬 계약(Section 4)**을 구현해야 한다

### 2-3. Empty 씬 (플레이스홀더)

- 아직 설계하지 않은 화면
- 멀티프레임에 빈 박스로 표시
- 설계가 완료되면 `json`으로 전환

---

## 3. 피그마식 개발 워크플로우

```
1. 기획        전체 씬에서 필요한 화면 목록 정의
               → game.json에 empty 씬으로 등록

2. 디자인      에디터 픽셀아트 툴로 UI 화면 제작
               → 완성 시 empty → json 전환

3. 구현        live 씬(게임)은 별도 HTML/JS로 개발
               → 씬 계약 구현 후 game.json에 live로 등록

4. 연결        JSON 씬 → Live 씬 navigate 메시지로 전환
               (버튼 클릭 → 챕터 실행)

5. 검증        에디터에서 각 씬 확인
               전체 씬: UI 레이아웃 확인
               게임 씬: ▶ 플레이로 실제 실행 확인
```

---

## 4. 씬 계약 (Live 씬이 반드시 구현할 것)

모든 live 씬 HTML은 아래 postMessage 프로토콜을 구현해야 한다.

### 4-1. 초기화 핸드셰이크

```js
// live 씬 HTML 내부
const _isEmbed = window !== window.top;

// 로드 완료 → 부모에게 준비 신호
window.addEventListener('load', () => {
    if (_isEmbed) window.parent.postMessage({ type: 'ready' }, '*');
});

// 부모의 start 신호 수신 → 게임 시작
window.addEventListener('message', (e) => {
    if (e.data?.type === 'start') main();
    if (e.data?.type === 'pause')  engine?.stop?.();
    if (e.data?.type === 'resume') engine?.start?.();
});
```

### 4-2. 씬 전환 (Live → 다음 씬)

```js
// 게임 종료 후 1974 플랫폼의 다른 씬으로 이동
window.parent.postMessage({ type: 'navigate', to: '씬이름' }, '*');
```

### 4-3. embed 모드 스케일링

```js
// embed 모드: 분수 스케일 (iframe 뷰포트에 맞춤)
// 단독 모드: 정수 스케일 (픽셀 퍼펙트)
const SCALE = _isEmbed
    ? Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H)
    : Math.max(1, Math.floor(Math.min(
          (window.innerWidth  - 240) / GAME_W,
          (window.innerHeight -  44) * 0.88 / GAME_H)));

// embed 모드: position:fixed로 overflow:hidden 클리핑 우회
if (_isEmbed) {
    const offX = Math.max(0, (window.innerWidth  - GAME_W * SCALE) / 2);
    const offY = Math.max(0, (window.innerHeight - GAME_H * SCALE) / 2);
    [canvas, overlay].forEach(c => {
        c.style.position = 'fixed';
        c.style.left = `${offX}px`;
        c.style.top  = `${offY}px`;
    });
}
```

---

## 5. 폴더 구조 규약

```
C:/1974/
├── engine/                    ← Sand Engine 코어 (수정 시 하위 호환 필수)
├── sand_engine/               ← 에디터 (sand_engine.html)
├── docs/                      ← 개발 문서
│   └── RULES.md
├── assets/                    ← 공유 에셋 (팔레트, 프리펩)
│   ├── palettes/
│   └── prefabs/
├── content/
│   ├── index.json             ← 프로젝트 목록 (에디터 프로젝트 피커)
│   └── 1974/                  ← 1974 플랫폼
│       ├── game.json          ← 씬 정의, 해상도, 팔레트
│       ├── scenes/            ← JSON 씬 파일들
│       │   ├── title.json
│       │   ├── lobby.json
│       │   └── ...
│       ├── ch1/               ← Ch1 게임 (live 씬)
│       │   ├── index.html
│       │   └── scripts/
│       ├── ch2/               ← Ch2 게임 (live 씬)
│       └── ch3/               ← Ch3 게임 (live 씬)
└── backup/                    ← 구버전 보관
```

---

## 6. game.json 작성 규약

```json
{
  "id": "1974",
  "name": "1974",
  "version": "0.1",
  "resolution": { "width": 320, "height": 240 },
  "palette": "/assets/palettes/palette_1974.json",
  "scenes": {
    "title":  { "type": "json", "src": "/content/1974/scenes/title.json",  "label": "타이틀"     },
    "lobby":  { "type": "json", "src": "/content/1974/scenes/lobby.json",  "label": "로비"       },
    "ch1":    { "type": "live", "liveEntry": "content/1974/ch1/index.html", "label": "Ch1 · 게임명" },
    "ch2":    { "type": "live", "liveEntry": "content/1974/ch2/index.html", "label": "Ch2 · 게임명" }
  },
  "defaultScene": "title"
}
```

**규칙:**
- JSON 씬 `src`: 항상 절대경로 (`/content/...`)
- Live 씬 `liveEntry`: 서버 루트 기준 상대경로 (`content/...`)
- `label`: 에디터 탭에 표시되는 이름 — 한글 사용

---

## 7. 에셋 경로 규약

모든 에셋 경로는 **서버 루트 기준 절대경로**를 사용한다.

```js
// ✅ 올바름
await engine.loadPalette('/assets/palettes/palette_1974.json');
await engine.loadPrefabs({ COIN: '/assets/prefabs/COIN.prefab.json' });

// ❌ 틀림 (상대경로 — 진입점 위치에 따라 404 발생)
await engine.loadPalette('assets/palettes/palette_1974.json');
```

---

## 8. 핵심 개발 규칙

| 규칙 | 내용 |
|------|------|
| **Git Push** | 기획자 명시 명령 시에만 |
| **engine/ 수정** | 하위 호환성 반드시 확인 후 진행 |
| **게임 결정** | 기획자와 함께 결정, 먼저 구현하지 말 것 |
| **live 씬** | 씬 계약(Section 4) 반드시 구현 |
| **에셋 경로** | 항상 절대경로 (`/assets/...`) |
| **씬 설계** | empty → json → live 순서로 단계적 완성 |

---

*최종 업데이트: 2026-05-24*
