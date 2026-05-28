/**
 * Sand Engine — DitherEngine
 * Bayer 8×8 ordered dithering. Scene 01~09 1-bit 흑백 + 체커보드 보더 효과.
 *
 * 사용 예:
 *   const dither = new DitherEngine();
 *   // 렌더 후 포스트프로세스:
 *   dither.apply(ctx, width, height, frameIndex);
 *   // 테두리 체커보드만:
 *   dither.applyBorder(ctx, width, height, frameIndex, borderSize);
 */
export default class DitherEngine {

    // Bayer 8×8 표준 매트릭스 (0~63)
    static MATRIX = [
        [ 0, 32,  8, 40,  2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44,  4, 36, 14, 46,  6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [ 3, 35, 11, 43,  1, 33,  9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47,  7, 39, 13, 45,  5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21],
    ];

    // 특정 픽셀 위치의 Bayer 임계값 반환 (0.0 ~ 1.0)
    threshold(x, y) {
        return DitherEngine.MATRIX[y & 7][x & 7] / 64;
    }

    // 캔버스 전체에 1-bit Bayer 디더링 적용 (포스트프로세스)
    // ctx: CanvasRenderingContext2D
    // frameIndex: 체커보드 애니메이션 프레임 번호
    apply(ctx, width, height, frameIndex = 0) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const MATRIX = DitherEngine.MATRIX;

        for (let y = 0; y < height; y++) {
            const row = MATRIX[y & 7];
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) << 2;
                const a = data[i + 3];
                if (a === 0) continue; // 투명 픽셀 스킵

                // 휘도 계산 (BT.601)
                const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 255000;
                const bit = lum > row[x & 7] / 64 ? 255 : 0;

                data[i]     = bit;
                data[i + 1] = bit;
                data[i + 2] = bit;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // CLAUDE.md 연출 기법: (x + y + frame) % 8 === 0 → 체커보드 보더
    // borderSize: 테두리 두께(px), 기본 1px
    applyBorder(ctx, width, height, frameIndex = 0, borderSize = 1) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            const isBorderRow = y < borderSize || y >= height - borderSize;
            for (let x = 0; x < width; x++) {
                const isBorderCol = x < borderSize || x >= width - borderSize;
                if (!isBorderRow && !isBorderCol) continue;

                const i = (y * width + x) << 2;
                // 체커보드: 프레임마다 위상 이동으로 깜빡임
                const on = (x + y + frameIndex) % 8 === 0;
                const v  = on ? 255 : 0;
                data[i]     = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = on ? 255 : 0; // off 픽셀은 투명
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // 특정 팔레트 인덱스를 1-bit로 강제 매핑 (렌더 전 팔레트 변환용)
    // luminance → 1 (white) or 2 (black) 인덱스
    // PaletteManager.addPreset 과 연계해서 사용
    static to1BitIndex(r, g, b, x, y) {
        const lum = (r * 299 + g * 587 + b * 114) / 255000;
        return lum > DitherEngine.MATRIX[y & 7][x & 7] / 64 ? 1 : 2;
    }
}
