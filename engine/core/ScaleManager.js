/**
 * Sand Engine — ScaleManager
 * 논리적 게임 해상도 → 물리적 화면 해상도 스케일링.
 * Mobile-First: max-width 420px 컨테이너 기준.
 * image-rendering: pixelated 으로 픽셀 퍼펙트 유지.
 */
export default class ScaleManager {
    constructor(gameWidth, gameHeight) {
        this.gameW  = gameWidth;
        this.gameH  = gameHeight;
        this.scale  = 1;
        this.dispW  = gameWidth;
        this.dispH  = gameHeight;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    // 컨테이너 크기 기준으로 스케일 계산
    calculate(containerW, containerH) {
        const sx = containerW / this.gameW;
        const sy = containerH / this.gameH;
        this.scale = Math.min(sx, sy);

        this.dispW   = Math.floor(this.gameW * this.scale);
        this.dispH   = Math.floor(this.gameH * this.scale);
        this.offsetX = Math.floor((containerW - this.dispW) / 2);
        this.offsetY = Math.floor((containerH - this.dispH) / 2);

        return this;
    }

    // 캔버스에 스케일 적용 (CSS 크기만 변경, canvas 내부 해상도는 유지)
    applyToCanvas(canvas) {
        canvas.style.width           = `${this.dispW}px`;
        canvas.style.height          = `${this.dispH}px`;
        canvas.style.imageRendering  = 'pixelated';
        canvas.style.position        = 'absolute';
        canvas.style.left            = `${this.offsetX}px`;
        canvas.style.top             = `${this.offsetY}px`;
        return this;
    }

    // 화면 좌표 → 게임 논리 좌표 변환 (InputManager에서 사용)
    screenToGame(screenX, screenY, canvasRect) {
        return {
            x: Math.floor((screenX - canvasRect.left) * this.gameW / canvasRect.width),
            y: Math.floor((screenY - canvasRect.top)  * this.gameH / canvasRect.height),
        };
    }

    // resize 이벤트 시 재계산 + 적용
    update(containerW, containerH, canvas) {
        this.calculate(containerW, containerH);
        if (canvas) this.applyToCanvas(canvas);
        return this;
    }
}
