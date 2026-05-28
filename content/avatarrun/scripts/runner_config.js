export const CFG = {
    // ── 월드 ──────────────────────────────────────────────────────
    GAME_W:      480,
    GAME_H:      270,
    GROUND_Y:    220,   // 지면 Y (픽셀, 캐릭터 바닥 기준)
    CHAR_LEFT:   60,    // 캐릭터 고정 X
    CHAR_SIZE:   24,    // 캐릭터 기본 크기

    // ── 물리 ──────────────────────────────────────────────────────
    GRAVITY:       900,
    JUMP_IMPULSE:  340,
    DELTA_CAP:     0.05,
    HIT_INSET:     3,

    // ── 스크롤 / 속도 ─────────────────────────────────────────────
    SCROLL_BASE:        70,   // 기본 스크롤 속도 (px/s)
    SCROLL_SCORE_CHUNK: 100,   // 점수 몇 점당 속도 증가
    SCROLL_STEP:         10,   // 속도 증가량
    SPEED_SLOW:          0.5,
    SPEED_BOOST:         2.0,

    // ── 점수 ──────────────────────────────────────────────────────
    SCORE_PER_SEC:  6,

    // ── 팔레트 인덱스 ─────────────────────────────────────────────
    PAL: {
        TRANSPARENT:  0,
        PAPER:        1,
        PAPER_DK:     2,
        GROUND:       3,
        INK:          4,
        CHAR_BASE:    5,
        CHAR_DK:      6,
        COIN:         7,
        COIN_ACC:     8,
        CHAR_BOOST:  10,
        CHAR_SLOW:   11,
    }
};
