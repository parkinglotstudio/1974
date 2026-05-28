/**
 * CameraSystem — ctx.setTransform 기반 줌/팬 카메라
 *
 * 상태:
 *   base      — scale 1.00, offset (0, 0)
 *   boost     — scale 0.85, offsetX +30 (앞쪽 와이드)
 *   slow      — scale 1.15, 좌우 미세 진동
 *   gameover  — scale 1.30, 캐릭터 중심 클로즈업
 *   intro_out — scale 0.70, 0.5초 후 base 복귀
 *
 * 사용법:
 *   camera.setState('boost')
 *   camera.pulse(1.03, 0.2)       // 코인 수집 bounce
 *   camera.apply(ctx, canvas)     // ctx.save() + transform
 *   camera.restore(ctx)           // ctx.restore()
 *   camera.update(dt)             // 매 프레임 호출
 */

const STATE_CONFIGS = {
    base:      { scale: 1.00, offsetX:   0, offsetY: 0, lerpSpeed: 0.08 },
    boost:     { scale: 0.85, offsetX:  30, offsetY: 0, lerpSpeed: 0.12 },
    slow:      { scale: 1.15, offsetX:   0, offsetY: 0, lerpSpeed: 0.06 },
    gameover:  { scale: 1.30, offsetX:   0, offsetY: 0, lerpSpeed: 0.18 },
    intro_out: { scale: 0.70, offsetX:   0, offsetY: 0, lerpSpeed: 0.14 },
};

export default class CameraSystem {
    constructor() {
        this.scale       = 1.0;   // 현재 줌
        this.targetScale = 1.0;   // 목표 줌
        this.offsetX     = 0;     // 수평 오프셋
        this.offsetY     = 0;     // 수직 오프셋
        this.targetOffX  = 0;
        this.targetOffY  = 0;
        this.lerpSpeed   = 0.08;  // 기본 Lerp 속도

        this._state      = 'base';
        this._shakeX     = 0;     // 슬로우 진동
        this._shakeTimer = 0;
        this._shakeAmp   = 0;
        this._shakeFreq  = 0;

        // 일시적 pulse (코인 수집 등)
        this._pulseScale  = 0;    // 추가 pulse 값
        this._pulseDecay  = 0;    // 초당 감소량

        // intro_out 복귀 타이머
        this._introTimer  = 0;
    }

    // ── 상태 전환 ─────────────────────────────────────────────────
    setState(state, opts = {}) {
        this._state = state;
        const cfg = STATE_CONFIGS[state] ?? STATE_CONFIGS.base;
        this.targetScale = cfg.scale;
        this.targetOffX  = opts.offsetX ?? cfg.offsetX;
        this.targetOffY  = opts.offsetY ?? cfg.offsetY;
        this.lerpSpeed   = opts.lerpSpeed ?? cfg.lerpSpeed;

        // 슬로우 — 좌우 진동 활성화
        if (state === 'slow') {
            this._shakeAmp  = opts.shakeAmp  ?? 2;
            this._shakeFreq = opts.shakeFreq ?? 7;
        } else {
            this._shakeAmp = 0;
        }

        // intro_out — 0.5초 후 자동 base 복귀
        if (state === 'intro_out') {
            this._introTimer = opts.duration ?? 0.5;
        }
    }

    // ── 일시적 펄스 (코인 수집 bounce) ───────────────────────────
    // targetScale: 목표 스케일, duration: 유지 시간(초)
    pulse(targetScale, duration = 0.2) {
        this._pulseScale = targetScale - this.scale;
        this._pulseDecay = Math.abs(this._pulseScale) / (duration * 0.5);
    }

    // ── 오르막/내리막 카메라 팬 ──────────────────────────────────
    tiltUp(amount = 8) {
        this.targetOffY = -Math.abs(amount);
    }
    tiltDown(amount = 6) {
        this.targetOffY = Math.abs(amount);
    }
    resetTilt() {
        this.targetOffY = STATE_CONFIGS[this._state]?.offsetY ?? 0;
    }

    // ── 매 프레임 업데이트 ────────────────────────────────────────
    update(dt) {
        // intro_out 자동 복귀
        if (this._state === 'intro_out') {
            this._introTimer -= dt;
            if (this._introTimer <= 0) this.setState('base');
        }

        // Lerp scale
        this.scale  += (this.targetScale - this.scale)  * this.lerpSpeed * 60 * dt;
        this.offsetX += (this.targetOffX - this.offsetX) * this.lerpSpeed * 60 * dt;
        this.offsetY += (this.targetOffY - this.offsetY) * this.lerpSpeed * 60 * dt;

        // 슬로우 진동
        if (this._shakeAmp > 0) {
            this._shakeTimer += dt;
            this._shakeX = Math.sin(this._shakeTimer * this._shakeFreq * Math.PI * 2)
                           * this._shakeAmp;
        } else {
            this._shakeX = 0;
        }

        // pulse 감쇠
        if (this._pulseScale !== 0) {
            const sign = Math.sign(this._pulseScale);
            this._pulseScale -= sign * this._pulseDecay * dt;
            if (sign !== Math.sign(this._pulseScale)) this._pulseScale = 0;
        }
    }

    // ── 렌더 적용 / 복원 ─────────────────────────────────────────
    apply(ctx, canvasW, canvasH) {
        ctx.save();
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        const s  = this.scale + this._pulseScale;
        const ox = this.offsetX + this._shakeX;
        const oy = this.offsetY;
        ctx.translate(cx + ox, cy + oy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
    }

    restore(ctx) {
        ctx.restore();
    }

    // ── Letterbox (부스트 시 상하 검은 띠) ───────────────────────
    drawLetterbox(ctx, canvasW, canvasH, bandH = 14, alpha = 0.7) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#000';
        ctx.fillRect(0, 0, canvasW, bandH);
        ctx.fillRect(0, canvasH - bandH, canvasW, bandH);
        ctx.restore();
    }

    // ── Vignette (슬로우 시 붉은 외곽 그라데이션) ────────────────
    drawVignette(ctx, canvasW, canvasH, color = 'rgba(180,20,20,', strength = 0.5) {
        ctx.save();
        const grad = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.2,
            canvasW / 2, canvasH / 2, canvasH * 0.8
        );
        grad.addColorStop(0,   color + '0)');
        grad.addColorStop(1,   color + strength + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }

    get currentState() { return this._state; }
}
