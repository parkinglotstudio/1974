// AmmoSystem.js — 캐릭터 주위를 도는 원소 탄창 슬롯(궤도/잠금/소모/재생) + 이동/파동 라인
import { HOLD_THRESHOLD } from './constants.js';

// 탄창 슬롯 데이터 테이블
// state: 'orbit' | 'locked' | 'empty'
// orbit  → 궤도 회전 중 (사용 가능)
// locked → pointerdown으로 잠금, 라인 발사 기준점
// empty  → 소모됨, regenMs 카운트 중
// angle은 init()에서 count 기준 균등 배치로 덮어씀
const AMMO_TABLE = [
    { angVel: 0.45, rx: 65, ry: 22, size: 13, morphT: 0.0, morphSpeed: 1.5 },
    { angVel: 0.38, rx: 58, ry: 19, size: 10, morphT: 1.4, morphSpeed: 2.0 },
    { angVel: 0.52, rx: 70, ry: 25, size: 11, morphT: 2.8, morphSpeed: 1.7 },
    { angVel: 0.41, rx: 62, ry: 21, size: 14, morphT: 4.2, morphSpeed: 1.3 },
    { angVel: 0.47, rx: 68, ry: 23, size:  9, morphT: 5.6, morphSpeed: 2.2 },
    { angVel: 0.43, rx: 60, ry: 20, size: 12, morphT: 3.0, morphSpeed: 1.8 },
    { angVel: 0.50, rx: 72, ry: 26, size: 11, morphT: 1.8, morphSpeed: 1.6 },
];

export default class AmmoSystem {
    constructor(game) {
        this.game = game;          // NuriGame 인스턴스 — player/camera/mouse 참조용
        this.slots = [];
        this.lockedSlot = null;
        this._pts = null;          // 모프 포인트(사각↔원), 한 번만 생성
        this._levelMap = new Map();
        this.level   = 1;
        this.regenMs = 30000;

        const tbl = game.engine.data?.ammoLevels;
        if (tbl) {
            for (const row of tbl.all()) {
                const lv = Number(row.level);
                if (!lv) continue;
                this._levelMap.set(lv, {
                    name:    row.name_ko,
                    maxAmmo: Number(row.max_ammo) || 5,
                    regenMs: Number(row.regen_ms) || 30000,
                });
            }
        }
        this.setLevel(1);
    }

    setLevel(level) {
        const cfg = this._levelMap.get(level) ?? { maxAmmo: 5, regenMs: 30000 };
        this.level   = level;
        this.regenMs = cfg.regenMs;
        this._init(cfg.maxAmmo);
    }

    _init(count = 5) {
        if (!this._pts) {
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
            this._pts = { sq, ci };
        }

        this.slots = Array.from({ length: count }, (_, i) => ({
            ...AMMO_TABLE[i % AMMO_TABLE.length],
            angle:   (i / count) * Math.PI * 2,
            state:   'orbit',
            regenMs: 0,
            lockedX: 0,
            lockedY: 0,
        }));

        if (this.lockedSlot && !this.slots.includes(this.lockedSlot)) {
            this.lockedSlot = null;
        }
    }

    update(dt) {
        const dtSec = dt / 1000;
        for (const slot of this.slots) {
            if (slot.state === 'orbit') {
                slot.angle  = (slot.angle + slot.angVel * dtSec) % (Math.PI * 2);
                slot.morphT += slot.morphSpeed * dtSec;
            } else if (slot.state === 'empty') {
                slot.regenMs += dt;
                if (slot.regenMs >= this.regenMs) {
                    slot.state   = 'orbit';
                    slot.regenMs = 0;
                    slot.angle   = Math.random() * Math.PI * 2;
                    this.game.messages.show('regen_done');
                }
            }
            // locked 슬롯은 정지 상태 유지
        }
    }

    // pointerdown 시 호출 — 첫 번째 orbit 슬롯 잠금
    lock(charCx, charCy) {
        for (const slot of this.slots) {
            if (slot.state !== 'orbit') continue;
            const sa  = Math.sin(slot.angle);
            slot.lockedX = charCx + Math.cos(slot.angle) * slot.rx;
            slot.lockedY = charCy + sa * slot.ry;
            slot.state   = 'locked';
            this.lockedSlot = slot;
            return slot;
        }
        return null;   // 탄창 없음
    }

    // pointerup(이동/공격) 시 호출 — 슬롯 소모
    consume() {
        if (!this.lockedSlot) return;
        this.lockedSlot.state   = 'empty';
        this.lockedSlot.regenMs = 0;
        this.lockedSlot = null;
    }

    // pointerup(취소) 시 호출 — 슬롯 복귀
    release() {
        if (!this.lockedSlot) return;
        this.lockedSlot.state = 'orbit';
        this.lockedSlot = null;
    }

    render(ctx, frontPass, activeEnt) {
        const g   = this.game;
        const pts = this._pts;
        const ent = activeEnt ?? g._player;
        if (!pts || !ent) return;

        const charCx = ent.x - g._cameraX + ent.pw / 2;
        const charCy = ent.y + (ent.ph || 150) * 0.38;

        ctx.save();
        for (const slot of this.slots) {
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
    // clampedTarget: phase2(파동 충전)일 때 실제 발사 도달 지점(화면 좌표) — 없으면 마우스 위치 그대로 사용
    renderAimLine(ctx, activeEnt, clampedTarget) {
        const g   = this.game;
        const ent = activeEnt ?? g._player;
        if (!ent) return;
        const mx = clampedTarget?.x ?? g._mousePos.x, my = clampedTarget?.y ?? g._mousePos.y;

        // 라인 기준점: locked 탄창 위치 → 없으면 캐릭터 중심
        const slot = this.lockedSlot;
        const cx = slot ? slot.lockedX : ent.x - g._cameraX + ent.pw / 2;
        const cy = slot ? slot.lockedY : ent.y + ent.ph * 0.45;
        const held = performance.now() - g._holdStart;
        const t = Math.min(1, held / HOLD_THRESHOLD);   // 0→1 (0.5초 동안)

        // 색상: 흰색 → 시안 → 주황 (phase 1→2)
        let r, gC, b, alpha, lineW;
        if (g._chargePhase < 2) {
            // phase 1: 흰→시안
            r = Math.round(255 * (1 - t));
            gC = 255;
            b = 255;
            alpha = 0.3 + t * 0.3;
            lineW = 1 + t * 0.5;
        } else {
            // phase 2: 시안→주황 (충전 지속 시간 기반)
            const ct = Math.min(1, (held - HOLD_THRESHOLD) / 700);
            r = Math.round(0   + ct * 255);
            gC = Math.round(255 - ct * 95);
            b = Math.round(255 - ct * 255);
            alpha = 0.6 + ct * 0.3;
            lineW = 2 + ct * 2;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgb(${r},${gC},${b})`;
        ctx.lineWidth   = lineW;
        ctx.lineCap     = 'round';

        // 파동 충전 중: 사인파 출렁임
        if (g._chargePhase === 2) {
            const ct   = Math.min(1, (held - HOLD_THRESHOLD) / 700);
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
        ctx.fillStyle = `rgb(${r},${gC},${b})`;
        ctx.beginPath();
        ctx.arc(mx, my, lineW * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
