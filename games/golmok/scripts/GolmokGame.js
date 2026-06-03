import { Scene } from '../../../engine/scene/SceneManager.js';
import { SAND_BASE_RGB, SAND_TONES_RGB } from '../../../engine/SandPalette.js';

const MOVE_SPEED  = 180;   // px/sec (1.5배↑ — walk fps도 12→18 동기화)
const WORLD_WIDTH = 2560;
const GROUND_Y    = 412;   // 발끝 = 412+405 = 817 (캐릭터 1.5배 높이 405, 바닥선 817 유지)

// ── 배경 순환 ───────────────────────────────────────────────────────
const BG_LIST     = ['1960_1', '1970_1', '1980_1', '2020_1']; // 세로 4장 (pixels/objects, 1706×960)
const BG_PID      = '1974';
const BG_INTERVAL = 10000;  // 10초마다 다음 배경
const BG_TRANS_MS = 2000;   // 전환 시간 (2초)
const CYCLE_ENABLED = true;  // 화면 끝 도달 시 다음 배경으로 sandburst 전환 ON
const DIGITAL_ENABLED = false; // 디지털 회로/메시 오버레이 ON/OFF (저장만, 지금은 OFF)
const FOG_ENABLED = false;     // 안개(절차적 + 드리프트 구름) ON/OFF (지금은 OFF)

// 전환 효과를 차례대로 순환 — 새로 만든 모래 생성형 3종 테스트
const FX_LIST     = ['sand_top', 'sand_sides', 'wave'];

// ── SandScroll (모래 생성/소멸 스크롤) 프로토타입 파라미터 ───────────
const SAND_ENABLED   = true;
const CHAR_DISSOLVE_ENABLED = false; // 캐릭터 외곽 모래 중력낙하 디졸브 (요청: 가림)
const INTRO_MS       = 1500;  // 게임 진입 인트로: 배경 모래-로딩 + 캐릭터 픽셀 모이기 연출 시간
const SAND_BAND_MAX  = 0.022; // 최대 띠 폭 (화면 비율) — 1/3로 축소 (오빠의 튜닝 사양)
const SAND_GRAIN     = 4;     // 모래 입자 크기 px
const SAND_SETTLE_MS = 280;   // 멈출 때 굳는(가라앉는) 시간
const SAND_BUILDUP_MS = 2000; // 걷기 시작 → 최대 크기까지 빌드업 (2초). 달리면 즉시.

// 앰비언트 — 가만히 있어도 픽셀이 톡톡 떨어지는 모래알
const SAND_FALL_RATE = 70;    // 초당 떨어져 나가는 디지털 픽셀 수
const SAND_FALL_G    = 4;     // 디지털 블록 크기 px (그리드 정렬)
const SAND_GRAVITY   = 130;   // 중력 가속 px/s² — 포물선 낙하
const BG_MOTE_RATE   = 32;    // 배경에서 위로 피어오르는 모래알 수/초

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

        // 디지털 오버레이 — 회로/메시 조각이 불규칙하게 일어났다 사라짐
        this._digital = [];
        this._digAcc  = 0;
    }

    onEnter(engine) {
        // 월드 폭 = 씬이 설정한 bounds 사용 (가로/세로 씬마다 다름). 덮어쓰지 않음.
        this._worldW = engine.bounds.worldWidth || WORLD_WIDTH;

        // 엔진 FX 전부 ON (테스트)
        engine.lighting.setAmbient(0.2, '#0a1428');                  // 살짝만 어둡게 (밝은 쪽)
        engine.lighting.clearLights();
        engine.lighting.addLight({ id: 'key', x: 270, y: 300, radius: 340, color: '#ffd060', intensity: 0.95, fixed: true });
        engine.glow.enable();                                        // 발광(인덱스10) — 해당 픽셀 있을 때
        // 캐릭터 rim은 게임측 _renderCharRim 단일 사용 (방향 명확 + 픽셀별 배경색 env + floor).
        // 엔진 rim은 lightDir 반대쪽 엣지에도 그려 게임 rim과 합쳐지면 방향이 뭉개지므로 OFF.
        engine.rim.disable();
        if (FOG_ENABLED) {
            engine.fog.enable();
            engine.fog.enableLayerFog({ startY: 430, endY: 960, color: '#9fb3cc', maxOpacity: 0.5, direction: 'bottom' });
        } else {
            engine.fog.disable();
        }
        engine.vignette.setPreset('warm');                           // 가장자리 비네트

        this._player = engine.entities.get('player');
        if (this._player) {
            this._groundY = this._player.y;                          // 씬 설정에 지정된 초기 y좌표(세로 690, 가로 412 등)를 바닥으로 채택
        }
        this._preload();
        if (FOG_ENABLED) this._loadFog();

        this._intro = { t: 0 };   // 게임 진입 연출 시작 (배경 모래-생성 + 캐릭터 픽셀 모이기)

        // ── 화면 클릭/터치 → 그 지점으로 걸어가기 ──────────────────
        const canvas = engine.canvas;
        if (canvas && !this._clickBound) {
            this._clickBound = true;
            canvas.style.cursor = 'pointer';
            const onPoint = (clientX) => {
                const p = this._player; if (!p) return;
                const rect = canvas.getBoundingClientRect();
                if (rect.width <= 0) return;
                const gx     = (clientX - rect.left) / rect.width * engine.gameWidth; // 화면→논리 X
                const worldX = engine.cameraX + gx;                                   // →월드 X
                this._targetX = Math.max(0, Math.min((this._worldW ?? WORLD_WIDTH) - p.pw, worldX - p.pw / 2));
            };
            canvas.addEventListener('pointerdown', (ev) => onPoint(ev.clientX));
        }
    }

    // 구름-포그 텍스쳐 로드 → 캔버스로 1회 래스터 (앞/뒤 2겹)
    async _loadFog() {
        const defs = [
            { file: 'fog_1', y: -20, dh: 540, speed: 5,  baseAlpha: 0.42 },  // 뒤(위), 느림
            { file: 'fog_2', y: 360, dh: 640, speed: 11, baseAlpha: 0.5  },  // 앞(아래), 빠름
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

    // 배경 1장 비동기 로드 (이미 있거나 로딩 중이면 skip)
    async _ensureBg(name) {
        if (this._bgCache[name]) return;
        if (!this._bgLoading) this._bgLoading = {};
        if (this._bgLoading[name]) return;
        this._bgLoading[name] = true;
        try {
            const r = await fetch(`./pixels/objects/${name}.json`, { cache: 'no-store' });
            if (r.ok) this._bgCache[name] = await r.json();
        } catch (e) { console.warn('[golmok] bg load fail:', name, e); }
        delete this._bgLoading[name];
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

    _swapBg(engine, name) {
        const d = this._bgCache[name];
        if (!d) return;
        // 이전 배경의 오브젝트 전부 해제 (bg_main, player 제외) — 메모리 정리
        for (const id of [...engine.entities._entities.keys()]) {
            if (id !== 'bg_main' && id !== 'player') engine.entities.remove(id);
        }
        engine.entities.remove('bg_main');
        const ent = engine.entities.add('bg_main', {
            x: 0, y: 0, pw: d.width, ph: d.height,
            layer: 1, visible: true,
            _scanline: d.scanline, _palette: d.palette,
        });
        if (ent) { ent.type = name; ent._asset = name; ent._assetCategory = 'objects'; }
        this._bgTone = null;   // 배경 바뀌면 톤 재샘플 → 림/조명 자동 매칭
    }

    // 배경(L1)의 밝은 영역 평균색 = 대표 톤. FX 톤(림 floor·key광)을 배경마다 자동 매칭하는 기준.
    _sampleBgTone(engine) {
        const L1 = engine.layers.getCanvas(1);
        if (!L1 || !L1.width) return;
        try {
            const d = L1.getContext('2d').getImageData(0, 0, L1.width, L1.height).data;
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
        if (dx !== 0) {
            player.x += dx * dtSec;
            player.flipX = dx > 0;                                           // 에셋 기본 시선(왼쪽) 반영하여 방향 전환 (dx > 0 일 때 flip)
            player.x = Math.max(0, Math.min(this._worldW - player.pw, player.x));
            player.setState('walk');
        } else {
            player.setState('idle');
        }
        player.y = this._groundY;                                            // 하드코딩된 GROUND_Y 대신 동적 바닥 높이 적용

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
        const k = 0.5 - 0.5 * Math.cos(this._dayT * (Math.PI * 2 / 60));
        this._fxK = k;

        // 림 = 캐릭터 색상 곡선과 분리. 캐릭터 밝기가 40% 이하로 떨어질 때부터 페이드인.
        const charBright = 1 - (1 - 0.20) * k;                          // 낮 1.0 → 밤 0.20
        let rimF = (0.60 - charBright) / (0.60 - 0.20);                  // 밝기 60%부터 페이드인 (k≈0.5부터)
        rimF = rimF < 0 ? 0 : rimF > 1 ? 1 : rimF;
        this._rimF = rimF;   // 게임측 _renderCharRim 두께/세기에 사용 (엔진 rim은 비활성)
        for (const f of this._fog) f.x += f.speed * dtSec;               // 안개 드리프트
        if (DIGITAL_ENABLED) this._updateDigital(dt);                    // 디지털 패턴 생성/소멸 (현재 OFF)
        const hx = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
        // ── 배경마다 FX 톤 자동 매칭: 배경 대표색에서 밤 key광·어둠색 도출 ──
        if (!this._bgTone) this._sampleBgTone(engine);
        const bt = this._bgTone || { r: 255, g: 200, b: 95 };
        const mx = Math.max(bt.r, bt.g, bt.b, 1);
        const ntr = bt.r / mx * 235, ntg = bt.g / mx * 235, ntb = bt.b / mx * 235;  // 밤 key광 = 배경색(밝게 정규화)
        // 어둠색 = 배경색의 어두운 버전(그림자도 배경 톤 띰)
        engine.lighting.setAmbient(0.5 * k, '#' + hx(bt.r * 0.12 + 6) + hx(bt.g * 0.13 + 8) + hx(bt.b * 0.16 + 16));
        const lr = 185 + (ntr - 185) * k, lg = 215 + (ntg - 215) * k, lb = 255 + (ntb - 255) * k;  // 낮 쿨 → 밤 배경색
        engine.lighting.updateLight('key', { color: '#' + hx(lr) + hx(lg) + hx(lb), intensity: 0.95 * k });
        engine.vignette.setStrength(0.55 * k);                           // 비네트 0↔0.55
        engine.glow._bloomStrength = 0.95 * k;                           // 글로우 0↔0.95
        engine.fog._layerFogOpts.maxOpacity = 0.5 * k;                   // 안개 0↔0.5
        engine.fog._gradCache = null;

        // ── IDLE: 발밑 그림자 누적용 시간만 추적 (픽셀 낙하 효과는 제거) ──
        if (dx === 0) this._idleT += dtSec; else this._idleT = 0;

        // 앰비언트(캐릭터 외곽 디지털 디졸브) + 배경에서 위로 피어오르는 모래알
        if (CHAR_DISSOLVE_ENABLED) this._updateAmbientSand(dt);
        this._updateBgMotes(dt);

        // ── 배경 순환 + 전환 ──────────────────────────────────────
        // CYCLE_ENABLED=false 동안 전체 순환/끝-도달 전환 비활성 (세로 4장 전환은 추후)
        if (!CYCLE_ENABLED || !this._bgReady) return;

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
                    const G = 3, shown = t < 0.5 ? (1 - t / 0.5) : (t - 0.5) / 0.5;
                    const src = ctx.getImageData(0, 0, W, H), sd = src.data;
                    const out = ctx.createImageData(W, H), od = out.data;
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
        } else if (SAND_ENABLED && this._sandRamp > 0.01) {
            this._renderSandScroll(ctx, W, H);
            overlay = true;
        }

        // ── 게임 진입 인트로: 배경 모래-생성 + 캐릭터 픽셀 모이기 ──
        if (this._intro) {
            this._renderIntro(ctx, W, H, this._intro.t);
            return;   // 인트로 중엔 일반 캐릭터/모래알/디지털/포그 스킵
        }

        // 배경에서 위로 피어오르는 모래알 (캐릭터 뒤 분위기)
        this._drawBgMotes(ctx);

        // 발밑 그림자 (항상, 캐릭터 아래) — 정지=픽셀 깨짐 / 이동=블러 모션
        this._drawShadow(ctx);

        // 캐릭터 본체 (그림자 위, 항상 재그림 - 비침 방지 및 배경색 융합 렌더러 적용)
        const moving = this._sandI > 0.05;
        const l2 = this.engine.layers.getCanvas(2);
        const reg = this._readCharRegion(W, H);   // L1+L2 캐릭터 영역 1회 읽기 → trail·reveal·rim 공유
        if (moving) this._renderCharTrail(ctx, reg);
        this._renderCharReveal(ctx, reg, l2, W, H);

        // 캐릭터 외곽 역광 rim — 뒤 배경색을 픽셀별로 받아 가장자리에서 페이드
        this._renderCharRim(ctx, reg);

        // 앰비언트 모래알 (캐릭터 외곽 디지털 디졸브) — 요청으로 OFF
        if (CHAR_DISSOLVE_ENABLED) this._drawAmbientSand(ctx);

        // 디지털 패턴 오버레이 (회로/메시가 불규칙하게 명멸 — 디지털 세계 느낌)
        this._drawDigital(ctx);

        // 드리프트 구름-포그 (몽환적 분위기, FX 세기에 연동)
        this._drawFog(ctx, W, H);

        // 가장자리 픽셀 깨짐 프레임 — 반듯한 사각 테두리를 픽셀아트답게 침식 (이동 시)
        this._renderEdgeFrame(ctx, W, H);
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
    _updateBgMotes(dt) {
        const dtSec = dt / 1000;
        const e = this.engine, W = e.gameWidth, H = e.gameHeight;
        const L1 = e.layers.getCanvas(1);
        const lctx1 = L1 ? L1.getContext('2d') : null;
        if (lctx1) {
            this._bgMoteAcc += BG_MOTE_RATE * dtSec;
            let guard = 0;
            while (this._bgMoteAcc >= 1 && guard++ < 40) {
                this._bgMoteAcc -= 1;
                const x = (Math.random() * W) | 0;
                const y = (H * 0.45 + Math.random() * H * 0.55) | 0;   // 중하단에서 피어오름
                const sx = Math.min(L1.width - 1, Math.max(0, Math.floor(e.cameraX) + x));
                let col; try { col = lctx1.getImageData(sx, y, 1, 1).data; } catch (_) { break; }
                if (col[3] < 16) continue;
                this._bgMotes.push({
                    x, y,
                    vy: -(8 + Math.random() * 22),       // 위로
                    vx: (Math.random() - 0.5) * 8,
                    age: 0, maxlife: 1.2 + Math.random() * 1.8,
                    r: Math.min(255, col[0] + 70), g: Math.min(255, col[1] + 64), b: Math.min(255, col[2] + 54),
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

    // 캐릭터 영역의 L1(배경)·L2(캐릭터) 픽셀을 1회만 읽어 reveal·rim·trail이 공유 (getImageData 호출 절반)
    _readCharRegion(W, H) {
        const e = this.engine; const p = this._player;
        const L1 = e.layers.getCanvas(1), L2 = e.layers.getCanvas(2);
        if (!p || !L1 || !L2) return null;
        const psx = (p.x - e.cameraX) | 0;
        const x0 = Math.max(0, psx - 2), x1 = Math.min(W, psx + p.pw + 2);
        const y0 = Math.max(0, p.y - 2), y1 = Math.min(H, p.y + p.ph + 2);
        const rw = x1 - x0, rh = y1 - y0;
        if (rw <= 0 || rh <= 0) return null;
        const parallax = e.layers.get(1)?.parallax ?? 1;
        let bgsx = Math.floor(e.cameraX * parallax) + x0; if (bgsx < 0) bgsx = 0;
        const lw = Math.max(1, Math.min(rw, L1.width - bgsx));
        try {
            const l1d   = L1.getContext('2d').getImageData(bgsx, y0, lw, rh).data;
            const l2img = L2.getContext('2d').getImageData(x0, y0, rw, rh);
            return { x0, y0, rw, rh, lw, l1d, l2img };
        } catch (_) { return null; }
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
        const cd = l2img.data;
        const k = this._fxK ?? 1.0;
        const nightReveal = 0.20 + 0.15 * Math.min(1, avgLum * 1.6);   // 밤 20%(어두운배경)~35%(밝은배경)
        const reveal = 1 - (1 - nightReveal) * k;                       // 낮→1.0, 밤→nightReveal
        const blendFactor = 0.15 * k;                                   // 밤에 배경색 15% 융합
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
        const N = 3 + Math.round(this._rimF ?? 0);   // rim 폭 낮3 → 밤4
        const PEAK = 0.55 * (this._rimF ?? 0);        // 캐릭터 밝기<60%부터 페이드인
        if (PEAK <= 0.02) return;
        const Lx = 0.7071, Ly = -0.7071;              // 우상단 광원(역광)
        const bt = this._bgTone || { r: 164, g: 127, b: 91 };
        const flR = bt.r * 0.55, flG = bt.g * 0.55, flB = bt.b * 0.55;   // floor = 배경톤 어두운 버전
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
                const a = PEAK * (0.35 + 0.65 * falloff) * (0.08 + 0.92 * dir * dir); // 빛 방향 강조
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
        // 2) 캐릭터 픽셀 모이기 (0.4~1.0 구간, 배경 생성과 살짝 겹침)
        const chT = (t - 0.4) / 0.6;
        if (chT > 0) {
            const reg = this._readCharRegion(W, H);
            if (reg) this._renderCharGather(ctx, reg, Math.min(1, chT));
        }
    }

    // 넓게 퍼진 모래가 쌓여 캐릭터 형성 — 모래알이 좌우로 흩날리다 아래→위로 쌓이며 모래색→실제색
    _renderCharGather(ctx, reg, t) {
        const { x0, y0, rw, rh, l2img } = reg;
        const d = l2img.data;
        const NT = SAND_TONES_RGB.length;
        ctx.save();
        for (let ly = 0; ly < rh; ly++) {
            for (let lx = 0; lx < rw; lx++) {
                const ci = (ly * rw + lx) << 2;
                if (d[ci + 3] < 8) continue;
                const h  = sandHash(lx * 1.7, ly * 1.3);
                const h2 = sandHash(lx * 3.1 + 5, ly * 2.3 + 9);
                // 아래쪽 픽셀부터 쌓임(bottom-up) → "쌓여서" 누적감. 위로 갈수록 늦게 정착.
                const delay = (1 - ly / rh) * 0.55 + h * 0.12;
                let lt = (t - delay) / (1 - delay); lt = lt < 0 ? 0 : lt > 1 ? 1 : lt;
                lt = lt * lt * (3 - 2 * lt);                        // ease
                const s = 1 - lt;                                  // 1=완전 흩어짐 → 0=정착
                // 넓게 퍼진 모래: 좌우로 크게 펼쳐졌다 모이고, 위에서 흩날려 내려와 쌓임
                const spread = rw * 0.8 + 100;
                const fx = x0 + lx + (h - 0.5) * spread * s + Math.sin(h2 * 25 + s * 8) * 14 * s;
                const fy = y0 + ly - s * (rh * 0.55) + Math.cos(h * 19) * 8 * s;
                // 모래색(흩날릴 때) → 실제 캐릭터색(정착)
                const tc = SAND_TONES_RGB[(h2 * NT) | 0];
                const r = d[ci]     * lt + tc[0] * s;
                const g = d[ci + 1] * lt + tc[1] * s;
                const b = d[ci + 2] * lt + tc[2] * s;
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
