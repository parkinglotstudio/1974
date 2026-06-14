let nextId = 1;

/**
 * 적 스폰 + 추적 AI + 시간 기반 난이도 상승 + 보스.
 *
 * 난이도 상승 (diffCfg):
 *  - 시간(분)에 따라 신규 스폰 적의 hp/speed 가 점진적으로 증가
 *  - 스폰 간격은 점점 짧아져 spawnIntervalFloorRatio 까지 줄어든다
 *
 * 보스 (bossCfg):
 *  - intervalSec 마다 1체 스폰 (동시에 최대 1체)
 *  - hp 비율 기준 phaseThresholds 를 지날 때마다 phase 증가 → 이동속도 상승,
 *    슬램(범위 공격) 주기 단축
 *  - 슬램: 주기마다 자신 위치에서 충격파(slams[])를 발생, targetRadius 도달 시
 *    플레이어가 범위 내면 slamDmg 피해
 */
export default class EnemySpawner {
    constructor(cfg, bossCfg, diffCfg, elements, waves) {
        this.cfg     = cfg;
        this.bossCfg = bossCfg;
        this.diff    = diffCfg ?? {};
        this.waves   = waves ?? [];
        this.elements = elements ?? [];
        this.enemies = [];
        this.slams   = [];
        this.boss    = null;
        this._spawnTimer = 0;
        this._bossTimer  = bossCfg?.intervalSec ?? 60;
        this.elapsed = 0;
    }

    /** @param view 카메라 가시 영역 {x, y, w, h} — 가장자리 바깥에서 스폰 */
    tick(dt, player, view) {
        this.elapsed += dt;
        const minutes = this.elapsed / 60;

        // ── 시간 기반 난이도 ──
        const hpMult  = 1 + minutes * (this.diff.hpGrowthPerMin ?? 0.18);
        const spdMult = 1 + minutes * (this.diff.speedGrowthPerMin ?? 0.06);

        // ── wave_config 기반 스폰 주기/최대마리수/적 구성비 (해당 stage의 waves 제공 시) ──
        let wave = null;
        for (const w of this.waves) {
            if (w.startSec <= this.elapsed) wave = w;
        }
        const spawnScale = this.cfg.spawnIntervalScale ?? 1;
        const maxScale   = this.cfg.maxEnemiesScale ?? 1;
        const interval = wave
            ? (wave.intervalFrames / 60) * spawnScale
            : Math.max(
                this.cfg.spawnIntervalSec * (this.diff.spawnIntervalFloorRatio ?? 0.35),
                this.cfg.spawnIntervalSec - minutes * (this.diff.spawnIntervalDecayPerMin ?? 0.12)
            );
        const maxEnemies = wave ? Math.round(wave.maxEnemies * maxScale) : Infinity;

        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0) {
            this._spawnTimer = interval;
            if (this.enemies.length < maxEnemies) this._spawn(view, hpMult, spdMult, wave);
        }

        // ── 보스 스폰 ──
        if (this.bossCfg && !this.boss) {
            this._bossTimer -= dt;
            if (this._bossTimer <= 0) {
                this._bossTimer = this.bossCfg.intervalSec;
                this._spawnBoss(view, minutes);
            }
        }

        const dmgEvents = [];
        for (const e of this.enemies) {
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;

            // ── 디버프 처리 (SkillRunner 가 부여) ──
            // 침식 — 초당 데미지
            if (e.dotT > 0) {
                e.dotT -= dt;
                e.hp -= (e.dotDps ?? 0) * dt;
            }
            // 취약(낙인) 타이머
            if (e.vulnT > 0) e.vulnT -= dt;

            // 석화 — 이동 정지
            if (e.stunT > 0) {
                e.stunT -= dt;
            } else {
                // 감속 (모래 늪)
                let spd = e.speed;
                if (e.slowT > 0) { e.slowT -= dt; spd *= e.slowFactor ?? 1; }
                e.x += (dx / dist) * spd * dt;
                e.y += (dy / dist) * spd * dt;
            }

            // 보스 페이즈 / 슬램
            if (e.isBoss) this._tickBoss(dt, e);

            e.contactTimer -= dt;
            if (dist < player.radius + e.radius && e.contactTimer <= 0) {
                e.contactTimer = this.cfg.contactCooldownSec;
                dmgEvents.push(e.dmg);
            }
        }

        // ── 슬램 충격파 진행 + 판정 ──
        for (const s of this.slams) {
            s.t += dt;
            if (!s.hit) {
                s.radius += s.speed * dt;
                if (s.radius >= s.targetRadius) {
                    s.hit = true;
                    s.radius = s.targetRadius;
                    const d = Math.hypot(player.x - s.x, player.y - s.y);
                    if (d < s.targetRadius + player.radius) dmgEvents.push(s.dmg);
                }
            }
        }
        this.slams = this.slams.filter(s => s.t < 0.5);

        return dmgEvents;
    }

    /** 보스 페이즈 전환 + 슬램(범위 공격) 발생 */
    _tickBoss(dt, e) {
        const cfg = this.bossCfg;
        const ratio = e.hp / e.maxHp;
        let phase = 0;
        for (const th of cfg.phaseThresholds ?? []) if (ratio <= th) phase++;
        if (phase !== e.phase) {
            e.phase = phase;
            e.speed = cfg.speed * (1 + phase * 0.25);
            e.slamIntervalSec = (cfg.slamIntervalSec ?? 3) * Math.pow(0.8, phase);
        }

        e.slamTimer = (e.slamTimer ?? e.slamIntervalSec) - dt;
        if (e.slamTimer <= 0) {
            e.slamTimer = e.slamIntervalSec;
            this.slams.push({
                x: e.x, y: e.y,
                radius: 4,
                targetRadius: (cfg.slamRadius ?? 140) + e.phase * 30,
                speed: 480,
                dmg: (cfg.slamDmg ?? 18) + e.phase * 4,
                t: 0, hit: false,
            });
        }
    }

    /** enemy_config.csv 의 weight 가중치로 적 종류 선택 */
    _pickType(wave) {
        const types = this.cfg.types;
        if (wave) {
            const total = types.reduce((s, t) => s + (wave.rates?.[t.id] ?? 0), 0);
            if (total > 0) {
                let r = Math.random() * total;
                for (const t of types) {
                    r -= (wave.rates?.[t.id] ?? 0);
                    if (r <= 0) return t;
                }
                return types[types.length - 1];
            }
        }
        const total = types.reduce((s, t) => s + (t.weight ?? 1), 0);
        let r = Math.random() * total;
        for (const t of types) {
            r -= (t.weight ?? 1);
            if (r <= 0) return t;
        }
        return types[types.length - 1];
    }

    _spawn(view, hpMult, spdMult, wave) {
        const type = this._pickType(wave);
        // 카메라 가시 영역 가장자리(상/하/좌/우) 바깥에서 스폰
        const r = type.radius;
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0)      { x = view.x + Math.random() * view.w; y = view.y - r; }
        else if (side === 1) { x = view.x + Math.random() * view.w; y = view.y + view.h + r; }
        else if (side === 2) { x = view.x - r; y = view.y + Math.random() * view.h; }
        else                 { x = view.x + view.w + r; y = view.y + Math.random() * view.h; }

        const hp = Math.round(type.hp * hpMult * (this.cfg.hpMult ?? 1));
        const speedScale = this.cfg.speedScale ?? 1;
        this.enemies.push({
            id: nextId++,
            x, y,
            hp, maxHp: hp,
            speed: type.speed * speedScale * spdMult,
            dmg: type.contactDmg * (this.cfg.dmgMult ?? 1),
            radius: type.radius,
            color: type.color,
            goldDrop: type.goldDrop,
            expDropType: type.expDropType,
            contactTimer: 0,
            element: this.elements.length ? this.elements[Math.floor(Math.random() * this.elements.length)] : null,
        });
    }

    _spawnBoss(view, minutes) {
        const cfg = this.bossCfg;
        const r = cfg.radius;
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0)      { x = view.x + Math.random() * view.w; y = view.y - r; }
        else if (side === 1) { x = view.x + Math.random() * view.w; y = view.y + view.h + r; }
        else if (side === 2) { x = view.x - r; y = view.y + Math.random() * view.h; }
        else                 { x = view.x + view.w + r; y = view.y + Math.random() * view.h; }

        const hp = Math.round(cfg.hp * (1 + minutes * (cfg.hpGrowthPerMin ?? 0.35)) * (cfg.hpMult ?? 1));
        const boss = {
            id: nextId++,
            x, y,
            hp, maxHp: hp,
            speed: cfg.speed,
            dmg: cfg.dmg * (cfg.dmgMult ?? 1),
            radius: r,
            contactTimer: 0,
            isBoss: true,
            phase: 0,
            slamIntervalSec: cfg.slamIntervalSec ?? 3,
            slamTimer: cfg.slamIntervalSec ?? 3,
        };
        this.enemies.push(boss);
        this.boss = boss;
    }

    removeDead() {
        const dead = this.enemies.filter(e => e.hp <= 0);
        this.enemies = this.enemies.filter(e => e.hp > 0);
        if (this.boss && this.boss.hp <= 0) this.boss = null;
        return dead;
    }
}
