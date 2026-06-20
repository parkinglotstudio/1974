// NuriGame.js — 누리 / NURI  v3.0
// 조이스틱 달리기 + 모래시계 PixelStream + 오비터 + 기억(記憶) 컨트롤 기반
// 배경: 2021 원경 + 인트로 모래 연출 + 카메라 스크롤

import { Scene }           from '../../../engine/scene/SceneManager.js';
import { AnimPhasePlayer } from '../../../engine/anim/AnimPhasePlayer.js';
import GridWaveSystem      from './core/GridWaveSystem.js';
import MessageSystem       from './core/MessageSystem.js';
import AmmoSystem          from './core/AmmoSystem.js';
import { HOLD_THRESHOLD }  from './core/constants.js';

// ── 공중 이동 물리 ──
const GRAVITY           = 600;   // px/s² (구 상태머신용, 미사용)
// deliver 단계: 도착 위치에서 캐릭터를 픽셀무브로 천천히 채움(조립)
const FILL_MS           = 1300;  // ms — 픽셀 채우기 시간 (길수록 천천히 채워짐)
const CHAIN_FILL_MS     = 380;   // ms — 공중 체이닝 시 빠른 픽셀 대시
const FILL_RISE         = 0;     // px — 채우는 동안 떠오르는 높이 (0=떠오름 없음)
const AERIAL_Y_OFFSET   = 0;     // px — 중심 정렬 후 미세조정용(+ 아래로 / - 위로)
// rise 단계: 채운 뒤 루프 동작으로 부드럽게 살짝 떠오름 (중력 없음) — 2배 속도
const RISE_VY           = 140;   // px/s — 떠오르는 속도
const RISE_VX           = 160;   // px/s — 떠오를 때 전진
// spin_fall 단계: 떠오른 뒤 정지프레임으로 회전하며 가속 낙하 — 2배 속도
const FALL_GRAV         = 3600;  // px/s² — 낙하 중력 가속
const FALL_VX           = 240;   // px/s — 낙하 중 전진 속도
// 이동 동선 디버그 꼬리 (임시)
const MOVE_TRAIL_ON     = true;
const MOVE_TRAIL_MS     = 3000;  // 꼬리 유지 시간
// 공중 GIF 공통 스케일 기준: standing 포즈(jump_prep) 소스 bbox 높이.
// 모든 공중 GIF를 이 높이 기준 동일 스케일로 그려 idle 캐릭터 크기와 맞춤.
// (값을 줄이면 캐릭터가 커지고, 키우면 작아짐)
const AERIAL_REF_SRC_H  = 833;
// 회전체(air_loop)에서 튀는 모래 파편 (톱니바퀴 금속 파편 느낌)
const SPIN_SPARKS_ENABLED = false; // 스파크 파티클 on/off
const SPIN_SPARK_RATE   = 480;   // 초당 생성 수
const SPIN_SPARK_RADIUS = 50;    // 방출 림 반경(px)
const SPIN_SPARK_VT     = 720;   // 접선 속도(회전 방향) 기준
const SPIN_SPARK_VO     = 140;   // 바깥쪽 속도 기준
const SPIN_SPARK_HOT    = 0.4;   // 흰열 코어 비율
const AIR_HANG_MS       = 400;
const LAND_MS           = 400;
const PM_DURATION       = 700;
const WAIST_SCALE       = 0.05;
const FLASH_MS          = 200;
const CHAR_SCALE        = 1.0;
const CHAR_BRIGHTNESS   = 0.1;   // 캐릭터 밝기(1=원본, 0.1=90% 어둡게)
const RAW_IDLE_FOOT_ROW = 256;
const RAW_RUN_FOOT_ROW  = 260;
const IDLE_FOOT_ROW     = Math.round(RAW_IDLE_FOOT_ROW * CHAR_SCALE);  // 128
const RUN_FOOT_ROW      = Math.round(RAW_RUN_FOOT_ROW  * CHAR_SCALE);  // 130
const RUN_SPEED         = 160;   // px/s — fallback, characters.csv(move_speed)가 있으면 그 값 사용
const RUN_FPS           = 20;    // fallback, characters.csv(run_fps)가 있으면 그 값 사용

// ── 맵 / 카메라 ──
const WORLD_WIDTH       = 3119;
const BG_FAR_W          = 3748;
const BG_FAR_H          = 960;
const BG_FAR_Y          = -100;  // 배경 y 오프셋

// ── 인트로 ──
const INTRO_MS          = 600;
const SAND_BASE         = [62, 52, 41];   // 모래 바탕색 RGB

// 단순 해시 (골목길과 동일)
function sandHash(x, y) {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

export default class NuriGame extends Scene {
    constructor() { super('nuri_main'); }

    onEnter(engine) {
        this.engine  = engine;
        this._W      = engine.gameWidth;
        this._H      = engine.gameHeight;
        this._player = engine.entities.get('nuri_player')
                    ?? engine.entities.getAll?.()[0]
                    ?? null;

        // 달리기 속도/애니 fps — characters.csv 값 사용 (없으면 fallback 상수)
        const charRow   = engine.data?.characters?.byId('id', 'nuri_player');
        this._runSpeed  = Number(charRow?.move_speed) || RUN_SPEED;
        this._runFps    = Number(charRow?.run_fps)    || RUN_FPS;

        // 아이들 엔티티 CHAR_SCALE 적용 (rawPw/rawPh 저장 후 pw/ph 축소, y 재조정)
        if (this._player && !this._player._rawPw) {
            const p = this._player;
            p._rawPw = p.pw;
            p._rawPh = p.ph;
            const origFootY = p.y + RAW_IDLE_FOOT_ROW;
            p.pw = Math.round(p.pw * CHAR_SCALE);
            p.ph = Math.round(p.ph * CHAR_SCALE);
            p.y  = origFootY - IDLE_FOOT_ROW;
        }

        this._pointerDown  = false;
        this._holdStart    = 0;
        this._holdPos      = null;
        this._mousePos     = null;   // 실시간 마우스 위치
        this._chargePhase  = 0;      // 0=없음 1=이동대기 2=파동충전
        this._pmBlend      = null;
        this._landing      = false;
        this._landingTimer = 0;

        this._runEntity = null;
        this._runState  = 'idle';   // 'idle' | 'running' | 'stopping'
        this._runDir    = 1;
        this._joy       = { left: false, right: false };

        this._dustParticles = [];
        this._dustAcc       = 0;

        // ── 공중 이동 상태머신 ──
        this._airState   = null;
        this._airVelY    = 0;
        this._airHangMs  = 0;
        this._landMs     = 0;
        this._groundY    = null;
        this._parabolaVX = 0;

        // ── 카메라 ──
        this._cameraX    = 0;

        // ── 배경 ──
        this._bgFarCanvas = null;

        // ── 인트로 ──
        this._intro      = { t: 0 };

        // ── 애니 시퀀스 플레이어 ──
        this._seqPlayer  = null;   // AnimPhasePlayer 인스턴스
        this._animFrames = null;   // { jump_loop:{imgs,...}, jump_land:... }
        this._seqDefs    = null;   // anim_sequences.json
        this._flyData    = null;   // { startX, endX, dur, elapsed, arrived }
        this._flyX       = null;   // 현재 fly lerp X (월드 좌표)
        this._aerialState  = null; // null | 'rise' | 'spin_fall'
        this._aerialDir    = 1;
        this._fallVY       = 0;
        this._aerialVel    = { x: 0, y: 0 };
        this._spinFixedBlur   = false;
        this._moveTrail    = []; // 디버그 꼬리 [{wx, wy, age}]
        this._impactParticles = [];
        this._shockRings      = [];
        this._landFlash       = null;
        this._spinPartAcc     = 0;

        this.messages = new MessageSystem(engine);
        this.ammo     = new AmmoSystem(this);
        this._loadRunEntity(engine);
        this._loadBgFar();
        this._loadAnimAssets();
        this._setupJoystick();
        this._initSignatureFx(engine);
        this._initCombat(engine);

        this._onDown = this._handleDown.bind(this);
        this._onUp   = this._handleUp.bind(this);
        this._onMove = this._handleMove.bind(this);
        this._onMsg  = this._handleMessage.bind(this);
        engine.canvas.addEventListener('pointerdown', this._onDown);
        engine.canvas.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
        window.addEventListener('message', this._onMsg);   // 애니메이터 라이브 미리보기
    }

    onExit() {
        this.engine?.canvas.removeEventListener('pointerdown', this._onDown);
        this.engine?.canvas.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        window.removeEventListener('message', this._onMsg);
        if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
        if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
    }

    // ── 애니메이터 에디터 라이브 미리보기 (postMessage) ──────────
    //   nuri:reloadSeq — anim_sequences.json·meta 재로드 (저장 직후). demo:true 면 데모 이동
    //   nuri:demoMove  — 데모 공중 이동 1회 실행
    async _handleMessage(e) {
        const m = e?.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'nuri:reloadSeq') {
            await this._loadAnimAssets();
            console.log('[nuri] anim sequences reloaded (live preview)');
            if (m.demo) this._demoAerial();
        } else if (m.type === 'nuri:demoMove') {
            this._demoAerial();
        }
    }

    // 데모 공중 이동: 캐릭터 앞·위 지점으로 1회 (에디터 미리보기용)
    _demoAerial() {
        const p = this._player;
        if (!p || this._seqPlayer?.isActive || this._pmBlend) return;
        const dir = p.flipX ? -1 : 1;
        this._startAerialMove({ x: p.x + dir * 140, y: p.y - 150 }, false);
    }

    // ── 모래엔진 시그니처 효과 (시간대 조명 + 캐릭터 림라이트) ──────
    _initSignatureFx(engine) {
        this._sigOn   = true;                            // 마스터 토글 (G 키)
        this._todList = ['off', 'dusk', 'night', 'rain'];
        this._todIdx  = 0;                               // 기본: off(배경 그대로) — T 키로 순환
        // 캐릭터 림라이트 — 어두운 야경에서 실루엣을 차가운 달빛으로 분리
        const rim = engine.rim;
        if (rim) {
            rim.enable();
            rim.setColor('#9fc0ff');
            rim.setWidth(2);
            rim.setIntensity(0.6);
            rim.setLightDir?.('top');
        }
        this._applyTimeOfDay();
    }

    _applyTimeOfDay() {
        const L = this.engine?.lighting;
        if (!L) return;
        const tod = this._todList[this._todIdx];
        if (tod === 'off') { L.disable(); return; }
        L.enable();
        L.setScenePreset(tod);
    }

    _cycleTimeOfDay() {
        this._todIdx = (this._todIdx + 1) % this._todList.length;
        this._applyTimeOfDay();
        console.log('[nuri] time-of-day:', this._todList[this._todIdx]);
    }

    // ── 격자 파동 전투 (GridWaveSystem 통합) ───────────────────────
    _initCombat(engine) {
        this._activeElement = 'na';
        this._enemies = [];
        this._carbon  = [];
        this._enemySpawnAcc = 0;
        this._combatOn = true;          // C 키로 적 스폰 토글
        this._gridWave = null;

        const elemTbl = engine.data?.elements;
        const chgTbl  = engine.data?.charge;
        if (!elemTbl || !chgTbl) { console.warn('[nuri] combat data missing (element/charge config)'); return; }

        // 크리쳐 테이블(적/NPC 공용) — kind=enemy 행만 스폰 풀로 사용
        const creatureTbl = engine.data?.creatures;
        this._enemyDefs = creatureTbl ? creatureTbl.filter('kind', 'enemy') : [];
        this._enemyWeightSum = this._enemyDefs.reduce((s, r) => s + (Number(r.spawn_weight) || 0), 0);
        // ParamTable → plain object (GridWaveSystem이 자체 Number 변환)
        const charge = {};
        for (const k of chgTbl.keys()) charge[k] = chgTbl.str(k);
        this._gridWave = new GridWaveSystem({ charge, elements: elemTbl.all() });

        // 하단 스킬 버튼이 호출할 수 있도록 전역 노출
        window._nuri = this;
        console.log('[nuri] combat ready — elements:', elemTbl.all().map(e => e.id).join(','));
    }

    setActiveElement(id) { if (this._gridWave?.elements[id]) this._activeElement = id; }
    get activeElement() { return this._activeElement; }

    // 캐릭터의 화면 좌표 중심 (UI/조준선 등 화면 고정 요소용)
    _playerScreen() {
        const p = this._player;
        if (!p) return { x: this._W / 2, y: this._H / 2 };
        return { x: p.x - this._cameraX + p.pw / 2, y: p.y + p.ph * 0.4 };
    }

    // 캐릭터의 맵(월드) 좌표 중심 — 적 스폰/추적·격자 파동 발사 원점은 전부 이 좌표계 사용
    _playerWorld() {
        const p = this._player;
        if (!p) return { x: 0, y: this._H / 2 };
        return { x: p.x + p.pw / 2, y: p.y + p.ph * 0.4 };
    }

    // 마우스(화면 좌표) → 월드 좌표 변환 — 조준 대상 계산용
    _mouseWorld() {
        if (!this._mousePos) return null;
        return { x: this._mousePos.x + this._cameraX, y: this._mousePos.y };
    }

    // 파동 충전 중(phase 2) 실제 도달 거리(현재 충전율·원소별 사거리 반영) → 화면 좌표
    // 이동 라인(AmmoSystem.renderAimLine)이 실제 발사 거리와 일치하도록 이 점을 목표로 그린다
    _aimClampedScreen() {
        const gw = this._gridWave;
        const mouseWorld = this._mouseWorld();
        if (!gw || !mouseWorld) return null;
        const held = performance.now() - (this._holdStart ?? performance.now());
        const full = gw.computeParams(mouseWorld, this._activeElement).chargeFullMs;
        const ratio = Math.min(held / full, 1);
        const pt = gw.displayPoint(mouseWorld, this._activeElement, ratio);
        return { x: pt.x - this._cameraX, y: pt.y };
    }

    // 파동 발사 — held(ms) 만큼 충전된 격자 파동
    _startWaveAttack(heldMs) {
        const gw = this._gridWave;
        if (!gw) return;
        const origin = this._playerWorld();
        gw.setOrigin(origin.x, origin.y);
        const orbit = this.ammo.slots.filter(s => s.state === 'orbit');
        gw.fire(heldMs / 1000, this._mouseWorld() ?? { x: origin.x + 120, y: origin.y }, {
            element: this._activeElement,
            slotCount: orbit.length,
            consume: (cost) => {
                let g = 0;
                for (let i = orbit.length - 1; i >= 0 && g < cost; i--) {
                    orbit[i].state = 'empty'; orbit[i].regenMs = 0; g++;
                }
                return g;
            },
            onEvent: (type, data) => {
                if (type === 'shake') this.engine.fx?.shake({ intensity: data.amount, duration: 280, decay: 2 });
                if (type === 'popup') this._showMessageText?.(data.text);
            },
        });
    }

    // 크리쳐 테이블(kind=enemy)에서 spawn_weight 가중치로 한 행 추첨
    _pickEnemyDef() {
        const defs = this._enemyDefs;
        if (!defs?.length) return null;
        let r = Math.random() * this._enemyWeightSum;
        for (const def of defs) {
            r -= Number(def.spawn_weight) || 0;
            if (r <= 0) return def;
        }
        return defs[defs.length - 1];
    }

    _spawnEnemy(def = this._pickEnemyDef()) {
        if (!def) return;
        const o = this._playerWorld();
        const a = Math.random() * Math.PI * 2, rad = Math.max(this._W, this._H) * 0.6;
        const speedMin = Number(def.speed_min) || 0.8, speedMax = Number(def.speed_max) || 1.4;
        const hp = Number(def.hp) || 1;
        this._enemies.push({
            defId: def.id, x: o.x + Math.cos(a) * rad, y: o.y + Math.sin(a) * rad,
            speed: speedMin + Math.random() * (speedMax - speedMin),
            hp, maxHp: hp,
            size: Number(def.size) || 12, color: def.color || '#C8102E',
            contactDmg: Number(def.contact_dmg) || 0,
            isElite: def.elite === '1', flashTicks: 0,
        });
    }

    _updateCombat(dt, now) {
        const gw = this._gridWave;
        if (!gw) return;
        const o = this._playerWorld();
        gw.setOrigin(o.x, o.y);

        // 적 자동 스폰 (1.2초 간격, 최대 24, 종류는 creatures.csv spawn_weight로 추첨)
        if (this._combatOn) {
            this._enemySpawnAcc += dt;
            if (this._enemySpawnAcc >= 1200) {
                this._enemySpawnAcc = 0;
                if (this._enemies.length < 24) this._spawnEnemy();
            }
        }

        gw.update(this._enemies);

        // 적 AI(코어 추적) · 사망 · 침식
        const dtSec = dt / 1000;
        for (let i = this._enemies.length - 1; i >= 0; i--) {
            const e = this._enemies[i];
            const a = Math.atan2(o.y - e.y, o.x - e.x);
            const step = e.speed * dtSec * 60;        // 프레임 기준 속도 → dt 보정
            e.x += Math.cos(a) * step; e.y += Math.sin(a) * step;
            if (e.flashTicks > 0) e.flashTicks--;
            if (Math.hypot(o.x - e.x, o.y - e.y) < e.size + 18) {
                this._carbon.push({ x: e.x, y: e.y, size: e.isElite ? 35 : 18, alpha: 1 });
                this._enemies.splice(i, 1); continue;
            }
            if (e.hp <= 0) this._enemies.splice(i, 1);
        }
        this._carbon.forEach(c => { if (c.alpha > 0.45) c.alpha -= 0.005 * dt / 16.67; });
    }

    // 모든 좌표는 맵(월드) 기준 — 카메라 오프셋만큼 translate 후 그려서 배경/캐릭터와 동일하게 스크롤
    _renderCombat(ctx) {
        const gw = this._gridWave;
        if (!gw) return;
        ctx.save();
        ctx.translate(-this._cameraX, 0);
        // 침식 블록
        for (const c of this._carbon) {
            ctx.fillStyle = `rgba(3,4,6,${c.alpha})`;
            ctx.fillRect(c.x - c.size / 2, c.y - c.size / 2, c.size, c.size);
        }
        // 적 (코어로 몰려드는 망각세포)
        for (const e of this._enemies) {
            ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            ctx.fillStyle = e.flashTicks > 0 ? '#fff' : e.color; ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(e.x - 12, e.y - (e.isElite ? 20 : 15), 24, 3);
            ctx.fillStyle = e.isElite ? '#FFB300' : '#00E676';
            ctx.fillRect(e.x - 12, e.y - (e.isElite ? 20 : 15), (e.hp / e.maxHp) * 24, 3);
        }
        // 파동 투사체·이펙트만 표시 (격자 가이드 점선은 제거 — 이동 라인 스타일로 단일화)
        gw.render(ctx);
        ctx.restore();
    }

    // ── 런 엔티티 비동기 로드 ─────────────────────────────────
    async _loadRunEntity(engine) {
        try {
            const r = await fetch('./pixels/characters/ch01_player_run.json', { cache: 'no-store' });
            if (!r.ok) { console.warn('[nuri] ch01_player_run.json not found'); return; }
            const data = await r.json();
            const scaledW = Math.round(data.width  * CHAR_SCALE);
            const scaledH = Math.round(data.height * CHAR_SCALE);
            this._runEntity = engine.entities.add('nuri_run', {
                x: 0, y: -1000, pw: scaledW, ph: scaledH,
                layer: 2, visible: false,
                frames: data.frames,
                _palette: data.palette,
                stateDef: data.stateDef,
            });
            this._runEntity._rawPw = data.width;
            this._runEntity._rawPh = data.height;
            console.log(`[nuri] run entity: ${scaledW}x${scaledH} (raw ${data.width}x${data.height}), ${data.frames.length} frames`);
        } catch (e) {
            console.warn('[nuri] run entity load error:', e);
        }
    }

    // ── 조이스틱 설정 ─────────────────────────────────────────
    _setupJoystick() {
        const jL = document.getElementById('btnL');
        const jR = document.getElementById('btnR');
        if (jL && jR) {
            const setL = v => { this._joy.left  = v; jL.classList.toggle('held', v); };
            const setR = v => { this._joy.right = v; jR.classList.toggle('held', v); };
            const bind = (btn, setFn) => {
                btn.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    btn.setPointerCapture(e.pointerId);
                    setFn(true);
                });
                btn.addEventListener('pointerup',     e => { e.preventDefault(); setFn(false); });
                btn.addEventListener('pointercancel', e => { e.preventDefault(); setFn(false); });
            };
            bind(jL, setL);
            bind(jR, setR);
        }
        this._onKeyDown = e => {
            if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') this._joy.left  = true;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._joy.right = true;
            // F: 애니메이션 플로우 다이어그램 토글
            if (e.key === 'f' || e.key === 'F') this._showFlow = !this._showFlow;
            // T: 시간대(조명) 순환  /  G: 시그니처 효과  /  C: 적 스폰 토글
            if (e.key === 't' || e.key === 'T') this._cycleTimeOfDay();
            if (e.key === 'g' || e.key === 'G') this._sigOn = !this._sigOn;
            if (e.key === 'c' || e.key === 'C') this._combatOn = !this._combatOn;
        };
        this._onKeyUp = e => {
            if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') this._joy.left  = false;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._joy.right = false;
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup',   this._onKeyUp);
    }

    // ── 포인터 핸들러 ─────────────────────────────────────────
    _toCanvas(e) {
        const rect = this.engine.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this._W / rect.width),
            y: (e.clientY - rect.top)  * (this._H / rect.height),
        };
    }

    _handleDown(e) {
        e.preventDefault();
        this._pointerDown = true;
        this._holdStart   = performance.now();
        const pos = this._toCanvas(e);
        this._holdPos  = pos;
        this._mousePos = pos;
        this._chargePhase = 1;

        // 탄창 잠금 (카메라 보정 화면 좌표)
        const ent = (this._runState === 'running' && this._runEntity?.visible)
            ? this._runEntity : this._player;
        if (ent) {
            const cx = ent.x - this._cameraX + ent.pw / 2;
            const cy = ent.y + (ent.ph || 150) * 0.38;
            this.ammo.lock(cx, cy);
        }
    }

    _handleMove(e) {
        if (!this._pointerDown) return;
        this._mousePos = this._toCanvas(e);
    }

    _handleUp() {
        if (!this._pointerDown) return;
        this._pointerDown = false;

        const held = performance.now() - this._holdStart;
        this._chargePhase = 0;

        // 공중 부양(rise/spin_fall) 중이면 체이닝 재이동 허용
        const airborne = this._seqPlayer?.isActive &&
                         (this._aerialState === 'rise' || this._aerialState === 'spin_fall');

        // 달리기 중·블렌드 중·(부양 아닌)시퀀스 중이면 취소
        if (this._runState !== 'idle' || this._pmBlend || this._flyData ||
            (this._seqPlayer?.isActive && !airborne)) {
            this.ammo.release();
            return;
        }

        if (!this.ammo.lockedSlot) {
            this.ammo.release();
            this.messages.show('no_ammo');
            return;
        }

        if (held < HOLD_THRESHOLD) {
            // ── 0.5초 미만: 이동 ──
            this.ammo.consume();
            if (airborne) {
                // 공중 부양 중 재이동: 도착 애니 생략, rise부터
                this._startAerialMove(this._mousePos, true);
            } else {
                this._startMove(this._mousePos);
            }
        } else {
            // ── 0.5초 이상: 격자 파동 공격 ──
            this.ammo.release();
            this._startWaveAttack(held);
        }
    }

    // ── 클릭 이동 — 지상/공중 분기 ──────────────────────────
    _startMove(targetPos) {
        const p = this._player;
        if (!p || this._pmBlend) return;

        // 지면 Y 확정 (최초 1회)
        if (this._groundY === null) {
            this._groundY = p.y + IDLE_FOOT_ROW;
        }

        // 캐릭터 머리(상단)보다 위를 찍어야 공중 이동.
        // 머리~발(키 전체) 높이 안쪽은 모두 지상 이동.
        const headY = p.y;
        if (targetPos.y < headY) {
            this._startAerialMove(targetPos);
            return;
        }

        // ── 지상 이동: 수평 픽셀무브(모래시계) ──
        const src = this._pixelsScreen(p, p._frameIdx ?? 0, p.flipX ?? false);
        if (!src.length) return;

        const worldTX = targetPos.x + this._cameraX;
        const dstX    = Math.max(0, Math.min(WORLD_WIDTH - p.pw, worldTX - p.pw / 2));
        if (Math.abs(dstX - p.x) < 5) return;
        const newFlip = worldTX > p.x + p.pw / 2;
        p.flipX = newFlip;

        const dx = dstX - p.x;
        const runStopFrames = p.asm?.states?.run_stop?.frames ?? [];
        const runStopF0     = runStopFrames[0] ?? (p._frameIdx ?? 0);
        const dstRaw        = this._pixelsScreen(p, runStopF0, newFlip);
        const N    = src.length;
        const step = dstRaw.length / N;
        const dst  = Array.from({ length: N }, (_, i) => {
            const d = dstRaw[Math.round(i * step) % dstRaw.length];
            return [d[0] + dx, d[1], d[2], d[3], d[4]];
        });

        const dist = Math.abs(dx);
        const dur  = Math.max(350, Math.min(1000, dist / this._W * 1400));

        p.visible = false;
        this._startPixelMoveBlend(src, dst, dur, () => {
            p.x = dstX;
            p.visible = true;
            this._setAnim(p, 'run_stop');
            p._frameIdx      = runStopF0;
            this._landing    = true;
            this._landingTimer = 450;
        });
    }

    // ── 공중 이동 (구조화) ────────────────────────────────────
    // 4 phase: deliver(직선 픽셀무브) → rise(천천히 살짝 떠오름+B잔상) →
    //          spin_fall(빠른 회전 낙하) → land(착지)
    //   순서/전환은 anim_sequences.json + AnimPhasePlayer가 담당,
    //   이 메서드는 각 phase 콜백에서 픽셀무브/물리만 연결.
    //   chained=true: 공중 부양 중 재이동 — 도착 애니(채우기) 생략, 부양(rise)부터 시작.
    _startAerialMove(targetPos, chained = false) {
        const p = this._player;
        if (!p || this._pmBlend) return;
        if (!chained && this._seqPlayer?.isActive) return;
        if (!this._animFrames?.jump_loop || !this._seqDefs?.aerial_move) return;

        this._spinFixedBlur = false;   // 회전은 A(속도 비례 블러)

        if (this._groundY === null) this._groundY = p.y + IDLE_FOOT_ROW;

        const worldTX  = targetPos.x + this._cameraX;
        const dstX     = Math.max(0, Math.min(WORLD_WIDTH - p.pw, worldTX - p.pw / 2));
        const newFlip  = worldTX > p.x + p.pw / 2;
        // 도착 발높이: 캐릭터 "중심"이 마우스에 오도록 charHalf 만큼 아래로.
        // (이전엔 발을 마우스에 둬서 전신이 커서 위로 떠 보였음)
        const loopInfo = this._animFrames.jump_loop;
        const aerScale = (p.ph / AERIAL_REF_SRC_H) * 0.9;
        const charHalf = ((loopInfo.footRows[0] - loopInfo.topRows[0]) * 0.5 * aerScale) || 0;
        const dstFootY = targetPos.y + charHalf + AERIAL_Y_OFFSET; // 중심=마우스, +오프셋 미세조정
        const dstTopY  = dstFootY - IDLE_FOOT_ROW;
        const dir      = newFlip ? 1 : -1;
        const curFlip  = p.flipX;          // 체이닝 src(현재 떠있는 포즈) 캡처용

        this._aerialDir = dir;
        this._fallVY    = 0;
        this._aerialVel = { x: 0, y: 0 };
        if (!this._seqPlayer) this._seqPlayer = new AnimPhasePlayer(this._seqDefs);

        // deliver(픽셀무브) src — 지상이면 idle 포즈, 공중 체이닝이면 현재 떠있는 GIF 포즈.
        // 둘 다 동일하게 deliver→rise→spin→land 구조를 탐 (픽셀무브가 항상 나옴).
        let src;
        if (chained) {
            const gif = (this._seqPlayer?.isActive && this._seqPlayer.currentGif) || 'jump_loop';
            const fi  = this._seqPlayer?.isActive ? this._seqPlayer.currentFrame : 0;
            src = this._gifFramePixels(gif, fi, p.x, p.y + IDLE_FOOT_ROW, curFlip);
            this._seqPlayer.stop();        // 진행 중 시퀀스 중단 후 새로 시작
            this._aerialState = null;
        } else {
            src = this._pixelsScreen(p, p._frameIdx ?? 0, newFlip);
        }
        p.flipX = newFlip;
        p.visible = false;

        const dstSil = this._aerialDstSilhouette('jump_loop', dstX, dstFootY, newFlip);
        if (!src.length || !dstSil.length) return;
        const N    = src.length;
        const step = dstSil.length / N;
        const dst  = Array.from({ length: N }, (_, i) => dstSil[Math.round(i * step) % dstSil.length]);
        const fillMs = chained ? CHAIN_FILL_MS : FILL_MS;   // 체이닝은 빠른 픽셀 대시

        const callbacks = {
            // ① 픽셀무브로 도착 위치까지 → 완료 시 rise로
            onDeliver: () => {
                this._startPixelMoveBlend(src, dst, fillMs, () => {
                    p.x = dstX;
                    p.y = dstTopY - FILL_RISE;
                    this._seqPlayer?.notifyBlendDone();
                }, true, FILL_RISE);
            },
            // ② 루프 동작으로 부드럽게 상승
            onRise: () => { this._aerialState = 'rise'; },
            // ③ 정지프레임 회전 + 가속 낙하
            onSpinFall: () => { this._aerialState = 'spin_fall'; this._fallVY = 0; },
            // ④ 데이터 기반 VFX 디스패치 (phase.fx 의 'enter' 효과)
            onPhaseFX: (ph) => this._runPhaseFX(ph),
            // ⑤ 시퀀스 끝 → 착지 포즈에서 idle로 픽셀 무브로 이어줌
            onAppear: () => {
                p.y = (this._groundY ?? (this._H - 20)) - IDLE_FOOT_ROW;
                this._startLandToIdleBlend(p.flipX);
            },
            onDone: () => { this._aerialState = null; },
        };

        this._seqPlayer.start('aerial_move', this._animFrames, callbacks);
    }

    // 지정 GIF 1프레임의 불투명 픽셀 위치를 도착 지점(월드 좌표)에 배치해 반환.
    // AnimPhasePlayer.render와 동일한 스케일/앵커(발 중심)로 맞춰 재조립이 GIF와 일치.
    _aerialDstSilhouette(gifKey, dstX, dstFootY, flip, frameIdx = 0) {
        const info = this._animFrames?.[gifKey];
        const fi   = Math.min(frameIdx, (info?.imgs?.length ?? 1) - 1);
        const img  = info?.imgs?.[fi];
        const p    = this._player;
        if (!img || !p) return [];

        if (!this._imgReadCv) {
            this._imgReadCv  = document.createElement('canvas');
            this._imgReadCtx = this._imgReadCv.getContext('2d', { willReadFrequently: true });
        }
        const cv = this._imgReadCv, c = this._imgReadCtx;
        cv.width = img.width; cv.height = img.height;
        c.clearRect(0, 0, img.width, img.height);
        c.drawImage(img, 0, 0);
        let data;
        try { data = c.getImageData(0, 0, img.width, img.height).data; } catch (e) { return []; }

        // AnimPhasePlayer.render와 동일한 스케일(공중 GIF size 0.9)·발 앵커로 맞춰
        // 채우기 완료 위치가 rise/spin 렌더와 정확히 일치(떠 보이지 않음).
        const scale     = (p.ph / AERIAL_REF_SRC_H) * 0.9;
        const footRow   = info.footRows ? info.footRows[fi] : img.height;
        const dw        = img.width  * scale;
        const footXWorld = dstX + p.pw / 2;
        const xLeft     = footXWorld - dw / 2;
        const yTop      = dstFootY - footRow * scale;  // 실제 발을 dstFootY에

        const out    = [];
        const STRIDE = 2;                              // 다운샘플 (입자 수 제한)
        for (let py = 0; py < img.height; py += STRIDE) {
            for (let px = 0; px < img.width; px += STRIDE) {
                if (data[(py * img.width + px) * 4 + 3] < 16) continue;
                const fx = flip ? (img.width - 1 - px) : px;
                out.push([Math.round(xLeft + fx * scale), Math.round(yTop + py * scale)]);
            }
        }
        return out;
    }

    // GIF 한 프레임의 불투명 픽셀을 색까지 포함해 월드 좌표에 배치 ([x,y,r,g,b]).
    // 공중 체이닝 시 "현재 떠있는 포즈"를 픽셀무브 src로 쓰기 위함.
    _gifFramePixels(gifKey, frameIdx, atX, atFootY, flip) {
        const info = this._animFrames?.[gifKey];
        const fi   = Math.min(frameIdx, (info?.imgs?.length ?? 1) - 1);
        const img  = info?.imgs?.[fi];
        const p    = this._player;
        if (!img || !p) return [];

        if (!this._imgReadCv) {
            this._imgReadCv  = document.createElement('canvas');
            this._imgReadCtx = this._imgReadCv.getContext('2d', { willReadFrequently: true });
        }
        const cv = this._imgReadCv, c = this._imgReadCtx;
        cv.width = img.width; cv.height = img.height;
        c.clearRect(0, 0, img.width, img.height);
        c.drawImage(img, 0, 0);
        let data;
        try { data = c.getImageData(0, 0, img.width, img.height).data; } catch (e) { return []; }

        const scale     = (p.ph / AERIAL_REF_SRC_H) * 0.9;
        const footRow   = info.footRows ? info.footRows[fi] : img.height;
        const dw        = img.width * scale;
        const xLeft     = (atX + p.pw / 2) - dw / 2;
        const yTop      = atFootY - footRow * scale;

        const out    = [];
        const STRIDE = 2;
        for (let py = 0; py < img.height; py += STRIDE) {
            for (let px = 0; px < img.width; px += STRIDE) {
                const idx = (py * img.width + px) * 4;
                if (data[idx + 3] < 16) continue;
                const fx = flip ? (img.width - 1 - px) : px;
                out.push([
                    Math.round(xLeft + fx * scale), Math.round(yTop + py * scale),
                    data[idx], data[idx + 1], data[idx + 2],
                ]);
            }
        }
        return out;
    }

    // ── 착지 포즈 → idle 픽셀 무브 전환 (동작 이어주기) ───────
    _startLandToIdleBlend(flip) {
        const p = this._player;
        if (!p) return;
        // idle 포즈 픽셀 (착지 위치)
        this._setAnim(p, 'idle') || this._setAnim(p, 'run_stop');
        if (p.asm) { p.asm.tick(performance.now()); p._frameIdx = p.asm.getCurrentFrame(); }
        const dst = this._pixelsScreen(p, p._frameIdx ?? 0, flip);
        if (!dst.length) { p.visible = true; return; }

        // land 마지막 프레임 실루엣(웅크린 포즈) 위치 → idle 색으로 채워 src
        const footY    = p.y + IDLE_FOOT_ROW;
        const lastLand = (this._animFrames?.land_new?.imgs?.length ?? 1) - 1;
        const sil = this._aerialDstSilhouette('land_new', p.x, footY, flip, lastLand);
        const N   = dst.length;
        let src;
        if (sil.length) {
            const step = sil.length / N;
            src = dst.map((d, i) => {
                const s = sil[Math.round(i * step) % sil.length];
                return [s[0], s[1], d[2], d[3], d[4]];
            });
        } else {
            src = dst.map(d => [d[0] + (Math.random() - 0.5) * 50, d[1] + Math.random() * 30, d[2], d[3], d[4]]);
        }

        p.visible = false;
        this._startPixelMoveBlend(src, dst, 350, () => {
            p.visible = true;
            this._setAnim(p, 'idle') || this._setAnim(p, 'run_stop');
        }, true);   // straight 흐름
    }

    // ── 공중 이동 물리 (rise: 부드럽게 떠오름 / spin_fall: 가속 낙하) ──
    _updateAirBallistic(dt) {
        const cur = this._aerialState;
        if (cur !== 'rise' && cur !== 'spin_fall') return;
        const p   = this._player;
        const dtS = dt / 1000;
        const dir = this._aerialDir ?? 1;
        const maxX = WORLD_WIDTH - p.pw;

        if (cur === 'rise') {
            // 중력 없이 부드럽게 살짝 떠오름 + 전진
            p.y -= RISE_VY * dtS;
            p.x = Math.max(0, Math.min(maxX, p.x + dir * RISE_VX * dtS));
            this._aerialVel = { x: dir * RISE_VX, y: -RISE_VY };
            return;
        }

        // spin_fall: 가속 낙하 + 전진
        this._fallVY += FALL_GRAV * dtS;
        p.y += this._fallVY * dtS;
        p.x = Math.max(0, Math.min(maxX, p.x + dir * FALL_VX * dtS));
        this._aerialVel = { x: dir * FALL_VX, y: this._fallVY };

        const gY = this._groundY ?? (this._H - 20);
        if (this._fallVY > 0 && p.y + IDLE_FOOT_ROW >= gY) {
            p.y = gY - IDLE_FOOT_ROW;              // 지면에 정확히 맞춤
            this._aerialState = null;             // 착지 후 전진/낙하 정지 (미끄러짐 방지)
            this._seqPlayer?.notifyGrounded();     // → land phase
        }
    }

    // ── 이동 동선 디버그 꼬리 (임시) ──────────────────────────
    _updateMoveTrail(dt) {
        const p = this._player;
        const cur = this._seqPlayer?.currentId;
        // 공중 비행(rise/spin_fall) 및 착지 중 캐릭터 중심·발 기록
        if (p && this._seqPlayer?.isActive && cur && cur !== 'deliver') {
            this._moveTrail.push({
                cx: p.x + p.pw / 2, cy: p.y + p.ph * 0.5,
                fx: p.x + p.pw / 2, fy: p.y + IDLE_FOOT_ROW,
                age: 0,
            });
        }
        for (let i = this._moveTrail.length - 1; i >= 0; i--) {
            this._moveTrail[i].age += dt;
            if (this._moveTrail[i].age >= MOVE_TRAIL_MS) this._moveTrail.splice(i, 1);
        }
    }

    _renderMoveTrail(ctx) {
        if (!this._moveTrail.length) return;
        const camX = this._cameraX;
        ctx.save();
        // 중심 경로(시안) + 발 경로(주황) 두 선
        for (const [key, col] of [[['cx','cy'], '0,255,255'], [['fx','fy'], '255,150,0']]) {
            const [kx, ky] = key;
            ctx.beginPath();
            let started = false;
            for (const q of this._moveTrail) {
                const x = q[kx] - camX, y = q[ky];
                if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = `rgba(${col},0.5)`;
            ctx.lineWidth = 2;
            ctx.stroke();
            // 점 (나이에 따라 페이드)
            for (const q of this._moveTrail) {
                const a = 1 - q.age / MOVE_TRAIL_MS;
                ctx.globalAlpha = a * 0.8;
                ctx.fillStyle = `rgb(${col})`;
                ctx.beginPath();
                ctx.arc(q[kx] - camX, q[ky], 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    // ── 공중 상태머신 전환 ────────────────────────────────────
    // 애니 슬롯: p.asm.states 에 해당 키 있으면 재생, 없으면 현재 프레임 유지
    _enterAirState(state) {
        const p = this._player;
        this._airState = state;

        switch (state) {
            case 'jump':
                // TODO: jump 애니 추가 시 → this._setAnim(p, 'jump')
                this._setAnim(p, 'jump') || this._setAnim(p, 'idle');
                // jump는 1회 재생 후 aerial로 전환 (AIR_HANG_MS로 타이밍)
                this._airHangMs = 0;
                break;
            case 'aerial':
                // TODO: aerial 애니 추가 시 → this._setAnim(p, 'aerial')
                this._setAnim(p, 'aerial') || this._setAnim(p, 'idle');
                this._airHangMs = 0;
                this._airVelY   = 0;
                break;
            case 'fall':
                // TODO: fall 애니 추가 시 → this._setAnim(p, 'fall')
                this._setAnim(p, 'fall') || this._setAnim(p, 'idle');
                break;
            case 'land':
                this._landMs  = 0;
                this._airVelY = 0;
                p.y = (this._groundY ?? (this._H - 20)) - IDLE_FOOT_ROW;
                if (this._seqPlayer?.currentId === 'spin') {
                    // seqPlayer의 land phase 시작 → impact 콜백이 충격파 처리
                    this._seqPlayer.notifyLand();
                } else {
                    this._setAnim(p, 'land') || this._setAnim(p, 'run_stop');
                }
                break;
        }
    }

    // 애니 상태 설정 헬퍼 — 해당 상태 없으면 false 반환
    _setAnim(entity, stateName) {
        if (!entity?.asm?.states?.[stateName]) return false;
        entity.asm.setState(stateName);
        entity.asm.restart();
        return true;
    }

    // ── 공중 물리 업데이트 ────────────────────────────────────
    _updateAirState(dt) {
        const p = this._player;
        if (!this._airState || !p) return;

        switch (this._airState) {
            case 'jump':
                // jump 애니 재생 시간(AIR_HANG_MS/2) 후 aerial로
                this._airHangMs += dt;
                if (this._airHangMs >= AIR_HANG_MS / 2) {
                    this._enterAirState('aerial');
                }
                break;

            case 'aerial':
                // AIR_HANG_MS 동안 공중 정지 후 fall로
                this._airHangMs += dt;
                if (this._airHangMs >= AIR_HANG_MS) {
                    this._enterAirState('fall');
                }
                break;

            case 'fall': {
                // 중력 가속
                this._airVelY += GRAVITY * dt / 1000;
                p.y += this._airVelY * dt / 1000;

                // 포물선 수평 이동 (이동 방향으로 약한 전진)
                if (this._parabolaVX) {
                    const maxX = WORLD_WIDTH - p.pw;
                    p.x = Math.max(0, Math.min(maxX, p.x + this._parabolaVX * dt / 1000));
                }

                // 지면 도달 체크 (_groundY null 안전)
                const gY = this._groundY ?? (this._H - 20);
                if (p.y + IDLE_FOOT_ROW >= gY) {
                    this._parabolaVX = 0;
                    this._enterAirState('land');
                }
                break;
            }

            case 'land':
                this._landMs += dt;
                if (this._landMs >= LAND_MS) {
                    this._airState = null;
                    // seqPlayer가 land GIF 재생 중이면 idle 전환을 seqPlayer의 onAppear에 위임
                    if (!this._seqPlayer?.isActive) {
                        this._setAnim(p, 'idle') || this._setAnim(p, 'run_stop');
                    }
                }
                break;
        }
    }

    // ── 공중 이동 fly lerp 업데이트 ──────────────────────────────
    _updateFly(dt) {
        const fd = this._flyData;
        if (!fd || !this._flyActive) return;   // pull phase 동안은 정지
        const p = this._player;

        fd.elapsed = Math.min(fd.dur, fd.elapsed + dt);
        const t    = fd.elapsed / fd.dur;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        this._flyX = fd.startX + (fd.endX - fd.startX) * ease;

        if (!fd.arrived && fd.elapsed >= fd.dur) {
            fd.arrived = true;
            if (p) p.x = fd.endX;
            this._seqPlayer?.notifyArrived();
        }
    }

    // ── 런 상태 전환 ──────────────────────────────────────────
    _enterRunning(dir) {
        const p = this._player;
        const re = this._runEntity;
        if (!re) return;

        this._runState = 'running';
        this._runDir   = dir;
        this._landing  = false;   // 착지 타이머 취소

        // run entity 위치: 발 행 기준 맞춤 (캔버스 높이 오차 제거)
        re.y    = (p.y + IDLE_FOOT_ROW) - RUN_FOOT_ROW;
        re.x    = p.x + Math.round((p.pw - re.pw) / 2);
        re.flipX = dir > 0;
        re.visible = true;

        if (re.asm) {
            if (re.asm.states?.run) re.asm.states.run.fps = this._runFps;
            re.asm.setState('run'); re.asm.restart();
        }

        p.visible = false;
    }

    _enterStopping() {
        const p = this._player;
        const re = this._runEntity;
        if (!re) return;

        this._runState = 'stopping';

        // idle entity 위치: 발 행 기준 맞춤
        p.x     = re.x + Math.round((re.pw - p.pw) / 2);
        p.y     = (re.y + RUN_FOOT_ROW) - IDLE_FOOT_ROW;
        p.flipX = re.flipX;
        p.visible = true;

        if (p.asm) {
            if (p.asm.states?.run_stop) p.asm.states.run_stop.fps = 20;
            p.asm.setState('run_stop'); p.asm.restart();
        }
        re.visible = false;
        this._landing      = true;
        this._landingTimer = 450;
    }

    _enterIdle() {
        this._runState = 'idle';
        const p = this._player;
        if (p?.asm) { p.asm.setState('idle'); p.asm.restart(); }
    }

    // ── 업데이트 ─────────────────────────────────────────────
    onUpdate(now, dt) {
        // PixelStream 블렌드 진행
        if (this._pmBlend) {
            this._pmBlend.t += dt;
            if (this._pmBlend.t >= this._pmBlend.dur) {
                const cb = this._pmBlend.onDone;
                this._pmBlend = null;
                cb?.();
            }
        }

        // 인트로 타이머
        if (this._intro) {
            this._intro.t += dt / INTRO_MS;
            if (this._intro.t >= 1) this._intro = null;
        }

        const p = this._player;
        if (p?.asm) { p.asm.tick(now); p._frameIdx = p.asm.getCurrentFrame(); }
        this.ammo.update(dt);
        this.messages.update(dt);
        this._updateAirState(dt);
        this._updateFly(dt);
        this._updateAirBallistic(dt);
        if (MOVE_TRAIL_ON) this._updateMoveTrail(dt);
        this._seqPlayer?.update(dt);
        this._updateSpinParticles(dt);
        this._updateImpactParticles(dt);
        this._updateShockRings(dt);
        this._updateDust(dt);
        this._updateCombat(dt, now);
        this._updateCamera();

        // run_stop → idle 타이머 (클릭 이동 & 조이스틱 정지 공통)
        if (this._landing && this._landingTimer !== undefined) {
            this._landingTimer -= dt;
            if (this._landingTimer <= 0) {
                this._landing = false;
                if (this._runState === 'stopping') {
                    this._enterIdle();
                } else {
                    if (p?.asm) { p.asm.setState('idle'); p.asm.restart(); }
                }
            }
        }

        // 홀드 중 chargePhase 업데이트 (1=이동대기, 2=파동충전)
        if (this._pointerDown) {
            const held = performance.now() - this._holdStart;
            this._chargePhase = held >= HOLD_THRESHOLD ? 2 : 1;
        }

        // 조이스틱 상태머신 (픽셀 블렌드·공중 상태·공중 이동 시퀀스 중에는 처리 안 함)
        if (!this._pmBlend && !this._airState && !this._seqPlayer?.isActive) {
            this._updateRunState(now, dt);
        }
    }

    _updateRunState(now, dt) {
        const goLeft  = this._joy.left && !this._joy.right;
        const goRight = this._joy.right && !this._joy.left;
        const anyJoy  = goLeft || goRight;
        const re      = this._runEntity;
        const p       = this._player;

        switch (this._runState) {
            case 'idle':
                if (anyJoy && re) this._enterRunning(goRight ? 1 : -1);
                break;

            case 'running':
                if (re?.asm) { re.asm.tick(now); re._frameIdx = re.asm.getCurrentFrame(); }
                if (!anyJoy) {
                    this._enterStopping();
                } else {
                    const newDir = goRight ? 1 : -1;
                    if (newDir !== this._runDir) {
                        this._runDir = newDir;
                        if (re) re.flipX = newDir > 0;
                    }
                    if (re) {
                        const maxX = WORLD_WIDTH - re.pw;
                        re.x = Math.max(0, Math.min(maxX, re.x + this._runDir * this._runSpeed * dt / 1000));
                        // idle entity X 동기화 (정지 전환 시 위치 맞춤용)
                        p.x = re.x + Math.round((re.pw - p.pw) / 2);
                    }
                }
                break;

            case 'stopping':
                // 다시 조이스틱 → 즉시 달리기 재개
                if (anyJoy && re) this._enterRunning(goRight ? 1 : -1);
                break;
        }
    }

    // ── 렌더 ─────────────────────────────────────────────────
    onPostRender(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this._W, this._H);

        // 인트로 중
        if (this._intro) {
            this._renderBg(ctx);
            this._renderIntro(ctx, this._intro.t);
            return;
        }

        // 배경 렌더 (카메라 적용)
        this._renderBg(ctx);

        const p  = this._player;
        const re = this._runEntity;
        const isRunning = this._runState === 'running' && re?.visible;
        const activeEnt = isRunning ? re : p;

        if (this._pointerDown && this._mousePos && !this._pmBlend) {
            this.ammo.renderAimLine(ctx, activeEnt, this._chargePhase === 2 ? this._aimClampedScreen() : null);
        }

        // fly GIF (캐릭터 아래 레이어)
        this._renderSeqOverlay(ctx, false);

        if (this._pmBlend) {
            this._renderPixelMove(ctx, this._pmBlend);
        } else if (activeEnt?.visible !== false) {
            if (isRunning) {
                this._buildEntBuf(re);
                this.ammo.render(ctx, false, re);
                this._renderDust(ctx);
                this._renderTrail(ctx, re);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.filter = `brightness(${CHAR_BRIGHTNESS})`;
                ctx.drawImage(this._entBuf, re.x - this._cameraX, re.y, re.pw, re.ph);
                ctx.filter = 'none';
                ctx.imageSmoothingEnabled = false;
                this.ammo.render(ctx, true, re);
            } else {
                this.ammo.render(ctx, false, activeEnt);
                this._drawEntityCam(ctx, activeEnt);
                if (this._sigOn) this._drawCharRim(ctx, activeEnt);   // 시그니처 림라이트
                this.ammo.render(ctx, true, activeEnt);
            }
        }
        this._renderImpactParticles(ctx);
        this._renderShockRings(ctx);
        this._renderLandFlash(ctx);
        // land GIF는 flash/shock 위에 그려야 보임
        this._renderSeqOverlay(ctx, true);
        // 격자 파동 전투 (적·투사체·이펙트·조준 가이드)
        this._renderCombat(ctx);
        // ── 모래엔진 시그니처 효과: 시간대 조명 (게임 위 / 디버그 오버레이 아래) ──
        // nuri는 onPostRender에서 캔버스를 직접 그리므로 엔진 자동 FX 패스가
        // 덮어써짐 → 여기서 직접 호출. (림라이트는 캐릭터 그릴 때 _drawCharRim 으로 처리)
        if (this._sigOn) this.engine.lighting?.render(canvas, this._cameraX);
        if (MOVE_TRAIL_ON) this._renderMoveTrail(ctx);
        // F 키: 애니메이션 플로우 다이어그램 (디버그 오버레이)
        if (this._showFlow && this._seqPlayer) {
            this._seqPlayer.renderFlow(ctx, this._W - 178, 14, { seqId: 'aerial_move' });
        }
        this.messages.render(ctx, this._W, this._H);
    }

    // 카메라 x 적용 drawEntity
    _drawEntityCam(ctx, entity) {
        if (!this._buildEntBuf(entity)) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = `brightness(${CHAR_BRIGHTNESS})`;
        ctx.drawImage(this._entBuf, entity.x - this._cameraX, entity.y, entity.pw, entity.ph);
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = false;
    }

    // ── 시그니처 림라이트 (캐릭터 버퍼 기반 백라이트) ──────────────
    // 엔진 RimLightSystem은 레이어 엔티티를 샘플하지만 nuri는 캐릭터를
    // 직접 그리므로 적용 불가 → 캐릭터 버퍼(_entBuf)를 림 색으로 틴트해
    // 위쪽으로 살짝 오프셋·가산합성하여 실루엣 상단을 달빛처럼 분리.
    _drawCharRim(ctx, entity) {
        const buf = this._entBuf;
        if (!buf) return;
        if (!this._rimBuf) { this._rimBuf = document.createElement('canvas'); this._rimCtx = this._rimBuf.getContext('2d'); }
        const rb = this._rimBuf, rc = this._rimCtx;
        if (rb.width !== buf.width || rb.height !== buf.height) { rb.width = buf.width; rb.height = buf.height; }
        const o = 2;                                       // 백라이트 오프셋(버퍼 px, 위쪽=달빛 방향)
        rc.clearRect(0, 0, rb.width, rb.height);
        rc.globalCompositeOperation = 'source-over';
        rc.drawImage(buf, 0, -o);                          // 실루엣을 위로 살짝 이동
        rc.globalCompositeOperation = 'source-in';
        rc.fillStyle = '#9fc0ff';
        rc.fillRect(0, 0, rb.width, rb.height);
        rc.globalCompositeOperation = 'destination-out';
        rc.drawImage(buf, 0, 0);                           // 원래 실루엣을 빼내 가장자리만 남김
        rc.globalCompositeOperation = 'source-over';

        const dw = entity.pw, dh = entity.ph;
        const x = entity.x - this._cameraX, y = entity.y;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(rb, x, y, dw, dh);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;
    }

    // ── 배경 로드 ─────────────────────────────────────────────
    async _loadBgFar() {
        try {
            const r = await fetch('./pixels/objects/2021_far.json', { cache: 'no-store' });
            if (!r.ok) { console.warn('[nuri] 2021_far.json not found'); return; }
            const data = await r.json();
            const W = data.width, H = data.height;
            const pal = data.palette ?? [];
            const palCache = pal.map(hex => {
                if (!hex || hex === 'transparent') return null;
                return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
            });

            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            const bCtx = cv.getContext('2d');
            const imgD = bCtx.createImageData(W, H);
            const d = imgD.data;

            // scanline: flat 1D 팔레트 인덱스 배열 (W×H)
            const flat = data.scanline;
            if (flat) {
                for (let i = 0; i < flat.length; i++) {
                    const idx = flat[i];
                    if (!idx) continue;
                    const rgb = palCache[idx]; if (!rgb) continue;
                    const off = i * 4;
                    d[off]=rgb[0]; d[off+1]=rgb[1]; d[off+2]=rgb[2]; d[off+3]=255;
                }
            } else {
                const pixels = data.pixels ?? (data.frames?.[0]?.pixels ?? []);
                for (const [px, py, idx] of pixels) {
                    const rgb = palCache[idx]; if (!rgb) continue;
                    const off = (py * W + px) * 4;
                    d[off]=rgb[0]; d[off+1]=rgb[1]; d[off+2]=rgb[2]; d[off+3]=255;
                }
            }
            bCtx.putImageData(imgD, 0, 0);
            this._bgFarCanvas = cv;
            console.log(`[nuri] bg_far loaded: ${W}x${H}`);
        } catch(e) {
            console.warn('[nuri] bg_far load error:', e);
        }
    }

    // ── 배경 렌더 (카메라 패럴랙스) ──────────────────────────
    _renderBg(ctx) {
        if (!this._bgFarCanvas) {
            // 배경 로드 전: 어두운 모래색으로 채움
            ctx.fillStyle = `rgb(${SAND_BASE[0]},${SAND_BASE[1]},${SAND_BASE[2]})`;
            ctx.fillRect(0, 0, this._W, this._H);
            return;
        }
        const PARALLAX = 0.30;
        const farScrollX = this._cameraX * PARALLAX;
        const maxFarX = Math.max(0, BG_FAR_W - this._W);
        const sx = Math.min(farScrollX, maxFarX);
        const sy = Math.max(0, -BG_FAR_Y);  // y=-100이면 sy=100

        // 배경 캔버스의 일부를 화면에 맞게 잘라서 그림 (세로 fit)
        const scale = this._H / (BG_FAR_H - sy);
        const srcW = this._W / scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._bgFarCanvas,
            sx, sy, Math.min(srcW, BG_FAR_W - sx), BG_FAR_H - sy,
            0, 0, this._W, this._H);
        ctx.imageSmoothingEnabled = false;
    }

    // ── 카메라 업데이트 ───────────────────────────────────────
    _updateCamera() {
        const re = this._runEntity;
        const isRunning = this._runState === 'running' && re?.visible;
        const ent = isRunning ? re : this._player;
        if (!ent) return;
        const targetX = ent.x + ent.pw / 2 - this._W / 2;
        const maxX = Math.max(0, WORLD_WIDTH - this._W);
        const tx = Math.max(0, Math.min(maxX, targetX));
        // 부드러운 추적 (lerp)
        this._cameraX += (tx - this._cameraX) * 0.12;
    }

    // ── 인트로 연출 ───────────────────────────────────────────
    // 0~0.5: 배경이 sand_top 스타일로 드러남 / 0.4~1.0: 캐릭터 픽셀 모이기
    _renderIntro(ctx, t) {
        const W = this._W, H = this._H;
        // ① 배경 모래 소멸 (위→아래)
        const bgShown = Math.min(1, t / 0.55);
        if (bgShown < 1) {
            const [BR, BG, BB] = SAND_BASE;
            const img = ctx.getImageData(0, 0, W, H);
            const d = img.data;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const n  = sandHash(x >> 2, y >> 2);
                    const thr = (y / H) * 0.65 + n * 0.35;
                    if (bgShown < thr) {
                        const i = (y * W + x) << 2;
                        d[i]=BR; d[i+1]=BG; d[i+2]=BB; d[i+3]=255;
                    }
                }
            }
            ctx.putImageData(img, 0, 0);
        }

        // ② 캐릭터 픽셀 모이기 (0.35~1.0)
        const chT = Math.max(0, Math.min(1, (t - 0.35) / 0.65));
        if (chT > 0) {
            const p = this._player;
            if (!p || !this._buildEntBuf(p)) return;
            const rawPw = p._rawPw ?? p.pw;
            const rawPh = p._rawPh ?? p.ph;
            const sc = p.pw / rawPw;
            const bCtx = this._entBufCtx;
            const x0 = p.x - this._cameraX, y0 = p.y;
            const rw = p.pw, rh = p.ph;

            ctx.save();
            for (let ly = 0; ly < rawPh; ly++) {
                for (let lx = 0; lx < rawPw; lx++) {
                    let pxData;
                    try { pxData = bCtx.getImageData(lx, ly, 1, 1).data; } catch(e) { continue; }
                    if (pxData[3] < 8) continue;
                    const h  = sandHash(lx * 1.7, ly * 1.3);
                    const h2 = sandHash(lx * 3.1 + 5, ly * 2.3 + 9);
                    const delay = (1 - ly / rawPh) * 0.45 + h * 0.1;
                    let lt = (chT - delay) / Math.max(0.01, 1 - delay);
                    lt = lt < 0 ? 0 : lt > 1 ? 1 : lt;
                    lt = lt * lt * (3 - 2 * lt);  // ease
                    const s = 1 - lt;
                    const spread = rw * 0.8 + 80;
                    const fx = x0 + lx * sc + (h - 0.5) * spread * s + Math.sin(h2 * 25 + s * 8) * 12 * s;
                    const fy = y0 + ly * sc - s * (rh * 0.5) + Math.cos(h * 19) * 7 * s;
                    const [BR, BG, BB] = SAND_BASE;
                    const reveal = lt;
                    const r = BR * (1-reveal) + pxData[0] * reveal;
                    const g = BG * (1-reveal) + pxData[1] * reveal;
                    const b = BB * (1-reveal) + pxData[2] * reveal;
                    ctx.globalAlpha = Math.min(1, 0.3 + lt * 0.7);
                    ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
                    ctx.fillRect(fx | 0, fy | 0, 2, 2);
                }
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    // ── 엔티티 렌더 ────────────────────────────────────────────
    _buildEntBuf(entity) {
        if (!entity) return false;
        const pixels = entity._frames
            ? (entity._frames[entity._frameIdx ?? 0]?.pixels ?? [])
            : (entity._pixels ?? []);
        const pal = entity._palette ?? [];
        if (!pixels.length) return false;

        const rawPw = entity._rawPw ?? entity.pw;
        const rawPh = entity._rawPh ?? entity.ph;

        if (!this._entBuf || this._entBuf.width !== rawPw || this._entBuf.height !== rawPh) {
            this._entBuf        = document.createElement('canvas');
            this._entBuf.width  = rawPw;
            this._entBuf.height = rawPh;
            this._entBufCtx     = this._entBuf.getContext('2d');
            this._palCache      = null;
            this._palCacheRef   = null;
        }
        if (this._palCacheRef !== pal) {
            this._palCacheRef = pal;
            this._palCache    = pal.map(hex => {
                if (!hex || hex === 'transparent') return null;
                return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
            });
        }
        const eCtx    = this._entBufCtx;
        const imgData = eCtx.createImageData(rawPw, rawPh);
        const d       = imgData.data;
        const flip    = entity.flipX ?? false;
        for (const [px, py, idx] of pixels) {
            const rgb = this._palCache[idx];
            if (!rgb) continue;
            const xi  = flip ? rawPw - 1 - px : px;
            const off = (py * rawPw + xi) * 4;
            d[off]=rgb[0]; d[off+1]=rgb[1]; d[off+2]=rgb[2]; d[off+3]=255;
        }
        eCtx.putImageData(imgData, 0, 0);
        return true;
    }

    _drawEntity(ctx, entity) {
        if (!this._buildEntBuf(entity)) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._entBuf, entity.x, entity.y, entity.pw, entity.ph);
        ctx.imageSmoothingEnabled = false;
    }

    // 달리기 중 진행 반대 방향으로 옅어지는 푸른 잔광 트레일 (가산 합성)
    _renderTrail(ctx, entity) {
        if (!this._entBuf) return;
        const N    = 5;
        const STEP = 7;
        const dir  = this._runDir;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalCompositeOperation = 'lighter';
        for (let k = N; k >= 1; k--) {
            const ox = -dir * k * STEP;
            ctx.globalAlpha = (1 - k / (N + 1)) * 0.38;
            ctx.drawImage(this._entBuf, entity.x - this._cameraX + ox, entity.y, entity.pw, entity.ph);
        }
        ctx.restore();
    }

    // 달리기 중 발밑에서 모래 입자가 뒤로 흩날리는 시그니처 효과
    _updateDust(dt) {
        const dtSec = dt / 1000;
        const re = this._runEntity;
        const isRunning = this._runState === 'running' && re?.visible;

        if (isRunning && this._entBuf) {
            const buf = this._entBuf;
            const bCtx = this._entBufCtx;
            const rawPw = re._rawPw ?? re.pw;
            const rawPh = re._rawPh ?? re.ph;
            const sc = re.pw / rawPw;
            const footY = re.y + RUN_FOOT_ROW;

            this._dustAcc += 18 * dtSec;
            while (this._dustAcc >= 1) {
                this._dustAcc -= 1;
                // 발 근처 하단 20% 구역에서 랜덤 픽셀 샘플
                const lx = (Math.random() * rawPw) | 0;
                const ly = (rawPh * 0.78 + Math.random() * rawPh * 0.22) | 0;
                let imgData;
                try { imgData = bCtx.getImageData(lx, ly, 1, 1).data; } catch(e) { break; }
                if (imgData[3] < 16) continue;
                const r = Math.min(255, imgData[0] + 30);
                const g = Math.min(255, imgData[1] + 20);
                const b = Math.min(255, imgData[2] + 10);
                this._dustParticles.push({
                    x: re.x + lx * sc,
                    y: re.y + ly * sc,
                    vx: (Math.random() - 0.5) * 20 - this._runDir * 35,
                    vy: (Math.random() * 6 - 8),
                    age: 0,
                    maxlife: 0.4 + Math.random() * 0.5,
                    r, g, b,
                });
            }
        }

        const H = this._H;
        for (let i = this._dustParticles.length - 1; i >= 0; i--) {
            const q = this._dustParticles[i];
            q.vy += 120 * dtSec;
            q.x  += q.vx * dtSec;
            q.y  += q.vy * dtSec;
            q.age += dtSec;
            if (q.age >= q.maxlife || q.y > H + 4) this._dustParticles.splice(i, 1);
        }
    }

    _renderDust(ctx) {
        const G = 2;
        ctx.save();
        for (const p of this._dustParticles) {
            const t = p.age / p.maxlife;
            const a = (t > 0.6 ? (1 - (t - 0.6) / 0.4) : 1) * 0.75;
            if (a <= 0.03) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
            ctx.fillRect((((p.x - this._cameraX) / G) | 0) * G, ((p.y / G) | 0) * G, G, G);
        }
        ctx.restore();
    }

    // ── 픽셀 추출 ──────────────────────────────────────────────
    _pixelsScreen(entity, frameIdx, flip) {
        const pixels = entity._frames
            ? (entity._frames[frameIdx]?.pixels ?? [])
            : (entity._pixels ?? []);
        const pal = entity._palette ?? [];
        const out = [];
        const ox    = entity.x, oy = entity.y;
        const rawPw = entity._rawPw ?? entity.pw;
        const sc    = entity.pw / rawPw;   // = CHAR_SCALE
        for (const [px, py, idx] of pixels) {
            const hex = pal[idx];
            if (!hex || hex === 'transparent') continue;
            const rawX = flip ? rawPw - 1 - px : px;
            const cx = ox + Math.round(rawX * sc);
            const cy = oy + Math.round(py   * sc);
            out.push([cx, cy,
                parseInt(hex.slice(1,3), 16),
                parseInt(hex.slice(3,5), 16),
                parseInt(hex.slice(5,7), 16)]);
        }
        return out;
    }

    // ── 블렌드 초기화 ─────────────────────────────────────────
    _startPixelMoveBlend(src, dst, dur, onDone, straight = false, riseOffset = 0) {
        const N = src.length;
        if (!N) { onDone?.(); return; }

        let sx=0, sy=0, dx=0, dy=0;
        for (let i=0; i<N; i++) {
            sx += src[i][0]; sy += src[i][1];
            dx += (dst[i]??src[i])[0]; dy += (dst[i]??src[i])[1];
        }
        sx/=N; sy/=N; dx/=N; dy/=N;

        const tDir = Math.atan2(dy - sy, dx - sx);
        const cosA = Math.cos(tDir), sinA = Math.sin(tDir);

        let minL = Infinity, maxL = -Infinity;
        const particles = src.map((s, i) => {
            const d      = dst[i] ?? s;
            const relX   = s[0] - sx, relY = s[1] - sy;
            const longP  = relX * cosA + relY * sinA;
            const transP = -relX * sinA + relY * cosA;
            if (longP < minL) minL = longP;
            if (longP > maxL) maxL = longP;
            return { sx:s[0], sy:s[1], sr:s[2], sg:s[3], sb:s[4],
                     dx:d[0], dy:d[1],
                     longP, transP,
                     ff:       Math.random(),
                     ecgFreq:  1 + Math.random() * 3,
                     ecgPhase: Math.random() * 4 };
        });

        const gatherX  = sx + cosA * (maxL + 50);
        const gatherY  = sy + sinA * (maxL + 50);
        const releaseX = dx + cosA * (minL - 50);
        const releaseY = dy + sinA * (minL - 50);

        const streamDot = cosA * (releaseX - gatherX) + sinA * (releaseY - gatherY);
        const midX = (sx + dx) / 2, midY = (sy + dy) / 2;
        // straight=true → 오버슈트(출발·도착점 너머) 제거, 중심선 직선 흐름
        const safeGX = straight ? sx : (streamDot > 0 ? gatherX  : midX);
        const safeGY = straight ? sy : (streamDot > 0 ? gatherY  : midY);
        const safeRX = straight ? dx : (streamDot > 0 ? releaseX : midX);
        const safeRY = straight ? dy : (streamDot > 0 ? releaseY : midY);

        this._pmBlend = {
            particles,
            gatherX: safeGX, gatherY: safeGY,
            releaseX: safeRX, releaseY: safeRY,
            cosA, sinA, dur, t: 0, onDone,
            riseOffset,
        };
    }

    // ── ECG 심박 파형 ─────────────────────────────────────────
    _ecg(t) {
        const tc = ((t % 1) + 1) % 1;
        if (tc < 0.20) return 0;
        if (tc < 0.26) return -(tc - 0.20) / 0.06 * 0.25;
        if (tc < 0.32) return -0.25 + (tc - 0.26) / 0.06 * 1.25;
        if (tc < 0.40) return 1.0  - (tc - 0.32) / 0.08 * 1.4;
        if (tc < 0.46) return -0.4 + (tc - 0.40) / 0.06 * 0.4;
        if (tc < 0.58) return 0;
        if (tc < 0.72) return Math.sin((tc - 0.58) / 0.14 * Math.PI) * 0.28;
        return 0;
    }

    // ── 모래시계 렌더 ─────────────────────────────────────────
    _renderPixelMove(ctx, b) {
        const prog = Math.min(b.t / b.dur, 1);
        const ease = t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
        const W = this._W, H = this._H;

        if (!this._blendBuf || this._blendBuf.width !== W || this._blendBuf.height !== H) {
            this._blendBuf        = document.createElement('canvas');
            this._blendBuf.width  = W;
            this._blendBuf.height = H;
            this._blendBufCtx     = this._blendBuf.getContext('2d');
            this._blendImgD       = this._blendBufCtx.createImageData(W, H);
        }
        const imgD = this._blendImgD;
        imgD.data.fill(0);
        const d = imgD.data;

        // 파티클 좌표는 월드 좌표 → 화면 렌더 시 카메라 오프셋 적용
        const camX = this._cameraX | 0;
        const riseShift = ((b.riseOffset || 0) * prog) | 0;   // 채우며 상승

        for (const p of b.particles) {
            const trav = (prog - p.ff * 0.5) / 0.5;
            let wx, py, a;   // wx = 월드 x

            if (trav <= 0) {
                wx = p.sx|0; py = p.sy|0; a = 255;
            } else if (trav >= 1) {
                wx = p.dx|0; py = p.dy|0; a = 255;
            } else {
                const gpx = b.gatherX  - b.sinA * (p.transP * WAIST_SCALE);
                const gpy = b.gatherY  + b.cosA * (p.transP * WAIST_SCALE);
                const rpx = b.releaseX - b.sinA * (p.transP * WAIST_SCALE);
                const rpy = b.releaseY + b.cosA * (p.transP * WAIST_SCALE);

                let bpx, bpy;
                if (trav < 0.25) {
                    const t = ease(trav / 0.25);
                    bpx = p.sx + (gpx - p.sx) * t;
                    bpy = p.sy + (gpy - p.sy) * t;
                    wx = bpx | 0; py = bpy | 0;
                } else if (trav < 0.75) {
                    const st = ease((trav - 0.25) / 0.50);
                    bpx = gpx + (rpx - gpx) * st;
                    bpy = gpy + (rpy - gpy) * st;
                    wx  = bpx | 0;
                    py  = bpy | 0;
                } else {
                    const raw = (trav - 0.75) / 0.25;
                    const t = raw * raw * raw;
                    bpx = rpx + (p.dx - rpx) * t;
                    bpy = rpy + (p.dy - rpy) * t;
                    wx = bpx | 0; py = bpy | 0;
                }
                a = 215;
            }

            const px = wx - camX;
            const py2 = py - riseShift;             // 채우며 부드럽게 상승
            if (px < 0 || px >= W || py2 < 0 || py2 >= H) continue;
            const off = (py2 * W + px) * 4;
            if (a > d[off + 3]) {
                // 지상이동(클릭 이동 픽셀 스트림) 캐릭터 어둡기 — putImageData는 ctx.filter가 안 먹어 직접 곱함
                d[off]=p.sr * CHAR_BRIGHTNESS; d[off+1]=p.sg * CHAR_BRIGHTNESS; d[off+2]=p.sb * CHAR_BRIGHTNESS; d[off+3]=a;
            }
        }

        if (b.t < FLASH_MS) {
            const fa = ((1 - b.t / FLASH_MS) * 255) | 0;
            for (const p of b.particles) {
                const x = (p.sx|0) - camX, y = p.sy|0;
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const off = (y * W + x) * 4;
                d[off]   = Math.min(255, d[off]   + fa);
                d[off+1] = Math.min(255, d[off+1] + fa);
                d[off+2] = Math.min(255, d[off+2] + fa);
                d[off+3] = 255;
            }
        }
        // 이동 완료 시 흰색 번쩍임(끝 플래시) 제거 — 재조립 모습이 잘 보이도록
        // (필요 시 위 시작 플래시 블록을 참고해 복원)

        this._blendBufCtx.putImageData(imgD, 0, 0);
        ctx.drawImage(this._blendBuf, 0, 0);
    }

    // ── 픽셀 나타나기 (착지 후 모래 → 캐릭터) ────────────────
    _startPixelAppearBlend(entity, dur, onDone) {
        const dst = this._pixelsScreen(entity, entity._frameIdx ?? 0, entity.flipX ?? false);
        if (!dst.length) { onDone?.(); return; }
        const spread = 60;
        const src = dst.map(d => [
            d[0] + (Math.random() - 0.5) * spread * 2,
            d[1] + Math.random() * spread,
            d[2], d[3], d[4],
        ]);
        this._startPixelMoveBlend(src, dst, dur, onDone);
    }

    // ── 조준 중 날아가는 자세 오버레이 ───────────────────────
    _renderAimPose(ctx, entity) {
        const info = this._animFrames?.jump_loop;
        if (!info?.imgs?.length) return;
        const img = info.imgs[info.imgs.length - 1];
        if (!img) return;
        const p   = this._player;
        if (!p)   return;
        const charH = p.ph;
        const footX = p.x - this._cameraX + p.pw / 2;
        const footY = this._groundY ?? (p.y + IDLE_FOOT_ROW);
        const scale = charH * 1.3 / Math.max(img.width, img.height);
        const dw = img.width * scale, dh = img.height * scale;
        const flip = p.flipX;
        const x = footX - dw / 2, y = footY - dh;
        ctx.save();
        ctx.globalAlpha = 0.85;
        if (flip) {
            ctx.translate(x + dw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, y, dw, dh);
        } else {
            ctx.drawImage(img, x, y, dw, dh);
        }
        ctx.restore();
    }

    // 이미지의 불투명 픽셀 세로 범위 (최상단/최하단 행) 계산
    _computeVBounds(img) {
        try {
            if (!this._vbCv) {
                this._vbCv  = document.createElement('canvas');
                this._vbCtx = this._vbCv.getContext('2d', { willReadFrequently: true });
            }
            const cv = this._vbCv, c = this._vbCtx;
            cv.width = img.width; cv.height = img.height;
            c.clearRect(0, 0, img.width, img.height);
            c.drawImage(img, 0, 0);
            const d = c.getImageData(0, 0, img.width, img.height).data;
            let topRow = -1, footRow = -1;
            for (let y = 0; y < img.height; y++) {
                let any = false;
                const rowOff = y * img.width * 4;
                for (let x = 0; x < img.width; x++) {
                    if (d[rowOff + x * 4 + 3] > 24) { any = true; break; }
                }
                if (any) { if (topRow < 0) topRow = y; footRow = y; }
            }
            return { topRow: topRow < 0 ? 0 : topRow, footRow: footRow < 0 ? img.height : footRow + 1 };
        } catch (e) {
            return { topRow: 0, footRow: img.height };
        }
    }

    // ── GIF + 시퀀스 에셋 로더 ───────────────────────────────
    async _loadAnimAssets() {
        const base = './pixels/characters/jump/';
        const loadImg = src => new Promise((res, rej) => {
            const img = new Image();
            img.onload  = () => res(img);
            img.onerror = () => { console.warn('[nuri] img load fail:', src); rej(new Error(src)); };
            img.src = src;
        });
        try {
            const [meta, seqDefs] = await Promise.all([
                fetch(base + 'meta.json',           { cache: 'no-store' }).then(r => r.json()),
                fetch('./data/anim_sequences.json', { cache: 'no-store' }).then(r => r.json()),
            ]);
            const frames = {};
            for (const [key, info] of Object.entries(meta)) {
                // 개별 프레임 로드 실패 시 해당 키만 스킵
                try {
                    const imgs = await Promise.all(info.frames.map(f => loadImg(base + f.file)));
                    // 프레임별 실제 발(최하단)·머리(최상단) 행 계산 → 발 기준 정렬용
                    const bounds = imgs.map(img => this._computeVBounds(img));
                    frames[key] = {
                        imgs, frames: info.frames,
                        footRows: bounds.map(b => b.footRow),
                        topRows:  bounds.map(b => b.topRow),
                    };
                } catch (e) {
                    console.warn(`[nuri] skip anim key "${key}":`, e.message);
                }
            }
            this._animFrames = frames;
            this._seqDefs    = seqDefs;
            console.log('[nuri] anim assets loaded:', Object.keys(frames));
        } catch (e) {
            console.warn('[nuri] anim assets load error:', e);
        }
    }

    // ── 스핀 파티클 생성 ──────────────────────────────────────
    _updateSpinParticles(dt) {
        // 회전(spin_fall) 중에만 — 톱니바퀴 파편처럼 접선 방향으로 모래 픽셀 방출.
        // 활성 여부는 phase.fx 의 spinSparks(during) 데이터로 게이팅.
        const spinFX = this._activeFX('spinSparks');
        if (!spinFX || spinFX.enabled === false) return;
        const p = this._player;
        if (!p) return;

        const cx  = p.x - this._cameraX + p.pw / 2;
        const cy  = p.y + p.ph * 0.45;            // 회전 중심(시각 중심) 근사
        const dir = p.flipX ? -1 : 1;              // 회전 방향(렌더와 일치)

        this._spinPartAcc += SPIN_SPARK_RATE * dt / 1000;
        while (this._spinPartAcc >= 1) {
            this._spinPartAcc -= 1;
            const a  = Math.random() * Math.PI * 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            // 접선(회전 방향) + 약간의 바깥쪽 성분 → 휘날리는 파편
            const vt = SPIN_SPARK_VT * (0.7 + Math.random() * 0.6);
            const vo = SPIN_SPARK_VO * (0.4 + Math.random() * 0.9);
            const tx = -sa * dir, ty = ca * dir;   // 접선 단위벡터
            // 불꽃 색: 대부분 진한 주황~빨강, 일부 흰열(hot core)
            const hot = Math.random() < SPIN_SPARK_HOT;
            const r = hot ? 255 : 235 + (Math.random() * 20 | 0);
            const g = hot ? 235 + (Math.random() * 20 | 0) : 80 + (Math.random() * 90 | 0);
            const b = hot ? 190 + (Math.random() * 50 | 0) : 18 + (Math.random() * 42 | 0);
            this._impactParticles.push({
                x: cx + ca * SPIN_SPARK_RADIUS,
                y: cy + sa * SPIN_SPARK_RADIUS,
                vx: tx * vt + ca * vo,
                vy: ty * vt + sa * vo,
                age: 0,
                maxlife: 0.16 + Math.random() * 0.28,
                r, g, b,
                streak: true,
            });
        }
    }

    // ── 데이터 기반 VFX 디스패처 ──────────────────────────────
    // phase.fx 배열의 'enter'(또는 미지정) 효과를 phase 진입 시 1회 실행.
    // 'during' 효과는 매 프레임 _updateSpinParticles 등에서 phase.fx 를 직접 읽음.
    // type 매핑:
    //   landImpact → 착지 충격파(_triggerLandImpact)
    //   flash/shake/colorShift/emit:* → 엔진 FX/Particle (엔진 연동 시 확장)
    _runPhaseFX(ph) {
        for (const fx of (ph.fx ?? [])) {
            if (fx.when && fx.when !== 'enter') continue;   // during 등은 여기서 스킵
            switch (fx.type) {
                // ── nuri 자체 효과 ──
                case 'landImpact':
                    this._triggerLandImpact(fx);
                    break;
                // ── 모래엔진 FXSystem (화면 단위) ──
                case 'flash':
                    this.engine?.fx?.flash({
                        color: fx.color ?? '#ffffff',
                        duration: fx.duration ?? 200,
                        maxAlpha: fx.maxAlpha ?? 0.6,
                        blend: fx.blend ?? 'source-over',
                    });
                    break;
                case 'shake':
                    this.engine?.fx?.shake({
                        intensity: fx.intensity ?? 4,
                        duration: fx.duration ?? 300,
                        decay: fx.decay ?? 1,
                    });
                    break;
                case 'colorShift':
                    this.engine?.fx?.colorShift({
                        color: fx.color ?? '#ff8800',
                        duration: fx.duration ?? 500,
                        blend: fx.blend ?? 'overlay',
                        maxAlpha: fx.maxAlpha ?? 0.3,
                    });
                    break;
                // ── 모래엔진 ParticleSystem ──
                // fx.particle = vortex|stardust|sand_rain|burst|convergence|
                //               erosion|streak|wake|drift|pixel_burst
                case 'emit': {
                    const at = this._fxOrigin(fx.at);   // 기본: 캐릭터 발 (월드 좌표)
                    this.engine?.particles?.emit(fx.particle ?? 'burst', {
                        cx: fx.cx ?? at.x,
                        cy: fx.cy ?? at.y,
                        count: fx.count ?? 20,
                        ...fx.config,
                    });
                    break;
                }
                // 렌더 모디파이어 — AnimPhasePlayer.render 가 직접 소비 (여기선 no-op)
                case 'spin': case 'squash': case 'afterimage': case 'spinSparks':
                    break;
                default:
                    if (fx.type) console.warn(`[nuri] unknown phase fx: ${fx.type}`);
            }
        }
    }

    // VFX 기준점(월드 좌표). at='foot'(기본)|'center'|'head'
    _fxOrigin(at = 'foot') {
        const p = this._player;
        if (!p) return { x: 0, y: 0 };
        const x = p.x + p.pw / 2;
        const footY = this._groundY ?? (p.y + IDLE_FOOT_ROW);
        if (at === 'center') return { x, y: p.y + p.ph * 0.5 };
        if (at === 'head')   return { x, y: p.y };
        return { x, y: footY };
    }

    // 현재 활성 phase 의 fx 중 type 일치하는 첫 항목 반환 (during 효과 게이팅용)
    _activeFX(type) {
        const fxs = this._seqPlayer?.currentPhase?.fx;
        if (!fxs) return null;
        return fxs.find(f => f.type === type) ?? null;
    }

    // ── 착지 충격파 트리거 ────────────────────────────────────
    _triggerLandImpact() {
        const p = this._player;
        if (!p) return;
        const cx = p.x - this._cameraX + p.pw / 2;
        const cy = this._groundY ?? (p.y + IDLE_FOOT_ROW);

        // 충격파 링 3개 (더 크게)
        this._shockRings = [
            { cx, cy, maxR: 210, t: 0, dur: 520 },
            { cx, cy, maxR: 150, t: 0, dur: 380 },
            { cx, cy, maxR:  95, t: 0, dur: 240 },
        ];

        // ① 먼지 폭발 파티클 280개 (좌우 180° 부채꼴, 더 빠르고 멀리)
        for (let i = 0; i < 280; i++) {
            const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
            const speed = 120 + Math.random() * 460;
            this._impactParticles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.5 - Math.random() * 40,
                age: 0,
                maxlife: 0.45 + Math.random() * 0.6,
                sz: 2 + (Math.random() * 2 | 0),
                r: 175 + (Math.random() * 55 | 0),
                g: 138 + (Math.random() * 45 | 0),
                b:  75 + (Math.random() * 35 | 0),
            });
        }

        // ② 바닥을 따라 낮게 퍼지는 먼지 구름 (느리고 넓고 큰 덩어리)
        for (let i = 0; i < 90; i++) {
            const side  = Math.random() < 0.5 ? -1 : 1;
            const speed = 40 + Math.random() * 180;
            this._impactParticles.push({
                x: cx + side * (Math.random() * 30),
                y: cy - Math.random() * 8,
                vx: side * speed,
                vy: -Math.random() * 30,
                age: 0,
                maxlife: 0.6 + Math.random() * 0.8,
                sz: 3 + (Math.random() * 3 | 0),
                r: 158 + (Math.random() * 50 | 0),
                g: 128 + (Math.random() * 42 | 0),
                b:  82 + (Math.random() * 34 | 0),
            });
        }

        this._landFlash = { t: 0, dur: 240 };
    }

    _updateImpactParticles(dt) {
        const dtS = dt / 1000;
        for (let i = this._impactParticles.length - 1; i >= 0; i--) {
            const q = this._impactParticles[i];
            q.vy += 220 * dtS;
            q.x  += q.vx * dtS;
            q.y  += q.vy * dtS;
            q.age += dtS;
            if (q.age >= q.maxlife || q.y > this._H + 8) this._impactParticles.splice(i, 1);
        }
    }

    _updateShockRings(dt) {
        for (const r of this._shockRings) r.t += dt;
        this._shockRings = this._shockRings.filter(r => r.t < r.dur);
        if (this._landFlash) {
            this._landFlash.t += dt;
            if (this._landFlash.t >= this._landFlash.dur) this._landFlash = null;
        }
    }

    // ── 공중 이동 GIF 오버레이 렌더 ──────────────────────────
    // frontPass=false → pull/fly (배경 위, 캐릭터 아래)
    // frontPass=true  → arrive_loop/arrive_end/land (충격파·flash 위)
    _renderSeqOverlay(ctx, frontPass = false) {
        if (!this._seqPlayer?.isActive) return;
        const p = this._player;
        if (!p) return;
        const curId     = this._seqPlayer.currentId;
        const isFront   = curId === 'rise' || curId === 'spin_fall' || curId === 'land' || curId === 'arrive_loop' || curId === 'arrive_end';
        if (frontPass !== isFront) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = `brightness(${CHAR_BRIGHTNESS})`;   // 공중이동(jump/fly 시퀀스) 캐릭터 어둡기
        this._seqPlayer.render(ctx, {
            playerX:     p.x,
            playerY:     p.y,
            playerPW:    p.pw,
            playerPH:    p.ph,
            cameraX:     this._cameraX,
            groundY:     this._groundY,
            charH:       p.ph,
            flip:        p.flipX,
            idleFootRow: IDLE_FOOT_ROW,
            flyX:        this._flyX ?? undefined,
            refSrcH:     AERIAL_REF_SRC_H,
            spinFixedBlur: this._spinFixedBlur,
            velX:        this._aerialVel?.x ?? 0,
            velY:        this._aerialVel?.y ?? 0,
        });
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = false;
    }

    // ── 충격파 / 플래시 렌더 ─────────────────────────────────
    _renderImpactParticles(ctx) {
        const G = 2;
        ctx.save();
        for (const q of this._impactParticles) {
            const t = q.age / q.maxlife;
            const a = (t > 0.55 ? (1 - (t - 0.55) / 0.45) : 1) * 0.85;
            if (a <= 0.02) continue;

            if (q.streak) {
                // 불꽃 파편: 속도 방향으로 늘어진 선 + 가산합성
                const sp = Math.hypot(q.vx, q.vy) || 1;
                const len = Math.min(26, sp * 0.045) * (0.5 + (1 - t) * 0.5);
                const ux = q.vx / sp, uy = q.vy / sp;
                ctx.globalAlpha = a;
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = `rgb(${q.r},${q.g},${q.b})`;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(q.x, q.y);
                ctx.lineTo(q.x - ux * len, q.y - uy * len);
                ctx.stroke();
                continue;
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${q.r},${q.g},${q.b})`;
            const sz = q.sz ?? G;
            ctx.fillRect(((q.x / G) | 0) * G, ((q.y / G) | 0) * G, sz, sz);
        }
        ctx.restore();
    }

    _renderShockRings(ctx) {
        for (const ring of this._shockRings) {
            const prog  = ring.t / ring.dur;
            const r     = ring.maxR * Math.pow(prog, 0.55);
            const alpha = (1 - prog) * 0.75;
            const lw    = (1 - prog) * 4 + 1;
            ctx.save();
            ctx.globalAlpha  = alpha;
            ctx.strokeStyle  = `rgb(230,190,110)`;
            ctx.lineWidth    = lw;
            ctx.beginPath();
            ctx.arc(ring.cx, ring.cy, Math.max(1, r), Math.PI, 0);
            ctx.stroke();
            ctx.restore();
        }
    }

    _renderLandFlash(ctx) {
        if (!this._landFlash) return;
        const alpha = (1 - this._landFlash.t / this._landFlash.dur) * 0.38;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = 'white';
        ctx.fillRect(0, 0, this._W, this._H);
        ctx.restore();
    }
}
