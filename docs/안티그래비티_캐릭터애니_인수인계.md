# 🛰️ 안티그래비티 핸드오프 — 골목길 캐릭터 애니메이션 & 연출

> 작성: Claude (Opus) · 기준일 **2026-06-06**
> 작업 대상: **`C:\1974` (main 브랜치)** — 반드시 여기서만 작업
> 담당 범위: **골목길(`games/golmok`) 캐릭터 애니메이션 + 연출(staging/FX 연출)**
>  - GIF → 스프라이트 변환으로 캐릭터 모션 제작
>  - 모래 엔진의 **시그니처 연출**(모래 코팅 전환 등)을 캐릭터에 입히고 다듬기
>  - 그동안 쌓인 변환/연출 노하우를 이어받아 발전

이 문서 하나로 현재 구조·상황·함정·규칙을 모두 파악할 수 있게 정리했다. **시작 전 끝까지 정독할 것.**

---

## 0. ⚠️ 가장 먼저 — 절대 규칙 (어기면 작업이 날아간다)

1. **커밋 안 한 작업은 언제든 사라질 수 있다 (실제로 사고가 났음).**
   - 2026-06-06, `games/golmok/scripts/GolmokGame.js`의 **커밋 안 된 애니메이션 작업 ~494줄이 통째로 되돌려졌다**(누군가 tracked 파일을 마지막 커밋 상태로 덮어씀). 트랜스크립트에서 91개 편집을 재적용해 겨우 복구했다.
   - **교훈:** ① tracked 파일(`GolmokGame.js`, 엔진 파일 등)을 `git checkout/discard/restore`로 되돌리지 말 것 — 커밋 안 된 작업이 사라진다. ② 의미 있는 단위마다 **사용자에게 커밋 요청**할 것. ③ `GolmokGame.js`를 통째로 덮어쓰지 말고 항상 **부분 편집**할 것.

2. **커밋·푸시·배포는 사용자가 “하라”고 할 때만.** 임의로 하지 말 것.

3. **`dev_server.py` 손대지 말 것** — 다른 에이전트 담당. (읽기만 가능. 실행은 `python dev_server.py 9193`, no-store 헤더로 서빙.)

4. **엔진 소스 비노출** — Vercel 배포본에는 엔진 원본이 들어가면 안 됨. 배포는 `npm run build`(→ `dist/app.min.js` 번들). `dist/`는 gitignore.

5. **NO-TOUCH:** `.claude/`(워크트리 4개), `.claire/`, `backup/`(원본 보관, 읽기만), `node_modules/`.

6. **사용자가 직접 테스트한다.** preview/screenshot/시뮬 검증에 턴 쓰지 말 것. 코드/에셋 변경 후 **`node --check`(JS) / JSON.parse(JSON) 구문검사만** 하고 사용자에게 넘긴다. (프리뷰 탭이 rAF suspend로 자주 멈춰 검증이 비효율적.)

7. **채팅 세션을 옮길 땐 먼저 말할 것.**

8. **줄바꿈:** 작업 파일은 LF. git `autocrlf` 경고는 정상(저장은 LF, 체크아웃 CRLF). 트랜스크립트/외부 텍스트로 패치할 때 CRLF↔LF 불일치에 주의.

9. **`games/golmok/samples/`(레퍼런스 GIF, 57MB)는 gitignore됨** — 로컬 전용. 산출물(JSON)만 커밋.

---

## 1. 프로젝트 한눈에

- **1974** = 커스텀 2D 픽셀아트 “모래 엔진” 게임. 메인 게임 = **골목길(`games/golmok`)**.
- 레이어: **L0 원경**(far, parallax 0.30) · **L1 근경**(near silhouette) · **L2 캐릭터** · **L3 UI**.
- 엔진(`engine/`)은 로직, 게임(`games/golmok`)은 데이터/수치. **“시그니처 = 엔진 기능, 게임은 값만 설정”** 이 대원칙(아래 §5).
- 로컬 실행: `python dev_server.py 9193` → http://localhost:9193/games/golmok/index.html

### 관련 디렉터리
```
games/golmok/
  index.html, main.js              # 진입 (main.js가 GolmokGame import; ?v= 캐시버스트 사용중)
  scripts/GolmokGame.js            # ★ 메인 씬 컨트롤러 (이동·공격·시그니처 FX) — 가장 많이 만지는 파일
  scripts/TitleScene.js, ResultScene.js
  animator/ch01.anim.json          # 애니메이터 플로우(파라미터+전환)
  pixels/characters/
    ch01_player.json               # 플레이어 스프라이트 (idle + walk)
    ch01_gun.json                  # 총 스프라이트 (atk_start/active/recover)
    ch01_player_black.json         # (현재 미사용)
  data/
    characters.csv                 # 캐릭터 스탯(move_speed 등)
    animations.csv                 # 상태별 fps/loop (스프라이트 stateDef를 override)
    maps.csv, fx_params.csv        # 배경 순환 / FX 라이브 수치
  samples/                         # 레퍼런스 GIF (gitignore, 로컬 전용)
tools/
  gif_to_sprite.py                 # ★ 다중 GIF → 단일 다상태 스프라이트 변환기 (범용)
  build_female_char.py             # ★ 여성 캐릭터 빌드 (해상도 다른 클립 혼합 대응)
  png_to_pixels.py, convert_*.py, split_bg_layers.py
docs/
  ENGINE_CAPABILITIES.md           # 엔진 기능 카탈로그
  GOLMOK_SIGNATURE_FX.md           # ★ 시그니처 FX 수치 기록 (낮밤·림·reveal 등)
  PROJECT_STRUCTURE.md
  (이 문서)
backup/male_char_20260606/         # 남자 캐릭터 백업 (여성 교체 전 원본)
```

---

## 2. 애니메이션 시스템 아키텍처 (유니티 Animator 사상)

3계층으로 분리돼 있다. **이 구조를 지킬 것.**

### (a) `engine/entity/AnimationStateMachine.js` — 클립 재생기 (asm)
- `states = { name: { frames:[절대인덱스...], loop, fps } }`
- `setState(name)`(같은 상태면 무시), `tick(now)`(프레임 진행), `getCurrentFrame()`, `isDone()`(non-loop 완료), `restart()`(0프레임부터).
- 내부: `_stateFrameIdx`, `_lastTick`, `_done`.
- 엔티티가 매 프레임 `asm.tick()` 호출 → 현재 프레임 인덱스 결정.

### (b) `engine/anim/AnimatorController.js` — 플로우(상태 그래프)
- `load(def)` / `setParam` / `setBool` / `trigger` / `update()`.
- `def = { default, parameters:[{name,type:'float'|'bool'|'trigger',default}], transitions:[ {from,to,conditions:[{p,op,v}],hasExitTime} ] }`
- `op`: `> >= < <= == != trigger`. `from:'*'` = Any State. `hasExitTime:true` = 클립 끝나야 전환.
- 게임 로직은 **파라미터만** 세팅, 어떤 클립이 재생될지는 컨트롤러가 결정.

### (c) 스프라이트 `stateDef` (JSON 안) — 상태 정의 데이터
- `{ "sprite":"...", "states": { "idle": {"frames":[...],"loop":true,"fps":5}, ... } }`
- 엔티티 생성 시 `stateDef` 넘기면 `entity.asm.load(stateDef)`.

### (d) `animations.csv` — fps/loop **override**
- `char_id,state,frames,fps,loop,notes`
- 로드 시 `this._player.asm.states[state].fps/loop`를 CSV값으로 **덮어씀**(존재하는 상태만).
- ⚠️ **프레임 데이터는 스프라이트 stateDef가 진실.** CSV의 `frames` 칸은 참고용(개수 메모)일 뿐. fps/loop만 실제 반영.

### 현재 캐릭터 구성
- **플레이어**(`ch01_player`, 149×259): `idle`(루프) + `walk`(루프).
- **총**(`ch01_gun`, 동적 크기): `atk_start`(준비, non-loop) → `atk_active`(발사, 루프) → `atk_recover`(회수/내리기, non-loop).
- 총 플로우(`GolmokGame._loadGun`): `atk_start→atk_active`(hasExitTime), `atk_active→atk_recover`(firing==false). **공격대기(standby)는 제거됨** — 회수 끝나면 게임 코드가 바로 idle로 전환(아래 §6).

---

## 3. ★ GIF → 스프라이트 변환 파이프라인 (핵심 노하우)

캐릭터 모션은 **그린스크린 GIF 여러 개 → 단일 다상태 스프라이트 JSON**으로 만든다.

### 두 변환기
- **`tools/gif_to_sprite.py`** — 범용. **동일 해상도** 클립들을 union-bbox로 정합. (남자 캐릭터가 이걸로 만들어짐.)
- **`tools/build_female_char.py`** — 여성 캐릭터용. **해상도가 다른 클립 혼합**(여성 720p + 남자 walk 270p)에 대응. 총은 union-bbox, 플레이어는 클립별 정규화+발밑 정렬.

### 파이프라인 단계 (gif_to_sprite.py 기준)
1. 각 GIF 프레임 RGBA 로드.
2. **그린스크린 제거(dekey)** + 디스필: `g - max(r,b) ≥ GREEN_DOM(38)` & `g ≥ GREEN_MIN(70)` → 투명. 가장자리 초록끼는 despill.
3. **마커 앵커 추출**(`extract_anchors`): 소스에 찍힌 고유색 점을 부착점으로 기록 후 제거.
   - 마젠타(255,0,255)=**muzzle(총구)** · 시안(0,255,255)=**hand** · 노랑(255,255,0)=**eject(탄피구)**. (2~3px 점, 다운스케일 생존)
   - 프레임별 `frame.anchors[name]=[x,y]`로 저장 → 렌더에서 정밀 위치(`GolmokGame._frameAnchor`)로 사용.
4. **공통 bbox 크롭** → 상태 간 캐릭터 위치 정합(안 튐). *동일 해상도 전제.*
5. **균일 스케일** — ⚠️ **함정 주의**(아래).
6. 클립별 후처리(`fx`): `'clean'`=작은 분리 blob(탄피) 제거 · `'white2black'`=흰색→검정.
7. **통합 메디안컷 양자화**(`quantize_all`) — 전 프레임 1팔레트(프레임마다 색 안 흔들림). `palette[0]='transparent'`.
8. `stateDef`(상태=프레임범위/fps/loop) 구성 → JSON 출력.

### ⚠️ 변환 함정 (과거에 실제로 터진 것들 — 반드시 숙지)
- **(A) 스케일 기준 = “서있는 캐릭터(첫 프레임) 머리~발 높이”로 잡을 것. union-bbox 높이로 잡지 말 것.**
  - 과거 버그: union-bbox에는 머즐플래시·탄피 등 캐릭터보다 위로 튄 효과가 섞여 bbox가 커짐 → 그 기준으로 스케일하면 **캐릭터가 작아져 플레이어와 키가 안 맞음**(236 vs 259 사건).
  - 해결: `ref = clips[0][0].getbbox()`(준비/idle 첫 프레임, 서있는 키) → `scale = TARGET_H / ref_h`. (`gif_to_sprite.py`/`build_female_char.py` 둘 다 이렇게 돼 있음. 유지할 것.)
- **(B) 발사/회수 포즈가 짧은 건 “숙인 포즈”라 정상.** bbox 높이가 작아도 스케일은 동일(같은 ref). 작아 보인다고 다시 스케일하면 오히려 커진다.
- **(C) 짧은 발사 루프(예: 3프레임) 머즐 검출.** `_loadGun`이 `atk_active.frames[3]`(4번째 프레임)을 머즐플래시 샘플에 쓰는데, 프레임이 3개뿐이면 `[3]`이 undefined. → **`frames[Math.min(3, len-1)]`로 클램프**돼 있고 `_muzzleLocal` 기본값도 둠. 새 발사 클립이 짧으면 이 처리에 의존.
- **(D) 스프라이트 크기 = 엔티티 크기.** 총은 `pw:g.width, ph:g.height`(동적, 발 앵커로 정합)라 자유. **플레이어는 149×259 고정 권장** — 다운스트림(발 위치/바운드/groundY)이 이 크기를 전제. 다른 크기로 만들면 정합 깨짐.
- **(E) 발광 인덱스.** 엔진은 팔레트 **idx10**만 emissive로 본다. 캐릭터엔 발광이 없으므로 게임이 `engine.glow.removeEmissiveIndex(10)` 호출(밤에 노란 halo 방지). 새 팔레트도 이 호출로 보호됨 — 손대지 말 것.

### build_female_char.py 특이점 (해상도 혼합)
- **총**: 3클립(준비/발사/넣기, 전부 1280×720) → union-bbox + atk_start 기준 균일 스케일(CHAR_H=255). 탄피 제거는 `atk_recover`(넣기)에만.
- **플레이어**: 여성 idle(720p) + **남자 WALK.gif(270p, 임시)** → 해상도가 달라 union-bbox 불가 → **클립별 정규화(각자 서있는 키→CHAR_H) 후 149×259 캔버스에 발밑 정렬**.

---

## 4. 현재 상황 (2026-06-06 시점) — 여성 캐릭터 교체 진행 중

- 사용자가 **남자 → 여성(1990) 캐릭터**로 교체 결정. 남자 원본은 `backup/male_char_20260606/` + 커밋 `1b9a772`에 보존.
- **여성 스프라이트 빌드 완료**(`tools/build_female_char.py`):
  - `ch01_player.json` 149×259 — idle 34f(`1990여성_ 서있기 아이들.gif`) + walk 16f(**남자 WALK.gif 임시**).
  - `ch01_gun.json` 148×255 — atk_start 9f(`총사격 준비 아이들`) / atk_active 3f 루프(`총사격 발사 루프`) / atk_recover 4f(`총사격 넣기 단일`).
- 네이티브 측정: 여성 idle 665px · 총-준비 664px = **동일 스케일**(준비 동작은 크기 정상). 발사 611·넣기 626은 숙인 포즈라 짧음(정상).
- **모래 코팅 연출 = “원래 띠 흐름” 상태**(아래 §5의 `_renderSandCoat` band-flow). fill→clear 실험은 사용자 요청으로 되돌림.

### 🔧 남은 결정/이슈 (사용자와 확인 필요)
- **walk 크기 불일치(미해결):** 남자 walk가 여성 idle 대비 폭 2배+(128 vs 58)·체형 다름 → **걸을 때 캐릭터가 확 달라 보임.** 사용자가 “사이즈 틀려도 됨”이라 임시 허용했으나 거슬려 함.
  - 후보 A) **여성 idle을 walk에도 사용**(이동 시 크기 안 튐, 단 걷는 모션 없음) — 권장.
  - 후보 B) 남자 walk를 여성 키·폭에 맞춰 축소(모션 유지, 체형은 남자).
  - 후보 C) 그대로. → **여성 walk 아트가 나오면 교체.**
- 그 외 여성 발사 방향/머즐 위치는 실기 확인 후 미세조정 여지.

---

## 5. ★ 시그니처 = 엔진 정체성 (가장 중요 — 강조)

> **이 게임의 정체성은 “픽셀이 모래로 부서졌다 다시 형성되는” 연출.** 단순 크로스페이드가 아니라 **모래 블렌드/코팅**이 우리만의 시그니처다. 캐릭터 애니의 전환·등장·공격 연출은 전부 이 결을 따라야 한다.
>
> 대원칙(기존 `GOLMOK_SIGNATURE_FX.md`): **“시그니처 = 엔진 기능. 로직은 `engine/`, 게임은 수치/색만.”** 단, 캐릭터 모래 코팅은 현재 `GolmokGame.js`에 게임측으로 들어가 있음(추후 엔진화 여지).

### 핵심 시그니처 연출 (구현 위치 = `GolmokGame.js`)
- **`_renderSandCoat` (모래 코팅 전환) ★캐릭터 애니 시그니처**
  - 동작 전환 시 “모래 띠가 몸을 한 방향으로 쓸고 지나가며” 모래가 생성→안착→사라짐.
  - 방향 통일: **라이즈(공격 시작)=뒤→앞**, **회수/복귀(→idle)=앞→뒤**.
  - 모래는 **현재 동작 실루엣 위에** 얹힌다(엔티티는 솔리드 100% 렌더 → 깜박임 방지, 모래는 오버레이). `src`=출발 포즈 픽셀에서 날아와 안착(`fly`), 띠 양끝 `sin` 페이드, `surge`로 진행방향 출렁.
  - `_startCoat(mode,bodyEntity,src,ms,onDone)`로 시작. `mode='raise'|'lower'`.
  - 공격 흐름: `_startAttack`(준비 중간프레임부터 + raise 코팅) → 발사(`_spawnShot` 머즐버스트/트레이서/반동/글로우) → 회수 끝 → **idle로 전환 + idle 위 lower 코팅**.
- **`_renderCharReveal`** — 낮↔밤 캐릭터 색 reveal(밤엔 배경톤으로 부드럽게 어두워짐). 수치는 `GOLMOK_SIGNATURE_FX.md`.
- **`_renderGunLight`** — 공격 중 총에 **플레이어 reveal과 동일 공식**으로 낮밤 톤 적용(검정 아님, 배경톤). `_lastAvgLum` 재사용.
- **`_renderCharRim` / `_renderNearRim`** — 캐릭터/근경 외곽 역광 림(픽셀별 배경색 env).
- **`_renderIntro`** — 진입 시 모래가 사람 실루엣을 형성 후 실제 캐릭터로 드러남.
- 낮↔밤 사이클 `k = 0.5 - 0.5*cos(dayT·2π/60)`(60초). 배경 4장 순환 + `_bgTone` 자동 매칭.

### 연출 작업 시 지킬 것
- 새 전환/등장/특수 모션은 **크로스페이드 금지 → 모래 코팅/디졸브 결**로.
- 깜박임 방지: 캐릭터 본체는 엔티티가 솔리드로 그리고, 효과는 그 **위 오버레이**로.
- 방향성 통일(생성·소멸 방향) 유지.
- 값 바꾸면 `docs/GOLMOK_SIGNATURE_FX.md` 갱신.

---

## 6. 이동/공격 상태 & 입력 (GolmokGame.js)

- **이동 잠금:** 공격/블렌드(비이동 모션) 중엔 이동키 무시 — `if (this._attacking || this._blend) { dx=0; }`. 이동은 idle/walk에서만. (특수 모션이 이동을 다시 허용하려면 그때 분기.)
- **공격:** `F`키 → `_startAttack`. 흐름 = 준비→발사(누르는 동안 루프)→회수→**바로 idle**(공격대기 없음). 회수 끝 처리: `asm.current==='atk_recover' && asm.isDone()` → 총 숨김/플레이어 보임/`idle` 0프레임 restart + lower 코팅.
- **총 정합:** `_positionGun`(발 앵커 `_gunAnchor`로 플레이어 발치에 맞춤, flipX 미러). 머즐 위치 `_muzzlePos`(있으면 `frame.anchors.muzzle`, 없으면 `_muzzleLocal` 휴리스틱).

---

## 7. 워크플로우 체크리스트

- [ ] 변경 후 `node --check games/golmok/scripts/GolmokGame.js` (JS) / `JSON.parse`(스프라이트 JSON) 구문검사.
- [ ] 스프라이트 재생성 시: 상태 이름 유지(idle/walk/atk_start/atk_active/atk_recover). 플레이어는 149×259 유지. `animations.csv` fps/loop 확인.
- [ ] 짧은 발사 루프면 `_loadGun` 머즐 클램프 동작 확인.
- [ ] tracked 파일을 git으로 되돌리지 않기. 통째 덮어쓰기 금지(부분 편집).
- [ ] 의미 단위마다 **사용자에게 커밋 요청**(직접 커밋·푸시 금지).
- [ ] 사용자가 실기 테스트 → 피드백 반영. preview 검증에 턴 낭비 금지.
- [ ] 값/연출 바꾸면 `GOLMOK_SIGNATURE_FX.md` 갱신.

---

## 8. 자주 쓰는 명령

```bash
# 로컬 서버 (no-cache, 새 코드 바로 반영)
python dev_server.py 9193           # → http://localhost:9193/games/golmok/index.html

# 여성 캐릭터 재빌드 (samples의 GIF → 스프라이트)
python tools/build_female_char.py

# 범용 변환기 (동일 해상도 클립셋)
python tools/gif_to_sprite.py

# 스프라이트 상태/프레임 확인
node -e "const j=require('./games/golmok/pixels/characters/ch01_gun.json'); for(const k in j.stateDef.states){const v=j.stateDef.states[k]; console.log(k, v.frames.length+'f', v.fps+'fps', 'loop='+v.loop)}"
```

> 막히면 이 문서 §0(규칙)·§3(변환 함정)·§5(시그니처)를 다시 볼 것. 그리고 **모르면 사용자에게 묻고**, tracked 파일은 절대 git으로 되돌리지 말 것.
