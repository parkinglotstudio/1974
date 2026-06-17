/**
 * 스퀘어 — 인게임 씬 (v0.2 코어 슬라이스)
 * 조이스틱 이동 + 적 스폰/추적 + 자동 스킬 발사 + XP 드롭/픽업/레벨업.
 * HUD = data/ui_play.json.
 */
import { Scene } from '../engine/scene/SceneManager.js';
import PlayerEntity from './core/PlayerEntity.js';
import EnemySpawner from './core/EnemySpawner.js';
import SkillRunner  from './core/SkillRunner.js';
import XpDrops      from './core/XpDrops.js';
import SandFX       from './core/SandFX.js';
import SaveSystem   from './core/SaveSystem.js';

// 가상 조이스틱 데드존(px) — control_config.csv에 없는 보정값
const JOY_DEADZONE = 6;

export default class PlayScene extends Scene {
    constructor() {
        super('square_play');
        this._def  = null;
        this._t    = 0;      // 경과 ms
        this._sec  = -1;     // 마지막 표시 초
        // 로비가 입장 시 설정
        this.stageName = 'S1 · 야생 거리';
        this.stageId   = 's1';
        this.mult      = 1;

        this._joy = { active: false, ox: 0, oy: 0, vx: 0, vy: 0 };

        // 플레이어 자리표시 — 네모↔동그라미 핑크·시안 픽셀 모핑 (골목길 픽셀무브 효과 이식)
        this._pmTime = 0;
        this._pmPoints = null;
    }

    // 네모 둘레 N등분 점을 동그라미 둘레 각도로 매핑 (모핑용 점 집합 생성)
    _initPmPoints(side) {
        const N = 36, r = side * 0.56;
        const pts = [];
        for (let i = 0; i < N; i++) {
            const t = i / N, peri = t * 4;
            let sx, sy;
            if (peri < 1)       { sx = -side / 2 + peri * side;            sy = -side / 2; }
            else if (peri < 2)  { sx = side / 2;                           sy = -side / 2 + (peri - 1) * side; }
            else if (peri < 3)  { sx = side / 2 - (peri - 2) * side;       sy = side / 2; }
            else                { sx = -side / 2;                          sy = side / 2 - (peri - 3) * side; }
            const ang = t * Math.PI * 2;
            pts.push({ sx, sy, cx: Math.cos(ang) * r, cy: Math.sin(ang) * r, pink: (i & 1) === 0 });
        }
        this._pmPoints = pts;
    }

    async onEnter(engine) {
        this.engine = engine;
        this._t   = 0;
        this._sec = -1;
        if (!this._def) {
            this._def = await engine.assets.load('data/ui_play.json');
        }
        if (!this._cfg) {
            this._cfg = await engine.assets.load('data/core_config.json');
        }
        if (!this._meta) {
            this._meta = await engine.assets.load('data/meta_config.json');
        }
        if (!this._evo) {
            this._evo = await engine.assets.load('data/evolution_config.json');
        }

        const W = engine.gameWidth;
        const H = engine.gameHeight;
        // 월드는 화면보다 크고, 카메라가 플레이어를 따라간다
        this._bounds = { w: this._cfg.world?.w ?? W, h: this._cfg.world?.h ?? H };
        this._grid = this._cfg.map?.gridInterval ?? 60;

        // ── 카메라 락-포워드 구간(rooms) 설정 ──
        this._camMode = this._cfg.camera?.mode ?? 'follow';
        this._camLockRatio = this._cfg.camera?.lockRatio ?? 0.45;
        // 아래(시작)에서 위(보스)로 전진 — room[0]이 월드 최하단
        const roomsCfg = this._cfg.rooms?.[this.stageId];
        if (roomsCfg?.length) {
            const totalH = roomsCfg.reduce((sum, r) => sum + r.h, 0);
            let y = totalH;
            this._rooms = roomsCfg.map(r => {
                const yEnd = y; y -= r.h; const yStart = y;
                return { ...r, yStart, yEnd, cleared: false };
            });
            this._bounds.h = totalH;
            this._roomIdx = 0;
            this._roomKills = 0;
            this._roomTimer = 0;
            this._gateY = this._rooms[0].yStart; // 현재 구간 상단(전진 방향) 경계
        } else {
            this._rooms = null;
            this._gateY = null;
        }
        const ctrl = this._cfg.control ?? {};
        this._joyRadius = (ctrl.joystickMaxDist ?? 40) * (ctrl.scale ?? 1.75);
        this._joyKnob   = (ctrl.joystickKnobDiameter ?? 40) / 2 * (ctrl.scale ?? 1.75);
        this._joyRingOpacity = ctrl.joystickRingOpacity ?? 0.4;
        this._joyKnobOpacity = ctrl.joystickKnobOpacity ?? 0.7;
        this._cam = { x: 0, y: 0 };

        // ── 메타 진행도(장비/탈렌트) 보너스 + 스테이지 난이도 적용 ──
        this._save = SaveSystem.load();
        const bonus = SaveSystem.computeBonuses(this._save, this._meta, this._evo);
        const stage = this._meta.stages.find(s => s.id === this.stageId)
            ?? this._meta.stages[0];

        // ── 도전(난이도) 선택 — 해금된 마지막 도전(또는 최초 미클리어 도전) ──
        const stageMissions = this._meta.missions.filter(m => m.stageId === this.stageId);
        this._challenge = stageMissions.find(m => !this._save.missionCleared[m.id])
            ?? stageMissions[stageMissions.length - 1]
            ?? null;
        const chHpMult  = (stage.hpMult  ?? 1) * (this._challenge?.enemyHpMult  ?? 1);
        const chDmgMult = (stage.dmgMult ?? 1) * (this._challenge?.enemyDmgMult ?? 1);

        const playerCfg = { ...this._cfg.player,
            maxHp: this._cfg.player.maxHp + bonus.hpAdd,
            speed: this._cfg.player.speed * bonus.speedMult,
        };
        const enemyCfg = { ...this._cfg.enemy,
            speed:   this._cfg.enemy.speed * (stage.speedMult ?? 1),
            hpMult:  chHpMult,
            dmgMult: chDmgMult,
            spawnIntervalScale: stage.spawnIntervalScale ?? 1,
            maxEnemiesScale:    stage.maxEnemiesScale ?? 1,
        };
        const bossCfg = this._cfg.boss ? { ...this._cfg.boss,
            speed:   this._cfg.boss.speed * (stage.speedMult ?? 1),
            hpMult:  chHpMult,
            dmgMult: chDmgMult,
        } : null;
        const waves = this._cfg.waves?.[this.stageId] ?? [];

        this._baseMaxHp = playerCfg.maxHp;
        this._dmgReduce  = bonus.dmgReduce;
        this._magnetMult = bonus.magnetMult;
        this._lifesteal  = bonus.lifesteal;
        const startY = this._rooms ? this._bounds.h - 80 : this._bounds.h / 2;
        this.player  = new PlayerEntity(playerCfg, this._bounds.w / 2, startY);
        if (this._rooms) this._cam = { x: 0, y: Math.max(0, this._bounds.h - H) };
        this.enemies = new EnemySpawner(enemyCfg, bossCfg, this._cfg.difficulty, this._cfg.elements?.list, waves);
        // 락-포워드: 보스는 보스방 진입 전까지 스폰하지 않음
        if (this._rooms) this.enemies._bossTimer = Infinity;
        this.skills  = new SkillRunner(this._cfg.skills, this._cfg.elements, bonus.dmgMult, this._cfg.skillLevelScale, bonus.cooldownMult);
        this.xpDrops = new XpDrops(this._cfg.drop, this._cfg.level);
        this._joy = { active: false, ox: 0, oy: 0, vx: 0, vy: 0 };
        this._kills = 0;
        this._goldFromKills = 0;
        this._deaths  = [];   // 처치 파열 연출 큐
        this._pickups = [];   // XP 흡수 연출 큐
        this._choices = null; // 레벨업 카드 (null = 게임 진행 중)
        this._result  = null; // 게임오버 결과 카드 (null = 게임 진행 중)
        this._bossKilled = false;

        // 레벨업 카드 숫자키(1/2/3) 선택용 바인딩
        engine.input.bindAction('choice1', ['1']);
        engine.input.bindAction('choice2', ['2']);
        engine.input.bindAction('choice3', ['3']);

        engine.ui.load(this._def, { transition: 'sand', duration: 500 });
        engine.ui.onAction = (action) => {
            if (action === 'pause') {
                engine.scenes.transitionTo('square_lobby', { effect: 'dither', duration: 600 });
            }
        };
        engine.ui.set('lbl_stage_name', { text: this._rooms ? `${this.stageName} · ${this._rooms[0].label}` : this.stageName });
        engine.ui.set('lbl_lv',    { text: `LV.${this.xpDrops.level}` });
        engine.ui.set('lbl_kills', { text: 'K 0' });
        engine.ui.set('g_exp',     { ratio: 0 });
    }

    onExit() {
        this.engine?.ui.clear();
    }

    /** 게임오버 — 보상(골드/플레이어XP) 정산 + 미션 진행도 + 저장 */
    _endRun() {
        const survivedSec = this._t / 1000;
        const goldReward = this._goldFromKills;
        this._save.gold += goldReward;
        SaveSystem.applyPlayerXp(this._save, this._kills);
        SaveSystem.updateMissionProgress(this._save, this._meta, {
            bossKilled: this._bossKilled,
            challengeId: this._challenge?.id,
        });
        SaveSystem.save(this._save);
        const mm = String(Math.floor(survivedSec / 60)).padStart(2, '0');
        const ss = String(Math.floor(survivedSec) % 60).padStart(2, '0');
        this._result = {
            timer: `${mm}:${ss}`,
            stageName: this.stageName,
            level: this.xpDrops.level,
            kills: this._kills,
            goldReward,
            xpReward: this._kills,
            challengeCleared: this._bossKilled && this._challenge ? this._challenge.id : null,
        };
    }

    onUpdate(now, dt, input) {
        const sec_dt = dt / 1000;

        // 게임오버 결과 카드 — 게임 일시정지, 확인 버튼만 처리
        if (this._result) {
            this._updateResultInput(input);
            return;
        }

        // 레벨업 카드 선택 중 — 게임 일시정지, 카드 입력만 처리
        if (this._choices) {
            this._updateChoiceInput(input);
            return;
        }

        this._updateJoystick(input);
        this.player.move(this._joy.vx, this._joy.vy, sec_dt, this._bounds, this.skills.speedMult);
        this._pmTime += sec_dt;

        // 모래 부적(fitnessGuide) — 최대 HP 패시브 반영
        const newMaxHp = this._baseMaxHp + this.skills.hpBonus;
        if (newMaxHp !== this.player.maxHp) {
            this.player.hp += newMaxHp - this.player.maxHp;
            this.player.maxHp = newMaxHp;
        }
        this._updateCamera();
        this._clampPlayerToView();

        // 적은 카메라 가시 영역 가장자리 바깥에서 스폰
        const view = { x: this._cam.x, y: this._cam.y, w: this.engine.gameWidth, h: this.engine.gameHeight };
        const dmgEvents = this.enemies.tick(sec_dt, this.player, view);
        for (const dmg of dmgEvents) {
            const dead = this.player.takeDamage(dmg * (1 - this._dmgReduce));
            if (dead) {
                this._endRun();
                return;
            }
        }

        // 스킬 연출은 전부 SandFX 가 onRender 에서 절차적으로 그린다 (잔상 없음)
        this.skills.tick(sec_dt, this.player, this.enemies.enemies, this._bounds);

        const killed = this.enemies.removeDead();
        if (killed.length) {
            for (const en of killed) {
                this.xpDrops.spawnFrom(en);
                this._deaths.push({ x: en.x, y: en.y, t: 0 });
                this._goldFromKills += en.goldDrop ?? 0;
                if (en.isBoss) this._bossKilled = true;
                if (this._lifesteal > 0 && Math.random() < this._lifesteal) {
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.05);
                }
            }
            this._kills += killed.length;
            this._roomKills += killed.length;
            this.engine.ui.set('lbl_kills', { text: `K ${this._kills}` });
        }

        this._updateRoom(sec_dt);

        const { leveledUp, collected } = this.xpDrops.tick(sec_dt, this.player, this.skills.expMult, this._magnetMult);
        for (const d of collected) {
            this._pickups.push({ x: d.x, y: d.y, t: 0 });
        }

        // 연출 타이머 진행 (수명 끝나면 즉시 제거 — 잔상 없음)
        for (const d of this._deaths)  d.t += sec_dt;
        for (const p of this._pickups) p.t += sec_dt;
        this._deaths  = this._deaths.filter(d => d.t < 0.3);
        this._pickups = this._pickups.filter(p => p.t < 0.25);
        this.engine.ui.set('g_exp', { ratio: this.xpDrops.ratio });
        if (leveledUp) {
            this.engine.ui.set('lbl_lv', { text: `LV.${this.xpDrops.level}` });
            // 레벨업 보상 — 스킬 선택 카드 (선택지 없으면 생략)
            const choices = this.skills.getChoices(3);
            if (choices.length) {
                this._choices = choices;
                this._joy = { active: false, ox: 0, oy: 0, vx: 0, vy: 0 };
            }
        }

        this._t += dt;
        const sec = Math.floor(this._t / 1000);
        if (sec !== this._sec) {
            this._sec = sec;
            const mm = String(Math.floor(sec / 60)).padStart(2, '0');
            const ss = String(sec % 60).padStart(2, '0');
            this.engine.ui.set('lbl_timer', { text: `${mm}:${ss}` });
        }
    }

    /** 카메라 — 플레이어 추적, 월드 경계 클램프. forward 모드는 Y가 후퇴하지 않음 */
    _updateCamera() {
        const W = this.engine.gameWidth;
        const H = this.engine.gameHeight;
        this._cam.x = Math.max(0, Math.min(this._bounds.w - W, this.player.x - W / 2));
        if (this._camMode === 'forward') {
            // 전진 = 위로(Y 감소) — 카메라 y는 감소만 가능 (후진 불가)
            const lockY = H * this._camLockRatio;
            let camY = Math.max(0, this.player.y - lockY);
            camY = Math.min(this._cam.y, camY);
            this._cam.y = Math.min(camY, this._bounds.h - H);
        } else {
            this._cam.y = Math.max(0, Math.min(this._bounds.h - H, this.player.y - H / 2));
        }
    }

    /** 플레이어 위치를 화면/게이트 범위 내로 제한 (forward 모드 — 후진/게이트 통과 방지) */
    _clampPlayerToView() {
        if (this._camMode !== 'forward') return;
        const r = this.player.radius;
        let minY = this._cam.y + r;
        if (this._gateY != null) minY = Math.max(minY, this._gateY + r);
        const maxY = Math.min(this._cam.y + this.engine.gameHeight - r, this._bounds.h - r);
        this.player.y = Math.max(minY, Math.min(this.player.y, maxY));
    }

    /** 구간(room) 클리어 판정 + 게이트 갱신 */
    _updateRoom(sec_dt) {
        if (!this._rooms) return;
        const room = this._rooms[this._roomIdx];
        if (!room || room.cleared) return;
        this._roomTimer += sec_dt;
        const c = room.clear;
        let cleared = false;
        if (c.type === 'kills')   cleared = this._roomKills >= c.value;
        else if (c.type === 'survive') cleared = this._roomTimer >= c.value;
        else if (c.type === 'timer')   cleared = this._roomTimer >= c.value;
        else if (c.type === 'boss')    cleared = this._bossKilled;
        if (!cleared) return;

        room.cleared = true;
        this._roomIdx++;
        this._roomKills = 0;
        this._roomTimer = 0;
        const next = this._rooms[this._roomIdx];
        this._gateY = next ? next.yStart : null;
        if (next?.clear.type === 'boss') this.enemies._bossTimer = 1.5; // 보스방 진입 → 보스 즉시 등장
        if (next) this.engine.ui.set('lbl_stage_name', { text: `${this.stageName} · ${next.label}` });
    }

    /** 레벨업 카드 영역 (i = 0~2) */
    _choiceRect(i) {
        const W = this.engine.gameWidth;
        return { x: (W - 420) / 2, y: 250 + i * 160, w: 420, h: 130 };
    }

    _updateChoiceInput(input) {
        // 숫자키 1/2/3 으로 선택
        const keyActions = ['choice1', 'choice2', 'choice3'];
        for (let i = 0; i < this._choices.length; i++) {
            if (input.isPressed(keyActions[i])) {
                this.skills.applyChoice(this._choices[i].id);
                this._choices = null;
                return;
            }
        }

        const p = input.pointer;
        if (!p.justDown) return;
        for (let i = 0; i < this._choices.length; i++) {
            const r = this._choiceRect(i);
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
                this.skills.applyChoice(this._choices[i].id);
                this._choices = null;
                return;
            }
        }
    }

    /** 결과 카드 — 확인 버튼 영역 */
    _resultBtnRect() {
        const W = this.engine.gameWidth;
        const H = this.engine.gameHeight;
        return { x: (W - 360) / 2, y: H - 140, w: 360, h: 64 };
    }

    _updateResultInput(input) {
        const p = input.pointer;
        if (input.isPressed('choice1') || input.isPressed('choice2') || input.isPressed('choice3')) {
            // 숫자키 — 빠른 확인
        } else if (!p.justDown) {
            return;
        } else {
            const r = this._resultBtnRect();
            if (!(p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) return;
        }
        this._result = null;
        this.engine.scenes.transitionTo('square_lobby', { effect: 'dither', duration: 600 });
    }

    _updateJoystick(input) {
        const p = input.pointer;
        const HUD_TOP = 60; // 상단 HUD 영역 제외

        if (p.justDown && p.y > HUD_TOP) {
            this._joy.active = true;
            this._joy.ox = p.x;
            this._joy.oy = p.y;
            this._joy.vx = 0;
            this._joy.vy = 0;
        }

        if (this._joy.active && p.down) {
            const dx = p.x - this._joy.ox;
            const dy = p.y - this._joy.oy;
            const dist = Math.hypot(dx, dy);
            if (dist < JOY_DEADZONE) {
                this._joy.vx = 0;
                this._joy.vy = 0;
            } else {
                const clamped = Math.min(dist, this._joyRadius);
                this._joy.vx = (dx / dist) * (clamped / this._joyRadius);
                this._joy.vy = (dy / dist) * (clamped / this._joyRadius);
            }
        }

        if (p.justUp || !p.down) {
            this._joy.active = false;
            this._joy.vx = 0;
            this._joy.vy = 0;
        }

        // 키보드 이동 (WASD / 방향키) — 조이스틱이 활성화되지 않았을 때만 반영
        if (!this._joy.active) {
            let kx = 0, ky = 0;
            if (input.isDown('left'))  kx -= 1;
            if (input.isDown('right')) kx += 1;
            if (input.isDown('up'))    ky -= 1;
            if (input.isDown('down'))  ky += 1;
            if (kx !== 0 || ky !== 0) {
                const len = Math.hypot(kx, ky);
                this._joy.vx = kx / len;
                this._joy.vy = ky / len;
            } else {
                this._joy.vx = 0;
                this._joy.vy = 0;
            }
        }
    }

    // 플레이어 위치에 네모↔동그라미 핑크·시안 픽셀 모핑 그리기 (카메라 평행이동된 ctx 기준)
    _renderPmPlayer(ctx) {
        const side = this.player.radius * 2;
        if (!this._pmPoints) this._initPmPoints(side);

        const cx = this.player.x;
        const cy = this.player.y;
        const phase = (Math.sin(this._pmTime * 1.6) + 1) / 2;   // 0→1→0 왕복
        const morph = phase * phase * (3 - 2 * phase);          // ease
        const spin = phase * Math.PI * 2;                       // 모핑 중 회전
        const sin = Math.sin(spin), cos = Math.cos(spin);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const pt of this._pmPoints) {
            const lx = pt.sx + (pt.cx - pt.sx) * morph;
            const ly = pt.sy + (pt.cy - pt.sy) * morph;
            const x = cx + (lx * cos - ly * sin);
            const y = cy + (lx * sin + ly * cos);
            ctx.fillStyle = pt.pink ? 'rgb(255,110,210)' : 'rgb(110,200,255)';
            ctx.fillRect(x | 0, y | 0, 3, 3);
        }
        ctx.restore();
    }

    onRender(cameraX) {
        const e = this.engine;
        const W = e.gameWidth;
        const H = e.gameHeight;
        const pal = e.palette_mgr.original ?? [];

        const cam = this._cam ?? { x: 0, y: 0 };

        // 아레나 바닥 (L1) — 어두운 바닥 + 카메라 오프셋 그리드
        const c = e.layers.getCtx(1);
        if (c) {
            c.fillStyle = pal[14] ?? '#30364A';
            c.fillRect(0, 0, W, H);
            c.fillStyle = pal[15] ?? '#232838';
            const grid = this._grid;
            const gx0 = -(cam.x % grid);
            const gy0 = -(cam.y % grid);
            for (let x = gx0; x < W; x += grid) c.fillRect(x, 0, 2, H);
            for (let y = gy0; y < H; y += grid) c.fillRect(0, y, W, 2);
            // 월드 경계 표시
            c.fillStyle = pal[8] ?? '#E8553C';
            const bx = -cam.x, by = -cam.y;
            const bw = this._bounds.w, bh = this._bounds.h;
            if (bx >= 0)            c.fillRect(bx, 0, 3, H);
            if (by >= 0)            c.fillRect(0, by, W, 3);
            if (bx + bw <= W)       c.fillRect(bx + bw - 3, 0, 3, H);
            if (by + bh <= H)       c.fillRect(0, by + bh - 3, W, 3);

            // 구간 게이트 — 클리어 전까지 통과 불가 벽
            if (this._gateY != null) {
                const gy = this._gateY - cam.y;
                if (gy >= 0 && gy <= H) {
                    c.fillStyle = pal[8] ?? '#E8553C';
                    c.globalAlpha = 0.6;
                    for (let x = 0; x < W; x += 16) c.fillRect(x, gy - 2, 10, 4);
                    c.globalAlpha = 1;
                }
            }
        }

        // 게임 객체 (L2) — 월드 좌표를 카메라만큼 평행이동해서 그림
        const c2 = e.layers.getCtx(2);
        if (c2 && this.player) {
            c2.save();
            c2.translate(-cam.x, -cam.y);
            // XP 오브
            c2.fillStyle = pal[7] ?? '#F5D454';
            for (const d of this.xpDrops.drops) {
                c2.beginPath();
                c2.arc(d.x, d.y, 5, 0, Math.PI * 2);
                c2.fill();
            }

            // ── SandFX 절차적 스킬 연출 (매 프레임 새로 그림 — 잔상 없음) ──
            if (!this._fx || this._fx.pal !== pal) this._fx = new SandFX(pal);
            const time = this._t / 1000;

            // 적 + 디버프 오버레이
            for (const en of this.enemies.enemies) {
                const r = en.radius;
                if (en.isBoss) {
                    this._fx.boss(c2, en, time);
                } else {
                    c2.fillStyle = en.color ?? (pal[8] ?? '#E8553C');
                    c2.fillRect(en.x - r, en.y - r, r * 2, r * 2);
                }
                this._fx.debuffs(c2, en, time);
            }

            // 보스 슬램 충격파
            for (const s of this.enemies.slams) {
                this._fx.bossSlam(c2, s, time);
            }

            // 모래 폭풍 오라
            for (const skill of this.skills.skills) {
                if (skill.cfg.pattern !== 'aura' || skill.level <= 0) continue;
                this._fx.aura(c2, this.player, skill.auraRadius ?? skill.cfg.radius, time);
            }

            // 석화 파동
            for (const p of this.skills.pulses) {
                this._fx.pulse(c2, p, time);
            }

            // 쿠나이 — 미니 모래 토네이도
            for (const p of this.skills.projectiles) {
                this._fx.tornado(c2, p);
            }

            // 기본 공격 — 모래 실 → 폭발
            for (const th of this.skills.threads) {
                this._fx.thread(c2, th, this.player, time);
            }

            // 샷건 — 흐르는 모래 파도
            for (const w of this.skills.waves) {
                this._fx.wave(c2, w, time);
            }

            // 모래 늪 (장판은 다른 객체 아래에)
            for (const z of this.skills.zones) {
                this._fx.quicksand(c2, z, time);
            }

            // 모래 비
            for (const rn of this.skills.rains) {
                this._fx.rain(c2, rn, time);
            }

            // 모래 가시
            for (const sp of this.skills.spikes) {
                this._fx.spike(c2, sp, time);
            }

            // 모래 드론
            for (const skill of this.skills.skills) {
                if (skill.cfg.pattern !== 'drone' || skill.level <= 0 || skill.x == null) continue;
                c2.fillStyle = skill.active ? (pal[7] ?? '#3D8EDB') : (pal[3] ?? '#888888');
                c2.fillRect(skill.x - 8, skill.y - 8, 16, 16);
            }

            // 차원 참격 — 부채꼴 슬래시
            for (const s of this.skills.slashes) {
                c2.strokeStyle = pal[9] ?? '#E8553C';
                c2.lineWidth = 5;
                c2.beginPath();
                c2.arc(s.x, s.y, s.range, s.dir - s.arcRad / 2, s.dir + s.arcRad / 2);
                c2.stroke();
                c2.lineWidth = 1;
            }

            // 모래 화염병 — 비행 중
            for (const f of this.skills.flasks) {
                const r = Math.max(0, Math.min(1, f.t / f.dur));
                c2.fillStyle = pal[8] ?? '#E8553C';
                c2.beginPath();
                c2.arc(f.x + (f.tx - f.x) * r, f.y + (f.ty - f.y) * r, 6, 0, Math.PI * 2);
                c2.fill();
            }

            // 모래 지뢰
            for (const m of this.skills.mines) {
                c2.fillStyle = m.armed ? (pal[8] ?? '#E8553C') : (pal[7] ?? '#3D8EDB');
                c2.beginPath();
                c2.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
                c2.fill();
            }

            // 모래 낙뢰 — 연쇄 라인
            c2.strokeStyle = pal[6] ?? '#3D8EDB';
            c2.lineWidth = 3;
            for (const ch of this.skills.chains) {
                c2.beginPath();
                c2.moveTo(ch.x1, ch.y1);
                c2.lineTo(ch.x2, ch.y2);
                c2.stroke();
            }
            c2.lineWidth = 1;

            // 모래 부메랑
            for (const b of this.skills.boomerangs) {
                c2.save();
                c2.translate(b.x, b.y);
                c2.rotate(b.spin);
                c2.fillStyle = pal[9] ?? '#E8553C';
                c2.fillRect(-b.radius, -b.radius * 0.4, b.radius * 2, b.radius * 0.8);
                c2.restore();
            }

            // 수호자 — 바위 + 모래 꼬리
            for (const skill of this.skills.skills) {
                if (skill.cfg.pattern !== 'orbit' || !skill.blades) continue;
                for (const b of skill.blades) {
                    this._fx.guardian(c2, b, this.player, skill.cfg.orbitRadius, time);
                }
            }

            // 처치 파열 / XP 흡수
            for (const d of this._deaths)  this._fx.shatter(c2, d);
            for (const p of this._pickups) this._fx.absorb(c2, p, this.player);

            // 플레이어 자리표시 — 네모↔동그라미 핑크·시안 픽셀 모핑 (골목길 픽셀무브 효과)
            this._renderPmPlayer(c2);
            c2.restore();
        }

        // 레벨업 카드 (L3) — 게임 일시정지 오버레이
        const cUi = e.layers.getCtx(3);
        if (cUi && this._choices) {
            cUi.save();
            // 어두운 배경
            cUi.fillStyle = 'rgba(10, 12, 20, 0.72)';
            cUi.fillRect(0, 0, W, H);

            // 타이틀
            cUi.fillStyle = pal[7] ?? '#F5D454';
            cUi.font = 'bold 30px monospace';
            cUi.textAlign = 'center';
            cUi.fillText('LEVEL UP!', W / 2, 200);

            for (let i = 0; i < this._choices.length; i++) {
                const ch = this._choices[i];
                const r = this._choiceRect(i);
                // 카드 본체 + 픽셀풍 이중 보더
                cUi.fillStyle = pal[14] ?? '#30364A';
                cUi.fillRect(r.x, r.y, r.w, r.h);
                cUi.fillStyle = ch.isNew ? (pal[7] ?? '#F5D454') : (pal[6] ?? '#3D8EDB');
                cUi.fillRect(r.x, r.y, r.w, 4);
                cUi.fillRect(r.x, r.y + r.h - 4, r.w, 4);
                cUi.fillRect(r.x, r.y, 4, r.h);
                cUi.fillRect(r.x + r.w - 4, r.y, 4, r.h);

                // 숫자키 뱃지 (좌측 상단)
                cUi.fillStyle = pal[1] ?? '#1A1A18';
                cUi.fillRect(r.x + 10, r.y + 10, 28, 28);
                cUi.fillStyle = pal[7] ?? '#F5D454';
                cUi.font = 'bold 20px monospace';
                cUi.textAlign = 'center';
                cUi.fillText(String(i + 1), r.x + 24, r.y + 30);

                // 아이콘
                cUi.font = '26px monospace';
                cUi.fillText(ch.icon ?? '✦', r.x + 54, r.y + 46);

                // 스킬명 + NEW/Lv 뱃지
                cUi.textAlign = 'left';
                cUi.fillStyle = pal[12] ?? '#C8E8F0';
                cUi.font = 'bold 26px monospace';
                cUi.fillText(ch.name, r.x + 88, r.y + 46);

                cUi.fillStyle = ch.isNew ? (pal[7] ?? '#F5D454') : (pal[6] ?? '#3D8EDB');
                cUi.font = 'bold 20px monospace';
                cUi.textAlign = 'right';
                cUi.fillText(ch.isNew ? 'NEW!' : `Lv.${ch.nextLevel}`, r.x + r.w - 24, r.y + 46);

                // 설명
                cUi.textAlign = 'left';
                cUi.fillStyle = pal[13] ?? '#8A8FA3';
                cUi.font = '19px monospace';
                cUi.fillText(ch.desc, r.x + 24, r.y + 88);
            }
            cUi.restore();
        }

        // 게임오버 결과 카드 (L3)
        if (cUi && this._result) {
            const r = this._result;
            cUi.save();
            cUi.fillStyle = 'rgba(10, 12, 20, 0.78)';
            cUi.fillRect(0, 0, W, H);

            // 상단 정보 패널 — 타이머 / 스테이지 / 레벨
            const px = (W - 460) / 2;
            cUi.fillStyle = pal[14] ?? '#30364A';
            cUi.fillRect(px, 160, 460, 170);
            cUi.fillStyle = pal[7] ?? '#F5D454';
            cUi.font = 'bold 48px monospace';
            cUi.textAlign = 'center';
            cUi.fillText(r.timer, W / 2, 230);

            cUi.font = 'bold 18px monospace';
            cUi.fillStyle = pal[12] ?? '#C8E8F0';
            cUi.fillText(`${r.stageName}   LV.${r.level}   K ${r.kills}`, W / 2, 270);

            cUi.fillStyle = pal[13] ?? '#8A8FA3';
            cUi.font = '16px monospace';
            cUi.fillText('보상', W / 2, 310);

            // 보상 카드 2개 (골드 / EXP)
            const cardW = 180, cardH = 90, gap = 20;
            const cx = W / 2 - cardW - gap / 2;
            const cy = 350;
            const rewards = [
                { label: '골드', value: `+${r.goldReward}`, color: pal[7] ?? '#F5D454' },
                { label: 'EXP',  value: `+${r.xpReward}`,   color: pal[6] ?? '#3D8EDB' },
            ];
            rewards.forEach((rw, i) => {
                const rx = cx + i * (cardW + gap);
                cUi.fillStyle = pal[15] ?? '#232838';
                cUi.fillRect(rx, cy, cardW, cardH);
                cUi.fillStyle = rw.color;
                cUi.font = 'bold 22px monospace';
                cUi.textAlign = 'center';
                cUi.fillText(rw.value, rx + cardW / 2, cy + 40);
                cUi.fillStyle = pal[12] ?? '#C8E8F0';
                cUi.font = '14px monospace';
                cUi.fillText(rw.label, rx + cardW / 2, cy + 68);
            });

            // 확인 버튼
            const br = this._resultBtnRect();
            cUi.fillStyle = pal[7] ?? '#F5D454';
            cUi.fillRect(br.x, br.y, br.w, br.h);
            cUi.fillStyle = pal[1] ?? '#1A1A18';
            cUi.font = 'bold 26px monospace';
            cUi.textAlign = 'center';
            cUi.fillText('확인', br.x + br.w / 2, br.y + br.h / 2 + 9);

            cUi.restore();
        }

        // 가상 조이스틱 (L3)
        const c3 = e.layers.getCtx(3);
        if (c3 && this._joy.active) {
            c3.save();
            c3.globalAlpha = this._joyRingOpacity;
            c3.strokeStyle = '#FFFFFF';
            c3.lineWidth = 3;
            c3.beginPath();
            c3.arc(this._joy.ox, this._joy.oy, this._joyRadius, 0, Math.PI * 2);
            c3.stroke();

            c3.globalAlpha = this._joyKnobOpacity;
            c3.fillStyle = '#FFFFFF';
            c3.beginPath();
            c3.arc(
                this._joy.ox + this._joy.vx * this._joyRadius,
                this._joy.oy + this._joy.vy * this._joyRadius,
                this._joyKnob, 0, Math.PI * 2
            );
            c3.fill();
            c3.restore();
        }
    }
}
