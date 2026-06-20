// GridWaveSystem.js — 누리 "가변형 수직 격자 파동(Lateral Grid Wave)" 전투 시스템
// ─────────────────────────────────────────────────────────────────────────
// 엔진=로직 / 데이터=CSV 원칙. nuri_skill_prototype.html 의 전투 로직을
// 데이터 기반 + 핸들러 레지스트리 구조로 재구성한 모듈.
//
// 파이프라인:  충전(beginCharge→release) → 격자 발사 → 거동(behavior) →
//              사거리 자폭(detonate) / 적중(onHit) → 효과(장판·가디언·연쇄)
//
// 확장 방식: 새 원소 = element_config.csv 한 줄 + (신규 거동/효과면) 핸들러 1개.
//   - BEHAVIORS  : 비행 중 거동      (straight | homing | ...)
//   - DETONATORS : 사거리 도달 자폭   (knockback | fire_ground | guardian | none | ...)
//   - ON_HITS    : 적 적중 시 효과     (chain | none | ...)
//
// 의존성: 외부에서 적 리스트(enemies)를 주입받아 데미지/넉백만 가한다.
//         적 이동·사망·스폰·슬롯 관리는 호출측(게임/하니스) 책임.
// 좌표/속도는 프로토타입과 동일하게 프레임(60fps) 기준.

const TIER = { BASIC: 'basic', MEDIUM: 'medium', STRONG: 'strong', FUSION: 'fusion' };
const FUSION_COLOR = '#a855f7';

export default class GridWaveSystem {
    // charge: charge_config.csv 의 key→value 맵, elements: element_config.csv 행 배열
    constructor({ charge, elements }) {
        this.cfg = this._numConfig(charge);
        this.elements = {};
        for (const row of elements) {
            this.elements[row.id] = {
                ...row,
                params: this._parseParams(row.params),
            };
        }
        // 캐릭터(발사 원점) — setViewport 로 갱신
        this.cx = 400; this.cy = 260;

        // 런타임 효과 풀
        this.projectiles  = [];
        this.groundEffects = [];
        this.guardianOrbs = [];
        this.chains       = [];   // 칼슘 연쇄 시각효과
        this.particles    = [];

        // 충전 상태
        this._charging = false;
        this._chargeStart = 0;

        // 핸들러 레지스트리 ─────────────────────────────────────────────
        this.BEHAVIORS = {
            straight: () => {},                       // 직선 — 각도 유지
            // 유도 — 발사 시 각 투사체에 서로 다른 적을 배정해 분산 추적 (평타 제외)
            // 한번 배정된 타겟은 죽거나 사라질 때까지 유지(p.target) → 같은 적에게 몰리지 않음
            homing: (p, enemies, el) => {
                if (p.tier === TIER.BASIC || !enemies.length) return;
                if (p.target && (p.target.hp <= 0 || !enemies.includes(p.target))) p.target = null;
                if (!p.target) {
                    const claimed = new Set(
                        this.projectiles.filter(o => o !== p && o.target).map(o => o.target)
                    );
                    let pool = enemies.filter(e => !claimed.has(e));
                    if (!pool.length) pool = enemies;   // 적보다 투사체가 많으면 중복 허용
                    let closest = null, minD = Infinity;
                    for (const e of pool) {
                        const d = Math.hypot(e.x - p.x, e.y - p.y);
                        if (d < minD) { minD = d; closest = e; }
                    }
                    p.target = closest;
                }
                if (!p.target) return;
                const target = Math.atan2(p.target.y - p.y, p.target.x - p.x);
                const turn = p.tier === TIER.STRONG ? (el.params.turnStrong ?? 0.15) : (el.params.turn ?? 0.05);
                p.angle += (target - p.angle) * turn;
            },
        };
        this.DETONATORS = {
            none: () => {},
            knockback: (p, enemies, el) => {          // 나트륨 — 충격파 넉백
                const r = el.params.radius ?? 75, kb = el.params.knockback ?? 80, mult = el.params.dmgMult ?? 0.8;
                for (const e of enemies) {
                    if (Math.hypot(e.x - p.x, e.y - p.y) >= r) continue;
                    e.hp -= p.damage * mult; e.flashTicks = 3;
                    const a = Math.atan2(e.y - p.y, e.x - p.x);
                    e.x += Math.cos(a) * kb; e.y += Math.sin(a) * kb;
                }
            },
            fire_ground: (p, enemies, el) => {        // 산소 — 화염 장판
                const strong = p.tier === TIER.STRONG || p.tier === TIER.FUSION;
                this.groundEffects.push({
                    x: p.x, y: p.y, color: p.color,
                    radius: strong ? (el.params.radiusStrong ?? 65) : (el.params.radius ?? 35),
                    duration: el.params.duration ?? 3,
                    damageTick: strong ? (el.params.tickStrong ?? 0.8) : (el.params.tick ?? 0.35),
                });
            },
            guardian: (p, enemies, el) => {           // 마그네슘 — 공전 가디언 오브
                const rMin = el.params.radiusMin ?? 40, rMax = el.params.radiusMax ?? 70;
                this.guardianOrbs.push({
                    angle: p.angle, radius: rMin + Math.random() * (rMax - rMin),
                    speed: el.params.speed ?? 0.04, size: el.params.size ?? 8,
                    hp: el.params.hp ?? 3, color: p.color,
                });
            },
        };
        this.ON_HITS = {
            none: () => {},
            chain: (p, hitEnemy, enemies, el) => {    // 칼슘 — 연쇄 전격
                const maxChain = (p.tier === TIER.STRONG || p.tier === TIER.FUSION)
                    ? (el.params.maxChainStrong ?? 6) : (el.params.maxChain ?? 3);
                const range = el.params.range ?? 150, mult = el.params.dmgMult ?? 0.6;
                let src = hitEnemy; const used = new Set([hitEnemy]);
                for (let c = 0; c < maxChain; c++) {
                    let next = null, minD = range;
                    for (const e of enemies) {
                        if (used.has(e)) continue;
                        const d = Math.hypot(e.x - src.x, e.y - src.y);
                        if (d < minD) { minD = d; next = e; }
                    }
                    if (!next) break;
                    this.chains.push({ x1: src.x, y1: src.y, x2: next.x, y2: next.y, alpha: 1 });
                    next.hp -= p.damage * mult; next.flashTicks = 4;
                    used.add(next); src = next;
                }
            },
        };
    }

    // ── 설정/뷰포트 ──────────────────────────────────────────────────
    setViewport(w, h) { this.cx = w * 0.5; this.cy = h * 0.5; }
    setOrigin(x, y)   { this.cx = x; this.cy = y; }

    _numConfig(raw) {
        const o = {};
        for (const k in raw) { const n = Number(raw[k]); o[k] = Number.isNaN(n) ? raw[k] : n; }
        return o;
    }
    _parseParams(str) {
        const o = {};
        if (!str) return o;
        for (const pair of String(str).split(';')) {
            const [k, v] = pair.split('=');
            if (k) o[k.trim()] = Number(v);
        }
        return o;
    }

    // ── 충전 → 발사 ─────────────────────────────────────────────────
    beginCharge(now = performance.now()) { this._charging = true; this._chargeStart = now; }
    get isCharging() { return this._charging; }

    // 원소별 사거리 — element_config.csv params(minDist/maxDist) 오버라이드, 없으면 charge_config 전역값
    _travelRange(elementId) {
        const c = this.cfg;
        const p = this.elements[elementId]?.params;
        return { minD: p?.minDist ?? c.min_travel_dist, maxD: p?.maxDist ?? c.max_travel_dist };
    }

    // 마우스 거리 → 충전시간·탄막수 (실시간 미리보기/발사 공용). elementId로 원소별 사거리 적용
    computeParams(mouse, elementId) {
        const c = this.cfg;
        const { minD, maxD } = this._travelRange(elementId);
        const dx = mouse.x - this.cx, dy = mouse.y - this.cy;
        const aimedDist = Math.max(minD, Math.min(Math.hypot(dx, dy), maxD));
        const ratio = (aimedDist - minD) / (maxD - minD);
        const chargeFullMs = c.charge_min_ms + ratio * (c.charge_max_ms - c.charge_min_ms);
        const predictedMissiles = this._missiles(aimedDist, minD, maxD);
        return { aimedDist, ratio, chargeFullMs, predictedMissiles, angle: Math.atan2(dy, dx), minD, maxD };
    }
    _missiles(firedDist, minD = this.cfg.min_travel_dist, maxD = this.cfg.max_travel_dist) {
        const c = this.cfg;
        const lr = (firedDist - minD) / (maxD - minD);
        return Math.max(c.missile_min, Math.min(c.missile_max, Math.round(c.missile_min + lr * (c.missile_max - c.missile_min))));
    }

    // 현재 충전율(0~1) — 미리보기/사운드용
    chargeRatioNow(mouse, elementId, now = performance.now()) {
        if (!this._charging) return 0;
        const { chargeFullMs } = this.computeParams(mouse, elementId);
        return Math.min((now - this._chargeStart) / chargeFullMs, 1);
    }

    // 발사. opts = { element, slotCount, consume(cost)->granted, onEvent(type,data) }
    //   element  : 발사 원소 id
    //   slotCount: 현재 채워진 슬롯 수 (필살융합 판정·코스트 가용)
    //   consume  : cost 만큼 슬롯 차감 시도, 실제 차감 수 반환
    //   onEvent  : 'sound'|'shake'|'popup' 콜백
    // 반환: { tier, cost, count }
    release(mouse, opts = {}, now = performance.now()) {
        if (!this._charging) return null;
        this._charging = false;
        const holdTime = (now - this._chargeStart) / 1000;
        return this._fire(holdTime, mouse, opts);
    }

    // 충전 상태 없이 즉시 발사 (게임 통합용). holdSec = 홀드 시간(초)
    fire(holdSec, mouse, opts = {}) { return this._fire(holdSec, mouse, opts); }

    _fire(holdTime, mouse, opts) {
        const c = this.cfg;
        const elId = opts.element ?? 'na';
        const el = this.elements[elId];
        if (!el) return null;
        const { aimedDist, angle, chargeFullMs, minD, maxD } = this.computeParams(mouse, elId);

        const ratio = Math.min((holdTime * 1000) / chargeFullMs, 1);
        const firedDist = minD + ratio * (aimedDist - minD);
        const perSide = this._missiles(firedDist, minD, maxD);

        // 티어/코스트
        let tier = TIER.BASIC, cost = 0;
        if (holdTime >= c.tier_hold_min) {
            if (ratio >= c.tier_strong_ratio) { tier = TIER.STRONG; cost = c.cost_strong; }
            else { tier = TIER.MEDIUM; cost = c.cost_medium; }
        }
        const fullSlots = (opts.slotCount ?? 0) >= 5;
        if (fullSlots && tier === TIER.STRONG) { tier = TIER.FUSION; cost = c.cost_fusion; }

        // 슬롯 차감 (부족하면 평타 격하)
        if (cost > 0) {
            const granted = opts.consume ? opts.consume(cost) : cost;
            if (granted < cost) { tier = TIER.BASIC; cost = 0; opts.onEvent?.('popup', { text: '자원 부족: 평타', color: '#ef4444' }); }
        }

        // 사운드
        const snd = tier === TIER.FUSION ? 'fire_fusion' : tier === TIER.STRONG ? 'fire_strong'
                  : tier === TIER.MEDIUM ? 'fire_medium' : 'fire_basic';
        opts.onEvent?.('sound', { sound: snd });

        // 격자 배치: 조준축 위 perSide 지점, 각 지점에서 좌우 직각(±90°) 쌍
        for (let i = 0; i < perSide; i++) {
            const along = perSide === 1
                ? firedDist
                : minD + (i / (perSide - 1)) * (firedDist - minD);
            const sx = this.cx + Math.cos(angle) * along;
            const sy = this.cy + Math.sin(angle) * along;
            this._spawn(sx, sy, angle + Math.PI / 2, tier, el, ratio);
            this._spawn(sx, sy, angle - Math.PI / 2, tier, el, ratio);
        }

        if (tier === TIER.STRONG || tier === TIER.FUSION) {
            opts.onEvent?.('shake', { amount: tier === TIER.FUSION ? c.shake_fusion : c.shake_strong });
        }
        return { tier, cost, count: perSide * 2 };
    }

    _spawn(x, y, angle, tier, el, ratio) {
        const c = this.cfg;
        const basic = tier === TIER.BASIC;
        const sizeMult  = el.params.sizeMult  ?? 1;
        const speedMult = el.params.speedMult ?? 1;
        const p = {
            elementId: el.id, el, tier, color: el.color,
            x, y, startX: x, startY: y, angle,
            speed:  (basic ? c.proj_speed_basic : c.proj_speed_base + ratio * c.proj_speed_span) * speedMult,
            size:   (basic ? c.proj_size_basic  : c.proj_size_base  + ratio * c.proj_size_span) * sizeMult,
            damage: basic ? c.dmg_basic
                : el.params.fixedDmg ? c.dmg_wave_base
                : c.dmg_wave_base + Math.pow(ratio, c.power_exponent) * c.dmg_wave_span,
            distanceTraveled: 0,
            maxRange: c.detonate_range_min + ratio * c.detonate_range_span,
            trail: [],
        };
        if (tier === TIER.FUSION) {
            p.damage = c.fusion_dmg; p.size = c.fusion_size * sizeMult; p.speed = c.fusion_speed * speedMult;
            p.maxRange = c.fusion_range; p.color = FUSION_COLOR;
        }
        this.projectiles.push(p);
    }

    _pierces(p) {
        if (p.el.pierce === 'always') return true;             // 철
        return p.tier === TIER.STRONG || p.tier === TIER.FUSION; // 강파동·필살융합
    }

    // ── 업데이트 (프레임 1틱) — enemies 주입 ─────────────────────────
    update(enemies = []) {
        // 1) 장판 DoT
        for (let i = this.groundEffects.length - 1; i >= 0; i--) {
            const ge = this.groundEffects[i];
            ge.duration -= 0.016;
            for (const e of enemies) {
                if (Math.hypot(e.x - ge.x, e.y - ge.y) < ge.radius + e.size) { e.hp -= ge.damageTick; e.flashTicks = 2; }
            }
            if (ge.duration <= 0) this.groundEffects.splice(i, 1);
        }

        // 2) 투사체: 거동 → 전진 → 자폭/적중
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 6) p.trail.shift();
            p.distanceTraveled += p.speed;

            (this.BEHAVIORS[p.el.behavior] ?? this.BEHAVIORS.straight)(p, enemies, p.el);
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;

            // 사거리 도달 → 자폭
            if (p.distanceTraveled >= p.maxRange) {
                this._burstParticles(p.x, p.y, p.color, 12);
                (this.DETONATORS[p.el.detonate] ?? this.DETONATORS.none)(p, enemies, p.el);
                this.projectiles.splice(i, 1);
                continue;
            }

            // 적중
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (Math.hypot(e.x - p.x, e.y - p.y) >= e.size + p.size) continue;
                e.hp -= p.damage; e.flashTicks = 3;
                this._burstParticles(e.x, e.y, p.color, 4);
                (this.ON_HITS[p.el.on_hit] ?? this.ON_HITS.none)(p, e, enemies, p.el);
                if (!this._pierces(p)) { this.projectiles.splice(i, 1); break; }
            }
        }

        // 3) 가디언 오브 — 플레이어 공전, 적 접촉 데미지
        for (let i = this.guardianOrbs.length - 1; i >= 0; i--) {
            const orb = this.guardianOrbs[i];
            orb.angle += orb.speed;
            const ox = this.cx + Math.cos(orb.angle) * orb.radius;
            const oy = this.cy + Math.sin(orb.angle) * orb.radius;
            for (const e of enemies) {
                if (Math.hypot(e.x - ox, e.y - oy) >= e.size + orb.size) continue;
                e.hp -= 30; e.flashTicks = 3;
                const a = Math.atan2(e.y - this.cy, e.x - this.cx);
                e.x += Math.cos(a) * 40; e.y += Math.sin(a) * 40;
                if (--orb.hp <= 0) { this.guardianOrbs.splice(i, 1); break; }
            }
        }

        // 4) 파티클 / 연쇄 시각효과 감쇠
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx; pt.y += pt.vy; pt.alpha -= pt.decay;
            if (pt.alpha <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.chains.length - 1; i >= 0; i--) {
            this.chains[i].alpha -= 0.15;
            if (this.chains[i].alpha <= 0) this.chains.splice(i, 1);
        }
    }

    _burstParticles(x, y, color, n) {
        for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1.5;
            this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, size: Math.random() * 3 + 1, alpha: 1, decay: 0.04 });
        }
    }

    // ── 렌더 ────────────────────────────────────────────────────────
    render(ctx) {
        // 장판
        for (const ge of this.groundEffects) {
            const g = ctx.createRadialGradient(ge.x, ge.y, 5, ge.x, ge.y, ge.radius);
            g.addColorStop(0, ge.color + '44'); g.addColorStop(0.7, ge.color + '15'); g.addColorStop(1, ge.color + '00');
            ctx.beginPath(); ctx.arc(ge.x, ge.y, ge.radius, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        }
        // 연쇄 번개
        for (const ch of this.chains) {
            const dist = Math.hypot(ch.x2 - ch.x1, ch.y2 - ch.y1), seg = Math.max(1, Math.floor(dist / 14));
            const a = Math.atan2(ch.y2 - ch.y1, ch.x2 - ch.x1);
            ctx.beginPath(); ctx.moveTo(ch.x1, ch.y1);
            for (let i = 1; i < seg; i++) {
                const r = i / seg, off = (Math.random() - 0.5) * 12;
                ctx.lineTo(ch.x1 + Math.cos(a) * dist * r + Math.cos(a + Math.PI / 2) * off,
                           ch.y1 + Math.sin(a) * dist * r + Math.sin(a + Math.PI / 2) * off);
            }
            ctx.lineTo(ch.x2, ch.y2);
            ctx.strokeStyle = `rgba(0,230,118,${ch.alpha})`; ctx.lineWidth = 2; ctx.stroke();
        }
        // 가디언 오브
        for (const orb of this.guardianOrbs) {
            const ox = this.cx + Math.cos(orb.angle) * orb.radius, oy = this.cy + Math.sin(orb.angle) * orb.radius;
            ctx.beginPath(); ctx.arc(ox, oy, orb.size, 0, Math.PI * 2); ctx.fillStyle = orb.color; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        }
        // 투사체 + 트레일
        for (const p of this.projectiles) {
            if (p.trail.length > 1) {
                ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let t = 1; t < p.trail.length; t++) ctx.lineTo(p.trail[t].x, p.trail[t].y);
                ctx.strokeStyle = p.color + '35'; ctx.lineWidth = p.size; ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke();
        }
        // 파티클
        for (const pt of this.particles) {
            ctx.globalAlpha = pt.alpha; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fillStyle = pt.color; ctx.fill(); ctx.globalAlpha = 1;
        }
    }

    // 현재 충전율 기준 실제 도달 지점(월드 좌표) — 조준선 등 다른 UI가 실제 사거리와 일치시키는 데 사용
    displayPoint(mouse, elementId, ratio = 0) {
        const { angle, aimedDist, minD } = this.computeParams(mouse, elementId);
        const dist = minD + ratio * (aimedDist - minD);
        return { x: this.cx + Math.cos(angle) * dist, y: this.cy + Math.sin(angle) * dist, dist };
    }

    // 충전 중 조준 가이드 + 유령 격자 미리보기. ratio=현재 충전율(0~1), 호출측이 충전 중일 때만 호출
    renderAimGuide(ctx, mouse, elementId, ratio = 0) {
        const el = this.elements[elementId]; if (!el) return;
        const { angle, aimedDist, minD, maxD } = this.computeParams(mouse, elementId);
        const displayDist = minD + ratio * (aimedDist - minD);
        const gx = this.cx + Math.cos(angle) * displayDist, gy = this.cy + Math.sin(angle) * displayDist;

        ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(gx, gy);
        ctx.strokeStyle = el.color + '66'; ctx.lineWidth = 1.5 + ratio * 3.5; ctx.stroke();

        const perSide = this._missiles(displayDist, minD, maxD);
        for (let i = 0; i < perSide; i++) {
            const along = perSide === 1 ? displayDist
                : minD + (i / (perSide - 1)) * (displayDist - minD);
            const px = this.cx + Math.cos(angle) * along, py = this.cy + Math.sin(angle) * along;
            const ux = px + Math.cos(angle + Math.PI / 2) * 15, uy = py + Math.sin(angle + Math.PI / 2) * 15;
            const dxp = px + Math.cos(angle - Math.PI / 2) * 15, dyp = py + Math.sin(angle - Math.PI / 2) * 15;
            ctx.beginPath(); ctx.arc(ux, uy, 4, 0, Math.PI * 2); ctx.arc(dxp, dyp, 4, 0, Math.PI * 2);
            ctx.fillStyle = el.color + '88'; ctx.fill();
            ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(dxp, dyp);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(gx, gy, 10, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
}

export { TIER };
