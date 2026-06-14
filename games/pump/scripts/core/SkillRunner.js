let nextId = 1;

/**
 * 멀티 스킬 러너 — core_config.json의 skills[] 배열을 받아
 * 스킬별 레벨/쿨다운/투사체/오빗/실/파도를 독립적으로 관리한다.
 *
 * 레벨 시스템:
 *  - level 0 = 미보유 (tick 안 함), startUnlocked: true 면 level 1 시작
 *  - 레벨업 보상: getChoices()로 후보 3개 → applyChoice(id)로 해금/강화
 *  - 레벨 스케일링: 데미지 +30%/Lv, 쿨다운 -8%/Lv, 오빗은 바위 +1개/Lv
 *
 * 패턴 핸들러:
 *  - 'nearest' : 가장 가까운 적 방향으로 투사체 발사 (쿠나이 토네이도)
 *  - 'thread'  : 가장 가까운 적에게 모래 실 연결 → 폭발 (기본 공격)
 *  - 'wave'    : 부채꼴 모래 파도가 퍼져나가며 통과 데미지 (샷건)
 *  - 'orbit'   : 플레이어 주위를 회전하는 수호 바위 (지속 충돌)
 *  - 'rain'    : 무작위 적 위치 범위 지속 데미지 (모래 비)
 *  - 'zone'    : 감속+지속딜 장판 (모래 늪)
 *  - 'spike'   : 적 발밑 예고 후 기습 (모래 가시)
 *  - 'aura'    : 플레이어 주위 상시 데미지 오라 (모래 폭풍)
 *  - 'pulse'   : 원형 파동 — 닿은 적 석화(스턴) (석화 파동)
 *  - 'dot'     : 무작위 적에게 침식 DoT 부여 (침식)
 *  - 'mark'    : 가장 가까운 적에게 받는 피해 증가 낙인 (모래 낙인)
 *
 * 디버프 (적 객체 필드, EnemySpawner/SkillRunner 가 공유):
 *  - slowT / slowFactor : 감속 (모래 늪)
 *  - stunT              : 석화 — 이동 정지 (석화 파동)
 *  - dotT / dotDps      : 침식 — 초당 데미지 (침식)
 *  - vulnT / vulnMult   : 취약 — 받는 피해 배율 (모래 낙인)
 */
export default class SkillRunner {
    constructor(skillCfgs, elementCfg, globalDmgMult = 1, levelScale = null, extraCooldownMult = 1) {
        this.elementBeats = elementCfg?.beats ?? {};
        this.elementBonus = elementCfg?.bonusMult ?? 1.3;
        this.globalDmgMult = globalDmgMult;
        this.extraCooldownMult = extraCooldownMult;
        // skill_level_config.csv — 전 스킬 공통 Lv별 배율
        this.dmgMultScale       = levelScale?.dmgMultScale       ?? [1.0, 1.2, 1.5, 1.8, 2.2];
        this.cooldownReduceRate = levelScale?.cooldownReduceRate ?? [0.0, 0.05, 0.10, 0.15, 0.20];
        this.skills = skillCfgs.map(cfg => ({
            cfg,
            level: cfg.startUnlocked ? 1 : 0,
            cooldownTimer: 0,
            angle: 0,           // orbit 회전각
        }));
        this.projectiles = [];  // nearest 투사체
        this.threads     = [];  // thread 연출 ({ex,ey,t,phase})
        this.waves       = [];  // wave 파도 ({ox,oy,dir,radius,hit})
        this.rains       = [];  // rain 모래 비 ({x,y,radius,t,dur})
        this.zones       = [];  // zone 모래 늪 ({x,y,radius,t,dur})
        this.spikes      = [];  // spike 모래 가시 ({x,y,t,delay,fired})
        this.pulses      = [];  // pulse 석화 파동 ({x,y,radius,hit})
        this.mines       = [];  // ground_self 모래 지뢰 ({x,y,radius,explodeRadius,armed})
        this.chains      = [];  // chain 낙뢰 연쇄 시각 효과 ({x1,y1,x2,y2,t})
        this.boomerangs  = [];  // boomerang 모래 부메랑 ({x,y,vx,vy,returning})
        this.flasks      = [];  // parabola 모래 화염병 ({x,y,tx,ty,t,dur})
        this.slashes     = [];  // blade 차원 참격 시각 효과 ({x,y,dir,arcRad,range,t})

        // 패턴별 발사 핸들러
        this._fire = {
            nearest: (s, pl, en) => this._fireNearest(s, pl, en),
            thread:  (s, pl, en) => this._fireThread(s, pl, en),
            wave:    (s, pl, en) => this._fireWave(s, pl, en),
            rain:    (s, pl, en) => this._fireRain(s, pl, en),
            zone:    (s, pl, en) => this._fireZone(s, pl, en),
            spike:   (s, pl, en) => this._fireSpike(s, pl, en),
            pulse:   (s, pl, en) => this._firePulse(s, pl, en),
            dot:     (s, pl, en) => this._fireDot(s, pl, en),
            mark:    (s, pl, en) => this._fireMark(s, pl, en),
            ground_self: (s, pl, en) => this._fireGroundSelf(s, pl, en),
            chain:       (s, pl, en) => this._fireChain(s, pl, en),
            boomerang:   (s, pl, en) => this._fireBoomerang(s, pl, en),
            homing:      (s, pl, en) => this._fireHoming(s, pl, en),
            blade:       (s, pl, en) => this._fireBlade(s, pl, en),
            parabola:    (s, pl, en) => this._fireParabola(s, pl, en),
            directional: (s, pl, en) => this._fireDirectional(s, pl, en),
        };
    }

    // ── 레벨 스케일링 ─────────────────────────────────────────────

    _dmg(skill) {
        const idx = Math.min(skill.level - 1, this.dmgMultScale.length - 1);
        return skill.cfg.dmg * this.dmgMultScale[idx] * this.globalDmgMult;
    }
    _cooldown(skill) {
        const idx = Math.min(skill.level - 1, this.cooldownReduceRate.length - 1);
        return skill.cfg.cooldownSec * (1 - this.cooldownReduceRate[idx]) * (1 - this.passiveBonus('energyCube')) * (1 - this.passiveBonus('ammoBooster')) * this.extraCooldownMult;
    }

    // ── 패시브 (PASSIVE) ─────────────────────────────────────────
    // 닌자 주문서/탄력 모래신/모래 정수/모래 부적 — 레벨당 passiveStep 누적

    passiveBonus(id) {
        const s = this.skills.find(sk => sk.cfg.id === id);
        if (!s || s.level <= 0) return 0;
        return (s.cfg.passiveStep ?? 0) * s.level;
    }

    get expMult()       { return 1 + this.passiveBonus('ninjaScroll'); }
    get speedMult()     { return 1 + this.passiveBonus('elasticShoes'); }
    get hpBonus()       { return this.passiveBonus('fitnessGuide'); }
    get explodeRadiusMult() { return 1 + this.passiveBonus('highFuel'); }
    get durationMult()      { return 1 + this.passiveBonus('exoskeleton'); }

    /** 데미지 적용 — 낙인(취약) 배율 + 속성 상성 배율 반영 */
    _hit(e, dmg, element) {
        let mult = e.vulnT > 0 ? (e.vulnMult ?? 1) : 1;
        if (element && e.element && this.elementBeats[element] === e.element) mult *= this.elementBonus;
        e.hp -= dmg * mult;
    }

    // ── 레벨업 보상 ──────────────────────────────────────────────

    /** 레벨업 카드 후보 — 만렙이 아닌 스킬 중 무작위 n개 */
    getChoices(n = 3) {
        const pool = this.skills.filter(s => s.level < (s.cfg.maxLevel ?? 5));
        // Fisher-Yates 셔플
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, n).map(s => ({
            id: s.cfg.id,
            name: s.cfg.name ?? s.cfg.id,
            icon: s.cfg.icon ?? '✦',
            desc: s.cfg.desc ?? '',
            nextLevel: s.level + 1,
            isNew: s.level === 0,
        }));
    }

    applyChoice(id) {
        const s = this.skills.find(sk => sk.cfg.id === id);
        if (s) s.level += 1;
    }

    // ── 게임 루프 ────────────────────────────────────────────────

    tick(dt, player, enemies, bounds) {
        for (const skill of this.skills) {
            if (skill.level <= 0) continue;
            const cfg = skill.cfg;
            if (cfg.pattern === 'orbit') {
                this._tickOrbit(dt, skill, player, enemies);
                continue;
            }
            if (cfg.pattern === 'aura') {
                this._tickAura(dt, skill, player, enemies);
                continue;
            }
            if (cfg.pattern === 'passive') continue;
            if (cfg.pattern === 'debuffAura') {
                this._tickDebuffAura(dt, skill, player, enemies);
                continue;
            }
            if (cfg.pattern === 'drone') {
                this._tickDrone(dt, skill, player, enemies);
                continue;
            }

            skill.cooldownTimer -= dt;
            if (skill.cooldownTimer <= 0 && enemies.length > 0) {
                skill.cooldownTimer = this._cooldown(skill);
                this._fire[cfg.pattern]?.(skill, player, enemies);
            }
        }

        this._tickProjectiles(dt, enemies, bounds);
        this._tickThreads(dt, player, enemies);
        this._tickWaves(dt, enemies);
        this._tickRains(dt, enemies);
        this._tickZones(dt, enemies);
        this._tickSpikes(dt, enemies);
        this._tickPulses(dt, enemies);
        this._tickMines(dt, enemies);
        this._tickChains(dt);
        this._tickBoomerangs(dt, player, enemies);
        this._tickFlasks(dt);
        this._tickSlashes(dt);
    }

    // ── aura (모래 폭풍 — 상시 데미지 오라) ───────────────────────

    _tickAura(dt, skill, player, enemies) {
        const cfg = skill.cfg;
        skill.auraRadius = (cfg.radius ?? 110) + (skill.level - 1) * 14;  // 레벨당 범위 확대
        skill.tickTimer = (skill.tickTimer ?? 0) - dt;
        if (skill.tickTimer > 0) return;
        skill.tickTimer = cfg.tickSec ?? 0.4;
        const dmg = this._dmg(skill);
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (Math.hypot(e.x - player.x, e.y - player.y) < skill.auraRadius + e.radius) {
                this._hit(e, dmg, cfg.element);
            }
        }
    }

    // ── pulse (석화 파동 — 닿은 적 스턴) ──────────────────────────

    _firePulse(skill, player, enemies) {
        const cfg = skill.cfg;
        this.pulses.push({
            element: cfg.element,
            x: player.x, y: player.y,
            radius: 10,
            speed: cfg.waveSpeed ?? 330,
            range: cfg.range ?? 260,
            stunSec: (cfg.stunSec ?? 1.2) + (skill.level - 1) * 0.25,  // 레벨당 석화 연장
            dmg: this._dmg(skill),
            hit: new Set(),
        });
    }

    _tickPulses(dt, enemies) {
        for (const p of this.pulses) {
            p.radius += p.speed * dt;
            if (p.radius > p.range) { p.dead = true; continue; }
            for (const e of enemies) {
                if (e.hp <= 0 || p.hit.has(e.id)) continue;
                const dist = Math.hypot(e.x - p.x, e.y - p.y);
                if (Math.abs(dist - p.radius) <= e.radius + 6) {
                    p.hit.add(e.id);
                    this._hit(e, p.dmg, p.element);
                    e.stunT = Math.max(e.stunT ?? 0, p.stunSec);    // 석화
                }
            }
        }
        this.pulses = this.pulses.filter(p => !p.dead);
    }

    // ── dot (침식 — 지속 데미지 부여) ─────────────────────────────

    _fireDot(skill, player, enemies) {
        const cfg = skill.cfg;
        const inRange = enemies.filter(e =>
            e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < (cfg.range ?? 420));
        if (!inRange.length) return;
        const count = Math.min((cfg.targetCount ?? 3) + Math.floor((skill.level - 1) / 2), inRange.length);
        for (let i = inRange.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [inRange[i], inRange[j]] = [inRange[j], inRange[i]];
        }
        for (let i = 0; i < count; i++) {
            const e = inRange[i];
            e.dotT   = cfg.durSec ?? 3;                              // 침식
            e.dotDps = this._dmg(skill);
        }
    }

    // ── mark (모래 낙인 — 받는 피해 증가) ─────────────────────────

    _fireMark(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        if (!target) return;
        if (Math.hypot(target.x - player.x, target.y - player.y) > (cfg.range ?? 420)) return;
        target.vulnT    = cfg.durSec ?? 4;                           // 취약
        target.vulnMult = (cfg.vulnMult ?? 1.5) + (skill.level - 1) * 0.15;
    }

    // ── nearest (쿠나이 토네이도) ─────────────────────────────────

    _fireNearest(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        if (!target) return;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.projectiles.push({
            id: nextId++,
            skillId: cfg.id,
            dmg: this._dmg(skill),
            x: player.x,
            y: player.y,
            vx: dx / dist * cfg.projectileSpeed,
            vy: dy / dist * cfg.projectileSpeed,
            radius: cfg.projectileRadius + (skill.level - 1) * 2,  // 레벨당 토네이도 확대
            range: cfg.range,
            traveled: 0,
            spin: 0,            // 토네이도 회전 위상
            dead: false,
            element: cfg.element,
        });
    }

    _tickProjectiles(dt, enemies, bounds) {
        const killedIds = new Set();
        for (const p of this.projectiles) {
            if (p.homing) {
                const target = this._nearest(p, enemies);
                if (target) {
                    const dx = target.x - p.x, dy = target.y - p.y;
                    const d = Math.hypot(dx, dy) || 1;
                    const spd = Math.hypot(p.vx, p.vy);
                    const tvx = dx / d * spd, tvy = dy / d * spd;
                    const turn = Math.min(1, 6 * dt);
                    p.vx += (tvx - p.vx) * turn;
                    p.vy += (tvy - p.vy) * turn;
                }
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.traveled += Math.hypot(p.vx, p.vy) * dt;
            p.spin += dt * 18;

            for (const e of enemies) {
                if (killedIds.has(e.id) || e.hp <= 0) continue;
                if (p.pierce && p.hitSet.has(e.id)) continue;
                const dist = Math.hypot(e.x - p.x, e.y - p.y);
                if (dist < e.radius + p.radius) {
                    if (p.explodeRadius > 0) {
                        const er = p.explodeRadius * this.explodeRadiusMult;
                        for (const en of enemies) {
                            if (en.hp <= 0) continue;
                            if (Math.hypot(en.x - p.x, en.y - p.y) < er + en.radius) {
                                this._hit(en, p.dmg, p.element);
                                if (en.hp <= 0) killedIds.add(en.id);
                            }
                        }
                    } else {
                        this._hit(e, p.dmg, p.element);
                        if (e.hp <= 0) killedIds.add(e.id);
                    }
                    if (p.pierce) { p.hitSet.add(e.id); }
                    else { p.dead = true; break; }
                }
            }

            // 관통(pierce) + 튕김(bounce) — 축구공/드릴샷
            if (p.bounce != null) {
                let bounced = false;
                if (p.x < p.radius || p.x > bounds.w - p.radius) {
                    p.vx = -p.vx;
                    p.x = Math.max(p.radius, Math.min(bounds.w - p.radius, p.x));
                    bounced = true;
                }
                if (p.y < p.radius || p.y > bounds.h - p.radius) {
                    p.vy = -p.vy;
                    p.y = Math.max(p.radius, Math.min(bounds.h - p.radius, p.y));
                    bounced = true;
                }
                if (bounced) {
                    p.bounce -= 1;
                    p.hitSet.clear();
                    if (p.bounce < 0) p.dead = true;
                }
            } else if (p.x < -20 || p.x > bounds.w + 20 || p.y < -20 || p.y > bounds.h + 20) {
                p.dead = true;
            }

            if (p.traveled > p.range) p.dead = true;
        }
        this.projectiles = this.projectiles.filter(p => !p.dead);
    }

    // ── thread (모래 실 연결 → 폭발) ──────────────────────────────

    _fireThread(skill, player, enemies) {
        const cfg = skill.cfg;
        let target = null;
        let best = cfg.range ?? 300;
        for (const e of enemies) {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < best) { best = d; target = e; }
        }
        if (!target) return;
        this.threads.push({
            enemyId: target.id,
            ex: target.x, ey: target.y,
            t: 0,
            phase: 'link',                       // link → explode → 제거
            linkSec: cfg.linkSec ?? 0.14,
            explodeSec: cfg.explodeSec ?? 0.22,
            explodeRadius: (cfg.explodeRadius ?? 28) + (skill.level - 1) * 6,
            dmg: this._dmg(skill),
            element: cfg.element,
        });
    }

    _tickThreads(dt, player, enemies) {
        for (const th of this.threads) {
            th.t += dt;
            if (th.phase === 'link') {
                // 실이 붙어 있는 동안 적 위치 추적
                const e = enemies.find(en => en.id === th.enemyId && en.hp > 0);
                if (e) { th.ex = e.x; th.ey = e.y; }
                if (th.t >= th.linkSec) {
                    th.phase = 'explode';
                    th.t = 0;
                    // 폭발 데미지 — 폭심 반경 내 모든 적
                    for (const en of enemies) {
                        if (en.hp <= 0) continue;
                        if (Math.hypot(en.x - th.ex, en.y - th.ey) < th.explodeRadius + en.radius) {
                            this._hit(en, th.dmg, th.element);
                        }
                    }
                }
            } else if (th.t >= th.explodeSec) {
                th.dead = true;
            }
        }
        this.threads = this.threads.filter(t => !t.dead);
    }

    // ── wave (모래 파도) ──────────────────────────────────────────

    _fireWave(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        if (!target) return;
        this.waves.push({
            ox: player.x, oy: player.y,
            dir: Math.atan2(target.y - player.y, target.x - player.x),
            arcRad: ((cfg.arcDeg ?? 70) + (skill.level - 1) * 12) * Math.PI / 180,  // 레벨당 호 확대
            radius: 12,
            speed: cfg.waveSpeed ?? 260,
            range: cfg.range ?? 300,
            dmg: this._dmg(skill),
            hit: new Set(),
            phase: Math.random() * Math.PI * 2,  // 파도 출렁임 위상
            element: cfg.element,
        });
    }

    _tickWaves(dt, enemies) {
        for (const w of this.waves) {
            w.radius += w.speed * dt;
            if (w.radius > w.range) { w.dead = true; continue; }

            for (const e of enemies) {
                if (e.hp <= 0 || w.hit.has(e.id)) continue;
                const dx = e.x - w.ox;
                const dy = e.y - w.oy;
                const dist = Math.hypot(dx, dy);
                if (Math.abs(dist - w.radius) > e.radius + 6) continue;
                let dAng = Math.atan2(dy, dx) - w.dir;
                while (dAng >  Math.PI) dAng -= Math.PI * 2;
                while (dAng < -Math.PI) dAng += Math.PI * 2;
                if (Math.abs(dAng) <= w.arcRad / 2) {
                    this._hit(e, w.dmg, w.element);
                    w.hit.add(e.id);
                }
            }
        }
        this.waves = this.waves.filter(w => !w.dead);
    }

    // ── rain (모래 비 — 범위 지속 데미지) ─────────────────────────

    _fireRain(skill, player, enemies) {
        const cfg = skill.cfg;
        // 사거리 내 적이 가장 밀집한 곳 근사 — 무작위 적 위치 선택
        const inRange = enemies.filter(e =>
            Math.hypot(e.x - player.x, e.y - player.y) < (cfg.range ?? 400));
        if (!inRange.length) return;
        const target = inRange[Math.floor(Math.random() * inRange.length)];
        this.rains.push({
            x: target.x, y: target.y,
            radius: (cfg.radius ?? 90) + (skill.level - 1) * 14,  // 레벨당 범위 확대
            t: 0,
            dur: (cfg.durSec ?? 2) * this.durationMult,
            tickSec: cfg.tickSec ?? 0.3,
            tickTimer: 0,
            dmg: this._dmg(skill),
            element: cfg.element,
        });
    }

    _tickRains(dt, enemies) {
        for (const rn of this.rains) {
            rn.t += dt;
            if (rn.t >= rn.dur) { rn.dead = true; continue; }
            rn.tickTimer -= dt;
            if (rn.tickTimer <= 0) {
                rn.tickTimer = rn.tickSec;
                for (const e of enemies) {
                    if (e.hp <= 0) continue;
                    if (Math.hypot(e.x - rn.x, e.y - rn.y) < rn.radius + e.radius) {
                        this._hit(e, rn.dmg, rn.element);
                    }
                }
            }
        }
        this.rains = this.rains.filter(r => !r.dead);
    }

    // ── zone (모래 늪 — 감속 + 지속 데미지 장판) ──────────────────

    _fireZone(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        if (!target) return;
        if (Math.hypot(target.x - player.x, target.y - player.y) > (cfg.range ?? 360)) return;
        this.zones.push({
            x: target.x, y: target.y,
            radius: (cfg.radius ?? 80) + (skill.level - 1) * 12,  // 레벨당 범위 확대
            t: 0,
            dur: (cfg.durSec ?? 3) * this.durationMult,
            tickSec: cfg.tickSec ?? 0.5,
            tickTimer: 0,
            slowFactor: cfg.slowFactor ?? 0.4,
            dmg: this._dmg(skill),
            element: cfg.element,
        });
    }

    _tickZones(dt, enemies) {
        for (const z of this.zones) {
            z.t += dt;
            if (z.t >= z.dur) { z.dead = true; continue; }
            z.tickTimer -= dt;
            const doTick = z.tickTimer <= 0;
            if (doTick) z.tickTimer = z.tickSec;
            for (const e of enemies) {
                if (e.hp <= 0) continue;
                if (Math.hypot(e.x - z.x, e.y - z.y) < z.radius + e.radius) {
                    // 늪 안 — 감속 부여 (EnemySpawner 가 slowT/slowFactor 를 본다)
                    e.slowT = 0.2;
                    e.slowFactor = z.slowFactor;
                    if (doTick) this._hit(e, z.dmg, z.element);
                }
            }
        }
        this.zones = this.zones.filter(z => !z.dead);
    }

    // ── spike (모래 가시 — 적 발밑 기습) ──────────────────────────

    _fireSpike(skill, player, enemies) {
        const cfg = skill.cfg;
        const inRange = enemies.filter(e =>
            e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < (cfg.range ?? 420));
        if (!inRange.length) return;
        // 무작위 적 N명 발밑에 가시 예고
        const count = Math.min((cfg.targetCount ?? 2) + Math.floor((skill.level - 1) / 2), inRange.length);
        for (let i = inRange.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [inRange[i], inRange[j]] = [inRange[j], inRange[i]];
        }
        for (let i = 0; i < count; i++) {
            this.spikes.push({
                element: cfg.element,
                x: inRange[i].x, y: inRange[i].y,
                t: 0,
                delay: cfg.delaySec ?? 0.3,          // 예고 시간 (이후 솟구침)
                upSec: 0.25,                          // 솟구침 연출 시간
                radius: cfg.spikeRadius ?? 18,
                dmg: this._dmg(skill),
                fired: false,
            });
        }
    }

    _tickSpikes(dt, enemies) {
        for (const sp of this.spikes) {
            sp.t += dt;
            if (!sp.fired && sp.t >= sp.delay) {
                sp.fired = true;
                for (const e of enemies) {
                    if (e.hp <= 0) continue;
                    if (Math.hypot(e.x - sp.x, e.y - sp.y) < sp.radius + e.radius) {
                        this._hit(e, sp.dmg, sp.element);
                    }
                }
            }
            if (sp.t >= sp.delay + sp.upSec) sp.dead = true;
        }
        this.spikes = this.spikes.filter(s => !s.dead);
    }

    // ── orbit (수호 바위) ─────────────────────────────────────────

    _tickOrbit(dt, skill, player, enemies) {
        const cfg = skill.cfg;
        const count = (cfg.bladeCount ?? 2) + (skill.level - 1);  // 레벨당 바위 +1
        skill.angle += (cfg.orbitSpeed ?? 2.5) * dt;

        const blades = [];
        for (let i = 0; i < count; i++) {
            const a = skill.angle + (Math.PI * 2 * i) / count;
            blades.push({
                x: player.x + Math.cos(a) * cfg.orbitRadius,
                y: player.y + Math.sin(a) * cfg.orbitRadius,
                a,                                  // 궤도각 (꼬리 렌더용)
            });
        }
        skill.blades = blades;

        skill.hitTimer = (skill.hitTimer ?? 0) - dt;
        if (skill.hitTimer <= 0) {
            skill.hitTimer = cfg.hitIntervalSec ?? 0.2;
            const dmg = this._dmg(skill);
            for (const e of enemies) {
                if (e.hp <= 0) continue;
                for (const b of blades) {
                    const dist = Math.hypot(e.x - b.x, e.y - b.y);
                    if (dist < e.radius + (cfg.bladeRadius ?? 8)) {
                        this._hit(e, dmg, cfg.element);
                        break;
                    }
                }
            }
        }
    }

    // ── ground_self (모래 지뢰 — 접촉 폭발) ────────────────────────

    _fireGroundSelf(skill, player, enemies) {
        const cfg = skill.cfg;
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 40;
        this.mines.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            radius: cfg.radius ?? 16,
            explodeRadius: (cfg.explodeRadius ?? 50) + (skill.level - 1) * 8,
            dmg: this._dmg(skill),
            element: cfg.element,
            armed: true,
            t: 0,
        });
    }

    _tickMines(dt, enemies) {
        for (const m of this.mines) {
            if (m.armed) {
                for (const e of enemies) {
                    if (e.hp <= 0) continue;
                    if (Math.hypot(e.x - m.x, e.y - m.y) < e.radius + m.radius) {
                        m.armed = false;
                        for (const en of enemies) {
                            if (en.hp <= 0) continue;
                            if (Math.hypot(en.x - m.x, en.y - m.y) < m.explodeRadius + en.radius) {
                                this._hit(en, m.dmg, m.element);
                            }
                        }
                        break;
                    }
                }
            } else {
                m.t += dt;
                if (m.t > 0.3) m.dead = true;
            }
        }
        this.mines = this.mines.filter(m => !m.dead);
    }

    // ── chain (모래 낙뢰 — 연쇄 전기 피해) ─────────────────────────

    _fireChain(skill, player, enemies) {
        const cfg = skill.cfg;
        const inRange = enemies.filter(e =>
            e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < (cfg.range ?? 360));
        if (!inRange.length) return;
        const dmg = this._dmg(skill);
        const chainRadius = (cfg.projectileRadius ?? 18) * 6 + (skill.level - 1) * 20;
        const maxChain = 3 + Math.floor((skill.level - 1) / 2);

        const first = inRange[Math.floor(Math.random() * inRange.length)];
        this._hit(first, dmg, cfg.element);
        this.chains.push({ x1: player.x, y1: player.y, x2: first.x, y2: first.y, t: 0 });

        const hitList = [first];
        let cur = first;
        for (let i = 1; i < maxChain; i++) {
            let next = null, best = chainRadius;
            for (const e of enemies) {
                if (e.hp <= 0 || hitList.includes(e)) continue;
                const d = Math.hypot(e.x - cur.x, e.y - cur.y);
                if (d < best) { best = d; next = e; }
            }
            if (!next) break;
            this._hit(next, dmg, cfg.element);
            this.chains.push({ x1: cur.x, y1: cur.y, x2: next.x, y2: next.y, t: 0 });
            hitList.push(next);
            cur = next;
        }
    }

    _tickChains(dt) {
        for (const c of this.chains) {
            c.t += dt;
            if (c.t > 0.15) c.dead = true;
        }
        this.chains = this.chains.filter(c => !c.dead);
    }

    // ── boomerang (모래 부메랑 — 발사 후 귀환 관통) ──────────────────

    _fireBoomerang(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        let dx = 1, dy = 0;
        if (target) {
            dx = target.x - player.x; dy = target.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            dx /= d; dy /= d;
        }
        this.boomerangs.push({
            x: player.x, y: player.y,
            vx: dx * cfg.projectileSpeed, vy: dy * cfg.projectileSpeed,
            dmg: this._dmg(skill),
            radius: (cfg.projectileRadius ?? 7) + (skill.level - 1) * 1.5,
            range: cfg.range ?? 500,
            traveled: 0,
            returning: false,
            element: cfg.element,
            hit: new Set(),
            spin: 0,
        });
    }

    _tickBoomerangs(dt, player, enemies) {
        for (const b of this.boomerangs) {
            b.spin += dt * 14;
            if (!b.returning) {
                b.x += b.vx * dt; b.y += b.vy * dt;
                b.traveled += Math.hypot(b.vx, b.vy) * dt;
                if (b.traveled >= b.range / 2) b.returning = true;
            } else {
                const dx = player.x - b.x, dy = player.y - b.y;
                const d = Math.hypot(dx, dy) || 1;
                const spd = Math.hypot(b.vx, b.vy);
                b.x += dx / d * spd * dt; b.y += dy / d * spd * dt;
                if (d < 16) b.dead = true;
            }
            for (const e of enemies) {
                if (e.hp <= 0 || b.hit.has(e.id)) continue;
                if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius) {
                    this._hit(e, b.dmg, b.element);
                    b.hit.add(e.id);
                }
            }
        }
        this.boomerangs = this.boomerangs.filter(b => !b.dead);
    }

    // ── debuffAura (감쇄의 모래바람 — 감속 + 지속딜 오라) ─────────────

    _tickDebuffAura(dt, skill, player, enemies) {
        const cfg = skill.cfg;
        skill.auraRadius = (cfg.radius ?? 100) + (skill.level - 1) * 12;
        skill.tickTimer = (skill.tickTimer ?? 0) - dt;
        const doTick = skill.tickTimer <= 0;
        if (doTick) skill.tickTimer = cfg.tickSec ?? 0.5;
        const dmg = this._dmg(skill);
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (Math.hypot(e.x - player.x, e.y - player.y) < skill.auraRadius + e.radius) {
                e.slowT = 0.2;
                e.slowFactor = cfg.slowFactor ?? 0.6;
                if (doTick) this._hit(e, dmg, cfg.element);
            }
        }
    }

    // ── homing (모래 로켓 — 유도 폭발) ──────────────────────────────

    _fireHoming(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        if (!target) return;
        const dx = target.x - player.x, dy = target.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.projectiles.push({
            id: nextId++,
            skillId: cfg.id,
            dmg: this._dmg(skill),
            x: player.x, y: player.y,
            vx: dx / dist * cfg.projectileSpeed,
            vy: dy / dist * cfg.projectileSpeed,
            radius: (cfg.projectileRadius ?? 6) + (skill.level - 1) * 1,
            range: cfg.range,
            traveled: 0,
            spin: 0,
            dead: false,
            element: cfg.element,
            homing: true,
            explodeRadius: (cfg.explodeRadius ?? 0) + (skill.level - 1) * 6,
        });
    }

    // ── blade (차원 참격 — 전방 부채꼴 즉시 타격) ────────────────────

    _fireBlade(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        const dir = target ? Math.atan2(target.y - player.y, target.x - player.x) : 0;
        const arcRad = ((cfg.arcDeg ?? 44) + (skill.level - 1) * 6) * Math.PI / 180;
        const range = cfg.range ?? 240;
        const dmg = this._dmg(skill);
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            const dx = e.x - player.x, dy = e.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range + e.radius) continue;
            let dAng = Math.atan2(dy, dx) - dir;
            while (dAng >  Math.PI) dAng -= Math.PI * 2;
            while (dAng < -Math.PI) dAng += Math.PI * 2;
            if (Math.abs(dAng) <= arcRad / 2) this._hit(e, dmg, cfg.element);
        }
        this.slashes.push({ x: player.x, y: player.y, dir, arcRad, range, t: 0 });
    }

    _tickSlashes(dt) {
        for (const s of this.slashes) {
            s.t += dt;
            if (s.t > 0.18) s.dead = true;
        }
        this.slashes = this.slashes.filter(s => !s.dead);
    }

    // ── parabola (모래 화염병 — 포물선 투척 → 화염 장판) ──────────────

    _fireParabola(skill, player, enemies) {
        const cfg = skill.cfg;
        const inRange = enemies.filter(e =>
            e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < (cfg.range ?? 300));
        if (!inRange.length) return;
        const target = inRange[Math.floor(Math.random() * inRange.length)];
        this.flasks.push({
            x: player.x, y: player.y, tx: target.x, ty: target.y,
            t: 0, dur: 0.5,
            radius: (cfg.radius ?? 70) + (skill.level - 1) * 10,
            dmg: this._dmg(skill),
            durSec: (cfg.durSec ?? 2.5) * this.durationMult,
            tickSec: cfg.tickSec ?? 0.4,
            element: cfg.element,
        });
    }

    _tickFlasks(dt) {
        for (const f of this.flasks) {
            f.t += dt;
            if (f.t >= f.dur) {
                f.dead = true;
                this.rains.push({
                    x: f.tx, y: f.ty, radius: f.radius, t: 0, dur: f.durSec,
                    tickSec: f.tickSec, tickTimer: 0, dmg: f.dmg, element: f.element,
                });
            }
        }
        this.flasks = this.flasks.filter(f => !f.dead);
    }

    // ── drone (모래 드론 — 주기적 유도 미사일) ────────────────────────

    _tickDrone(dt, skill, player, enemies) {
        const cfg = skill.cfg;
        const attackSec = cfg.attackSec ?? 3, restSec = cfg.restSec ?? 7;
        skill.cycleT = ((skill.cycleT ?? 0) + dt) % (attackSec + restSec);
        skill.x = player.x + (cfg.offsetX ?? 60);
        skill.y = player.y + (cfg.offsetY ?? -60);
        skill.active = skill.cycleT < attackSec;
        if (!skill.active) return;

        skill.fireTimer = (skill.fireTimer ?? 0) - dt;
        if (skill.fireTimer > 0 || !enemies.length) return;
        skill.fireTimer = cfg.cooldownSec ?? 0.333;

        const target = this._nearest(skill, enemies);
        if (!target) return;
        const dx = target.x - skill.x, dy = target.y - skill.y;
        const d = Math.hypot(dx, dy) || 1;
        this.projectiles.push({
            id: nextId++, skillId: cfg.id, dmg: this._dmg(skill),
            x: skill.x, y: skill.y,
            vx: dx / d * (cfg.projectileSpeed ?? 500),
            vy: dy / d * (cfg.projectileSpeed ?? 500),
            radius: cfg.projectileRadius ?? 5,
            range: cfg.range ?? 600,
            traveled: 0, spin: 0, dead: false,
            element: cfg.element, homing: true, explodeRadius: 0,
        });
    }

    // ── directional (모래 구슬/드릴 — 관통 + 벽 튕김) ─────────────────

    _fireDirectional(skill, player, enemies) {
        const cfg = skill.cfg;
        const target = this._nearest(player, enemies);
        let dx = 1, dy = 0;
        if (target) {
            dx = target.x - player.x; dy = target.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            dx /= d; dy /= d;
        }
        const baseAngle = Math.atan2(dy, dx);
        const count = cfg.projectileCount ?? 2;
        const spread = (cfg.spreadDeg ?? 20) * Math.PI / 180;
        for (let i = 0; i < count; i++) {
            const off = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
            const a = baseAngle + off;
            this.projectiles.push({
                id: nextId++, skillId: cfg.id, dmg: this._dmg(skill),
                x: player.x, y: player.y,
                vx: Math.cos(a) * cfg.projectileSpeed,
                vy: Math.sin(a) * cfg.projectileSpeed,
                radius: (cfg.projectileRadius ?? 7) + (skill.level - 1) * 1,
                range: cfg.range ?? 99999,
                traveled: 0, spin: 0, dead: false,
                element: cfg.element,
                bounce: cfg.bounceCount ?? 3,
                pierce: true,
                hitSet: new Set(),
            });
        }
    }

    _nearest(player, enemies) {
        let target = null;
        let best = Infinity;
        for (const e of enemies) {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < best) { best = d; target = e; }
        }
        return target;
    }
}
