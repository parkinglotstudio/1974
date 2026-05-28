/**
 * Sand Engine — Sequencer
 * 씬 내 타임라인 이벤트 시스템
 *
 * 사용법:
 *   engine.seq
 *     .at(0,   () => engine.particles.emit('sand_rain', {...}))
 *     .at(2.5, () => engine.particles.emitTextForm({text:'SAND ENGINE', ...}))
 *     .at(5.0, () => engine.scenes.transitionTo('title', {effect:'fade'}))
 *     .start();
 *
 *   // update는 engine이 자동으로 호출함 (dt: ms 단위)
 */
export default class Sequencer {

    constructor() {
        this._events  = [];
        this._t       = 0;       // 경과 시간 (초)
        this._running = false;
    }

    // ── 이벤트 등록 ───────────────────────────────────────────────

    /**
     * 특정 시간(초)에 실행할 콜백 등록
     * @param {number}   t   — 실행 시각 (초)
     * @param {Function} fn  — 콜백 (인수: 현재 경과 시간)
     * @returns {this}       — 체이닝용
     */
    at(t, fn) {
        this._events.push({ t, fn, fired: false });
        return this;
    }

    // ── 제어 ──────────────────────────────────────────────────────

    /** 처음부터 시작 */
    start() {
        this._t = 0;
        this._running = true;
        this._events.forEach(e => e.fired = false);
        this._events.sort((a, b) => a.t - b.t);
        return this;
    }

    /** 일시정지 */
    pause() { this._running = false; return this; }

    /** 재개 */
    resume() { this._running = true; return this; }

    /** 정지 + 초기화 */
    reset() {
        this._t = 0;
        this._running = false;
        this._events.forEach(e => e.fired = false);
        return this;
    }

    /** 이벤트 전체 제거 후 리셋 */
    clear() {
        this._events  = [];
        this._t       = 0;
        this._running = false;
        return this;
    }

    // ── 상태 조회 ─────────────────────────────────────────────────

    /** 현재 경과 시간 (초) */
    get time() { return this._t; }

    /** 실행 중 여부 */
    get running() { return this._running; }

    /** 모든 이벤트 발동 완료 여부 */
    get finished() {
        return this._events.length > 0 && this._events.every(e => e.fired);
    }

    // ── 내부 — engine._update에서 호출 (dt: ms) ──────────────────

    update(dt) {
        if (!this._running) return;
        this._t += dt / 1000;
        for (const e of this._events) {
            if (!e.fired && this._t >= e.t) {
                e.fn(this._t);
                e.fired = true;
            }
        }
    }
}
