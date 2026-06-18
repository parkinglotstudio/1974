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
    start(seqId, frames, callbacks) {
        const phases = this._seqs?.[seqId];
        if (!phases?.length) return false;
        this._state = {
            phases,
            idx:      0,
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

    // ── 외부 이벤트 알림 ──────────────────────────────────────
    // 캐릭터가 목적지에 도착 → fly phase 종료 → arrive_loop로 전환
    notifyArrived() {
        const s = this._state;
        if (!s) return;
        const ph = s.phases[s.idx];
        if (ph?.nextTrigger === 'arrived') this._advance();
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

        if (ph.loop) {
            s.frameIdx = Math.floor(s.t / dur) % info.imgs.length;
        } else {
            s.frameIdx = Math.min(info.imgs.length - 1, Math.floor(s.t / dur));
            if (ph.nextTrigger === 'frameEnd' && s.t >= info.imgs.length * dur) {
                this._onFrameEnd();
            }
        }
    }

    // ── 렌더 ──────────────────────────────────────────────────
    // flyX: 공중 이동 중 lerp된 월드 X 좌표 (없으면 playerX 사용)
    render(ctx, { playerX, playerY, playerPW, playerPH, cameraX, groundY, charH, flip, idleFootRow, flyX }) {
        const s = this._state;
        if (!s) return;
        const ph = s.phases[s.idx];
        if (!ph?.gif) return;

        const info = s.frames[ph.gif];
        if (!info?.imgs?.length) return;
        const img = info.imgs[Math.min(s.frameIdx, info.imgs.length - 1)];
        if (!img) return;

        // fly/pull phase는 공중 lerp 위치 사용, arrive 이후는 목적지 고정
        const worldX = (ph.id === 'fly' || ph.id === 'pull') ? (flyX ?? playerX) : playerX;
        const footX  = worldX - cameraX + playerPW / 2;
        const footY  = groundY ?? (playerY + (idleFootRow ?? playerPH));

        const size  = ph.size ?? 1.0;
        const scale = charH * size / img.height;
        const dw    = img.width  * scale;
        const dh    = img.height * scale;
        const x     = footX - dw * 0.5;
        const y     = footY - dh;

        ctx.save();
        if (flip) {
            ctx.translate(x + dw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, y, dw, dh);
        } else {
            ctx.drawImage(img, x, y, dw, dh);
        }
        ctx.restore();
    }

    // ── 내부 ──────────────────────────────────────────────────
    _onPhaseStart() {
        const s  = this._state;
        const ph = s.phases[s.idx];
        if (!ph) { this._done(); return; }

        // phase별 콜백
        const id = ph.id;
        if (id === 'pull')        s.cb.onPull?.();
        if (id === 'fly')         s.cb.onFly?.();
        if (id === 'arrive_loop') s.cb.onArrive?.();
        if (id === 'arrive_end' && ph.impact) s.cb.onImpact?.();
        if (id === 'land')        s.cb.onLand?.();
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
