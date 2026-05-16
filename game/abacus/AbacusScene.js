/**
 * 주판왕 — AbacusScene
 * Sand Engine SceneManager에 등록하는 메인 게임 씬.
 *
 * 게임 흐름:
 *   onEnter → 씬 로드 → 타이머 시작
 *   매 update → 타이머 감소 + 입력 처리 (주판알 토글)
 *   정답 확인 → onCorrect / onWrong
 *   타임업 → onTimeUp → 결과 씬으로 전환
 */
import { Scene }       from '../../engine/scene/SceneManager.js';
import AbacusEntity    from './AbacusEntity.js';
import ProblemGenerator from './ProblemGenerator.js';
import ScoreSystem     from './ScoreSystem.js';

// 레벨별 제한 시간 (초)
const LEVEL_TIMES = { 1: 30, 2: 25, 3: 20, 4: 15 };

export default class AbacusScene extends Scene {
    constructor() {
        super('abacus_game');
        this.abacus    = new AbacusEntity();   // 3열(百十一)
        this.generator = new ProblemGenerator();
        this.score     = null;
        this.timer     = 30;
        this._problem  = null;
        this._loaded   = false;
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
        });
    }

    async onEnter(engine) {
        this.abacus.reset();
        this.score.reset();
        this.timer    = LEVEL_TIMES[this.score.level] ?? 30;
        this._loaded  = false;

        // 씬 JSON으로 엔티티 배치
        const sceneJSON = await engine.assets.load('assets/scenes/abacus_game.scene.json');
        await engine.applyScene(sceneJSON);
        this._loaded = true;

        // 첫 문제 생성
        this._nextProblem(engine);

        console.log('[AbacusScene] ready');
    }

    onUpdate(now, dt, input) {
        if (!this._loaded) return;

        // 타이머 감소
        this.timer -= dt / 1000;
        if (this.timer <= 0) {
            this.timer = 0;
            this._timeUp();
            return;
        }

        // 주판 입력 처리 (InputManager action 기반)
        // 실제 주판알 터치/클릭은 게임 UI에서 별도 처리 예정
        // 여기선 confirm 키로 현재 주판값 = 답인지 확인
        if (input.isJustPressed('confirm')) {
            this._checkAnswer();
        }
    }

    onExit() {
        this._loaded = false;
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    _nextProblem(engine) {
        this._problem = this.generator.generate(this.score.level);
        // 타이머도 레벨에 맞게 리셋
        this.timer = LEVEL_TIMES[this.score.level] ?? 30;
        console.log(`[AbacusScene] 문제: ${this._problem.a} + ${this._problem.b} = ${this._problem.answer}`);
    }

    _checkAnswer() {
        if (!this._problem) return;
        const current = this.abacus.getValue();
        if (current === this._problem.answer) {
            const result = this.score.onCorrect();
            this.abacus.reset();
            this._nextProblem();
            console.log(`[AbacusScene] 정답! +${result.gained} 콤보×${result.combo}`);
        } else {
            this.score.onWrong();
            this.abacus.reset();
            console.log(`[AbacusScene] 오답. 현재값: ${current}, 정답: ${this._problem.answer}`);
        }
    }

    _timeUp() {
        const result = this.score.onTimeUp();
        console.log(`[AbacusScene] 시간 종료. 최종 점수: ${result.finalScore}`);
        // engine.scenes.change('abacus_result', 'dither_fade');
    }
}
