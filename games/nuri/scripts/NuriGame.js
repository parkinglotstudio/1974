// NuriGame.js — 누리 / NURI  v3.0
// 조이스틱 달리기 + 모래시계 PixelStream + 오비터 + 기억(記憶) 컨트롤 기반
// 배경: 2021 원경 + 인트로 모래 연출 + 카메라 스크롤

import { Scene }           from '../../../engine/scene/SceneManager.js';
import { AnimPhasePlayer } from '../../../engine/anim/AnimPhasePlayer.js';

const HOLD_THRESHOLD    = 500;   // 이동/파동 분기 임계값 (ms)

// ── 공중 이동 물리 ──
const GRAVITY           = 600;   // px/s²
const AIR_HANG_MS       = 400;
const LAND_MS           = 400;
const PM_DURATION       = 700;
const WAIST_SCALE       = 0.05;
const FLASH_MS          = 200;
const CHAR_SCALE        = 1.0;
const RAW_IDLE_FOOT_ROW = 256;
const RAW_RUN_FOOT_ROW  = 260;
const IDLE_FOOT_ROW     = Math.round(RAW_IDLE_FOOT_ROW * CHAR_SCALE);  // 128
const RUN_FOOT_ROW      = Math.round(RAW_RUN_FOOT_ROW  * CHAR_SCALE);  // 130
const RUN_SPEED         = 160;   // px/s

// ── 맵 / 카메라 ──
const WORLD_WIDTH       = 3119;
const BG_FAR_W          = 3748;
const BG_FAR_H          = 960;
const BG_FAR_Y          = -100;  // 배경 y 오프셋

// ── 인트로 ──
const INTRO_MS          = 2400;
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
        this._impactParticles = [];
        this._shockRings      = [];
        this._landFlash       = null;
        this._spinPartAcc     = 0;

        this._initMessages(engine);
        this._initAmmoLevels(engine);
        this._loadRunEntity(engine);
        this._loadBgFar();
        this._loadAnimAssets();
        this._setupJoystick();

        this._onDown = this._handleDown.bind(this);
        this._onUp   = this._handleUp.bind(this);
        this._onMove = this._handleMove.bind(this);
        engine.canvas.addEventListener('pointerdown', this._onDown);
        engine.canvas.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
    }

    onExit() {
        this.engine?.canvas.removeEventListener('pointerdown', this._onDown);
        this.engine?.canvas.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
        if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
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
            this._lockAmmo(cx, cy);
        }
    }

    _handleMove(e) {
        if (!this._pointerDown) return;
        this._mousePos = this._toCanvas(e);
    }

    _handleUp() {
        if (!this._pointerDown) return;
        this._pointerDown = false;
        this._chargePhase = 0;

        // 달리기 중·블렌드 중·공중 이동 중이면 취소
        if (this._runState !== 'idle' || this._pmBlend || this._flyData || this._seqPlayer?.isActive) {
            this._releaseAmmo();
            return;
        }

        if (this._lockedSlot) {
            this._consumeAmmo();
            this._startMove(this._mousePos);
        } else {
            this._releaseAmmo();
            this._showMessage('no_ammo');
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

        // 목표가 캐릭터 머리 위 → 공중 이동
        const headY = p.y;
        if (targetPos.y < headY) {
            this._startAerialMove(targetPos);
            return;
        }

        // ── 지상 이동 (기존 방식) ──
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

    // ── 공중 이동 ─────────────────────────────────────────────
    // 4모션: pull → fly → arrive_loop → arrive_end → land
    _startAerialMove(targetPos) {
        const p = this._player;
        if (!p || this._pmBlend || this._flyData || this._seqPlayer?.isActive) return;
        if (!this._animFrames || !this._seqDefs) return;

        if (this._groundY === null) this._groundY = p.y + IDLE_FOOT_ROW;

        const worldTX = targetPos.x + this._cameraX;
        const dstX    = Math.max(0, Math.min(WORLD_WIDTH - p.pw, worldTX - p.pw / 2));
        const newFlip = worldTX > p.x + p.pw / 2;
        const dist    = Math.abs(dstX - p.x);
        const flyDur  = Math.max(400, Math.min(1200, dist / this._W * 1600));

        p.flipX   = newFlip;
        p.visible = false;

        // pull 단계: 아직 flyData 없음 (캐릭터 제자리 대기)
        this._flyData = null;
        this._flyX    = p.x;   // pull 중에는 현재 위치 고정

        if (!this._seqPlayer) {
            this._seqPlayer = new AnimPhasePlayer(this._seqDefs);
        }

        const startX = p.x;
        this._seqPlayer.start('aerial_move', this._animFrames, {
            onPull: () => {
                // pull phase: 제자리에서 당기기 모션
                this._flyX = startX;
            },
            onFly: () => {
                // fly phase: flyData 활성화 → lerp 이동 시작
                this._flyData = { startX, endX: dstX, dur: flyDur, elapsed: 0, arrived: false };
            },
            onArrive: () => {
                // arrive_loop: 목적지 X 고정
                p.x = dstX;
                this._flyX = dstX;
            },
            onImpact: () => {
                // arrive_end: 충격파 + 모래
                this._triggerLandImpact();
            },
            onLand: () => {
                // land phase 시작: 캐릭터 위치 확정
                p.x = dstX;
                p.y = (this._groundY ?? (this._H - 20)) - IDLE_FOOT_ROW;
            },
            onAppear: () => {
                // 마지막 phase 완료 → 캐릭터 표시
                p.x = dstX;
                p.y = (this._groundY ?? (this._H - 20)) - IDLE_FOOT_ROW;
                p.visible = true;
                this._setAnim(p, 'idle') || this._setAnim(p, 'run_stop');
            },
            onDone: () => {
                this._flyData = null;
                this._flyX    = null;
            },
        });
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
        if (!fd) return;
        const p = this._player;

        fd.elapsed = Math.min(fd.dur, fd.elapsed + dt);
        const t    = fd.elapsed / fd.dur;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        this._flyX = fd.startX + (fd.endX - fd.startX) * ease;

        if (!fd.arrived && fd.elapsed >= fd.dur) {
            fd.arrived = true;
            p.x = fd.endX;
            p.y = (this._groundY ?? (this._H - 20)) - IDLE_FOOT_ROW;
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

        if (re.asm) { re.asm.setState('run'); re.asm.restart(); }

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
        this._updateAmmo(dt);
        this._updateMessage(dt);
        this._updateAirState(dt);
        this._updateFly(dt);
        this._seqPlayer?.update(dt);
        this._updateSpinParticles(dt);
        this._updateImpactParticles(dt);
        this._updateShockRings(dt);
        this._updateDust(dt);
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

        // 조이스틱 상태머신 (픽셀 블렌드·공중 상태 중에는 처리 안 함)
        if (!this._pmBlend && !this._airState) this._updateRunState(now, dt);
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
                        re.x = Math.max(0, Math.min(maxX, re.x + this._runDir * RUN_SPEED * dt / 1000));
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
            this._renderAimLine(ctx, activeEnt);
        }

        // fly GIF (캐릭터 아래 레이어)
        this._renderSeqOverlay(ctx, false);

        if (this._pmBlend) {
            this._renderPixelMove(ctx, this._pmBlend);
        } else if (activeEnt?.visible !== false) {
            if (isRunning) {
                this._buildEntBuf(re);
                this._renderAmmo(ctx, false, re);
                this._renderDust(ctx);
                this._renderTrail(ctx, re);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(this._entBuf, re.x - this._cameraX, re.y, re.pw, re.ph);
                ctx.imageSmoothingEnabled = false;
                this._renderAmmo(ctx, true, re);
            } else {
                this._renderAmmo(ctx, false, activeEnt);
                this._drawEntityCam(ctx, activeEnt);
                this._renderAmmo(ctx, true, activeEnt);
            }
        }
        this._renderImpactParticles(ctx);
        this._renderShockRings(ctx);
        this._renderLandFlash(ctx);
        // land GIF는 flash/shock 위에 그려야 보임
        this._renderSeqOverlay(ctx, true);
        this._renderMessage(ctx);
    }

    // 카메라 x 적용 drawEntity
    _drawEntityCam(ctx, entity) {
        if (!this._buildEntBuf(entity)) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._entBuf, entity.x - this._cameraX, entity.y, entity.pw, entity.ph);
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

    // ── 탄창 시스템 ───────────────────────────────────────────
    // 탄창 슬롯 데이터 테이블
    // state: 'orbit' | 'locked' | 'empty'
    // orbit  → 궤도 회전 중 (사용 가능)
    // locked → pointerdown으로 잠금, 라인 발사 기준점
    // empty  → 소모됨, regenMs 카운트 중
    // angle은 _initAmmo에서 count 기준 균등 배치로 덮어씀
    static _AMMO_TABLE = [
        { angVel: 0.45, rx: 65, ry: 22, size: 13, morphT: 0.0, morphSpeed: 1.5 },
        { angVel: 0.38, rx: 58, ry: 19, size: 10, morphT: 1.4, morphSpeed: 2.0 },
        { angVel: 0.52, rx: 70, ry: 25, size: 11, morphT: 2.8, morphSpeed: 1.7 },
        { angVel: 0.41, rx: 62, ry: 21, size: 14, morphT: 4.2, morphSpeed: 1.3 },
        { angVel: 0.47, rx: 68, ry: 23, size:  9, morphT: 5.6, morphSpeed: 2.2 },
        { angVel: 0.43, rx: 60, ry: 20, size: 12, morphT: 3.0, morphSpeed: 1.8 },
        { angVel: 0.50, rx: 72, ry: 26, size: 11, morphT: 1.8, morphSpeed: 1.6 },
    ];

    _initAmmo(count = 5) {
        // 모프 포인트 — 한 번만 생성
        if (!this._ammoPts) {
            const N = 24, sq = [], ci = [];
            for (let i = 0; i < N; i++) {
                const d = (i / N) * 4;
                let x, y;
                if (d < 1)      { x = d;         y = 0; }
                else if (d < 2) { x = 1;         y = d - 1; }
                else if (d < 3) { x = 1-(d-2);   y = 1; }
                else            { x = 0;         y = 1-(d-3); }
                sq.push([x - 0.5, y - 0.5]);
                const a = (i / N) * Math.PI * 2;
                ci.push([Math.cos(a) * 0.56, Math.sin(a) * 0.56]);
            }
            this._ammoPts = { sq, ci };
        }

        // 슬롯 생성: count개, angle은 균등 배치로 덮어씀
        const base = NuriGame._AMMO_TABLE;
        this._ammoSlots = Array.from({ length: count }, (_, i) => ({
            ...base[i % base.length],
            angle:   (i / count) * Math.PI * 2,
            state:   'orbit',
            regenMs: 0,
            lockedX: 0,
            lockedY: 0,
        }));

        // 레벨 전환 시 잠긴 슬롯이 구 배열에 속하면 해제
        if (this._lockedSlot && !this._ammoSlots.includes(this._lockedSlot)) {
            this._lockedSlot = null;
        }
    }

    // ── 메시지 시스템 ─────────────────────────────────────────
    _initMessages(engine) {
        this._msgMap    = new Map();
        this._activeMsg = null;   // { text, style, duration, remaining }
        const tbl = engine.data?.messages;
        if (!tbl) return;
        for (const row of tbl.all()) {
            if (!row.trigger) continue;
            this._msgMap.set(row.trigger, {
                text:     row.text_ko,
                duration: Number(row.duration_ms) || 2000,
                style:    row.style || 'info',
            });
        }
    }

    _showMessage(trigger) {
        const cfg = this._msgMap?.get(trigger);
        if (!cfg) return;
        this._activeMsg = { text: cfg.text, style: cfg.style, duration: cfg.duration, remaining: cfg.duration };
    }

    _updateMessage(dt) {
        if (!this._activeMsg) return;
        this._activeMsg.remaining -= dt;
        if (this._activeMsg.remaining <= 0) this._activeMsg = null;
    }

    _renderMessage(ctx) {
        const msg = this._activeMsg;
        if (!msg) return;

        const elapsed  = msg.duration - msg.remaining;
        const fadeIn   = Math.min(1, elapsed / 250);
        const fadeOut  = Math.min(1, msg.remaining / 250);
        const alpha    = Math.min(fadeIn, fadeOut);
        if (alpha <= 0.01) return;

        const STYLE_COLOR = { warning: [255, 160, 60], info: [180, 220, 255], hint: [160, 255, 180] };
        const [r, g, b] = STYLE_COLOR[msg.style] ?? STYLE_COLOR.info;

        const W = this._W, H = this._H;
        const fontSize = Math.round(H * 0.03);

        ctx.save();
        ctx.globalAlpha = alpha * 0.95;
        ctx.font        = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';

        // 그림자
        ctx.shadowColor   = `rgba(0,0,0,0.8)`;
        ctx.shadowBlur    = 8;
        ctx.fillStyle     = `rgb(${r},${g},${b})`;
        ctx.fillText(msg.text, W / 2, H * 0.12);

        ctx.restore();
    }

    // ── 원소 레벨 시스템 ──────────────────────────────────────
    _initAmmoLevels(engine) {
        this._ammoLevelMap = new Map();
        const tbl = engine.data?.ammoLevels;
        if (tbl) {
            for (const row of tbl.all()) {
                const lv = Number(row.level);
                if (!lv) continue;
                this._ammoLevelMap.set(lv, {
                    name:    row.name_ko,
                    maxAmmo: Number(row.max_ammo) || 5,
                    regenMs: Number(row.regen_ms) || 30000,
                });
            }
        }
        this._ammoLevel = 1;
        this._setAmmoLevel(1);
    }

    _setAmmoLevel(level) {
        const cfg = this._ammoLevelMap?.get(level) ?? { maxAmmo: 5, regenMs: 30000 };
        this._ammoLevel   = level;
        this._ammoRegenMs = cfg.regenMs;
        this._initAmmo(cfg.maxAmmo);
    }

    _updateAmmo(dt) {
        const dtSec = dt / 1000;
        for (const slot of this._ammoSlots) {
            if (slot.state === 'orbit') {
                slot.angle  = (slot.angle + slot.angVel * dtSec) % (Math.PI * 2);
                slot.morphT += slot.morphSpeed * dtSec;
            } else if (slot.state === 'empty') {
                slot.regenMs += dt;
                if (slot.regenMs >= this._ammoRegenMs) {
                    slot.state   = 'orbit';
                    slot.regenMs = 0;
                    slot.angle   = Math.random() * Math.PI * 2;
                    this._showMessage('regen_done');
                }
            }
            // locked 슬롯은 정지 상태 유지
        }
    }

    // pointerdown 시 호출 — 첫 번째 orbit 슬롯 잠금
    _lockAmmo(charCx, charCy) {
        for (const slot of this._ammoSlots) {
            if (slot.state !== 'orbit') continue;
            const sa  = Math.sin(slot.angle);
            slot.lockedX = charCx + Math.cos(slot.angle) * slot.rx;
            slot.lockedY = charCy + sa * slot.ry;
            slot.state   = 'locked';
            this._lockedSlot = slot;
            return slot;
        }
        return null;   // 탄창 없음
    }

    // pointerup(이동/공격) 시 호출 — 슬롯 소모
    _consumeAmmo() {
        if (!this._lockedSlot) return;
        this._lockedSlot.state   = 'empty';
        this._lockedSlot.regenMs = 0;
        this._lockedSlot = null;
    }

    // pointerup(취소) 시 호출 — 슬롯 복귀
    _releaseAmmo() {
        if (!this._lockedSlot) return;
        this._lockedSlot.state = 'orbit';
        this._lockedSlot = null;
    }

    _renderAmmo(ctx, frontPass, activeEnt) {
        const pts = this._ammoPts;
        const ent = activeEnt ?? this._player;
        if (!pts || !ent) return;

        const charCx = ent.x - this._cameraX + ent.pw / 2;
        const charCy = ent.y + (ent.ph || 150) * 0.38;

        ctx.save();
        for (const slot of this._ammoSlots) {
            if (slot.state === 'empty') continue;

            let ox, oy;
            if (slot.state === 'locked') {
                ox = slot.lockedX;
                oy = slot.lockedY;
            } else {
                const sa = Math.sin(slot.angle);
                if ((sa > 0) !== frontPass) continue;
                ox = charCx + Math.cos(slot.angle) * slot.rx;
                oy = charCy + sa * slot.ry;
            }
            if (slot.state === 'locked' && frontPass) continue;  // locked는 뒤 패스에만

            const sa    = slot.state === 'locked' ? 0 : Math.sin(slot.angle);
            const scale = slot.state === 'locked' ? 1.2 : (0.65 + 0.35 * (sa + 1) / 2);
            const sz    = slot.size * scale;
            const alpha = slot.state === 'locked' ? 1.0 : (frontPass ? 0.88 : 0.60);
            const phase = (Math.sin(slot.morphT) + 1) / 2;
            const morph = phase * phase * (3 - 2 * phase);

            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = 'lighter';
            const N = pts.sq.length;
            for (let i = 0; i < N; i++) {
                const s = pts.sq[i], c = pts.ci[i];
                const px = ox + (s[0] + (c[0] - s[0]) * morph) * sz;
                const py = oy + (s[1] + (c[1] - s[1]) * morph) * sz;
                // locked: 시안 단색으로 강조
                if (slot.state === 'locked') {
                    ctx.fillStyle = 'rgb(80,255,255)';
                } else {
                    ctx.fillStyle = (i % 2 === 0) ? 'rgb(255,110,210)' : 'rgb(110,200,255)';
                }
                ctx.fillRect(px | 0, py | 0, 3, 3);
            }
        }
        ctx.restore();
    }

    // ── 조준선 렌더 (홀드 중) ─────────────────────────────────
    _renderAimLine(ctx, activeEnt) {
        const ent = activeEnt ?? this._player;
        if (!ent) return;
        const mx = this._mousePos.x, my = this._mousePos.y;

        // 라인 기준점: locked 탄창 위치 → 없으면 캐릭터 중심
        const slot = this._lockedSlot;
        const cx = slot ? slot.lockedX : ent.x - this._cameraX + ent.pw / 2;
        const cy = slot ? slot.lockedY : ent.y + ent.ph * 0.45;
        const held = performance.now() - this._holdStart;
        const t = Math.min(1, held / HOLD_THRESHOLD);   // 0→1 (0.5초 동안)

        // 색상: 흰색 → 시안 → 주황 (phase 1→2)
        let r, g, b, alpha, lineW;
        if (this._chargePhase < 2) {
            // phase 1: 흰→시안
            r = Math.round(255 * (1 - t));
            g = 255;
            b = 255;
            alpha = 0.3 + t * 0.3;
            lineW = 1 + t * 0.5;
        } else {
            // phase 2: 시안→주황 (충전 지속 시간 기반)
            const ct = Math.min(1, (held - HOLD_THRESHOLD) / 1500);
            r = Math.round(0   + ct * 255);
            g = Math.round(255 - ct * 95);
            b = Math.round(255 - ct * 255);
            alpha = 0.6 + ct * 0.3;
            lineW = 2 + ct * 2;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth   = lineW;
        ctx.lineCap     = 'round';

        // 파동 충전 중: 사인파 출렁임
        if (this._chargePhase === 2) {
            const ct   = Math.min(1, (held - HOLD_THRESHOLD) / 1500);
            const amp  = 4 + ct * 10;
            const freq = 0.04 + ct * 0.02;
            const phase = held * 0.005;
            const dx = mx - cx, dy = my - cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) { ctx.restore(); return; }
            const ux = dx / len, uy = dy / len;
            const px = -uy, py = ux;   // 수직 방향

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            const steps = Math.max(20, len / 4) | 0;
            for (let i = 1; i <= steps; i++) {
                const f  = i / steps;
                const wx = cx + dx * f + px * Math.sin(f * len * freq + phase) * amp * f;
                const wy = cy + dy * f + py * Math.sin(f * len * freq + phase) * amp * f;
                ctx.lineTo(wx, wy);
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(mx, my);
        }

        ctx.stroke();

        // 목표 지점 점
        ctx.globalAlpha = alpha * 1.2;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(mx, my, lineW * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
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
    _startPixelMoveBlend(src, dst, dur, onDone) {
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
        const safeGX = streamDot > 0 ? gatherX  : midX;
        const safeGY = streamDot > 0 ? gatherY  : midY;
        const safeRX = streamDot > 0 ? releaseX : midX;
        const safeRY = streamDot > 0 ? releaseY : midY;

        this._pmBlend = {
            particles,
            gatherX: safeGX, gatherY: safeGY,
            releaseX: safeRX, releaseY: safeRY,
            cosA, sinA, dur, t: 0, onDone,
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
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const off = (py * W + px) * 4;
            if (a > d[off + 3]) {
                d[off]=p.sr; d[off+1]=p.sg; d[off+2]=p.sb; d[off+3]=a;
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
        if (b.dur - b.t < FLASH_MS) {
            const fa = ((1 - (b.dur - b.t) / FLASH_MS) * 255) | 0;
            for (const p of b.particles) {
                const x = (p.dx|0) - camX, y = p.dy|0;
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const off = (y * W + x) * 4;
                d[off]   = Math.min(255, d[off]   + fa);
                d[off+1] = Math.min(255, d[off+1] + fa);
                d[off+2] = Math.min(255, d[off+2] + fa);
                d[off+3] = 255;
            }
        }

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
                    frames[key] = { imgs, frames: info.frames };
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
        if (this._seqPlayer?.currentId !== 'spin') return;
        const p = this._player;
        if (!p) return;

        const cx = p.x - this._cameraX + p.pw / 2;
        const cy = p.y + p.ph / 2;

        this._spinPartAcc += 80 * dt / 1000;
        while (this._spinPartAcc >= 1) {
            this._spinPartAcc -= 1;
            const angle = Math.random() * Math.PI * 2;
            const speed = 130 + Math.random() * 200;
            this._impactParticles.push({
                x: cx + Math.cos(angle) * 18,
                y: cy + Math.sin(angle) * 18,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
                maxlife: 0.25 + Math.random() * 0.35,
                r: 196 + (Math.random() * 40 | 0),
                g: 155 + (Math.random() * 40 | 0),
                b:  90 + (Math.random() * 30 | 0),
            });
        }
    }

    // ── 착지 충격파 트리거 ────────────────────────────────────
    _triggerLandImpact() {
        const p = this._player;
        if (!p) return;
        const cx = p.x - this._cameraX + p.pw / 2;
        const cy = this._groundY ?? (p.y + IDLE_FOOT_ROW);

        // 충격파 링 2개
        this._shockRings = [
            { cx, cy, maxR: 140, t: 0, dur: 420 },
            { cx, cy, maxR:  90, t: 0, dur: 280 },
        ];

        // 먼지 폭발 파티클 120개 (좌우 180° 부채꼴)
        for (let i = 0; i < 120; i++) {
            const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
            const speed = 90 + Math.random() * 310;
            this._impactParticles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.45,
                age: 0,
                maxlife: 0.4 + Math.random() * 0.55,
                r: 175 + (Math.random() * 55 | 0),
                g: 138 + (Math.random() * 45 | 0),
                b:  75 + (Math.random() * 35 | 0),
            });
        }

        this._landFlash = { t: 0, dur: 200 };
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
        const isFront   = curId === 'arrive_loop' || curId === 'arrive_end' || curId === 'land';
        if (frontPass !== isFront) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
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
        });
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
            ctx.globalAlpha = a;
            ctx.fillStyle = `rgb(${q.r},${q.g},${q.b})`;
            ctx.fillRect(((q.x / G) | 0) * G, ((q.y / G) | 0) * G, G, G);
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
