import { Scene } from '../../../engine/scene/SceneManager.js';
import { SAND_BASE_RGB, SAND_TONES_RGB } from '../../../engine/SandPalette.js';
import AnimatorController from '../../../engine/anim/AnimatorController.js';

// ⚠ 아래 let 값들은 코드 기본값(fallback)일 뿐 — 실제 값은 data/*.csv 테이블에서 로드해
//   _loadConfig()가 덮어쓴다. (엔진=로직, 게임 데이터=CSV 원칙)
let   MOVE_SPEED  = 207;   // ← characters.csv move_speed
const WORLD_WIDTH = 2560;
const GROUND_Y    = 412;   // 발끝 = 412+405 = 817 (캐릭터 1.5배 높이 405, 바닥선 817 유지)

// ── 배경 순환 ───────────────────────────────────────────────────────
let   BG_LIST     = ['2020a', '2020b']; // ← maps.csv cycle_order (2020 야경 2장 순환)
const BG_PID      = '1974';
const BG_INTERVAL = 10000;  // 10초마다 다음 배경
let   BG_TRANS_MS = 2000;   // ← fx_params.csv bg.trans_ms
const CYCLE_ENABLED = false; // 화면 끝 도달 시 배경 순환/전환 — 요청으로 OFF(끝에서 그냥 멈춤, 존 이동 없음)
const FAR_XFADE = false;     // 원경 크로스페이드(근경1에 원경2) — 성능 위해 OFF (원경=정적). 켜면 매 프레임 L0 재래스터.
const DIGITAL_ENABLED = false; // 디지털 회로/메시 오버레이 ON/OFF (저장만, 지금은 OFF)
const SHOW_FPS = true;         // 우상단 FPS 표시 (디버그 — 배경 전환 프레임 드랍 확인용)
let   ANIM_TEST_SLOW = 1;      // 총 애니 속도 배수 (1=정상. 테스트 시 3 등으로 느리게)
const FOG_ENABLED = false;     // 안개(절차적 + 드리프트 구름) ON/OFF (지금은 OFF)

// 전환 효과를 차례대로 순환 — 새로 만든 모래 생성형 3종 테스트
const FX_LIST     = ['sand_top', 'sand_sides', 'wave'];

// ── SandScroll (모래 생성/소멸 스크롤) 프로토타입 파라미터 ───────────
const SAND_ENABLED   = true;
const CHAR_DISSOLVE_ENABLED = false; // 캐릭터 외곽 모래 중력낙하 디졸브 (요청: 가림)
// ↓ let = CSV(fx_params.csv) 로드값으로 _loadConfig가 덮어씀. 숫자는 fallback 기본값.
let   INTRO_MS       = 2200;  // ← intro.ms
let   SAND_BAND_MAX  = 0.022; // ← sand.band_max
let   SAND_GRAIN     = 4;     // ← sand.grain
let   SAND_SETTLE_MS = 280;   // ← sand.settle_ms
let   SAND_BUILDUP_MS = 2000; // ← sand.buildup_ms

// 앰비언트 — 가만히 있어도 픽셀이 톡톡 떨어지는 모래알
let   SAND_FALL_RATE = 70;    // ← sand.fall_rate
const SAND_FALL_G    = 4;     // 디지털 블록 크기 px (그리드 정렬)
let   SAND_GRAVITY   = 130;   // ← sand.gravity
let   BG_MOTE_RATE   = 32;    // ← bg.mote_rate

// 에디터 FX 라이브 슬라이더 연동용 — 현재 활성 메인 씬 인스턴스(부모 postMessage가 여기로 적용)
let   _activeGolmok  = null;

// 월드 고정 셀 의사난수 0~1 (콘텐츠가 흐르는 동안 입자가 정체성 유지 → 팝인/팝아웃)
function sandHash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}

export default class GolmokGame extends Scene {
    constructor() {
        super('golmok_main');
        this._player  = null;
        this._targetX = null;    // 클릭 이동 목표 X (월드 좌표, player.x 기준)
        this._clickBound = false;

        this._bgIdx   = 0;
        this._fxIdx   = 0;
        this._bgCache = {};
        this._bgReady = false;
        this._timer   = 0;
        this._tr      = null;    // { t, effect, swapped, _pxOut, _pxIn }

        // SandScroll 상태
        this._lastCamX = null;
        this._sandDir  = 1;      // +1: 오른쪽 이동, -1: 왼쪽
        this._sandI    = 0;      // 효과 강도 0~1 (이동 시 1, 멈추면 감쇠)
        this._sandSpeed = 0;     // 평활된 스크롤 속도 px/sec
        this._sandRamp  = 0;     // 좌우 효과 빌드업 0~1 (걷기 2초 / 달리기 즉시)
        this._ambient  = [];     // 앰비언트 모래알 파티클
        this._ambAcc   = 0;      // 스폰 누적기
        this._bgMotes  = [];     // 배경에서 위로 피어오르는 모래알
        this._bgMoteAcc = 0;

        // IDLE(대기) 상태 — 픽셀 낙하 + 발밑 그림자
        this._idleT         = 0;   // 대기 누적 시간 (그림자 진하기)
        this._idleParticles = [];
        this._idleAcc       = 0;

        this._dayT = 0;            // 낮↔밤 60초 사이클 시간
        this._fxK  = 1;            // 현재 FX 세기 (0~1)
        this._fog  = [];           // 드리프트 구름-포그 레이어들
        this._groundY = 412;       // 씬 기반 동적 y좌표 바닥값
        this._worldW  = WORLD_WIDTH; // 씬 기반 동적 월드 폭 (onEnter에서 씬 bounds로 채택)
        this._bgTone  = null;      // 배경(L1) 대표색 {r,g,b} — FX 톤(림 floor·key광)을 배경마다 자동 매칭
        this._intro   = null;      // 게임 진입 인트로 연출 상태 { t: 0~1 }

        // FX 인라인 수치 — _loadConfig(engine)가 fx_params.csv 값으로 덮어씀. 아래는 fallback 기본값.
        this._p = {
            dayPeriod: 60, charMin: 0.20, rimThresh: 0.85, rimPeak: 0.7, rimFloorMul: 0.9,
            rimWidth: 3, rimDirBase: 0.3, revBase: 0.20, revLumScale: 0.15, revBlend: 0.15,
            ambMax: 0.5, keyMax: 0.95, vigMax: 0.55, glowMax: 0.5, fogMax: 0.5,
            bloomThreshold: 205, nearRimBase: 0.6, nearRimNight: 2.0,
        };

        // 디지털 오버레이 — 회로/메시 조각이 불규칙하게 일어났다 사라짐
        this._digital = [];
        this._digAcc  = 0;
    }

    onEnter(engine) {
        // 월드 폭 = 씬이 설정한 bounds 사용 (가로/세로 씬마다 다름). 덮어쓰지 않음.
        this._worldW = engine.bounds.worldWidth || WORLD_WIDTH;

        // 엔진 FX 전부 ON (테스트)
        engine.lighting.setAmbient(0.0);                             // 시작=낮(어둠 없음). onUpdate가 k로 조절
        engine.lighting.clearLights();                               // key 라이트 없음 — 밤은 ambient(어둠)+glow(불빛)의 콘트라스트로 표현
        engine.glow.enable();                                        // 배경 밝은 픽셀(도시 불빛) 블룸용
        // ⚠ 캐릭터(L2) 발광 OFF: ch01_player 팔레트 idx10(#3c3d40 옷색)이 엔진 예약 발광 인덱스와
        //   충돌해 밤에 노란 halo가 생김. 캐릭터엔 발광 픽셀이 없으니 idx10 발광을 제거한다.
        engine.glow.removeEmissiveIndex(10);
        // 캐릭터 rim은 게임측 _renderCharRim 단일 사용 (방향 명확 + 픽셀별 배경색 env + floor).
        // 엔진 rim은 lightDir 반대쪽 엣지에도 그려 게임 rim과 합쳐지면 방향이 뭉개지므로 OFF.
        engine.rim.disable();
        const _landscape = engine.gameWidth > engine.gameHeight;     // 가로 모드 여부(960×540 등)
        if (FOG_ENABLED) {
            engine.fog.enable();
            engine.fog.enableLayerFog(_landscape
                ? { startY: engine.gameHeight - 130, endY: engine.gameHeight, color: '#9fb3cc', maxOpacity: 0.5, direction: 'bottom' }  // 가로: 바닥 밴드만
                : { startY: 430, endY: 960, color: '#9fb3cc', maxOpacity: 0.5, direction: 'bottom' });
        } else {
            engine.fog.disable();
        }
        engine.vignette.setPreset('warm');                           // 가장자리 비네트

        this._player = engine.entities.get('player');
        if (this._player) {
            this._groundY = this._player.y;                          // 씬 설정에 지정된 초기 y좌표(세로 690, 가로 412 등)를 바닥으로 채택
        }
        // 배경 시프트 y(가로=-420, 세로=0) — 배경 교체(_swapBg) 시 유지하기 위해 씬에서 채택.
        const _bgM = engine.entities.get('bg_main');
        this._bgY = _bgM ? (_bgM.y | 0) : 0;
        this._loadConfig(engine);    // 게임 데이터 테이블(CSV)에서 값 로드 (상수 덮어쓰기)
        this._anim = null;           // 애니메이터 컨트롤러 (플로우) — 비동기 로드, 준비 전엔 수동 setState 폴백
        this._loadAnimator();
        this._gun = null; this._attacking = false;   // 총(공격) 스프라이트 — 비동기 로드, 공격 시 별도 엔티티로 스왑
        this._blend = null;                           // 모래 블렌드(동작 전환) 상태 { t, ms, src, dst, onDone }
        this._muzzleP = []; this._tracers = []; this._casings = [];   // 발사 임팩트 FX
        this._recoilT = 0; this._recoilDir = 0; this._muzzleFlash = 0; this._fireAcc = 110;
        this._loadGun();
        this._preload();
        if (FOG_ENABLED) this._loadFog();

        this._intro = { t: 0 };   // 게임 진입 연출 시작 (배경 모래-생성 + 캐릭터 픽셀 모이기)

        // ── 탭-이동(존이동) 제거: 이동은 온스크린 컨트롤(◀▶)·키보드로만 ──
        // (이전 "화면 클릭 → 그 지점으로 걸어가기"는 비활성화)

        // 키보드 F = 총 발사 (홀드: 준비→발동 루프→떼면 되돌리기)
        if (!this._keyBound) {
            this._keyBound = true;
            window.addEventListener('keydown', (ev) => { if ((ev.key === 'f' || ev.key === 'F') && !ev.repeat) this._startAttack(); });
            window.addEventListener('keyup',   (ev) => { if (ev.key === 'f' || ev.key === 'F') this._endFire(); });
        }

        // ── 에디터 FX 라이브 슬라이더 연동 ──────────────────────────
        // 부모(에디터)가 postMessage({type:'golmok:setFx', key, value})를 보내면 라이브 적용.
        _activeGolmok = this;
        if (!GolmokGame._fxMsgBound) {
            GolmokGame._fxMsgBound = true;
            window.addEventListener('message', (ev) => {
                const m = ev.data;
                if (m && m.type === 'golmok:setFx' && _activeGolmok) _activeGolmok.applyFxParam(m.key, m.value);
            });
        }
    }

    // ── 게임 데이터 테이블(CSV)에서 값 로드 ──────────────────────────
    // engine.data = { maps, characters, animations, fx } (main.js가 CSV에서 채움).
    // 모듈 상수(let)는 fallback이고, 여기서 테이블 값으로 덮어쓴다. 인라인 수치는 this._p에.
    _loadConfig(engine) {
        const D  = engine.data;
        const fx = D?.fx;
        const N  = (k, def) => (fx ? fx.num(k, def) : def);   // 숫자 읽기(없으면 fallback)

        // 1) 모듈 let 상수 덮어쓰기 (사용처 수정 없이 데이터 주도)
        BG_TRANS_MS   = N('bg.trans_ms',     BG_TRANS_MS);
        BG_MOTE_RATE  = N('bg.mote_rate',    BG_MOTE_RATE);
        INTRO_MS      = N('intro.ms',        INTRO_MS);
        SAND_BAND_MAX = N('sand.band_max',   SAND_BAND_MAX);
        SAND_GRAIN    = N('sand.grain',      SAND_GRAIN);
        SAND_SETTLE_MS= N('sand.settle_ms',  SAND_SETTLE_MS);
        SAND_BUILDUP_MS=N('sand.buildup_ms', SAND_BUILDUP_MS);
        SAND_FALL_RATE= N('sand.fall_rate',  SAND_FALL_RATE);
        SAND_GRAVITY  = N('sand.gravity',    SAND_GRAVITY);

        // 2) 배경 순환 = maps.csv cycle_order >= 0 정렬
        if (D?.maps) {
            const cyc = D.maps.all()
                .filter(r => Number(r.cycle_order) >= 0)
                .sort((a, b) => Number(a.cycle_order) - Number(b.cycle_order))
                .map(r => r.id);
            if (cyc.length) BG_LIST = cyc;
        }

        // 3) 캐릭터 스탯 = characters.csv (이동 속도)
        const charId = this._player?.type || 'ch01_player';
        const chRow  = D?.characters?.byId('id', charId);
        if (chRow && Number.isFinite(Number(chRow.move_speed))) {
            MOVE_SPEED = Number(chRow.move_speed);
        }

        // 4) 애니 타이밍 = animations.csv → 상태머신 fps/loop override
        if (D?.animations && this._player?.asm?.states) {
            for (const a of D.animations.filter('char_id', charId)) {
                const st = this._player.asm.states[a.state];
                if (!st) continue;
                if (Number.isFinite(Number(a.fps))) st.fps = Number(a.fps);
                if (a.loop !== '' && a.loop != null) st.loop = /^(1|true|on|yes)$/i.test(a.loop);
            }
        }

        // 5) 인라인 수치 → this._p (사용처에서 this._p.* 로 읽음)
        this._p = {
            dayPeriod:  N('daynight.period_s',        60),
            charMin:    N('daynight.char_bright_min', 0.20),
            rimThresh:  N('rim.fade_threshold',       0.85),
            rimPeak:    N('rim.peak',                 0.7),
            rimFloorMul:N('rim.floor_mult',           0.9),
            rimWidth:   N('rim.width_base',           3),
            rimDirBase: N('rim.dir_base',             0.3),
            revBase:    N('reveal.night_base',        0.20),
            revLumScale:N('reveal.night_lum_scale',   0.15),
            revBlend:   N('reveal.blend',             0.15),
            ambMax:     N('light.ambient_max',        0.5),
            keyMax:     N('light.key_intensity_max',  0.95),
            vigMax:     N('light.vignette_max',       0.55),
            glowMax:    N('light.glow_max',           0.5),
            fogMax:     N('light.fog_max',            0.5),
            bloomThreshold: N('light.bloom_threshold', 205),
            nearRimBase:  N('nearrim.base',           0.6),
            nearRimNight: N('nearrim.night',          2.0),
        };
        // 블룸 임계 적용 (밝은 불빛만 번지게 → 밝은 원경서 과블룸 방지). 캐시 재빌드 필요.
        engine.glow._bloomThreshold = this._p.bloomThreshold;
        for (const L of engine.layers.layers) L._bloomReady = false;

        // 6) 맵별 근경 역광 림 배율 = maps.csv near_rim (밝은 맵은 낮게)
        this._mapRim = {};
        if (D?.maps) for (const r of D.maps.all()) this._mapRim[r.id] = (r.near_rim === '' || r.near_rim == null) ? 1 : Number(r.near_rim);
        this._curRimMul = this._mapRim[BG_LIST[this._bgIdx]] ?? 1;
    }

    // ── 애니메이터 컨트롤러(플로우) 로드 ─────────────────────────────
    // animator/ch01.anim.json(파라미터+전환)을 읽어 캐릭터 asm(상태머신) 위에 얹는다.
    // 비동기 — 로드 전엔 onUpdate가 수동 setState로 폴백하므로 끊김 없음.
    async _loadAnimator() {
        const p = this._player;
        if (!p || !p.asm) return;
        try {
            const def = await fetch('./animator/ch01.anim.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
            if (def) { const c = new AnimatorController(p.asm); c.load(def); this._anim = c; }
        } catch (e) { console.warn('[golmok] animator load fail:', e); }
    }

    // ── 총(공격) 스프라이트 로드 + 발 정합 ────────────────────────────
    // 별도 'gun' 엔티티(layer2, 평소 숨김)로 추가. 공격 시 플레이어를 숨기고 발 위치를 맞춰 스왑.
    // (플레이어 sprite/카메라 안 건드림 → idle/walk 안전)
    async _loadGun() {
        const p = this._player; const e = this.engine;
        if (!p || !e) return;
        try {
            const _male = new URLSearchParams(location.search).get('char') === 'male';   // 남/녀 스왑
            const g = await fetch(`./pixels/characters/ch01_gun${_male ? '_male' : ''}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
            if (!g) return;
            this._gun = e.entities.add('gun', {
                x: 0, y: 0, pw: g.width, ph: g.height, layer: 2, visible: false,
                frames: g.frames, _palette: g.palette, stateDef: g.stateDef,
            });
            if (ANIM_TEST_SLOW > 1 && this._gun.asm) {   // 테스트용 슬로우 (코팅 효과 확인)
                for (const k in this._gun.asm.states) this._gun.asm.states[k].fps /= ANIM_TEST_SLOW;
            }
            this._gunAnim = new AnimatorController(this._gun.asm);
            this._gunAnim.load({
                default: 'atk_start',
                parameters: [ { name: 'firing', type: 'bool', default: false } ],
                transitions: [
                    { from: 'atk_start',   to: 'atk_active',  hasExitTime: true },                       // 준비 끝 → 발동
                    { from: 'atk_active',  to: 'atk_recover', conditions: [ { p: 'firing', op: '==', v: false } ] }, // 떼면 → 회수 (회수 끝나면 바로 idle, 공격대기 없음)
                ],
            });
            // 발 정합 앵커(원시값): 플레이어 idle 0프레임 ↔ 총 atk_start 0프레임. flipX(미러) 고려해 매 프레임 계산.
            const pa = this._feetAnchor(p._frames?.[0]?.pixels);
            const ga = this._feetAnchor(g.frames?.[0]?.pixels);
            this._gunAnchor = (pa && ga)
                ? { pcx: pa.cx, ppw: p.pw, pby: pa.by, gcx: ga.cx, gpw: this._gun.pw, gby: ga.by }
                : null;
            // 총구 이펙트 위치 = 발동 프레임 "머즐플래시(밝은 픽셀) 무게중심" — 이펙트가 총구 안에 오게(스프라이트 플래시와 정합)
            this._muzzleLocal = { x: (g.width * 0.5) | 0, y: (g.height * 0.42) | 0 };   // 기본값(검출 실패 대비)
            const afr = g.stateDef?.states?.atk_active?.frames;
            const afi = afr ? afr[Math.min(3, afr.length - 1)] : null;   // 발사 루프가 짧아도(3프레임) 안전
            const af = (afi != null) ? g.frames[afi]?.pixels : null;
            if (af && af.length) {
                const pal = g.palette;
                const yLimit = g.ph * 0.5;   // 상단(팔/총구)만 — 하단 흰 스니커즈 섞임 방지
                const pts = [];
                for (const q of af) {
                    if (q[1] >= yLimit) continue;
                    const h = pal[q[2]];
                    if (!h || h === 'transparent') continue;
                    const r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
                    if (r * 0.3 + gg * 0.5 + b * 0.2 > 185) pts.push(q);   // 상단 밝은 머즐플래시
                }
                // 총구 = 플래시의 "총 쪽(발사 반대편) 40%" 무게중심 ≈ 발사구(barrel tip). FX가 총에서 나가게.
                if (pts.length > 8) {
                    let mnx = 1e9, mxx = -1e9;
                    for (const q of pts) { if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0]; }
                    const cut = mxx - (mxx - mnx) * 0.4;   // 비플립(왼쪽 발사) 기준 총은 오른쪽(큰 x)
                    let sx = 0, sy = 0, n = 0;
                    for (const q of pts) { if (q[0] >= cut) { sx += q[0]; sy += q[1]; n++; } }
                    this._muzzleLocal = n > 4 ? { x: (sx / n) | 0, y: (sy / n) | 0 } : { x: 60, y: 50 };
                } else this._muzzleLocal = { x: 60, y: 50 };
            }
        } catch (err) { console.warn('[golmok] gun load fail:', err); }
    }

    // 스프라이트 프레임 픽셀의 bbox + 발(하단 8%) 중심 x / 바닥 y
    _feetAnchor(pixels) {
        if (!pixels || !pixels.length) return null;
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const px of pixels) { const x = px[0], y = px[1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        const footTop = maxY - (maxY - minY) * 0.08;
        let sx = 0, n = 0;
        for (const px of pixels) { if (px[1] >= footTop) { sx += px[0]; n++; } }
        return { cx: n ? sx / n : (minX + maxX) / 2, by: maxY };
    }

    _startAttack() {
        if (this._attacking || this._blend || !this._gun || !this._gunAnim) return;
        const p = this._player;
        this._attacking = true;
        this._atkHoldT = 0;                    // 내린 자세 유지 타이머 (리셋)
        this._atkFlip = !!p?.flipX;            // 플레이어 시선 방향으로 사격 (총 기본은 왼쪽)
        this._gun.flipX = this._atkFlip;
        this._gun.asm.setState('atk_start'); this._gun.asm.restart();
        // 모래가 "진행 중(올라가는) 동작"에 얹히도록 준비 중간 프레임부터 시작 — 앞 절반 windup은 모래 코팅이 대신.
        const st = this._gun.asm.states['atk_start'];
        const half = st ? (st.frames.length >> 1) : 0;
        this._gun.asm._stateFrameIdx = half; this._gun.asm._lastTick = 0;
        this._gunAnim.setBool('firing', true);
        this._positionGun();
        // 총 원본 애니(중간→끝) 재생(visible). idle이 모래로 변해 그 "움직이는 몸"에 날아와 붙었다 걷힘.
        const src = this._pixelsScreen(p, p?._frameIdx ?? 0, this._atkFlip);   // idle = 모래 원천
        if (p) p.visible = false;
        this._gun.visible = true;                                              // 총은 솔리드로 보이고, 모래가 위로 흐름
        const coatMs = st ? ((st.frames.length - half) / st.fps) * 1000 : 400; // 중간→끝 동안 코팅
        this._startCoat('raise', this._gun, src, coatMs, null);
    }
    _endFire() { this._gunAnim?.setBool('firing', false); }

    // 총을 플레이어 발치에 정합 (flipX 미러 고려)
    _positionGun() {
        const p = this._player, a = this._gunAnchor, g = this._gun;
        if (!p || !g) return;
        if (a) {
            const pFeetX = this._atkFlip ? (a.ppw - 1 - a.pcx) : a.pcx;
            const gFeetX = this._atkFlip ? (a.gpw - 1 - a.gcx) : a.gcx;
            g.x = p.x + pFeetX - gFeetX;
            g.y = p.y + (a.pby - a.gby);
        } else { g.x = p.x; g.y = p.y; }
        g.x += this._recoilDir * this._recoilT * 3.5;   // 발사 반동(뒤로 톡, 약하게)
    }

    // 현재 프레임의 마커 앵커(name) 화면좌표 (flip 미러 고려). 없으면 null.
    _frameAnchor(entity, name) {
        if (!entity || !entity._frames) return null;
        const fr = entity._frames[entity.asm ? entity.asm.getCurrentFrame() : entity._frameIdx];
        const a = fr && fr.anchors && fr.anchors[name];
        if (!a) return null;
        const ax = this._atkFlip ? (entity.pw - 1 - a[0]) : a[0];
        return { x: (entity.x - this.engine.cameraX) + ax, y: entity.y + a[1] };
    }

    // 총구 화면좌표 + 발사 방향 (dir: +1 오른쪽 / -1 왼쪽)
    // 마커 앵커('muzzle')가 있으면 그걸(정확·프레임추적), 없으면 휴리스틱(밝은 픽셀 무게중심) 폴백.
    _muzzlePos() {
        const g = this._gun;
        if (!g) return null;
        const dir = this._atkFlip ? 1 : -1;
        const an = this._frameAnchor(g, 'muzzle');
        if (an) return { x: an.x, y: an.y, dir };
        const m = this._muzzleLocal;
        if (!m) return null;
        const mx = this._atkFlip ? (g.pw - 1 - m.x) : m.x;
        return { x: (g.x - this.engine.cameraX) + mx, y: g.y + m.y, dir };
    }

    // 한 발 발사 — 머즐버스트(모래)·트레이서·탄피·반동·머즐글로우
    _spawnShot() {
        const m = this._muzzlePos(); if (!m) return;
        const dir = m.dir;
        this._recoilT = 1; this._recoilDir = -dir;     // 반동: 발사 반대로
        this._muzzleFlash = 1;                          // 머즐 글로우
        for (let i = 0; i < 9; i++) {                   // 머즐 모래 버스트(앞으로 확)
            const sp = 120 + Math.random() * 170;
            this._muzzleP.push({ x: m.x, y: m.y, vx: dir * sp + (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 130, age: 0, life: 0.13 + Math.random() * 0.1 });
        }
        this._tracers.push({ x: m.x, y: m.y, vx: dir * (720 + Math.random() * 180), vy: (Math.random() - 0.5) * 18, age: 0, life: 0.11 });
    }

    _updateFiringFx(dt) {
        this._recoilT = Math.max(0, this._recoilT - dt * 0.014);
        this._muzzleFlash = Math.max(0, this._muzzleFlash - dt * 0.012);
        const s = dt / 1000;
        const adv = (arr, grav) => { for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; p.age += s; if (p.age >= p.life) { arr.splice(i, 1); continue; } if (grav) p.vy += grav * s; p.x += p.vx * s; p.y += p.vy * s; } };
        adv(this._muzzleP, 200); adv(this._tracers, 0);
    }

    _renderFiringFx(ctx) {
        if (!this._muzzleP.length && !this._tracers.length && this._muzzleFlash <= 0.02) return;
        const NT = SAND_TONES_RGB.length;
        // 머즐 글로우 (가산 라디얼)
        if (this._muzzleFlash > 0.02) {
            const m = this._muzzlePos();
            if (m) {
                const r = 26 * this._muzzleFlash + 7;
                const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
                gr.addColorStop(0, `rgba(255,236,184,${0.85 * this._muzzleFlash})`);
                gr.addColorStop(0.5, `rgba(255,182,92,${0.4 * this._muzzleFlash})`);
                gr.addColorStop(1, 'rgba(255,150,60,0)');
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, 6.283); ctx.fill(); ctx.restore();
            }
        }
        // 트레이서 (밝은 줄기, 가산)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const p of this._tracers) {
            ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
            ctx.fillStyle = 'rgb(255,242,206)';
            ctx.fillRect(((p.vx > 0 ? p.x - 14 : p.x)) | 0, (p.y - 1) | 0, 14, 2);
        }
        ctx.restore();
        // 머즐 모래 버스트
        for (const p of this._muzzleP) {
            const tc = SAND_TONES_RGB[(sandHash(p.x, p.y) * NT) | 0];
            ctx.globalAlpha = Math.max(0, 1 - p.age / p.life) * 0.9;
            ctx.fillStyle = `rgb(${Math.min(255, tc[0] + 40) | 0},${Math.min(255, tc[1] + 28) | 0},${tc[2] | 0})`;
            ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // 엔티티 한 프레임을 화면좌표 입자 [sx,sy,r,g,b] 목록으로 (모래 블렌드용, 3픽셀 샘플)
    _pixelsScreen(entity, frameIdx, flip) {
        const out = [];
        if (!entity || !entity._frames) return out;
        const fr = entity._frames[frameIdx]; if (!fr || !fr.pixels) return out;
        const cache = entity._rgbaCache || this.engine.palette_mgr?.rgbaCache;
        if (!cache) return out;
        const pw = entity.pw;
        const ox = (entity.x - this.engine.cameraX) | 0, oy = entity.y | 0;
        const px = fr.pixels, STEP = 2;   // 조밀 그레인
        for (let i = 0; i < px.length; i += STEP) {
            const q = px[i]; const c = cache.get(q[2]);
            if (!c || c[3] < 16) continue;
            out.push([ox + (flip ? (pw - 1 - q[0]) : q[0]), oy + q[1], c[0], c[1], c[2]]);
        }
        return out;
    }

    // 총(공격 중)에 낮밤 톤 — 플레이어 reveal과 "동일 공식"(배경톤으로 부드럽게 어두워짐, 순수 검정 X).
    // 솔리드 총 위에, 같은 픽셀을 어두워진 색으로 덮어 칠한다. 낮(k≈0)엔 원본 그대로(스킵).
    _renderGunLight(ctx) {
        const g = this._gun;
        if (!g || !g.visible || !g.asm) return;
        const k = this._fxK ?? 0;
        if (k < 0.02) return;                          // 낮엔 손대지 않음(밝게)
        const p = this._p;
        const avgLum = this._lastAvgLum ?? 0.5;        // 최근 배경 밝기(플레이어가 계산해 저장)
        const nightReveal = p.revBase + p.revLumScale * Math.min(1, avgLum * 1.6);
        const reveal = 1 - (1 - nightReveal) * k;      // 낮 1.0 → 밤 nightReveal
        const blend  = p.revBlend * k;                 // 밤에 배경색 융합
        const bt = this._bgTone || { r: 120, g: 110, b: 100 };
        const body = this._pixelsScreen(g, g.asm.getCurrentFrame(), this._atkFlip);
        ctx.save();
        ctx.globalAlpha = 1;
        for (const d of body) {
            const r = (d[2] * reveal * (1 - blend) + bt.r * blend) | 0;
            const gg = (d[3] * reveal * (1 - blend) + bt.g * blend) | 0;
            const b = (d[4] * reveal * (1 - blend) + bt.b * blend) | 0;
            ctx.fillStyle = `rgb(${r},${gg},${b})`;
            ctx.fillRect(d[0] | 0, d[1] | 0, 3, 3);
        }
        ctx.restore();
    }

    // 모래 코팅 시작. bodyEntity = 그 밑에서 재생되는 "원본"(움직임, 엔진이 솔리드 100% 렌더). src = 모래 출발 포즈.
    // 캐릭터는 엔티티 렌더 그대로 두고(깜박임 방지), 모래는 그 위에 오버레이로만 흐른다.
    _startCoat(mode, bodyEntity, src, ms, onDone) {
        if (bodyEntity) bodyEntity.visible = false; // 실루엣 튐을 차단하기 위해 본체 일시 비활성화
        this._blend = { 
            mode, 
            bodyEntity, 
            src: src || [], 
            t: 0, 
            ms: Math.max(1, ms), 
            flip: this._atkFlip, 
            onDone,
            startCamX: this.engine.cameraX // 코팅 시작 시점의 카메라 X 저장 (이동 튐 방지용)
        };
    }

    // 모래 코팅 — "하나의 흐르는 파도": 모래 띠가 몸을 가로질러 한 방향으로 쓸고 지나간다.
    //  · 라이즈(시작)=뒤→앞,  공격대기(끝)=앞→뒤 (통일된 방향성).
    //  · 띠의 앞 가장자리=생성(모래 나타남), 뒤 가장자리=사라짐. 띠가 지나간 자리에서 캐릭터가 드러남.
    //  · 픽셀은 진행 방향으로 출렁(surge) + 지글지글. 띠 양끝은 sin으로 부드럽게 페이드.
    _renderSandCoat(ctx, b, W, H) {
        const ent = b.bodyEntity;
        if (!ent || !ent.asm) return;
        let t = b.t; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ease = t * t * (3 - 2 * t);
        const body = this._pixelsScreen(ent, ent.asm.getCurrentFrame(), b.flip);  // 움직이는 원본 몸
        const src = b.src, sN = src.length || 1, NT = SAND_TONES_RGB.length;
        const isLower = b.mode === 'lower';
        const Tj = (performance.now() * 0.05) | 0;   // 매 프레임 변하는 지글 시드
        const dirF = this._atkFlip ? 1 : -1;         // 발사(앞=총구) 방향
        const surgeDir = isLower ? -dirF : dirF;     // 라이즈=앞으로 / 공격대기=뒤로
        const BAND = 0.5;                            // 파도 띠 폭(한 번에 모래인 비율)
        let bMinX = 1e9, bMaxX = -1e9;
        for (const d of body) { if (d[0] < bMinX) bMinX = d[0]; if (d[0] > bMaxX) bMaxX = d[0]; }
        const bRange = Math.max(1, bMaxX - bMinX);
        
        // 실시간 카메라 횡스크롤 스크롤 델타 보정
        const camDiff = this.engine.cameraX - (b.startCamX ?? this.engine.cameraX);

        // 픽셀의 파도 진행 위치 p (0=파도 시작쪽, 1=끝쪽). genT~clrT 사이가 "모래 띠".
        const waveP = (d) => {
            const frontN = (dirF > 0 ? (d[0] - bMinX) : (bMaxX - d[0])) / bRange;   // 0=뒤, 1=앞(총구)
            return isLower ? (1 - frontN) : frontN;                                 // 라이즈 뒤→앞 / 공격대기 앞→뒤
        };
        const bc = this._blendCv || (this._blendCv = document.createElement('canvas'));
        if (bc.width !== W || bc.height !== H) { bc.width = W; bc.height = H; }
        const bx = bc.getContext('2d');

        bx.clearRect(0, 0, W, H);

        // 실시간 캐릭터 불투명도 보간 계수 연산: t=0.5일 때 약 50%의 반투명 상태가 됨
        const alphaFactor = 1.0 - 0.5 * Math.sin(t * Math.PI);
        const k = this._fxK ?? 0;
        const pParams = this._p;
        const avgLum = this._lastAvgLum ?? 0.5;
        const nightReveal = pParams.revBase + pParams.revLumScale * Math.min(1, avgLum * 1.6);
        const reveal = 1 - (1 - nightReveal) * k;
        const blend = pParams.revBlend * k;
        const bt = this._bgTone || { r: 120, g: 110, b: 100 };

        const applyDarkening = (r, g, b) => {
            if (k < 0.02) return [r, g, b];
            const dr = (r * reveal * (1 - blend) + bt.r * blend) | 0;
            const dg = (g * reveal * (1 - blend) + bt.g * blend) | 0;
            const db = (b * reveal * (1 - blend) + bt.b * blend) | 0;
            return [dr, dg, db];
        };

        // 1) 이전 포즈(src) 직접 렌더링 (투명도 크로스페이드 및 카메라 스크롤 오차 보정 반영)
        bx.save();
        bx.globalAlpha = (1 - t) * alphaFactor;
        for (let i = 0; i < src.length; i++) {
            const o = src[i];
            const px = (o[0] - camDiff) | 0;
            const py = o[1] | 0;
            const color = applyDarkening(o[2], o[3], o[4]);
            bx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
            bx.fillRect(px, py, 3, 3);
        }
        bx.restore();

        // 2) 새 포즈(body) 직접 렌더링 (투명도 크로스페이드 반영)
        bx.save();
        bx.globalAlpha = t * alphaFactor;
        for (let i = 0; i < body.length; i++) {
            const d = body[i];
            const px = d[0] | 0;
            const py = d[1] | 0;
            const color = applyDarkening(d[2], d[3], d[4]);
            bx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
            bx.fillRect(px, py, 3, 3);
        }
        bx.restore();

        // 3) 모래 띠 (생성→사라짐 한 방향 흐름)
        const baseA = isLower ? 0.8 : 0.7;
        for (let j = 0; j < body.length; j++) {
            const d = body[j];
            const p = waveP(d);
            const genT = p * (1 - BAND) + (sandHash(d[0] * 0.7, d[1] * 0.7) - 0.5) * 0.12;
            if (ease <= genT || ease >= genT + BAND) continue;                       // 띠 밖 = 모래 없음
            if (isLower && sandHash(d[0] * 2.1 + 7, d[1] * 1.7) < 0.4) continue;      // 공격대기: 성기게
            const near = (ease - genT) / BAND;                                       // 0(생성)→1(사라짐)
            const o = src[(j * 97 + 13) % sN];
            const fly = Math.min(1, near * 2.2);                                     // 생성 시 src→몸으로 안착
            
            // 카메라 스크롤 보정이 반영된 이전 포즈 X 좌표
            const srcX = o[0] - camDiff;
            
            // 입자가 사방으로 퍼지는 반경(Jitter)을 2.2px로 슬림하게 좁히고,
            // 쏠리는 오프셋(Surge)도 8px로 조율하여 캐릭터 바디 실루엣에 딱 핏(Fit)되게 제어
            let px = srcX + (d[0] - srcX) * fly + (sandHash(d[0] * 0.9 + Tj, d[1] * 0.4) - 0.5) * 2.2 + surgeDir * near * near * 8;
            let py = o[1] + (d[1] - o[1]) * fly + (sandHash(d[0] * 0.3, d[1] * 0.9 + Tj) - 0.5) * 2.2 - near * 4;
            
            const tc = SAND_TONES_RGB[(sandHash(d[0] * 3.1 + 5, d[1] * 2.3 + 9) * NT) | 0];
            bx.globalAlpha = baseA * Math.sin(near * Math.PI) * alphaFactor;                       // 띠 양끝(생성/사라짐) 부드럽게 + alphaFactor 곱함
            bx.fillStyle = `rgb(${(tc[0] * 0.8 + d[2] * 0.2) | 0},${(tc[1] * 0.8 + d[3] * 0.2) | 0},${(tc[2] * 0.8 + d[4] * 0.2) | 0})`;
            
            // 모래알 크기는 고정 2px로 칠해 캐릭터 덩치가 커 보이지 않게 통일
            bx.fillRect(px | 0, py | 0, 2, 2);
        }
        bx.globalAlpha = 1;
        ctx.save();
        ctx.filter = 'blur(0.4px)';
        ctx.drawImage(bc, 0, 0);
        ctx.restore();
    }

    // ── 에디터 FX 라이브 슬라이더 적용 ───────────────────────────────
    // fx_params.csv key → 소스값(this._p.* 또는 모듈 let) 갱신. onUpdate/render가 매 프레임
    // 이 소스값을 읽으므로 다음 프레임에 바로 반영(저장 X — 확정값은 코드/CSV에 수동 반영).
    // 매핑은 _loadConfig()와 1:1 대응.
    applyFxParam(key, value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return false;
        const p = this._p;
        switch (key) {
            // 모듈 let (사용처가 매 프레임 읽음)
            case 'bg.trans_ms':      BG_TRANS_MS   = v; break;
            case 'bg.mote_rate':     BG_MOTE_RATE  = v; break;
            case 'intro.ms':         INTRO_MS      = v; break;
            case 'sand.band_max':    SAND_BAND_MAX = v; break;
            case 'sand.grain':       SAND_GRAIN    = v; break;
            case 'sand.settle_ms':   SAND_SETTLE_MS= v; break;
            case 'sand.buildup_ms':  SAND_BUILDUP_MS=v; break;
            case 'sand.fall_rate':   SAND_FALL_RATE= v; break;
            case 'sand.gravity':     SAND_GRAVITY  = v; break;
            // this._p (낮밤/림/리빌/조명/근경림 — render·onUpdate가 매 프레임 읽음)
            case 'daynight.period_s':        p.dayPeriod   = v; break;
            case 'daynight.char_bright_min': p.charMin     = v; break;
            case 'rim.fade_threshold':       p.rimThresh   = v; break;
            case 'rim.peak':                 p.rimPeak     = v; break;
            case 'rim.floor_mult':           p.rimFloorMul = v; break;
            case 'rim.width_base':           p.rimWidth    = v; break;
            case 'rim.dir_base':             p.rimDirBase  = v; break;
            case 'reveal.night_base':        p.revBase     = v; break;
            case 'reveal.night_lum_scale':   p.revLumScale = v; break;
            case 'reveal.blend':             p.revBlend    = v; break;
            case 'light.ambient_max':        p.ambMax      = v; break;
            case 'light.key_intensity_max':  p.keyMax      = v; break;
            case 'light.vignette_max':       p.vigMax      = v; break;
            case 'light.glow_max':           p.glowMax     = v; break;
            case 'light.fog_max':            p.fogMax      = v; break;
            case 'light.bloom_threshold':    // 블룸 임계는 캐시 재빌드 필요
                p.bloomThreshold = v;
                if (this.engine?.glow) this.engine.glow._bloomThreshold = v;
                if (this.engine?.layers) for (const L of this.engine.layers.layers) L._bloomReady = false;
                break;
            case 'nearrim.base':             p.nearRimBase = v; break;
            case 'nearrim.night':            p.nearRimNight= v; break;
            default: return false;
        }
        return true;
    }

    // 구름-포그 텍스쳐 로드 → 캔버스로 1회 래스터 (앞/뒤 2겹)
    async _loadFog() {
        const _land = this.engine.gameWidth > this.engine.gameHeight;     // 가로 모드 540 높이
        const defs = _land ? [
            { file: 'fog_1', y: 180, dh: 360, speed: 5,  baseAlpha: 0.36 },  // 가로: 바닥쪽 옅게
            { file: 'fog_2', y: 320, dh: 300, speed: 11, baseAlpha: 0.44 },
        ] : [
            { file: 'fog_1', y: -20, dh: 540, speed: 5,  baseAlpha: 0.42 },  // 세로: 뒤(위), 느림
            { file: 'fog_2', y: 360, dh: 640, speed: 11, baseAlpha: 0.5  },  // 세로: 앞(아래), 빠름
        ];
        for (const def of defs) {
            try {
                const d = await fetch(`./pixels/fog/${def.file}.json`, { cache: 'no-store' }).then(r => r.json());
                this._fog.push({ canvas: this._rasterFog(d), x: Math.random() * d.width, ...def });
            } catch (e) { console.warn('[golmok] fog load fail:', def.file, e); }
        }
    }

    _rasterFog(d) {
        const cv = document.createElement('canvas'); cv.width = d.width; cv.height = d.height;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(d.width, d.height); const od = img.data;
        const pal = d.palette.map(c => {
            if (!c || c === 'transparent') return null;
            const h = c.slice(1);
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), h.length >= 8 ? parseInt(h.slice(6,8),16) : 255];
        });
        const s = d.scanline;
        for (let i = 0; i < s.length; i++) {
            const c = pal[s[i]]; if (!c) continue;
            const o = i << 2; od[o]=c[0]; od[o+1]=c[1]; od[o+2]=c[2]; od[o+3]=c[3];
        }
        ctx.putImageData(img, 0, 0);
        return cv;
    }

    // 캐시 관리: 한 번에 [현재 + 다음] 배경만 보유 (4장 전부 X → 메모리 절약).
    async _preload() {
        // 시작 배경(BG_LIST[0])은 씬이 이미 bg_main으로 로드 → 캐시에도 확보 + 다음 미리 로드
        await this._ensureBg(BG_LIST[0]);
        this._manageCache(0);          // 현재+다음만 유지
        this._bgReady = true;
    }

    // 배경 1세트(근경+원경) 비동기 로드 (이미 있거나 로딩 중이면 skip)
    // 캐시 값 = { near, far } (각 {era}_near.json / {era}_far.json)
    async _ensureBg(era) {
        if (this._bgCache[era]) return;
        if (!this._bgLoading) this._bgLoading = {};
        if (this._bgLoading[era]) return;
        this._bgLoading[era] = true;
        try {
            const [near, far] = await Promise.all([
                fetch(`./pixels/objects/${era}_near.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
                fetch(`./pixels/objects/${era}_far.json`,  { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
            ]);
            if (near && far) this._bgCache[era] = { near, far };
        } catch (e) { console.warn('[golmok] bg load fail:', era, e); }
        delete this._bgLoading[era];
    }

    // 현재+다음만 캐시에 유지하고 나머지(이전 등) 해제. 다음은 미리 로드.
    _manageCache(curIdx) {
        const n = BG_LIST.length;
        const keep = new Set([BG_LIST[curIdx], BG_LIST[(curIdx + 1) % n]]);
        for (const name of Object.keys(this._bgCache)) {
            if (!keep.has(name)) delete this._bgCache[name];   // 이전 배경 캐시 해제
        }
        this._ensureBg(BG_LIST[(curIdx + 1) % n]);             // 다음 배경 미리 로드
    }

    // 배경 스캔라인(JSON) → 캔버스 1회 래스터 (원경 크로스페이드용 _img).
    _rasterBgCanvas(d) {
        const cv = document.createElement('canvas'); cv.width = d.width; cv.height = d.height;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(d.width, d.height); const od = img.data;
        const pal = d.palette.map(c => (!c || c === 'transparent') ? null
            : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c.length >= 9 ? parseInt(c.slice(7, 9), 16) : 255]);
        const sl = d.scanline;
        for (let i = 0; i < sl.length; i++) { const c = pal[sl[i]]; if (!c) continue; const o = i << 2; od[o] = c[0]; od[o + 1] = c[1]; od[o + 2] = c[2]; od[o + 3] = c[3]; }
        ctx.putImageData(img, 0, 0);
        return cv;
    }
    _farCanvas(era) {
        this._farCv = this._farCv || {};
        if (this._farCv[era]) return this._farCv[era];
        const d = this._bgCache[era] && this._bgCache[era].far;
        if (!d || !d.scanline) return null;
        return (this._farCv[era] = this._rasterBgCanvas(d));
    }
    // 원경을 "크로스페이드 2장(_img, 비정적)"으로 셋업 — 캐시 준비되면 1회. (근경 1장에 원경 2개 노출)
    _ensureFarXfade(engine) {
        if (!FAR_XFADE || this._farXfade) return;   // OFF면 원경=정적(성능)
        const eraA = BG_LIST[this._bgIdx];
        const eraB = BG_LIST[(this._bgIdx + 1) % BG_LIST.length];
        const ca = this._farCanvas(eraA), cb = this._farCanvas(eraB);
        if (!ca || !cb) return;   // 캐시 아직 → 다음 프레임
        engine.entities.remove('bg_far');                          // 씬의 스캔라인 원경 제거
        const by = this._bgY || 0;
        const mk = (id, cv, a) => {
            const e = engine.entities.add(id, { x: 0, y: by, pw: cv.width, ph: cv.height, layer: 0, visible: true, static: false });
            if (e) { e._isSample = true; e._img = cv; e.alpha = a; }
            return e;
        };
        this._bgFar  = mk('bg_far',  ca, 1);   // 항상 풀
        this._bgFar2 = mk('bg_far2', cb, 0);   // 위에 알파로 페이드인
        this._farXfade = true;
    }

    _swapBg(engine, era) {
        const d = this._bgCache[era];
        if (!d) return;
        // 이전 배경 오브젝트 해제 (근경 bg_main, 원경 bg_far/bg_far2, player 제외)
        for (const id of [...engine.entities._entities.keys()]) {
            if (id !== 'bg_main' && id !== 'bg_far' && id !== 'bg_far2' && id !== 'player') engine.entities.remove(id);
        }
        // 근경(near) → L1 bg_main
        engine.entities.remove('bg_main');
        const near = engine.entities.add('bg_main', {
            x: 0, y: this._bgY ?? 0, pw: d.near.width, ph: d.near.height,   // 가로 시프트 y 유지
            layer: 1, visible: true, _scanline: d.near.scanline, _palette: d.near.palette,
        });
        if (near) { near.type = `${era}_near`; near._asset = `${era}_near`; near._assetCategory = 'objects'; }
        // 원경(far) → 크로스페이드 2장(_img)으로 관리: farA=현재 era, farB=다음 era. 셋업 전이면 폴백(스캔라인 단일).
        if (this._farXfade) {
            const eraB = BG_LIST[(this._bgIdx + 1) % BG_LIST.length];
            const ca = this._farCanvas(era), cb = this._farCanvas(eraB);
            if (this._bgFar  && ca) { this._bgFar._img  = ca; this._bgFar.alpha  = 1; }
            if (this._bgFar2 && cb) { this._bgFar2._img = cb; this._bgFar2.alpha = 0; }
        } else {
            engine.entities.remove('bg_far');
            const far = engine.entities.add('bg_far', {
                x: 0, y: this._bgY ?? 0, pw: d.far.width, ph: d.far.height,
                layer: 0, visible: true, _scanline: d.far.scanline, _palette: d.far.palette,
            });
            if (far) { far.type = `${era}_far`; far._asset = `${era}_far`; far._assetCategory = 'objects'; }
        }
        this._bgTone = null;   // 배경 바뀌면 톤 재샘플 → 림/조명 자동 매칭
        this._curRimMul = this._mapRim?.[era] ?? 1;   // 맵별 근경 림 배율
        // 원경(L0)만 블룸 재빌드 — 근경(L1)은 검은 실루엣이라 블룸 불필요(4320폭 재빌드 낭비 방지)
        if (engine.layers.layers[0]) engine.layers.layers[0]._bloomReady = false;
    }

    // 원경(L0)의 밝은 영역 평균색 = 대표 톤. FX 톤(림 floor·key광)을 배경마다 자동 매칭하는 기준.
    // (근경 L1은 검은 실루엣이라 톤 샘플에 부적합 → 색이 있는 원경 L0을 샘플)
    _sampleBgTone(engine) {
        const L0 = engine.layers.getCanvas(0);
        if (!L0 || !L0.width) return;
        try {
            // 전체 레이어를 읽으면 readback 비용↑ → 배경 전환 시 프레임 드랍.
            // 대표 영역만 읽는다: 폭은 뷰포트 2배까지, 높이는 상단 65%(조명 받는 하늘/건물).
            const sw = Math.min(L0.width, (engine.gameWidth || 540) * 2);
            const sh = Math.min(L0.height, Math.round(L0.height * 0.65));
            const d = L0.getContext('2d').getImageData(0, 0, sw, sh).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 64) {     // 듬성 샘플(16px 간격)
                if (d[i + 3] < 16) continue;
                if (d[i] + d[i + 1] + d[i + 2] < 90) continue;  // 거의 검은 픽셀 제외 (조명 받는 영역 위주)
                r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            }
            if (n > 30) this._bgTone = { r: r / n, g: g / n, b: b / n };
        } catch (_) {}
    }

    onUpdate(now, dt, input) {
        const engine = this.engine;
        const player = this._player ?? engine.entities.get('player');
        if (!player) return;
        this._player = player;

        const dtSec = dt / 1000;

        // 인트로 연출 진행 (끝나면 null). 진행 중엔 입력/이동 정지.
        if (this._intro) {
            this._intro.t += dt / INTRO_MS;
            if (this._intro.t >= 1) this._intro = null;
        }
        const introActive = !!this._intro;

        // 이동 — 키보드 우선, 없으면 클릭 목표로 이동 (인트로 중엔 정지)
        let dx = 0;
        if (!introActive) {
            if (input.isDown('left'))  { dx = -MOVE_SPEED; this._targetX = null; }
            if (input.isDown('right')) { dx =  MOVE_SPEED; this._targetX = null; }
        }
        if (dx === 0 && this._targetX != null) {
            const diff = this._targetX - player.x;
            const step = MOVE_SPEED * dtSec;
            if (Math.abs(diff) <= step) { player.x = this._targetX; this._targetX = null; }
            else dx = diff > 0 ? MOVE_SPEED : -MOVE_SPEED;
        }
        // 이동 잠금: 공격·공격대기·블렌드(특수 동작) 중엔 이동키/클릭이동 무시. idle/walk에서만 이동.
        //   ※ 나중에 "이동 가능한 특수 동작"이 생기면 그 상태를 여기 예외로 추가.
        if (this._attacking || this._blend) { dx = 0; this._targetX = null; }
        if (dx !== 0) {
            player.x += dx * dtSec;
            player.flipX = dx > 0;                                           // 에셋 기본 시선(왼쪽) 반영하여 방향 전환 (dx > 0 일 때 flip)
            player.x = Math.max(0, Math.min(this._worldW - player.pw, player.x));
        }
        // 애니: 로직은 파라미터만 세팅 → 컨트롤러(플로우)가 전환 결정. 미준비 시 수동 폴백.
        if (this._anim) { this._anim.setParam('speed', dx !== 0 ? 1 : 0); this._anim.update(); }
        else            { player.setState(dx !== 0 ? 'walk' : 'idle'); }
        player.y = this._groundY;                                            // 하드코딩된 GROUND_Y 대신 동적 바닥 높이 적용

        // 모래 코팅 진행 — 본체는 코팅 렌더가 직접 그림(투명도 40%→100%). 끝나면 엔티티 렌더(100%)로 인계.
        if (this._blend) {
            this._blend.t += dt / this._blend.ms;
            if (this._blend.t >= 1) {
                const b = this._blend; this._blend = null;
                if (b.bodyEntity) b.bodyEntity.visible = true;   // 코팅 끝 → 엔티티가 100%로 재생(이후 발사)
                if (b.onDone) b.onDone();
            }
        }

        // 공격(총): 발치 정합 + 플로우. 되돌리기는 끝까지 재생 후 "내린 자세 유지(hold)".
        //  · 유지 중 움직이면 즉시 이동(walk, 모래 없음). · 가만히 5초 지나면 모래 효과로 idle 전환(블렌딩 구간).
        if (this._attacking && this._gun && this._gunAnim) {
            this._positionGun();
            this._gunAnim.update();
            const asm = this._gun.asm;
            // 발사 중(atk_active) — 일정 간격으로 한 발씩 임팩트 FX
            if (asm.current === 'atk_active' && this._gun.visible) {
                this._fireAcc += dt;
                let guard = 0;
                while (this._fireAcc >= 110 && guard++ < 4) { this._fireAcc -= 110; this._spawnShot(); }
            } else {
                this._fireAcc = 110;   // 다음 발동 진입 시 즉발
            }
            if (!this._blend && asm.current === 'atk_recover' && asm.isDone()) {
                // 회수(내리기) 끝 → 바로 idle로 전환하고, "idle(솔리드) 위에" 모래 파도를 띄움(공격대기 생략).
                const src = this._pixelsScreen(this._gun, asm.getCurrentFrame(), this._atkFlip);  // 모래 원천 = 내린 자세
                this._gun.visible = false;
                if (player) {
                    player.visible = true;            // idle 보임(코팅 본체)
                    if (player.asm) { player.asm.setState('idle'); player.asm.restart(); }  // idle 0프레임부터
                }
                this._attacking = false;
                this._startCoat('lower', player, src, 550, null);   // body=idle, 모래 파도가 idle 위로 흐름
            }
        }
        this._updateFiringFx(dt);   // 발사 파티클(머즐버스트/트레이서/탄피)·반동·글로우 갱신 (비행 중엔 항상)

        // 카메라
        const rawCamX = player.x + player.pw / 2 - engine.gameWidth / 2;
        engine.cameraX = engine.bounds.clampCameraX(rawCamX);

        // ── 스크롤 모션 추적 (SandScroll 효과용) ──────────────────
        const cam = engine.cameraX;
        if (this._lastCamX == null) this._lastCamX = cam;
        const camDelta = cam - this._lastCamX;
        this._lastCamX = cam;
        // 순간 속도(px/sec) → EMA 평활 (가감속 시 띠 폭이 부드럽게 부풀고 가라앉음)
        const instSpeed = Math.abs(camDelta) / Math.max(dtSec, 0.001);
        this._sandSpeed = this._sandSpeed * 0.8 + instSpeed * 0.2;
        const speedNorm = this._sandSpeed / MOVE_SPEED;
        if (Math.abs(camDelta) > 0.05) {
            this._sandDir = camDelta > 0 ? 1 : -1;
            this._sandI   = 1;
            // 빌드업: 걷기(≈1배속)면 2초에 걸쳐, 달리기(>1.2배속)면 즉시 최대로
            const rampMs = speedNorm > 1.2 ? 200 : SAND_BUILDUP_MS;
            this._sandRamp = Math.min(1, this._sandRamp + dt / rampMs);
        } else {
            this._sandI    = Math.max(0, this._sandI    - dt / SAND_SETTLE_MS);
            this._sandRamp = Math.max(0, this._sandRamp - dt / SAND_SETTLE_MS);
        }

        // ── 낮↔밤 60초 사이클 ──────────────────────────────────────
        // 60초 주기로 낮(k=0)↔밤(k=1) 부드럽게 순환 (cosine ease). 시작=낮 → 30s 밤 → 60s 낮
        this._dayT += dtSec;
        const k = 0.5 - 0.5 * Math.cos(this._dayT * (Math.PI * 2 / this._p.dayPeriod));
        this._fxK = k;

        // 림 = 캐릭터 색상 곡선과 분리. 캐릭터 밝기 rimThresh부터 약하게 페이드인, 어두울수록 강해짐. (값: fx_params.csv)
        const charBright = 1 - (1 - this._p.charMin) * k;               // 낮 1.0 → 밤 charMin
        let rimF = (this._p.rimThresh - charBright) / (this._p.rimThresh - this._p.charMin);
        rimF = rimF < 0 ? 0 : rimF > 1 ? 1 : rimF;
        this._rimF = rimF;   // 게임측 _renderCharRim 두께/세기에 사용 (엔진 rim은 비활성)
        for (const f of this._fog) f.x += f.speed * dtSec;               // 안개 드리프트
        if (DIGITAL_ENABLED) this._updateDigital(dt);                    // 디지털 패턴 생성/소멸 (현재 OFF)
        const hx = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
        // ── 밤 콘트라스트: 어두운 데 더 어둡게(ambient multiply) + 밝은 데 더 밝게(glow) ──
        // 배경 대표색에서 '깊은 어둠색' 도출(그림자가 배경 톤을 띰). key 라이트는 제거(중앙 wash 방지).
        if (!this._bgTone) this._sampleBgTone(engine);
        const bt = this._bgTone || { r: 255, g: 200, b: 95 };
        // 어둠색 = 배경색의 어두운 버전 → multiply로 어두운 영역을 더 가라앉힘
        engine.lighting.setAmbient(this._p.ambMax * k, '#' + hx(bt.r * 0.12 + 6) + hx(bt.g * 0.13 + 8) + hx(bt.b * 0.16 + 16));
        engine.vignette.setStrength(this._p.vigMax * k);                 // 비네트 0↔max
        engine.glow._bloomStrength = this._p.glowMax * k;                // 글로우 0↔max
        engine.fog._layerFogOpts.maxOpacity = this._p.fogMax * k;        // 안개 0↔max
        engine.fog._gradCache = null;

        // ── IDLE: 발밑 그림자 누적용 시간만 추적 (픽셀 낙하 효과는 제거) ──
        if (dx === 0) this._idleT += dtSec; else this._idleT = 0;

        // 앰비언트(캐릭터 외곽 디지털 디졸브) + 배경에서 위로 피어오르는 모래알
        if (CHAR_DISSOLVE_ENABLED) this._updateAmbientSand(dt);
        this._updateBgMotes(dt);

        // ── 배경 순환 + 전환 ──────────────────────────────────────
        // CYCLE_ENABLED=false 동안 전체 순환/끝-도달 전환 비활성 (세로 4장 전환은 추후)
        if (!CYCLE_ENABLED || !this._bgReady) return;

        // ── 원경 크로스페이드: 근경 1장 지나는 동안 원경이 스크롤 40~62%에서 원경A→원경B로 ──
        this._ensureFarXfade(engine);
        if (this._farXfade && this._bgFar2) {
            const span = Math.max(1, this._worldW - engine.gameWidth);
            const frac = engine.cameraX / span;
            this._bgFar2.alpha = frac < 0.40 ? 0 : frac > 0.62 ? 1 : (frac - 0.40) / 0.22;
        }

        if (this._tr) {
            this._tr.t += dt / BG_TRANS_MS;
            // 화면이 모래색으로 덮인 중간 지점(t≥0.5)에서 배경 교체 + 새 맵 시작점으로 순간이동
            if (!this._tr.swapped && this._tr.t >= 0.5) {
                this._tr.swapped = true;
                this._bgIdx = (this._bgIdx + 1) % BG_LIST.length;
                this._swapBg(engine, BG_LIST[this._bgIdx]);
                this._manageCache(this._bgIdx);   // 이전 배경 캐시 해제 + 다음 미리 로드
                player.x = 0;                 // 다음 맵 왼쪽 끝에서 시작
                this._targetX = null;
                const camX2 = engine.bounds.clampCameraX(player.x + player.pw / 2 - engine.gameWidth / 2);
                engine.cameraX = camX2;
                this._lastCamX = camX2;        // 카메라 점프로 인한 모래 스파이크 방지
            }
            if (this._tr.t >= 1) { this._tr = null; this._timer = 0; }
            return;
        }

        // 맵 오른쪽 끝에 도달하면 모래폭발(sandburst) 전환으로 다음 배경 생성
        if (player.x >= this._worldW - player.pw - 2) {
            this._tr = { t: 0, effect: 'sandburst', swapped: false };
        }
    }

    // composite/FX 이후 — 전환 오버레이 또는 SandScroll 가장자리 효과
    onPostRender(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        let overlay = false;
        this._renderStamp = (this._renderStamp | 0) + 1;   // FX 소스 공유 캐시 유효성 판별용

        if (this._tr) {
            const t = this._tr.t;
            switch (this._tr.effect) {
                case 'palette_flash': {
                    const flash = Math.min(1, (1 - Math.abs(2 * t - 1)) * 1.4);
                    ctx.save();
                    ctx.globalAlpha = flash;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, W, H);
                    ctx.restore();
                    break;
                }
                case 'slide_left': {
                    let panelX;
                    if (t < 0.5) panelX = W * (1 - this._ease(t * 2));
                    else         panelX = -(W * this._ease((t - 0.5) * 2));
                    ctx.fillStyle = '#000';
                    ctx.fillRect(panelX, 0, W, H);
                    break;
                }
                case 'convergence': {
                    this._drawConvergence(ctx, W, H, t);
                    break;
                }
                case 'sand_top':
                case 'sand_sides': {
                    // 앞 절반: 구 배경 모래 소멸 / 뒤 절반: 새 배경 모래 생성
                    const shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
                    const img = ctx.getImageData(0, 0, W, H);
                    const d = img.data;
                    for (let y = 0; y < H; y++) {
                        for (let x = 0; x < W; x++) {
                            const n = sandHash(x >> 2, y >> 2);
                            let thr;
                            if (this._tr.effect === 'sand_top') {
                                thr = (y / H) * 0.7 + n * 0.3;
                            } else {
                                const dc = Math.abs(x - W * 0.5) / (W * 0.5);
                                thr = (1 - dc) * 0.7 + n * 0.3;
                            }
                            if (shown < thr) {                 // 미생성 = 모래 바탕색
                                const i = (y * W + x) << 2;
                                d[i] = BR; d[i + 1] = BG; d[i + 2] = BB; d[i + 3] = 255;
                            }
                        }
                    }
                    ctx.putImageData(img, 0, 0);
                    break;
                }
                case 'sandburst': {
                    // 대각 모래 스윕 + 반짝임 — 그림이 모래알로 흩어졌다 모래에서 재조립 (화려)
                    const G = 4, shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const src = ctx.getImageData(0, 0, W, H), sd = src.data;
                    if (!this._burstOut || this._burstOut.width !== W || this._burstOut.height !== H)
                        this._burstOut = ctx.createImageData(W, H);   // 버퍼 재사용(매 프레임 2MB 할당 방지)
                    const out = this._burstOut, od = out.data;
                    const NT = SAND_TONES_RGB.length, tw = (t * 34) | 0;
                    for (let y = 0; y < H; y += G) {
                        for (let x = 0; x < W; x += G) {
                            const cx = (x / G) | 0, cy = (y / G) | 0;
                            const n = sandHash(cx, cy);
                            const sweep = (x + y) / (W + H);          // 대각 스윕 0~1
                            const thr = sweep * 0.55 + n * 0.45;
                            let r, g, b;
                            if (shown > thr) {                         // 그림 유지
                                const si = (y * W + x) << 2;
                                r = sd[si]; g = sd[si + 1]; b = sd[si + 2];
                            } else {                                   // 모래알
                                const sp = sandHash(cx + tw, cy - tw);
                                if (sp > 0.93) { r = 255; g = 248; b = 224; }   // 반짝임(화려)
                                else {
                                    const tc = SAND_TONES_RGB[(n * NT) | 0], f = 0.65 + sp * 0.55;
                                    r = Math.min(255, tc[0] * f) | 0; g = Math.min(255, tc[1] * f) | 0; b = Math.min(255, tc[2] * f) | 0;
                                }
                            }
                            for (let dy = 0; dy < G && y + dy < H; dy++) {
                                const rb = (y + dy) * W;
                                for (let dx = 0; dx < G && x + dx < W; dx++) {
                                    const oi = (rb + x + dx) << 2;
                                    od[oi] = r; od[oi + 1] = g; od[oi + 2] = b; od[oi + 3] = 255;
                                }
                            }
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    break;
                }
                case 'wave': {
                    const shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const amp = (1 - shown) * 26, fade = shown, phase = t * Math.PI * 8;
                    const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
                    const src = ctx.getImageData(0, 0, W, H), sd = src.data;
                    const out = ctx.createImageData(W, H), od = out.data;
                    for (let y = 0; y < H; y++) {
                        const dx = Math.round(Math.sin(y * 0.045 + phase) * amp);
                        for (let x = 0; x < W; x++) {
                            let sxp = x - dx;
                            if (sxp < 0) sxp = 0; else if (sxp >= W) sxp = W - 1;
                            const si = (y * W + sxp) << 2, oi = (y * W + x) << 2;
                            // 모래 바탕색에서 그림색으로 보간 (검정 대신)
                            od[oi]     = BR + (sd[si]     - BR) * fade;
                            od[oi + 1] = BG + (sd[si + 1] - BG) * fade;
                            od[oi + 2] = BB + (sd[si + 2] - BB) * fade;
                            od[oi + 3] = 255;
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    break;
                }
            }
            overlay = true;
            if (SHOW_FPS) this._drawFps(ctx, W);
            return;   // 전환 중엔 캐릭터 FX·근경림·모래알 스킵 (모래 스윕이 화면을 덮음 → 안 보이고 비용만 큼)
        } else if (SAND_ENABLED && this._sandRamp > 0.01) {
            this._renderSandScroll(ctx, W, H);
            overlay = true;
        }

        // ── 게임 진입 인트로: 배경 모래-생성 + 캐릭터 픽셀 모이기 ──
        if (this._intro) {
            this._renderIntro(ctx, W, H, this._intro.t);
            return;   // 인트로 중엔 일반 캐릭터/모래알/디지털/포그 스킵
        }

        // 프레임당 FX 소스 readback 통합 — 근경림·캐릭터영역이 쓸 픽셀을 한 캔버스에 패킹해 getImageData 1회로 읽음
        this._buildFxSrc(W, H);

        // 근경 역광 림 — 원경(뒤) 빛이 근경 실루엣 가장자리를 감싸 입체감/공간감 부여
        this._renderNearRim(ctx, W, H);

        // 배경에서 위로 피어오르는 모래알 (캐릭터 뒤 분위기)
        this._drawBgMotes(ctx);

        // 발밑 그림자 (항상, 캐릭터 아래) — 정지=픽셀 깨짐 / 이동=블러 모션
        this._drawShadow(ctx);

        // 캐릭터 본체 — 공격(총) 중엔 총에 낮밤 다크닝(+코팅), 아니면 일반 캐릭터 FX.
        const gunActive = this._attacking && this._gun && this._gun.visible;
        if (this._blend) {
            if (gunActive) this._renderGunLight(ctx);     // 코팅 중에도 총에 낮밤 적용
            this._renderSandCoat(ctx, this._blend, W, H);
        } else if (gunActive) {
            this._renderGunLight(ctx);                    // 발사 중 총에 낮밤 다크닝
        } else {
            const moving = this._sandI > 0.05;
            const l2 = this.engine.layers.getCanvas(2);
            const reg = this._readCharRegion(W, H);   // L1+L2 캐릭터 영역 1회 읽기 → trail·reveal·rim 공유
            if (moving) this._renderCharTrail(ctx, reg);
            this._renderCharReveal(ctx, reg, l2, W, H);
            this._renderCharRim(ctx, reg);            // 외곽 역광 rim — 뒤 배경색 픽셀별
        }

        // 발사 임팩트 FX (머즐 글로우·모래버스트·트레이서·탄피) — 캐릭터 위
        this._renderFiringFx(ctx);

        // 앰비언트 모래알 (캐릭터 외곽 디지털 디졸브) — 요청으로 OFF
        if (CHAR_DISSOLVE_ENABLED) this._drawAmbientSand(ctx);

        // 디지털 패턴 오버레이 (회로/메시가 불규칙하게 명멸 — 디지털 세계 느낌)
        this._drawDigital(ctx);

        // 드리프트 구름-포그 (몽환적 분위기, FX 세기에 연동)
        this._drawFog(ctx, W, H);

        // 가장자리 픽셀 깨짐 프레임 — 반듯한 사각 테두리를 픽셀아트답게 침식 (이동 시)
        this._renderEdgeFrame(ctx, W, H);

        // FPS 표시 (우상단, 디버그) — 배경 전환 시 프레임 드랍 확인용
        if (SHOW_FPS) this._drawFps(ctx, W);
    }

    // 우상단 작은 FPS 카운터 (EMA 평활)
    _drawFps(ctx, W) {
        const now = performance.now();
        if (this._fpsLast) {
            const fps = 1000 / Math.max(1, now - this._fpsLast);
            this._fpsEma = this._fpsEma ? this._fpsEma * 0.85 + fps * 0.15 : fps;
        }
        this._fpsLast = now;
        const v = Math.round(this._fpsEma || 0);
        ctx.save();
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const txt = v + ' fps';
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(W - tw - 8, 2, tw + 6, 14);
        ctx.fillStyle = v < 30 ? '#ff6666' : (v < 50 ? '#ffd060' : '#9effa0');   // 낮으면 빨강
        ctx.fillText(txt, W - 3, 4);
        ctx.restore();
    }


    // ── 디지털 오버레이: 회로/메시 조각이 불규칙하게 명멸 ──────────────
    _updateDigital(dt) {
        const dtSec = dt / 1000;
        for (let i = this._digital.length - 1; i >= 0; i--) {
            const p = this._digital[i]; p.age += dtSec;
            if (p.age >= p.life) this._digital.splice(i, 1);
        }
        this._digAcc += 4 * dtSec;                          // ~초당 4개
        while (this._digAcc >= 1 && this._digital.length < 16) {
            this._digAcc -= 1; this._spawnDigital();
        }
    }

    _spawnDigital() {
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const wx = Math.floor(e.cameraX) + (Math.random() * (W + 100) - 50);
        const y  = 40 + Math.random() * (H - 220);
        const scale = 0.8 + Math.random() * 1.0;
        const pts = [], edges = [];
        if (Math.random() < 0.5) {
            // 회로 트레이스 (직각 경로 + 노드)
            let cx = 0, cy = 0; pts.push([cx, cy]);
            const segs = 3 + (Math.random() * 4 | 0);
            for (let i = 0; i < segs; i++) {
                const len = (18 + Math.random() * 48) * scale;
                if (i % 2 === 0) cx += (Math.random() < 0.5 ? -1 : 1) * len;
                else             cy += (Math.random() < 0.5 ? -1 : 1) * len;
                pts.push([cx, cy]);
            }
            for (let i = 0; i < pts.length - 1; i++) edges.push([i, i + 1]);
        } else {
            // 와이어프레임 노드망
            const n = 4 + (Math.random() * 4 | 0);
            for (let i = 0; i < n; i++) pts.push([(Math.random() - 0.5) * 100 * scale, (Math.random() - 0.5) * 100 * scale]);
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.random() < 0.4) edges.push([i, j]);
        }
        this._digital.push({ wx, y, age: 0, life: 0.7 + Math.random() * 1.7, pts, edges });
    }

    _drawDigital(ctx) {
        if (!this._digital.length) return;
        const cam = this.engine.cameraX;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';   // 가산 → 파랑 글로우
        for (const p of this._digital) {
            const t = p.age / p.life;
            const fade = t < 0.25 ? t / 0.25 : (t > 0.6 ? (1 - t) / 0.4 : 1);
            const a = Math.max(0, fade) * 0.75;
            if (a <= 0.02) continue;
            const ox = p.wx - cam, oy = p.y;
            ctx.globalAlpha = a;
            ctx.strokeStyle = '#3aa8ff'; ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (const [i, j] of p.edges) {
                ctx.moveTo(ox + p.pts[i][0], oy + p.pts[i][1]);
                ctx.lineTo(ox + p.pts[j][0], oy + p.pts[j][1]);
            }
            ctx.stroke();
            ctx.fillStyle = '#cfeaff';
            for (const pt of p.pts) ctx.fillRect((ox + pt[0] - 1) | 0, (oy + pt[1] - 1) | 0, 3, 3);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // 구름-포그 2겹 가로 드리프트 (반투명, FX 세기 k에 연동)
    _drawFog(ctx, W, H) {
        const k = this._fxK;
        if (k <= 0.02 || !this._fog.length) return;
        for (const f of this._fog) {
            const cw = f.canvas.width, ch = f.canvas.height;
            const drift = ((f.x % cw) + cw) % cw;
            ctx.save();
            ctx.globalAlpha = Math.min(1, f.baseAlpha * k);
            ctx.drawImage(f.canvas, 0, 0, cw, ch, -drift,     f.y, W, f.dh);  // 무한 가로 스크롤
            ctx.drawImage(f.canvas, 0, 0, cw, ch, W - drift,  f.y, W, f.dh);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 외곽이 디지털 픽셀로 부서져 곡선을 그리며 중력 낙하 (이 세계 = 디지털)
    _updateAmbientSand(dt) {
        const dtSec = dt / 1000;
        const e = this.engine;
        const W = e.gameWidth, H = e.gameHeight;
        const L2 = e.layers.getCanvas(2);
        const lctx2 = L2 ? L2.getContext('2d') : null;
        const p = this._player;

        // ── 스폰: 캐릭터 경계 픽셀만 추려서 디지털 블록으로 떨어뜨림 ──
        if (p && lctx2) {
            const psx = (p.x - e.cameraX) | 0;
            const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
            const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
            const rw = x1 - x0, rh = y1 - y0;
            let img = null;
            if (rw > 0 && rh > 0) { try { img = lctx2.getImageData(x0, y0, rw, rh).data; } catch (_) {} }
            if (img) {
                const A = (lx, ly) => (lx < 0 || lx >= rw || ly < 0 || ly >= rh) ? 0 : img[((ly * rw + lx) << 2) + 3];
                // 경계 픽셀 수집 (step 2) — 투명 이웃이 있는 캐릭터 픽셀
                const edges = [];
                for (let ly = 0; ly < rh; ly += 2) {
                    for (let lx = 0; lx < rw; lx += 2) {
                        if (A(lx, ly) < 40) continue;
                        if (A(lx-2,ly)>=40 && A(lx+2,ly)>=40 && A(lx,ly-2)>=40 && A(lx,ly+2)>=40) continue;
                        edges.push(lx, ly);
                    }
                }
                if (edges.length) {
                    const dir = this._sandDir || 1, moving = this._sandI;   // 0~1
                    // idle엔 소량, 이동할수록 많이 부서짐
                    this._ambAcc += SAND_FALL_RATE * (0.1 + 0.9 * moving) * dtSec;
                    while (this._ambAcc >= 1) {
                        this._ambAcc -= 1;
                        const k = ((Math.random() * (edges.length >> 1)) | 0) << 1;
                        const lx = edges[k], ly = edges[k + 1];
                        const o = (ly * rw + lx) << 2;
                        // 어두운 실루엣 → 차가운 청회색 '데이터' 픽셀로 살짝 들어올림
                        const r = Math.min(255, img[o]   + 30);
                        const g = Math.min(255, img[o+1] + 40);
                        const b = Math.min(255, img[o+2] + 60);
                        this._ambient.push({
                            x: x0 + lx, y: y0 + ly,
                            vx: (Math.random() - 0.5) * 16 - dir * 28 * moving, // 이동 시 뒤로 흩날림
                            vy: (Math.random() * 4 - 2),                        // 제자리 높이 유지하다 중력에 낙하
                            age: 0, maxlife: 0.7 + Math.random() * 0.9,
                            r, g, b,
                        });
                    }
                }
            }
        }

        // ── 업데이트: 중력 가속 → 포물선 낙하 ──
        for (let i = this._ambient.length - 1; i >= 0; i--) {
            const q = this._ambient[i];
            q.vy += SAND_GRAVITY * dtSec;
            q.x  += q.vx * dtSec;
            q.y  += q.vy * dtSec;
            q.age += dtSec;
            if (q.age >= q.maxlife || q.y > H + 6) this._ambient.splice(i, 1);
        }
    }

    _drawAmbientSand(ctx) {
        const G = SAND_FALL_G;
        for (const p of this._ambient) {
            const t = p.age / p.maxlife;                       // 0→1
            // 디지털: 또렷하게 유지하다 끝에서만 페이드 (소프트 팝 없음)
            const a = (t > 0.7 ? (1 - (t - 0.7) / 0.3) : 1) * 0.95;
            if (a <= 0.04) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
            // 그리드 정렬 → 디지털 블록 느낌
            ctx.fillRect(((p.x / G) | 0) * G, ((p.y / G) | 0) * G, G, G);
        }
        ctx.globalAlpha = 1;
    }

    // 배경(L1) 픽셀이 위로 천천히 피어오르는 모래알 — 분위기
    // 색 샘플은 직전 프레임 통합버퍼(_fx)의 근경 밴드에서(1×1 readback 스톨 제거). 근경 parallax=1 → 화면x↔밴드 정합.
    _updateBgMotes(dt) {
        const dtSec = dt / 1000;
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const fx = this._fx;   // update는 render 전 → 직전 프레임 패킹분 (앰비언트라 1프레임 지연 무관)
        if (fx) {
            const fd = fx.fd, S = fx.fxW;
            this._bgMoteAcc += BG_MOTE_RATE * dtSec;
            let guard = 0;
            while (this._bgMoteAcc >= 1 && guard++ < 40) {
                this._bgMoteAcc -= 1;
                const x = (Math.random() * W) | 0;
                const y = (H * 0.45 + Math.random() * H * 0.55) | 0;   // 중하단에서 피어오름
                const bi = (((y >> 1) * S) + (x >> 1)) << 2;           // 근경 밴드(band1L) 반해상 좌표
                if (fd[bi + 3] < 16) continue;                         // 근경 실루엣 있는 곳만
                this._bgMotes.push({
                    x, y,
                    vy: -(8 + Math.random() * 22),       // 위로
                    vx: (Math.random() - 0.5) * 8,
                    age: 0, maxlife: 1.2 + Math.random() * 1.8,
                    r: Math.min(255, fd[bi] + 70), g: Math.min(255, fd[bi + 1] + 64), b: Math.min(255, fd[bi + 2] + 54),
                });
            }
        }
        for (let i = this._bgMotes.length - 1; i >= 0; i--) {
            const m = this._bgMotes[i];
            m.y += m.vy * dtSec; m.x += m.vx * dtSec; m.age += dtSec;
            if (m.age >= m.maxlife || m.y < -4) this._bgMotes.splice(i, 1);
        }
    }

    _drawBgMotes(ctx) {
        for (const m of this._bgMotes) {
            const t = m.age / m.maxlife;
            const a = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.55;   // 은은하게 페이드
            if (a <= 0.03) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${m.r},${m.g},${m.b})`;
            ctx.fillRect(m.x | 0, m.y | 0, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // 프레임당 FX 소스 readback 통합기 —
    // 근경림(L1 알파·L0 색, 반해상) + 캐릭터영역(L0 색·L2 본체, 1:1) 을 한 캔버스에 패킹해
    // getImageData 1회로 읽는다. 기존: nearRim 2회 + charRegion 2회 = 프레임당 4회 GPU 스톨 → 1회.
    // 각 소비자에 넘기는 픽셀 바이트는 기존과 동일(같은 다운스케일/1:1 복사) → 룩 변화 없음.
    _buildFxSrc(W, H) {
        const e = this.engine;
        const L0 = e.layers.getCanvas(0), L1 = e.layers.getCanvas(1), L2 = e.layers.getCanvas(2);
        if (!L0 || !L1) { this._fx = null; return; }
        const px1 = e.layers.get(1)?.parallax ?? 1;
        const px0 = e.layers.get(0)?.parallax ?? 0.3;
        const hw = W >> 2, hh = H >> 2;   // 근경림 소스 = 쿼터해상도 (readback·루프 대폭↓, 밤 역광은 부드러운 글로우라 영향 미미). 캐릭터 영역은 아래 풀해상 유지.
        const sx1 = Math.min(Math.max(0, Math.floor(e.cameraX * px1)), Math.max(0, L1.width - W));
        const sx0 = Math.min(Math.max(0, Math.floor(e.cameraX * px0)), Math.max(0, L0.width - W));

        // 캐릭터 영역 좌표 (_readCharRegion 폴백과 동일 규칙)
        let cr = null;
        const p = this._player;
        if (p && L2) {
            const psx = (p.x - e.cameraX) | 0;
            const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
            const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
            const rw = x1 - x0, rh = y1 - y0;
            if (rw > 0 && rh > 0) {
                let bgsx = Math.floor(e.cameraX * px0) + x0; if (bgsx < 0) bgsx = 0;
                const lw = Math.max(1, Math.min(rw, L0.width - bgsx));
                cr = { x0, y0, rw, rh, lw, bgsx };
            }
        }

        // 패킹 캔버스: 상단 band1(반해상 L1|L0), 하단 band2(캐릭터 L0|L2)
        const fxW = Math.max(hw << 1, cr ? cr.lw + cr.rw : 1);
        const fxH = hh + (cr ? cr.rh : 0);
        const cv = this._fxCanvas || (this._fxCanvas = document.createElement('canvas'));
        if (cv.width !== fxW || cv.height !== fxH) { cv.width = fxW; cv.height = fxH; }
        const fctx = this._fxCtx || (this._fxCtx = cv.getContext('2d', { willReadFrequently: true }));
        fctx.imageSmoothingEnabled = true;   // 근경림 반해상 다운스케일 (기존 c0/c1 기본값과 동일)
        fctx.clearRect(0, 0, fxW, fxH);
        fctx.drawImage(L1, sx1, 0, W, H, 0,  0, hw, hh);   // band1L: 근경 알파
        fctx.drawImage(L0, sx0, 0, W, H, hw, 0, hw, hh);   // band1R: 원경 색
        if (cr) {
            fctx.drawImage(L0, cr.bgsx, cr.y0, cr.lw, cr.rh, 0,     hh, cr.lw, cr.rh);   // band2L: 캐릭터 뒤 원경색
            fctx.drawImage(L2, cr.x0,   cr.y0, cr.rw, cr.rh, cr.lw, hh, cr.rw, cr.rh);   // band2R: 캐릭터 본체
        }
        let fd;
        try { fd = fctx.getImageData(0, 0, fxW, fxH).data; }
        catch (_) { this._fx = null; return; }

        // 캐릭터 영역을 타이트 배열로 재포장 (소비자 선형 인덱싱·putImageData 호환 → 바이트 동일)
        let char = null;
        if (cr) {
            const { lw, rw, rh } = cr;
            const l1d = new Uint8ClampedArray(lw * rh * 4);
            for (let y = 0; y < rh; y++) {
                const s = ((hh + y) * fxW) << 2;
                l1d.set(fd.subarray(s, s + (lw << 2)), (y * lw) << 2);
            }
            const l2img = new ImageData(rw, rh);
            const l2d = l2img.data;
            for (let y = 0; y < rh; y++) {
                const s = ((hh + y) * fxW + lw) << 2;
                l2d.set(fd.subarray(s, s + (rw << 2)), (y * rw) << 2);
            }
            char = { x0: cr.x0, y0: cr.y0, rw, rh, lw, l1d, l2img };
        }
        this._fx = { fd, fxW, hw, hh, char };
        this._fxStamp = this._renderStamp;
    }

    // 캐릭터 영역의 L0(원경 색)·L2(캐릭터) 픽셀. 같은 프레임 _buildFxSrc 패킹분이 있으면 공유(readback 0),
    // 없으면(인트로 등 단독 경로) 자체 1회 읽기로 폴백. reveal·rim·trail이 공유.
    _readCharRegion(W, H) {
        if (this._fx && this._fxStamp === this._renderStamp) return this._fx.char;
        const e = this.engine; const p = this._player;
        // env(림/리빌의 배경색) = 원경(L0). 근경(L1)은 검은 실루엣이라 색이 없음.
        // → 캐릭터 뒤에 실제로 보이는 색(원경: 노을·도시 불빛)을 픽셀별로 받는다.
        const Lbg = e.layers.getCanvas(0), L2 = e.layers.getCanvas(2);
        if (!p || !Lbg || !L2) return null;
        const psx = (p.x - e.cameraX) | 0;
        const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
        const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
        const rw = x1 - x0, rh = y1 - y0;
        if (rw <= 0 || rh <= 0) return null;
        const parallax = e.layers.get(0)?.parallax ?? 0.3;   // 원경 패럴랙스
        let bgsx = Math.floor(e.cameraX * parallax) + x0; if (bgsx < 0) bgsx = 0;
        const lw = Math.max(1, Math.min(rw, Lbg.width - bgsx));
        try {
            const l1d   = Lbg.getContext('2d').getImageData(bgsx, y0, lw, rh).data;
            const l2img = L2.getContext('2d').getImageData(x0, y0, rw, rh);
            return { x0, y0, rw, rh, lw, l1d, l2img };
        } catch (_) { return null; }
    }

    // 근경(L1 검은 실루엣) 가장자리에 원경(L0) 빛을 역광으로 입힘 → 평평한 실루엣에 입체감/공간감.
    // env(뒤 색) = 원경, 대상 = 근경 엣지. 뒤가 밝을수록(불빛·노을) 강하게 빛나고 어두우면 안 빛남.
    _renderNearRim(ctx, W, H) {
        const fx = this._fx;
        if (!fx) return;                    // 통합 readback(_buildFxSrc) 미준비 시 스킵
        const p = this._p;
        const mul = this._curRimMul ?? 1;   // 맵별 배율 (밝은 원경 맵은 낮게)
        const STR = (p.nearRimBase + (p.nearRimNight - p.nearRimBase) * (this._fxK ?? 0)) * mul; // 낮 약, 밤 강
        if (STR <= 0.02) return;
        // ── 통합 버퍼에서 직접 읽음: 근경 알파=band1L(0,0), 원경 색=band1R(hw,0), stride=fxW ──
        // (소스 픽셀은 기존 s1/s0 반해상 다운스케일과 동일 → 결과 화질 동일)
        const fd = fx.fd, S = fx.fxW, hw = fx.hw, hh = fx.hh;
        const cv = this._nrCanvas || (this._nrCanvas = document.createElement('canvas'));
        if (cv.width !== hw || cv.height !== hh) { cv.width = hw; cv.height = hh; }
        const nctx = cv.getContext('2d');
        const out = nctx.createImageData(hw, hh);
        const od = out.data;
        const rowS = S << 2;        // 패킹 버퍼 한 행 (= R=1 이웃)
        const farOff = hw << 2;     // 원경 밴드 x오프셋 (band1R)
        for (let y = 0; y < hh; y++) {
            for (let x = 0; x < hw; x++) {
                const ni = (y * S + x) << 2;                              // 근경 알파 (band1L)
                if (fd[ni + 3] < 40) continue;                            // 근경 불투명만
                const l = x > 0 ? fd[ni - 4 + 3] : 0;
                const r = x < hw - 1 ? fd[ni + 4 + 3] : 0;
                const u = y > 0 ? fd[ni - rowS + 3] : 0;
                const dn = y < hh - 1 ? fd[ni + rowS + 3] : 0;
                if (l >= 40 && r >= 40 && u >= 40 && dn >= 40) continue;   // 엣지만
                const fi = ni + farOff;                                    // 원경 색 (band1R)
                const fr = fd[fi], fg = fd[fi + 1], fb = fd[fi + 2];
                const lum = fr * 0.299 + fg * 0.587 + fb * 0.114;
                if (lum < 24) continue;                                   // 뒤 어두우면 역광 없음
                let a = STR * (lum < 200 ? lum / 200 : 1) * 0.6;
                if (a <= 0.02) continue; if (a > 1) a = 1;
                const oi = (y * hw + x) << 2;                              // out 타이트 버퍼
                od[oi] = fr; od[oi + 1] = fg; od[oi + 2] = fb; od[oi + 3] = (a * 255) | 0;
            }
        }
        nctx.putImageData(out, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';   // 가산 → 빛이 더해짐
        ctx.imageSmoothingEnabled = true;            // 부드럽게 업스케일
        ctx.drawImage(cv, 0, 0, hw, hh, 0, 0, W, H);
        ctx.restore();
    }

    // 캐릭터 본체 색상 조절 + 배경색 흡수 (비침 방지). reg = _readCharRegion() 공유 데이터.
    _renderCharReveal(ctx, reg, l2, W, H) {
        if (!reg) { if (l2) ctx.drawImage(l2, 0, 0, W, H, 0, 0, W, H); return; }
        const { x0, y0, rw, rh, l1d, l2img } = reg;
        // 배경(L1) 평균 색/밝기
        let bgR = 0, bgG = 0, bgB = 0, avgLum = 0, count = 0;
        for (let i = 0; i < l1d.length; i += 16) {
            bgR += l1d[i]; bgG += l1d[i + 1]; bgB += l1d[i + 2];
            avgLum += (l1d[i] * 0.299 + l1d[i + 1] * 0.587 + l1d[i + 2] * 0.114) / 255; count++;
        }
        if (count > 0) { bgR /= count; bgG /= count; bgB /= count; avgLum /= count; }
        this._lastAvgLum = avgLum;   // 총 다크닝(공격 중)이 동일 배경밝기 재사용
        const cd = l2img.data;
        const k = this._fxK ?? 1.0;
        const nightReveal = this._p.revBase + this._p.revLumScale * Math.min(1, avgLum * 1.6);  // 밤 리빌(배경 밝기 비례) — fx_params.csv
        const reveal = 1 - (1 - nightReveal) * k;                       // 낮→1.0, 밤→nightReveal
        const blendFactor = this._p.revBlend * k;                       // 밤에 배경색 융합 비율
        for (let ly = 0; ly < rh; ly++) {
            for (let lx = 0; lx < rw; lx++) {
                const ci = (ly * rw + lx) << 2;
                if (cd[ci + 3] < 8) continue;
                const rVal = cd[ci] * reveal, gVal = cd[ci + 1] * reveal, bVal = cd[ci + 2] * reveal;
                cd[ci]     = (rVal * (1 - blendFactor) + bgR * blendFactor) | 0;
                cd[ci + 1] = (gVal * (1 - blendFactor) + bgG * blendFactor) | 0;
                cd[ci + 2] = (bVal * (1 - blendFactor) + bgB * blendFactor) | 0;
                cd[ci + 3] = 255;   // 불투명 강제 (밝기만 낮춤, 투명도 X)
            }
        }
        let tmp = this._charTmp || (this._charTmp = document.createElement('canvas'));
        tmp.width = rw; tmp.height = rh;
        tmp.getContext('2d').putImageData(l2img, 0, 0);
        ctx.drawImage(tmp, x0, y0);
    }

    // 캐릭터 외곽 역광 rim — 뒤 배경(L1) 색 픽셀별 샘플 + 우상단 광원 방향 + 두께(밤일수록↑). reg 공유.
    // (reveal이 l2img RGB를 수정하지만 rim은 알파만 읽으므로 공유 안전)
    _renderCharRim(ctx, reg) {
        if (!reg) return;
        const p = this._p;                            // 림 수치 = fx_params.csv
        const N = (p.rimWidth | 0) + Math.round(this._rimF ?? 0);   // rim 폭 (밤일수록 +1)
        const PEAK = p.rimPeak * (this._rimF ?? 0);   // 림 최대 세기
        if (PEAK <= 0.02) return;
        const Lx = 0.7071, Ly = -0.7071;              // 우상단 광원(역광)
        const bt = this._bgTone || { r: 164, g: 127, b: 91 };
        const flR = bt.r * p.rimFloorMul, flG = bt.g * p.rimFloorMul, flB = bt.b * p.rimFloorMul;  // floor = 배경톤 (어두운 배경 앞에서도 보이게)
        const { x0, y0, rw, rh, lw, l1d, l2img } = reg;
        const l2d = l2img.data;
        const A = (lx, ly) => (lx < 0 || lx >= rw || ly < 0 || ly >= rh) ? 0 : l2d[((ly * rw + lx) << 2) + 3];
        for (let ly = 0; ly < rh; ly++) {
            for (let lx = 0; lx < rw; lx++) {
                if (A(lx, ly) < 40) continue;
                if (A(lx-N,ly)>=40 && A(lx+N,ly)>=40 && A(lx,ly-N)>=40 && A(lx,ly+N)>=40) continue;
                let d = 0;
                for (let r = 1; r <= N; r++) {
                    if (A(lx-r,ly)<40||A(lx+r,ly)<40||A(lx,ly-r)<40||A(lx,ly+r)<40||A(lx-r,ly-r)<40||A(lx+r,ly-r)<40||A(lx-r,ly+r)<40||A(lx+r,ly+r)<40) { d = r; break; }
                }
                if (!d) continue;
                const gx = A(lx+2,ly) - A(lx-2,ly), gy = A(lx,ly+2) - A(lx,ly-2);
                const ox = -gx, oy = -gy; const ln = Math.hypot(ox, oy); let dir = 0;
                if (ln > 0) dir = Math.max(0, (ox/ln)*Lx + (oy/ln)*Ly);
                const falloff = 1 - (d - 1) / N;
                const a = PEAK * (0.35 + 0.65 * falloff) * (p.rimDirBase + (1 - p.rimDirBase) * dir); // 빛 방향(우상단) 가중
                if (a <= 0.03) continue;
                const bi = (ly * lw + Math.min(lx, lw - 1)) << 2;
                const r0 = Math.min(255, Math.max(l1d[bi]   * 1.8, flR)) | 0;   // env(배경색×1.8) + floor
                const g0 = Math.min(255, Math.max(l1d[bi+1] * 1.8, flG)) | 0;
                const b0 = Math.min(255, Math.max(l1d[bi+2] * 1.8, flB)) | 0;
                ctx.globalAlpha = a;
                ctx.fillStyle = `rgb(${r0},${g0},${b0})`;
                ctx.fillRect(x0 + lx, y0 + ly, 1, 1);
            }
        }
        ctx.globalAlpha = 1;
    }

    // ── 게임 진입 인트로 연출 ──────────────────────────────────────
    // t: 0~1. 배경은 시그니처 모래-로딩으로 위에서부터 생성, 캐릭터는 픽셀이 흩어진 상태에서 모여 형성.
    _renderIntro(ctx, W, H, t) {
        // 1) 배경 모래-생성 (sand_top 스타일): 아직 안 생긴 픽셀 = 모래 바탕색. 0~0.7 구간.
        const bgShown = Math.min(1, t / 0.70);
        if (bgShown < 1) {
            const BR = SAND_BASE_RGB[0], BG = SAND_BASE_RGB[1], BB = SAND_BASE_RGB[2];
            const img = ctx.getImageData(0, 0, W, H); const d = img.data;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const n = sandHash(x >> 2, y >> 2);            // 4px 알갱이
                    const thr = (y / H) * 0.6 + n * 0.4;           // 위에서부터 + 노이즈
                    if (bgShown < thr) { const i = (y * W + x) << 2; d[i] = BR; d[i + 1] = BG; d[i + 2] = BB; d[i + 3] = 255; }
                }
            }
            ctx.putImageData(img, 0, 0);
        }
        // 2) 캐릭터: 모래가 모여 모양 형성 → 실제색 (0.3~1.0 구간, 배경 생성과 겹침)
        const chT = (t - 0.3) / 0.7;
        if (chT > 0) {
            const reg = this._readCharRegion(W, H);
            if (reg) this._renderCharGather(ctx, reg, Math.min(1, chT));
        }
    }

    // 2단계 형성: (A) 넓게 퍼진 모래가 아래→위로 쌓여 '사람 모양(모래색 실루엣)' 완성
    //            (B) 모양 완성 후 실제 캐릭터 색으로 드러남
    _renderCharGather(ctx, reg, t) {
        const { x0, y0, rw, rh, l2img } = reg;
        const d = l2img.data;
        const NT = SAND_TONES_RGB.length;
        const SHAPE = 0.58;                                   // 0~SHAPE: 모양형성 / SHAPE~1: 색 전환
        const posPhase = Math.min(1, t / SHAPE);             // 모래 모여 모양 만드는 진행
        const colPhase = Math.max(0, (t - SHAPE) / (1 - SHAPE)); // 모래색→실제색 진행
        ctx.save();
        for (let ly = 0; ly < rh; ly++) {
            for (let lx = 0; lx < rw; lx++) {
                const ci = (ly * rw + lx) << 2;
                if (d[ci + 3] < 8) continue;
                const h  = sandHash(lx * 1.7, ly * 1.3);
                const h2 = sandHash(lx * 3.1 + 5, ly * 2.3 + 9);
                // 아래쪽부터 쌓임(bottom-up). 위로 갈수록 늦게 정착.
                const delay = (1 - ly / rh) * 0.5 + h * 0.12;
                let lt = (posPhase - delay) / (1 - delay); lt = lt < 0 ? 0 : lt > 1 ? 1 : lt;
                lt = lt * lt * (3 - 2 * lt);                  // ease
                const s = 1 - lt;                            // 1=흩어짐 → 0=정착
                // 넓게 퍼진 모래 위치
                const spread = rw * 0.8 + 100;
                const fx = x0 + lx + (h - 0.5) * spread * s + Math.sin(h2 * 25 + s * 8) * 14 * s;
                const fy = y0 + ly - s * (rh * 0.55) + Math.cos(h * 19) * 8 * s;
                // 색: (A) 모래색으로 모양 형성 → (B) colPhase로 실제색 드러남 (정착된 픽셀만)
                const tc = SAND_TONES_RGB[(h2 * NT) | 0];
                const reveal = colPhase * lt;                // 모양 완성(lt=1)된 곳부터 실제색으로
                const r = tc[0] * (1 - reveal) + d[ci]     * reveal;
                const g = tc[1] * (1 - reveal) + d[ci + 1] * reveal;
                const b = tc[2] * (1 - reveal) + d[ci + 2] * reveal;
                ctx.globalAlpha = Math.min(1, 0.35 + lt * 0.65);
                ctx.fillStyle = `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
                ctx.fillRect(fx | 0, fy | 0, 1, 1);
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // (미사용 제거됨: _renderCharEdge / _spawnIdleParticles / _updateIdleParticles — 2026-06-03 정리)

    // 발밑 그림자 — 캐릭터 넓이 기준(작게). 정지=픽셀 깨짐 가장자리 / 이동=블러 모션
    _drawShadow(ctx) {
        const e = this.engine; const p = this._player;
        if (!p) return;
        const cx = p.x - e.cameraX + p.pw / 2;
        const cy = this._groundY + p.ph - 5;          // 발밑
        const rx = p.pw * 0.36;                  // 캐릭터 넓이 기준 (크게)
        const ry = 12;
        const moving = this._sandI > 0.05;
        if (moving) {
            // 이동: 블러 모션 그림자 (진행할수록 늘어나고 흐려짐)
            const sn = Math.min(1, this._sandSpeed / MOVE_SPEED);
            ctx.save();
            ctx.globalAlpha = 0.36;
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${(3 + 5 * sn) | 0}px)`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx * (1 + 0.7 * sn), ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.filter = 'none';
            ctx.restore();
        } else {
            // 정지: 픽셀 그레인 — 중심 진하고 가장자리 깨지며 사라짐
            const a0 = Math.min(1, this._idleT / 0.5);
            if (a0 <= 0.02) return;
            const G = 4;
            ctx.save();
            ctx.fillStyle = '#000';
            for (let dy = -ry; dy <= ry; dy += G) {
                for (let dx = -Math.ceil(rx); dx <= rx; dx += G) {
                    const nx = dx / rx, ny = dy / ry;
                    const dist = nx * nx + ny * ny;
                    if (dist > 1) continue;
                    const dens = 1 - dist;                          // 중심 1 ~ 가장자리 0
                    if (sandHash((dx / G) | 0, (dy / G) | 0) > dens) continue;  // 가장자리 깨짐
                    ctx.globalAlpha = 0.5 * a0;
                    ctx.fillRect((cx + dx) | 0, (cy + dy) | 0, G, G);
                }
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    _drawIdleParticles(ctx) {
        for (const q of this._idleParticles) {
            const a = Math.max(0, 1 - q.age / q.maxlife) * 0.7;
            if (a <= 0.02) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${q.r},${q.g},${q.b})`;
            ctx.fillRect(q.x | 0, q.y | 0, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    // 캐릭터 뒤로 모션 트레일 — 진행 반대로 옅어지는 가산 푸른 잔광. reg(_readCharRegion) 공유 데이터 사용.
    _renderCharTrail(ctx, reg) {
        if (!reg) return;
        const speedNorm = Math.min(1, this._sandSpeed / MOVE_SPEED);
        if (speedNorm < 0.05) return;
        const dir  = this._sandDir;                  // +1 오른쪽 → 트레일은 왼쪽(-dir)
        const N    = Math.round(3 + 5 * speedNorm);  // 속도↑ → 트레일 길게
        const STEP = 4 + 8 * speedNorm;              // 잔상 간격
        const G    = 3;                              // 입자 크기
        const { x0, y0, rw, rh, l2img } = reg;       // 캐릭터 영역만 (전체화면 X)
        const img  = l2img.data;
        // 채도 낮춘 푸른 잔광을 가산(lighter) 합성 → 어두운 배경에서도 보이고 캐릭터 풀컬러가 안 튐
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = N; k >= 1; k--) {               // 뒤(옅음) → 앞(진함)
            const ox  = -dir * Math.round(k * STEP);
            const cov = (1 - k / (N + 1)) * speedNorm; // 뒤로 갈수록 입자 듬성
            const a   = cov * 0.85;
            if (a <= 0.02) continue;
            ctx.globalAlpha = a;
            for (let ly = 0; ly < rh; ly += G) {
                for (let lx = 0; lx < rw; lx += G) {
                    const i = (ly * rw + lx) << 2;
                    if (img[i + 3] < 16) continue;             // 캐릭터 픽셀만
                    if (sandHash((x0 + lx) / G + k * 13, (y0 + ly) / G) > cov) continue;
                    const lum = img[i] * 0.3 + img[i + 1] * 0.5 + img[i + 2] * 0.2;
                    const v   = 14 + lum * 0.16;               // 가산량(은은). floor 14로 어둠에서도 보임
                    ctx.fillStyle = `rgb(${v | 0},${(v * 1.05) | 0},${(v * 1.25) | 0})`;
                    ctx.fillRect(x0 + lx + ox, y0 + ly, G, G);
                }
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // 그 변에 더 펼쳐질 월드가 있는지 (좌우만 — 위/아래는 월드 없음)
    _edgeActive(side) {
        const e = this.engine;
        const maxCam = Math.max(0, (this._worldW ?? WORLD_WIDTH) - e.gameWidth);
        const cam = e.cameraX;
        if (side === 'left')  return cam > 1;            // 왼쪽에 더 보여줄 월드 있음
        if (side === 'right') return cam < maxCam - 1;   // 오른쪽에 더 있음
        return false;
    }

    // 좌/우 가장자리만 픽셀 침식 (위·아래 없음). 월드가 더 있는 변에서만.
    _renderEdgeFrame(ctx, W, H) {
        const inten   = this._sandI;
        const FRAME   = Math.round(3 + 3 * inten);   // 절반: 기본 3px, 이동 시 최대 6px
        const G       = 3;
        const NT      = SAND_TONES_RGB.length;
        const leftOn  = this._edgeActive('left');
        const rightOn = this._edgeActive('right');
        if (!leftOn && !rightOn) return;
        ctx.save();
        for (let y = 0; y < H; y += G) {
            for (let x = 0; x < W; x += G) {
                let d, active;
                if (x < FRAME)            { d = x;          active = leftOn; }
                else if (x >= W - FRAME)  { d = W - 1 - x;  active = rightOn; }
                else continue;                           // 중앙·상하 제외
                if (!active) continue;
                let t = d / FRAME; t = t * t * (3 - 2 * t);
                if (sandHash(x / G, y / G) < (1 - t)) {   // 가장자리일수록 잘 깨짐 → 검정
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x, y, G, G);
                }
            }
        }
        ctx.restore();
    }

    // ── SandScroll: 진행 방향 가장자리에서 배경이 모래로 생성/소멸 ──────
    _renderSandScroll(ctx, W, H) {
        const engine = this.engine;
        const band = Math.round(W * SAND_BAND_MAX * this._sandRamp);  // 빌드업(걷기2초/달리기즉시)
        if (band < 2) return;

        const L1 = engine.layers.getCanvas(1);
        if (!L1) return;
        const lctx = L1.getContext('2d');
        const cam  = Math.floor(engine.cameraX);

        ctx.globalAlpha = 1;
        // 진행 방향 = 선행(생성) / 반대 = 후행(소멸). 단, 그쪽에 월드가 더 있을 때만.
        const dir = this._sandDir;
        const leftRole  = dir > 0 ? 'trail' : 'lead';
        const rightRole = dir > 0 ? 'lead'  : 'trail';
        if (this._edgeActive('left'))  this._sandBand(ctx, lctx, cam, 0,        band, H, 'left',  leftRole);
        if (this._edgeActive('right')) this._sandBand(ctx, lctx, cam, W - band, band, H, 'right', rightRole);
    }

    // 가장자리에서 이미지가 "검은 픽셀"로 갉아먹히며 생성/소멸 (검정만, 모래색 없음)
    // side: 'left'|'right' / role: 'lead'(생성=빨리 채워짐) | 'trail'(소멸=검정 많이)
    _sandBand(ctx, lctx, cam, x0, bw, H, side, role) {
        let sx = cam + x0;
        if (sx < 0) sx = 0;
        const src = lctx.getImageData(sx, 0, bw, H);
        const out = ctx.createImageData(bw, H);
        const od  = out.data;
        od.set(src.data);                                // 이미지 그대로 복사
        const bwm = bw - 1;
        const G   = SAND_GRAIN;
        const isLead = role === 'lead';
        const NT = SAND_TONES_RGB.length;
        const sd = src.data;                              // 원본 이미지 픽셀

        for (let ly = 0; ly < H; ly += G) {
            for (let lx = 0; lx < bw; lx += G) {
                const distOuter = (side === 'left') ? lx : (bwm - lx);
                let f = bwm > 0 ? distOuter / bwm : 1;
                f = f * f * (3 - 2 * f);                  // 0=바깥(가장자리), 1=안쪽(화면)
                const wcx = ((sx + lx) / G) | 0, wcy = (ly / G) | 0;
                const h   = sandHash(wcx, wcy);
                // 셀마다 임계가 달라 순차 생성. 선행(생성)=바깥부터 빨리 / 후행(소멸)=늦게까지 모래.
                // thr 범위 0~0.7 → f=1(안쪽)에서 모든 셀이 완성되어 화면과 이음새 없음.
                const thr = isLead ? (h * 0.5) : (0.2 + h * 0.5);
                let rev = (f - thr) / 0.30;               // 모래(0) → 이미지(1) 연속 블렌드
                rev = rev <= 0 ? 0 : rev >= 1 ? 1 : rev * rev * (3 - 2 * rev);
                if (rev >= 0.999) continue;               // 완전 이미지 → 원본 그대로
                // 매질 = 검정만 (모래색·반짝임 미사용). rev: 0=검정 → 1=이미지. 검정 불투명도로 자연 침식
                for (let dy = 0; dy < G && ly + dy < H; dy++) {
                    const rowBase = (ly + dy) * bw;
                    for (let dx = 0; dx < G && lx + dx < bw; dx++) {
                        const oi = (rowBase + lx + dx) << 2;
                        od[oi]     = (sd[oi]     * rev) | 0;
                        od[oi + 1] = (sd[oi + 1] * rev) | 0;
                        od[oi + 2] = (sd[oi + 2] * rev) | 0;
                        od[oi + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(out, x0, 0);
    }

    // ── Convergence 픽셀 수렴/방산 (SceneManager 로직 이식) ──────────
    _drawConvergence(ctx, W, H, t) {
        if (t < 0.5) {
            if (!this._tr._pxOut) this._tr._pxOut = this._capturePx(ctx, W, H, 'in');
            this._renderPx(ctx, W, H, this._tr._pxOut, t * 2, 'in');   // 수렴
        } else {
            if (!this._tr._pxIn) this._tr._pxIn = this._capturePx(ctx, W, H, 'out');
            this._renderPx(ctx, W, H, this._tr._pxIn, (t - 0.5) * 2, 'out'); // 방산
        }
    }

    _capturePx(ctx, W, H, dir) {
        const cx = W * 0.5, cy = H * 0.5;
        const data = ctx.getImageData(0, 0, W, H).data;
        const STRIDE = Math.max(2, Math.round(Math.sqrt(W * H / 10000)));
        const particles = [];
        for (let y = 0; y < H; y += STRIDE) {
            for (let x = 0; x < W; x += STRIDE) {
                const i = (y * W + x) * 4;
                if (data[i + 3] < 8) continue;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if (r === 0 && g === 0 && b === 0 && Math.random() < 0.6) continue;
                const delay = Math.random() * 0.35;
                if (dir === 'in') particles.push({ sx: x, sy: y, ex: cx, ey: cy, r, g, b, delay });
                else              particles.push({ sx: cx, sy: cy, ex: x, ey: y, r, g, b, delay });
            }
        }
        return { particles, STRIDE };
    }

    _renderPx(ctx, W, H, pxData, t, dir) {
        if (!pxData._buf) pxData._buf = ctx.createImageData(W, H);
        const buf = pxData._buf.data;
        buf.fill(0);
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
        const S = pxData.STRIDE;
        for (const p of pxData.particles) {
            const lt = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
            const eased = dir === 'in' ? (lt * lt * lt) : (1 - Math.pow(1 - lt, 3));
            const px = Math.round(p.sx + (p.ex - p.sx) * eased);
            const py = Math.round(p.sy + (p.ey - p.sy) * eased);
            for (let dy = 0; dy < S; dy++) {
                for (let dx = 0; dx < S; dx++) {
                    const bx = px + dx, by = py + dy;
                    if (bx < 0 || bx >= W || by < 0 || by >= H) continue;
                    const bi = (by * W + bx) * 4;
                    buf[bi] = p.r; buf[bi + 1] = p.g; buf[bi + 2] = p.b; buf[bi + 3] = 255;
                }
            }
        }
        ctx.putImageData(pxData._buf, 0, 0);
    }

    _ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    onExit() {
        this.engine.lighting.clearLights();
    }
}
