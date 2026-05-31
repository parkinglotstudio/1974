/**
 * 신규 프로젝트 게임 스크립트 — 템플릿
 *
 * ★ 모래엔진 모토(시그니처 기본 효과)는 모든 신규 프로젝트에 기본 탑재됩니다.
 *   - SandScroll(이동 시 모래가 부풀어 맵 생성), 발밑 그림자, 배경색 역광 rim,
 *     배경 블룸, 낮밤 FX 사이클 등.
 *   - 이 효과들은 "빼달라"는 명시 요청 전까지 제거 금지. (엔진의 정체성)
 *   - 현재 기준 구현은 content/golmok/scripts/GolmokGame.js 에 있으며,
 *     골목 개발이 끝나면 engine/fx/ 공용 모듈로 승격될 예정(엔진툴 작업과 함께).
 *
 * 이 템플릿은 폴더 구조 견본이며 content/index.json 에 등록되어 있지 않습니다.
 */
export default class Game {
    constructor(engine) {
        this.engine = engine;
    }

    onStart() {
        const e = this.engine;
        // ── 모래엔진 기본 효과(모토) ON ──────────────────────────────
        e.glow?.enable();          // 배경 밝은부분 블룸 (네온/조명)
        e.rimLight?.enable?.();    // 배경색 역광 rim
        // SandScroll / 그림자 / 낮밤 사이클 = 공용 FX 모듈 승격 후 여기서 init
        // (현재 기준 구현: GolmokGame.js 참고)
    }

    onUpdate(dt) {}
    onPostRender(ctx, cameraX) {}
}
