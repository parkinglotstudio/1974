/**
 * 주판왕 — ProblemGenerator
 * 레벨에 따라 덧셈 문제를 생성한다. 결과값 ≤ 999 (3열 주판 최대).
 *
 * 레벨 정의:
 *   1 입문 — 1자리 + 1자리 (결과 ≤ 9)
 *   2 초급 — 1자리 + 1자리 (결과 ≤ 18)
 *   3 중급 — 2자리 + 1자리 (결과 ≤ 99)
 *   4 고급 — 2자리 + 2자리 (결과 ≤ 198)
 */
export default class ProblemGenerator {
    constructor() {
        this._history = [];
    }

    // level: 1~4. 반환값: { a, b, operator, answer }
    generate(level = 1) {
        let problem;
        let attempts = 0;
        do {
            problem = this._make(level);
            attempts++;
        } while (attempts < 10 && this._isDuplicate(problem));

        this._history.push(problem.answer);
        if (this._history.length > 5) this._history.shift();

        return problem;
    }

    _make(level) {
        const [aRange, bRange] = LEVEL_RANGES[Math.min(level, 4) - 1];
        const a        = this._rand(aRange[0], aRange[1]);
        const b        = this._rand(bRange[0], bRange[1]);
        const answer   = a + b;
        return { a, b, operator: '+', answer };
    }

    _isDuplicate(problem) {
        return this._history.includes(problem.answer);
    }

    _rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

// [a범위, b범위]
const LEVEL_RANGES = [
    [[1, 5],   [1, 4]],    // Level 1 입문
    [[1, 9],   [1, 9]],    // Level 2 초급
    [[10, 50], [1, 9]],    // Level 3 중급
    [[10, 90], [10, 90]],  // Level 4 고급
];
