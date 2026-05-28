/**
 * Sand Engine — AnimationStateMachine
 * 스프라이트 애니메이션 상태 관리. 매 tick마다 현재 프레임 인덱스 반환.
 *
 * 상태 정의 포맷 (PixelJSON Sparse 프레임 배열 기준):
 * {
 *   "sprite": "runner",
 *   "states": {
 *     "idle":   { "frames": [0],       "loop": true,  "fps": 2  },
 *     "walk":   { "frames": [1,2,3,4], "loop": true,  "fps": 8  },
 *     "run":    { "frames": [5,6,7,8], "loop": true,  "fps": 12 },
 *     "glitch": { "frames": [9,10],    "loop": false, "fps": 12 }
 *   }
 * }
 */
export default class AnimationStateMachine {
    constructor() {
        this.states   = {};    // name → { frames[], loop, fps }
        this.current  = null;  // 현재 상태 이름
        this._stateFrameIdx = 0;   // 현재 상태 내 frames[] 인덱스
        this._lastTick = 0;
        this._done     = false;    // non-loop 상태 완료 플래그

        // non-loop 상태가 끝났을 때 호출. onStateEnd(stateName)
        this.onStateEnd = null;
    }

    // 상태 정의 JSON 로드 + 첫 번째 상태로 초기화
    load(stateDef) {
        this.states = stateDef.states ?? {};
        const first = Object.keys(this.states)[0];
        if (first) this.setState(first);
    }

    // 상태 전환. 같은 상태면 리셋 없이 무시.
    setState(name) {
        if (!this.states[name]) {
            console.warn(`[ASM] unknown state: "${name}"`);
            return;
        }
        if (this.current === name) return;
        this.current        = name;
        this._stateFrameIdx = 0;
        this._lastTick      = 0;
        this._done          = false;
    }

    // 매 requestAnimationFrame에서 호출. now = performance.now() 또는 rAF timestamp.
    // 반환값: PixelJSON frames[] 의 절대 인덱스
    tick(now) {
        if (!this.current || this._done) return this.getCurrentFrame();

        const state    = this.states[this.current];
        const interval = 1000 / state.fps;

        // 첫 tick 기준점 초기화 (초기값 0 보호)
        if (this._lastTick === 0) {
            this._lastTick = now;
            return this.getCurrentFrame();
        }

        if (now - this._lastTick < interval) return this.getCurrentFrame();

        this._lastTick = now;
        this._stateFrameIdx++;

        if (this._stateFrameIdx >= state.frames.length) {
            if (state.loop) {
                this._stateFrameIdx = 0;
            } else {
                this._stateFrameIdx = state.frames.length - 1;
                this._done = true;
                if (this.onStateEnd) this.onStateEnd(this.current);
            }
        }

        return this.getCurrentFrame();
    }

    // 현재 PixelJSON 프레임 절대 인덱스
    getCurrentFrame() {
        if (!this.current) return 0;
        return this.states[this.current].frames[this._stateFrameIdx] ?? 0;
    }

    isDone()  { return this._done; }

    // 같은 상태를 처음부터 다시 재생 (glitch 등 반복 트리거 시)
    restart() {
        this._stateFrameIdx = 0;
        this._lastTick      = 0;
        this._done          = false;
    }
}
