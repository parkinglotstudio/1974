/**
 * Sand Engine — 시그니처 모래 팔레트
 * (사용자 지정 2026-05-30)
 *
 * 모래 효과(생성/소멸/침식/앰비언트)의 void(바탕)·입자 색에 사용한다.
 * "우리는 모래엔진" — 검정 대신 이 모래 톤을 기본 바탕으로 쓴다.
 *
 *   base  = 기본 바탕(void) 색 — 맨 위 진한 모래색
 *   tones = 깨짐/침식 입자에 조금씩 섞어 쓰는 변주 톤
 */
export const SAND_PALETTE_HEX = {
    base:  '#C2B280',
    tones: ['#C2B280', '#C2B980', '#88825A', '#FFFCE9', '#FFF9D4'],
};

// 기본 바탕(void) RGB
export const SAND_BASE_RGB = [0xC2, 0xB2, 0x80];   // #C2B280

// 변주 톤 RGB (입자 색 변화용)
export const SAND_TONES_RGB = [
    [0xC2, 0xB2, 0x80],  // #C2B280
    [0xC2, 0xB9, 0x80],  // #C2B980
    [0x88, 0x82, 0x5A],  // #88825A
    [0xFF, 0xFC, 0xE9],  // #FFFCE9
    [0xFF, 0xF9, 0xD4],  // #FFF9D4
];
