/**
 * 주판왕 — AbacusScene
 * 게임 흐름: 손님 등장 → 물건 주문 → 주판 계산 → 정답 확인 → 팔레트 트리거
 */
import { Scene }       from '../../engine/scene/SceneManager.js';
import AbacusEntity    from './AbacusEntity.js';
import ProblemGenerator from './ProblemGenerator.js';
import CustomerSystem  from './CustomerSystem.js';
import ScoreSystem     from './ScoreSystem.js';

const LEVEL_BASE_TIMES = { 1: 30, 2: 25, 3: 20, 4: 15 };

// 게임 상태 머신
const STATE = {
    IDLE:       'idle',
    CUSTOMER:   'customer',   // 손님 등장 연출 중
    PLAYING:    'playing',    // 주판 입력 대기
    CORRECT:    'correct',    // 정답 연출
    WRONG:      'wrong',      // 오답 연출
    LEVELUP:    'levelup',    // 레벨업 연출
    GAMEOVER:   'gameover',   // 타임오버
};

const FLASH_DURATION = 1.2;   // 연출 지속 시간(초)

export default class AbacusScene extends Scene {
    constructor() {
        super('abacus_game');
        this.abacus    = new AbacusEntity();
        this.generator = new ProblemGenerator();
        this.customers = new CustomerSystem();
        this.score     = null;

        this._state    = STATE.IDLE;
        this._timer    = 0;
        this._flashT   = 0;
        this._problem  = null;
        this._customer = null;
        this._loaded   = false;
        this._entityIdMap = {};

        // 외부(overlay)에서 읽는 공개 상태
        this.ui = {
            state:    STATE.IDLE,
            timer:    0,
            timerMax: 30,
            score:    0,
            combo:    0,
            level:    1,
            problem:  null,
            customer: null,
            correct:  false,
        };
    }

    async onInit(engine) {
        this.score = new ScoreSystem(engine.scenes);

        await engine.loadPrefabs({
            ABACUS_FRAME:  'assets/prefabs/ABACUS_FRAME.prefab.json',
            ABACUS_ROD:    'assets/prefabs/ABACUS_ROD.prefab.json',
            ABACUS_BEAD:   'assets/prefabs/ABACUS_BEAD.prefab.json',
            UI_TIMER:      'assets/prefabs/UI_TIMER.prefab.json',
            UI_SCORE:      'assets/prefabs/UI_SCORE.prefab.json',
            UI_PROBLEM:    'assets/prefabs/UI_PROBLEM.prefab.json',
            PARTICLE_STAR: 'assets/prefabs/PARTICLE_STAR.prefab.json',
            CUSTOMER:      'assets/prefabs/CUSTOMER.prefab.json',
            BG_SHOP_WALL:  'assets/prefabs/BG_SHOP_WALL.prefab.json',
        });

        // 커스텀 팔레트 프리셋 등록
        this._registerPalettes(engine);
    }

    async onEnter(engine) {
        this._engine  = engine;
        this.abacus.reset();
        this.customers.reset();
        this.score.reset();
        this._loaded  = false;
        this._state   = STATE.IDLE;
        this._entityIdMap = {};

        const sceneJSON = await engine.assets.load('assets/scenes/abacus_game.scene.json');
        await engine.applyScene(sceneJSON);

        // 엔티티 ID 맵 구성
        for (const entry of sceneJSON.entities || []) {
            if (entry.id) this._entityIdMap[entry.id] = entry.id;
        }

        this._loaded = true;
        this._spawnCustomer();
    }

    onUpdate(now, dt, input) {
        if (!this._loaded) return;

        const dtSec = dt / 1000;

        switch (this._state) {
            case STATE.CUSTOMER:
                // 손님 등장 연출 (1초 후 PLAYING)
                this._flashT -= dtSec;
                if (this._flashT <= 0) this._enterPlaying();
                break;

            case STATE.PLAYING:
                this._timer -= dtSec * (this._customer?.timerMult ?? 1.0);
                this.ui.timer = Math.max(0, this._timer);

                // 경고 팔레트 (타이머 30% 이하)
                if (this._timer <= this.ui.timerMax * 0.3 && this._timer > 0) {
                    this._triggerPalette('danger_tint', false);
                } else {
                    this._restorePalette();
                }

                if (this._timer <= 0) {
                    this._timeUp();
                    return;
                }

                if (input.isJustPressed('confirm')) {
                    this._checkAnswer();
                }
                break;

            case STATE.CORRECT:
            case STATE.WRONG:
                this._flashT -= dtSec;
                if (this._flashT <= 0) {
                    if (this._state === STATE.CORRECT) {
                        this._spawnCustomer();
                    } else {
                        this._enterPlaying(); // 오답: 재입력
                    }
                }
                break;

            case STATE.LEVELUP:
                this._flashT -= dtSec;
                if (this._flashT <= 0) this._spawnCustomer();
                break;

            case STATE.GAMEOVER:
                break;
        }

        this._syncUI();
    }

    onExit() {
        this._loaded = false;
        this._state  = STATE.IDLE;
        this._restorePalette();
    }

    // ── 공개 API (overlay에서 호출) ────────────────────────────────────

    // overlay 클릭으로 주판알 토글
    toggleBead(col, position, row) {
        if (this._state !== STATE.PLAYING) return;
        if (position === 'upper') {
            this.abacus.toggleUpper(col);   // 한국식: 윗알 1개, row 무시
        } else {
            this.abacus.toggleLower(col, row);
        }
    }

    // overlay 제출 버튼
    submitAnswer() {
        if (this._state !== STATE.PLAYING) return;
        this._checkAnswer();
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    _spawnCustomer() {
        this._restorePalette();
        this._customer = this.customers.generate(this.score.level);
        this._problem  = this.generator.fromCustomer(this._customer, this.score.level);
        this.abacus.reset();

        // 손님 등장 팔레트
        if (this._customer.palette) {
            this._triggerPalette(this._customer.palette, false);
        }

        this._state  = STATE.CUSTOMER;
        this._flashT = 1.0;  // 1초 손님 등장 연출
        this._syncUI();

        console.log(`[AbacusScene] 손님: ${this._customer.label} | 문제: ${this._problem.displayText} | 답: ${this._problem.answer}`);
    }

    _enterPlaying() {
        const baseTime = LEVEL_BASE_TIMES[this.score.level] ?? 30;
        this._timer       = baseTime;
        this.ui.timerMax  = baseTime;
        this._state       = STATE.PLAYING;

        // 꼼꼼한 손님은 cool_tint 유지
        if (this._customer?.id === 'picky') {
            this._triggerPalette('cool_tint', false);
        } else if (this._customer?.id === 'regular') {
            this._triggerPalette('warm_tint', false);
        } else {
            this._restorePalette();
        }
    }

    _checkAnswer() {
        if (!this._problem) return;
        const current = this.abacus.getValue();

        if (current === this._problem.answer) {
            const result = this.score.onCorrect();
            this._triggerPalette('bright_flash', true);
            this._state  = STATE.CORRECT;
            this._flashT = FLASH_DURATION;
            this.ui.correct = true;

            // 레벨업 체크
            if (result.levelUp) {
                this._triggerPalette('gold_flash', true);
                this._state  = STATE.LEVELUP;
                this._flashT = FLASH_DURATION * 1.5;
            }

            console.log(`[AbacusScene] 정답! +${result.gained} 콤보×${result.combo}`);
        } else {
            this.score.onWrong();
            this._triggerPalette('dark_flash', true);
            this._state  = STATE.WRONG;
            this._flashT = FLASH_DURATION * 0.6;
            this.ui.correct = false;

            console.log(`[AbacusScene] 오답. 현재: ${current}, 정답: ${this._problem.answer}`);
        }
    }

    _timeUp() {
        this._state = STATE.GAMEOVER;
        this._triggerPalette('dark_flash', true);
        const result = this.score.onTimeUp();
        console.log(`[AbacusScene] 시간 종료. 최종: ${result.finalScore}`);
        // engine.scenes.change('abacus_result', 'dither_fade');
    }

    _syncUI() {
        this.ui.state    = this._state;
        this.ui.score    = this.score?.score    ?? 0;
        this.ui.combo    = this.score?.combo    ?? 0;
        this.ui.level    = this.score?.level    ?? 1;
        this.ui.problem  = this._problem;
        this.ui.customer = this._customer;
    }

    _triggerPalette(name, once) {
        try {
            const pm = this._engine?.palette_mgr;
            if (!pm) return;
            pm.swap(name);
            if (once) {
                clearTimeout(this._palTimer);
                this._palTimer = setTimeout(() => pm.restore(), 800);
            }
        } catch (e) { /* 팔레트 미등록 시 무시 */ }
    }

    _restorePalette() {
        try {
            this._engine?.palette_mgr?.restore?.();
        } catch (e) {}
    }

    _registerPalettes(engine) {
        const pm = engine.palette_mgr;
        if (!pm?.addPreset) return;

        // warm_tint: 단골 손님 — 따뜻한 노란빛
        pm.addPreset('warm_tint',
            ['transparent', '#fff8e1', '#ffe082', '#ffca28', '#ffa000', '#e65100', '#bf360c', '#4e342e', '#3e2723', '#1a0000']
        );

        // cool_tint: 꼼꼼한 손님 — 차가운 청색빛
        pm.addPreset('cool_tint',
            ['transparent', '#e8f5e9', '#b2dfdb', '#4db6ac', '#00897b', '#00695c', '#004d40', '#1a237e', '#0d47a1', '#000a12']
        );

        // danger_tint: 타이머 경고 — 붉은 긴장감
        pm.addPreset('danger_tint',
            ['transparent', '#fff3e0', '#ffccbc', '#ff8a65', '#e64a19', '#bf360c', '#8d1a00', '#3e0000', '#1a0000', '#000000']
        );

        // gold_flash: 레벨업 — 황금빛
        pm.addPreset('gold_flash',
            ['transparent', '#ffffff', '#fff9c4', '#ffee58', '#fdd835', '#f9a825', '#ff6f00', '#4a148c', '#1a0050', '#000000']
        );

        // red_tint: 급한 손님 — 긴장된 붉은빛
        pm.addPreset('red_tint',
            ['transparent', '#fff3e0', '#ffccbc', '#ff7043', '#d84315', '#b71c1c', '#7f0000', '#3e0000', '#1a0000', '#000000']
        );

        // dark_shift: 외상 손님 (이미 PRESETS에 정의됨, 덮어쓰기)
        pm.addPreset('dark_shift',
            ['transparent', '#eceff1', '#b0bec5', '#78909c', '#546e7a', '#37474f', '#263238', '#1c2a32', '#101820', '#000000']
        );
    }
}
