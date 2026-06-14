/**
 * Sand Engine — FXSystem v1.0
 * (2026-05-27)
 *
 * 단발성 화면 FX 통합 관리자.
 * flash, shake, color_shift, distortion 등 씬 이벤트 반응 효과.
 *
 * 등록된 모든 FX는 duration 이 끝나면 자동 제거.
 *
 * 사용법:
 *   // 흰 번쩍임 (정답 연출)
 *   engine.fx.flash({ color: '#ffffff', duration: 200 });
 *
 *   // 붉은 번쩍임 (오답)
 *   engine.fx.flash({ color: '#cc0000', duration: 150, maxAlpha: 0.4 });
 *
 *   // 화면 흔들기
 *   engine.fx.shake({ intensity: 4, duration: 300 });
 *
 *   // 색조 변환 (일시적 팔레트 스왑 효과)
 *   engine.fx.colorShift({ color: '#ff8800', duration: 500, blend: 'overlay' });
 *
 *   // 전체 초기화
 *   engine.fx.clearAll();
 *
 * SandEngine 자동 연결:
 *   _update: engine.fx.update(dt)
 *   _render: engine.fx.renderPre(canvas)  — 합성 전 (shake offset 적용)
 *            engine.fx.renderPost(canvas) — 합성 후 최상단 (flash, colorShift)
 */

export default class FXSystem {
    constructor(viewWidth = 540, viewHeight = 960) {
        this._vw = viewWidth;
        this._vh = viewHeight;

        /** 활성 FX 목록 */
        this._effects = [];

        /** shake 현재 오프셋 (LayerSystem 합성에 적용) */
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    // ── FX 트리거 ─────────────────────────────────────────────────────

    /**
     * 화면 번쩍임.
     * @param {object} opts
     * @param {string}  [opts.color='#ffffff']  번쩍임 색상
     * @param {number}  [opts.duration=200]     지속 시간 ms
     * @param {number}  [opts.maxAlpha=0.6]     최대 불투명도 0~1
     * @param {string}  [opts.blend='source-over'] 블렌드 모드
     */
    flash({ color = '#ffffff', duration = 200, maxAlpha = 0.6, blend = 'source-over' } = {}) {
        this._effects.push({
            type: 'flash',
            color, maxAlpha, blend,
            t: 0, duration,
        });
    }

    /**
     * 화면 흔들기 (Canvas transform translate).
     * @param {object} opts
     * @param {number}  [opts.intensity=4]   최대 오프셋 (픽셀)
     * @param {number}  [opts.duration=300]  지속 시간 ms
     * @param {number}  [opts.decay=1]       감쇠 (1=선형, 2=이차)
     */
    shake({ intensity = 4, duration = 300, decay = 1 } = {}) {
        // 기존 shake가 있으면 더 강한 값으로 교체
        const existing = this._effects.find(e => e.type === 'shake');
        if (existing && existing.intensity >= intensity) return;
        if (existing) {
            existing.intensity = intensity;
            existing.duration  = duration;
            existing.t         = 0;
            existing.decay     = decay;
            return;
        }
        this._effects.push({
            type: 'shake',
            intensity, duration, decay,
            t: 0,
        });
    }

    /**
     * 일시적 색조 오버레이 (팔레트 스왑 대신 Canvas 레벨 효과).
     * @param {object} opts
     * @param {string}  [opts.color]         색조 색상
     * @param {number}  [opts.duration=500]  지속 시간 ms
     * @param {string}  [opts.blend='overlay'] 블렌드 모드
     * @param {number}  [opts.maxAlpha=0.3]  최대 불투명도
     */
    colorShift({ color = '#ff8800', duration = 500, blend = 'overlay', maxAlpha = 0.3 } = {}) {
        this._effects.push({
            type: 'color_shift',
            color, blend, maxAlpha,
            t: 0, duration,
        });
    }

    /**
     * 정답 연출 — bright flash (화이트)
     */
    triggerCorrect() {
        this.flash({ color: '#ffffff', duration: 180, maxAlpha: 0.55 });
    }

    /**
     * 오답 연출 — dark red flash
     */
    triggerWrong() {
        this.flash({ color: '#cc2800', duration: 200, maxAlpha: 0.40 });
        this.shake({ intensity: 3, duration: 250 });
    }

    /**
     * 레벨업 연출 — 밝은 플래시 + 황금빛 색조
     */
    triggerLevelUp() {
        this.flash({ color: '#ffd044', duration: 300, maxAlpha: 0.65 });
        this.colorShift({ color: '#ffd044', duration: 600, blend: 'overlay', maxAlpha: 0.25 });
    }

    /**
     * 씬 전환 충격 — 강한 흔들기
     */
    triggerImpact() {
        this.shake({ intensity: 7, duration: 400, decay: 2 });
        this.flash({ color: '#ffffff', duration: 80, maxAlpha: 0.3 });
    }

    /** 모든 FX 즉시 제거 */
    clearAll() {
        this._effects.length = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    // ── 업데이트 ─────────────────────────────────────────────────────

    /**
     * @param {number} dt  밀리초
     */
    update(dt) {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;

        for (let i = this._effects.length - 1; i >= 0; i--) {
            const e = this._effects[i];
            e.t += dt;

            if (e.type === 'shake') {
                const progress = Math.min(e.t / e.duration, 1);
                const remaining = 1 - Math.pow(progress, e.decay ?? 1);
                const amp = e.intensity * remaining;
                // pseudo-random noise (sin-based)
                const nx = Math.sin(e.t * 0.05)  * amp;
                const ny = Math.sin(e.t * 0.073) * amp;
                this.shakeOffsetX += Math.round(nx);
                this.shakeOffsetY += Math.round(ny);
            }

            // 완료된 FX 제거
            if (e.t >= e.duration) {
                this._effects.splice(i, 1);
            }
        }
    }

    // ── 렌더 ─────────────────────────────────────────────────────────

    /**
     * 메인 캔버스 위에 flash / colorShift 오버레이 렌더.
     * layers.composite() 이후, 최상단에 호출.
     * @param {HTMLCanvasElement} mainCanvas
     */
    renderPost(mainCanvas) {
        if (!this._effects.length) return;

        const ctx = mainCanvas.getContext('2d');

        for (const e of this._effects) {
            if (e.type === 'flash' || e.type === 'color_shift') {
                const progress = Math.min(e.t / e.duration, 1);
                // 삼각형 파형: 0→maxAlpha(절반)→0
                const phase  = progress < 0.5
                    ? progress * 2
                    : (1 - progress) * 2;
                const alpha  = e.maxAlpha * phase;
                if (alpha <= 0) continue;

                ctx.save();
                ctx.globalCompositeOperation = e.blend ?? 'source-over';
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = e.color;
                ctx.fillRect(0, 0, this._vw, this._vh);
                ctx.restore();
            }
        }
    }

    /**
     * shake 오프셋을 적용한 translate (layers.composite 직전 호출 — 실제 이동은
     * LayerSystem.composite 가 shakeOffsetX/Y를 반영하도록 SandEngine이 전달).
     * 직접 사용 시: ctx.translate(fx.shakeOffsetX, fx.shakeOffsetY)
     */
    getShakeOffset() {
        return { x: this.shakeOffsetX, y: this.shakeOffsetY };
    }

    resize(viewWidth, viewHeight) {
        this._vw = viewWidth;
        this._vh = viewHeight;
    }
}
