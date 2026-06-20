// AnimPhasePlayer.js — 데이터 기반 GIF 시퀀스 플레이어
// anim_sequences.json 의 phase 정의를 순서대로 실행
// GIF 렌더링 + phase 전환만 담당.
// 물리 / 충격파는 콜백으로 상위 게임 로직에 위임.

export class AnimPhasePlayer {
    constructor(sequenceDefs) {
        this._seqs  = sequenceDefs;
        this._state = null;
    }

    // ── 시작 ──────────────────────────────────────────────────
    // seqId    : JSON 키 ('aerial_move' 등)
    // frames   : { jump_start:{imgs,frames}, jump_loop:..., arrive_loop:..., jump_land:..., new_land:... }
    // callbacks:
    //   onPull()    — pull phase 시작 (당기기)
    //   onFly()     — fly phase 시작 (공중 이동)
    //   onArrive()  — arrive_loop phase 시작 (도착 루프)
    //   onImpact()  — arrive_end phase 시작 (충격파 트리거)
    //   onLand()    — land phase 시작 (착지)
    //   onAppear()  — 마지막 phase 완료 후 캐릭터 표시
    //   onDone()    — 시퀀스 전체 완료
    start(seqId, frames, callbacks, startId) {
        const phases = this._seqs?.[seqId];
        if (!phases?.length) return false;
        let idx = 0;
        if (startId) {
            const j = phases.findIndex(p => p.id === startId);
            if (j >= 0) idx = j;
        }
        this._state = {
            phases,
            idx,
            t:        0,
            frameIdx: 0,
            frames,
            cb:       callbacks ?? {},
        };
        this._onPhaseStart();
        return true;
    }

    stop() { this._state = null; }

    // ── 쿼리 ──────────────────────────────────────────────────
    get isActive()  { return this._state !== null; }
    get currentId() { return this._state?.phases[this._state.idx]?.id ?? null; }
    get currentGif() { return this._state?.phases[this._state.idx]?.gif ?? null; }
    get currentFrame() { return this._state?.frameIdx ?? 0; }
    get currentPhase() { return this._state?.phases[this._state.idx] ?? null; }

    // ── 렌더 모디파이어 해석 ──────────────────────────────────
    // spin/squash/afterimage 는 player가 직접 렌더에 반영하는 효과.
    // phase.fx 의 동일 type 항목을 우선 사용하고, 없으면 (구) top-level 속성을 폴백.
    _resolveMod(ph, type) {
        const fx = ph.fx?.find(f => f.type === type);
        if (type === 'spin') {
            if (fx) return { revPerSec: fx.revPerSec ?? 7, ghosts: fx.ghosts ?? 8, spread: fx.spread ?? 2.6, blurSec: fx.blurSec ?? 0.03 };
            if (ph.spin) return { revPerSec: ph.spinRevPerSec ?? 7, ghosts: ph.spinGhosts ?? 8, spread: ph.spinSpread ?? 2.6, blurSec: ph.spinBlurSec ?? 0.03 };
        } else if (type === 'afterimage') {
            if (fx) return { ghosts: fx.ghosts ?? 5, gap: fx.gap ?? 0.018 };
            if (ph.afterimage) return { ghosts: ph.afterGhosts ?? 5, gap: ph.afterGap ?? 0.018 };
        } else if (type === 'squash') {
            if (fx) return { amount: fx.amount ?? 0 };
            if (ph.squash) return { amount: ph.squash };
        }
        return null;
    }

    // ── 외부 이벤트 알림 ──────────────────────────────────────
    // 캐릭터가 목적지에 도착 → fly phase 종료 → arrive_loop로 전환
    notifyArrived() {
        const s = this._state;
        if (!s) return;
        const ph = s.phases[s.idx];
        if (ph?.nextTrigger === 'arrived') this._advance();
    }

    // 직선 픽셀무브(deliver) 완료 → air_loop로 전환
    notifyBlendDone() {
        const s = this._state;
        if (!s) return;
        if (s.phases[s.idx]?.nextTrigger === 'blendDone') this._advance();
    }

    // 중력 낙하 중 발이 지면 도달 → land로 전환
    notifyGrounded() {
        const s = this._state;
        if (!s) return;
        if (s.phases[s.idx]?.nextTrigger === 'grounded') this._advance();
    }

    // ── 업데이트 ──────────────────────────────────────────────
    update(dt) {
        const s = this._state;
        if (!s) return;
        const ph = s.phases[s.idx];
        if (!ph?.gif) return;

        s.t += dt;
        const info = s.frames[ph.gif];
        if (!info?.imgs?.length) return;

        const dur = ph.frameDur ?? 70;

        if (ph.staticFrame !== undefined) {
            // 정지 프레임 고정 (예: 회전은 한 장으로 돌림)
            s.frameIdx = Math.min(info.imgs.length - 1, ph.staticFrame);
        } else if (ph.loop) {
            s.frameIdx = Math.floor(s.t / dur) % info.imgs.length;
        } else {
            // startFrame: 앞부분 N프레임 건너뛰고 시작
            const start = ph.startFrame ?? 0;
            const count = info.imgs.length - start;
            s.frameIdx = start + Math.min(count - 1, Math.floor(s.t / dur));
            // holdLastMs: 마지막 프레임을 추가로 N ms 유지 후 종료
            const hold = ph.holdLastMs ?? 0;
            if (ph.nextTrigger === 'frameEnd' && s.t >= count * dur + hold) {
                this._onFrameEnd();
            }
        }
    }

    // ── 렌더 ──────────────────────────────────────────────────
    // flyX: 공중 이동 중 lerp된 월드 X 좌표 (없으면 playerX 사용)
    render(ctx, { playerX, playerY, playerPW, playerPH, cameraX, groundY, charH, flip, idleFootRow, flyX, refSrcH, spinFixedBlur, velX, velY }) {
        const s = this._state;
        if (!s) return;
        const ph = s.phases[s.idx];
        if (!ph?.gif) return;

        const info = s.frames[ph.gif];
        if (!info?.imgs?.length) return;
        const img = info.imgs[Math.min(s.frameIdx, info.imgs.length - 1)];
        if (!img) return;

        // fly/pull phase는 공중 lerp 위치 사용, 그 외는 캐릭터 실시간 위치
        const worldX = (ph.id === 'fly' || ph.id === 'pull') ? (flyX ?? playerX) : playerX;
        const footX  = worldX - cameraX + playerPW / 2;
        // 발 높이는 캐릭터 엔티티의 실시간 위치 기준 (air_loop 중력 낙하 추적).
        // 단, fly/pull(구 GIF 경로)은 groundY 고정 유지.
        const footY  = (ph.id === 'fly' || ph.id === 'pull')
            ? (groundY ?? (playerY + (idleFootRow ?? playerPH)))
            : (playerY + (idleFootRow ?? playerPH));

        const size  = ph.size ?? 1.0;
        // refSrcH(공통 소스 기준 높이)가 있으면 모든 프레임을 동일 스케일로(포즈별 크기 일관),
        // 없으면 기존처럼 프레임 높이를 charH에 맞춤.
        const scale = refSrcH ? (charH / refSrcH) * size : (charH * size / img.height);
        const dw    = img.width  * scale;
        const dh    = img.height * scale;
        // 프레임별 실제 발/머리 행 → 발 정렬·회전중심에 사용
        const fi      = Math.min(s.frameIdx, info.imgs.length - 1);
        const footRow = info.footRows ? info.footRows[fi] : img.height;
        const topRow  = info.topRows  ? info.topRows[fi]  : 0;
        const footPx  = footRow * scale;                 // 이미지 상단~발
        const x       = footX - dw * 0.5;
        const y       = footY - footPx;                  // 실제 발을 footY(발 선)에

        // ── 렌더 모디파이어 해석 (fx 우선, top-level 폴백) ──
        const spinMod   = this._resolveMod(ph, 'spin');
        const squashMod = this._resolveMod(ph, 'squash');
        const afterMod  = this._resolveMod(ph, 'afterimage');

        // ── spin phase: 캐릭터 중심 기준 초고속 회전 + 모션블러 (블랑카 롤링) ──
        if (spinMod) {
            const charHalf = (footRow - topRow) * 0.5 * scale;  // 캐릭터 세로 절반
            const centerPx = (topRow + footRow) * 0.5 * scale;  // 이미지 상단~캐릭터 중심
            const pivotX = footX;
            const pivotY = footY - charHalf;             // 캐릭터 세로 중심 (발 기준)
            const revPerSec = spinMod.revPerSec;         // 초당 회전수
            const ghosts    = spinMod.ghosts;            // 잔상 개수
            const dir       = flip ? -1 : 1;
            const omega     = revPerSec * Math.PI * 2;   // 각속도(rad/s)
            const base      = (s.t / 1000) * omega * dir;
            // 잔상 폭 = 각속도 × 블러 지속시간 → 느리면 한 장처럼, 빠르면 자동 블러.
            // spread는 상한(빠를 때 과도한 펼침 방지)으로 사용.
            const blurSec   = spinMod.blurSec;
            const maxSpread = spinMod.spread;
            // A(기본): 속도 비례 블러 / B(spinFixedBlur): 고정 잔상 펼침
            const spread    = spinFixedBlur ? maxSpread : Math.min(maxSpread, omega * blurSec);

            ctx.save();
            ctx.translate(pivotX, pivotY);
            for (let i = ghosts - 1; i >= 0; i--) {
                const a = base - dir * (i / ghosts) * spread;
                ctx.globalAlpha = (1 - i / ghosts) * 0.55;
                ctx.save();
                ctx.rotate(a);
                ctx.scale(dir, 1);
                ctx.drawImage(img, -dw * 0.5, -centerPx, dw, dh);   // 캐릭터 중심을 회전축에
                ctx.restore();
            }
            ctx.restore();
            return;
        }

        // ── 착지 스쿼시: 발 기준 높이를 줄였다 늘였다 (squash & stretch) ──
        let dhDraw = dh, yDraw = y;
        if (squashMod) {
            const dur   = ph.frameDur ?? 70;
            const total = info.imgs.length * dur;
            const prog  = Math.min(1, s.t / total);
            const scaleY = 1 - squashMod.amount * Math.sin(prog * Math.PI);  // 1→(1-amount)→1
            dhDraw = dh * scaleY;
            yDraw  = footY - footPx * scaleY;                          // 발 고정
        }

        const drawAt = (dx, dy) => {
            ctx.save();
            if (flip) {
                ctx.translate(dx + dw, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, dy, dw, dhDraw);
            } else {
                ctx.drawImage(img, dx, dy, dw, dhDraw);
            }
            ctx.restore();
        };

        // ── B 효과: 진행 방향 잔상(afterimage) — 움직임 강조 ──
        if (afterMod && (velX || velY)) {
            const gn  = afterMod.ghosts;
            const gap = afterMod.gap;              // 잔상 간격(초) — 클수록 길게 늘어짐
            for (let i = gn; i >= 1; i--) {
                ctx.globalAlpha = (1 - i / (gn + 1)) * 0.45;
                drawAt(x - velX * gap * i, y - velY * gap * i);
            }
            ctx.globalAlpha = 1;
        }

        drawAt(x, yDraw);
    }

    // ── 플로우 시각화 ─────────────────────────────────────────
    // 시퀀스의 phase 흐름을 다이어그램으로 그림.
    // 각 phase = 둥근 사각 노드, phase 사이 = 트리거 라벨 화살표.
    // 현재 활성 phase는 강조 + 진행 바. 시퀀스 비활성시 정적 흐름만 표시.
    renderFlow(ctx, x = 12, y = 12, opts = {}) {
        const {
            seqId    = this._state?.phases ? null : Object.keys(this._seqs ?? {})[0],
            nodeW    = 150,
            nodeH    = 34,
            gap      = 26,
            fontSize = 11,
        } = opts;

        // 활성 시퀀스 우선, 없으면 지정/첫 시퀀스
        const phases = this._state?.phases ?? (seqId ? this._seqs?.[seqId] : null);
        if (!phases?.length) return;
        const title = this._state
            ? (Object.keys(this._seqs ?? {}).find(k => this._seqs[k] === phases) ?? 'sequence')
            : (seqId ?? 'sequence');

        const curId   = this.currentId;
        const s       = this._state;
        const curT    = s?.t ?? 0;

        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';

        // 패널 배경
        const panelH = phases.length * nodeH + (phases.length - 1) * gap + 26;
        ctx.fillStyle   = 'rgba(8,10,16,0.78)';
        ctx.strokeStyle = 'rgba(80,120,160,0.4)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(x - 8, y - 8, nodeW + 16, panelH + 12, 8);
        ctx.fill();
        ctx.stroke();

        // 타이틀
        ctx.font      = `bold ${fontSize}px monospace`;
        ctx.fillStyle = '#7fd8ff';
        ctx.fillText(`▶ ${title}`, x, y + fontSize);

        const top0 = y + 22;

        phases.forEach((ph, i) => {
            const py       = top0 + i * (nodeH + gap);
            const isActive = ph.id === curId;
            const isPast   = s ? (phases.indexOf(phases.find(p => p.id === curId)) > i) : false;

            // 노드 배경
            if (isActive)      { ctx.fillStyle = 'rgba(80,200,255,0.22)'; ctx.strokeStyle = '#50c8ff'; ctx.lineWidth = 2; }
            else if (isPast)   { ctx.fillStyle = 'rgba(60,90,70,0.45)';   ctx.strokeStyle = '#5a8'; ctx.lineWidth = 1; }
            else               { ctx.fillStyle = 'rgba(24,28,38,0.8)';    ctx.strokeStyle = '#456'; ctx.lineWidth = 1; }
            ctx.beginPath();
            ctx.roundRect(x, py, nodeW, nodeH, 6);
            ctx.fill();
            ctx.stroke();

            // 진행 바 (활성 + frameEnd 기준)
            if (isActive && s) {
                let prog = 0;
                if (ph.nextTrigger === 'frameEnd') {
                    const info  = s.frames?.[ph.gif];
                    const dur   = ph.frameDur ?? 70;
                    const start = ph.startFrame ?? 0;
                    const count = Math.max(1, (info?.imgs?.length ?? 1) - start);
                    const total = count * dur + (ph.holdLastMs ?? 0);
                    prog = Math.min(1, curT / total);
                } else {
                    // blendDone/grounded/arrived: 외부 트리거 대기 → 펄스 표시
                    prog = 0.5 + 0.5 * Math.sin(curT / 140);
                }
                ctx.fillStyle = 'rgba(120,220,255,0.5)';
                ctx.beginPath();
                ctx.roundRect(x + 2, py + nodeH - 5, (nodeW - 4) * prog, 3, 1.5);
                ctx.fill();
            }

            // phase id
            ctx.font      = `bold ${fontSize}px monospace`;
            ctx.fillStyle = isActive ? '#bdefff' : (isPast ? '#9c9' : '#8a97a8');
            ctx.fillText(ph.id, x + 9, py + fontSize + 2);

            // gif/kind 부제
            ctx.font      = `${fontSize - 1}px monospace`;
            ctx.fillStyle = isActive ? '#eaf8ff' : (isPast ? '#7a8' : '#5a6577');
            ctx.fillText(ph.gif ?? ph.kind ?? '—', x + 9, py + nodeH - 7);

            // 다음 노드로 화살표 + 트리거 라벨
            if (i < phases.length - 1) {
                const cx = x + nodeW / 2;
                const ay = py + nodeH;
                ctx.strokeStyle = isActive ? '#50c8ff' : '#456';
                ctx.lineWidth   = isActive ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(cx, ay);
                ctx.lineTo(cx, ay + gap - 6);
                ctx.stroke();
                // 화살촉
                ctx.beginPath();
                ctx.moveTo(cx - 4, ay + gap - 10);
                ctx.lineTo(cx + 4, ay + gap - 10);
                ctx.lineTo(cx,     ay + gap - 4);
                ctx.closePath();
                ctx.fillStyle = isActive ? '#50c8ff' : '#456';
                ctx.fill();
                // 트리거 라벨
                ctx.font      = `${fontSize - 2}px monospace`;
                ctx.fillStyle = isActive ? '#7fd8ff' : '#566';
                ctx.textAlign = 'left';
                ctx.fillText(ph.nextTrigger ?? '', cx + 8, ay + gap / 2 + 2);
            }
        });

        ctx.restore();
    }

    // ── 내부 ──────────────────────────────────────────────────
    _onPhaseStart() {
        const s  = this._state;
        const ph = s.phases[s.idx];
        if (!ph) { this._done(); return; }

        // phase별 콜백
        const id = ph.id;
        if (id === 'deliver')     s.cb.onDeliver?.();
        if (id === 'rise')        s.cb.onRise?.();
        if (id === 'spin_fall')   s.cb.onSpinFall?.();
        if (id === 'pull')        s.cb.onPull?.();
        if (id === 'fly')         s.cb.onFly?.();
        if (id === 'air_loop')    s.cb.onAirLoop?.();
        if (id === 'arrive_loop') s.cb.onArrive?.();
        if (ph.impact)            s.cb.onImpact?.();   // (구) 단일 impact 플래그 — 하위호환
        if (id === 'land')        s.cb.onLand?.();
        // 데이터 기반 VFX: phase.fx 의 'enter' 효과를 게임이 디스패치
        if (ph.fx?.length)        s.cb.onPhaseFX?.(ph);
    }

    _onFrameEnd() {
        const s  = this._state;
        const isLast = s.idx === s.phases.length - 1;
        if (isLast) s.cb.onAppear?.();
        this._advance();
    }

    _advance() {
        const s = this._state;
        s.idx++;
        s.t        = 0;
        s.frameIdx = 0;
        const ph = s.phases[s.idx];
        if (!ph) { this._done(); return; }
        this._onPhaseStart();
    }

    _done() {
        const cb = this._state?.cb;
        this._state = null;
        cb?.onDone?.();
    }
}
