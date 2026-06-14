/**
 * Sand Engine — PixelRenderer
 * createImageData + putImageData 방식으로 픽셀 단위 직접 제어.
 * fillRect 루프 대비 수십 배 빠름.
 *
 * enableIndexMap() 호출 시 팔레트 인덱스 버퍼도 병행 관리.
 * CollisionSystem이 Layer 2 충돌 데이터를 읽기 위해 사용.
 */
export default class PixelRenderer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.width  = width;
        this.height = height;

        canvas.width  = width;
        canvas.height = height;

        this.imageData = this.ctx.createImageData(width, height);
        this.buf       = this.imageData.data; // Uint8ClampedArray
        this._indexMap = null;                // Uint16Array (옵션 — enableIndexMap 후 활성화)

        // 오프스크린 캔버스: putImageData → offscreen 후 drawImage(source-over) 합성
        // 이렇게 해야 투명 엔티티 픽셀이 레이어 배경을 덮어쓰지 않는다
        this._offscreen     = document.createElement('canvas');
        this._offscreen.width  = width;
        this._offscreen.height = height;
        this._offCtx        = this._offscreen.getContext('2d');
    }

    // 인덱스맵 활성화 (CollisionSystem 전용 — Layer 2에만 사용)
    enableIndexMap() {
        this._indexMap = new Uint16Array(this.width * this.height);
    }

    // 팔레트 인덱스 조회
    getPixelIndex(x, y) {
        if (!this._indexMap || x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
        return this._indexMap[y * this.width + x];
    }

    // 배경색으로 전체 초기화 (기본값: 투명)
    clear(r = 0, g = 0, b = 0, a = 0) {
        const buf = this.buf;
        const len = buf.length;
        for (let i = 0; i < len; i += 4) {
            buf[i]     = r;
            buf[i + 1] = g;
            buf[i + 2] = b;
            buf[i + 3] = a;
        }
        if (this._indexMap) this._indexMap.fill(0);
    }

    // pixels: [[x, y, paletteIndex], ...]
    // ox, oy: 렌더 오프셋 (엔티티 월드/스크린 좌표)
    putPixels(pixels, rgbaCache, ox = 0, oy = 0) {
        const buf  = this.buf;
        const imap = this._indexMap;
        const w    = this.width;
        const h    = this.height;

        for (const [x, y, idx] of pixels) {
            const px = x + ox;
            const py = y + oy;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            const rgba = rgbaCache.get(idx);
            if (!rgba) continue; // transparent

            const pos    = (py * w + px) << 2;
            buf[pos]     = rgba[0];
            buf[pos + 1] = rgba[1];
            buf[pos + 2] = rgba[2];
            buf[pos + 3] = rgba[3];
            if (imap) imap[py * w + px] = idx;
        }
    }

    // pixelMap: 2D 배열 [[paletteIndex, ...], ...]
    putPixelMap(pixelMap, rgbaCache) {
        const buf  = this.buf;
        const imap = this._indexMap;
        const w    = this.width;

        for (let y = 0; y < pixelMap.length; y++) {
            const row = pixelMap[y];
            for (let x = 0; x < row.length; x++) {
                const idx = row[x];
                if (!idx) continue;
                const rgba = rgbaCache.get(idx);
                if (!rgba) continue;

                const pos    = (y * w + x) << 2;
                buf[pos]     = rgba[0];
                buf[pos + 1] = rgba[1];
                buf[pos + 2] = rgba[2];
                buf[pos + 3] = rgba[3];
                if (imap) imap[y * w + x] = idx;
            }
        }
    }

    // 단일 픽셀 쓰기 (트랜스폼 렌더링 / 파티클용)
    // idx: 팔레트 인덱스 (인덱스맵 기록용 — 기본 0)
    putPixel(x, y, rgba, idx = 0) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        const pos    = (y * this.width + x) << 2;
        this.buf[pos]     = rgba[0];
        this.buf[pos + 1] = rgba[1];
        this.buf[pos + 2] = rgba[2];
        this.buf[pos + 3] = rgba[3];
        if (this._indexMap) this._indexMap[y * this.width + x] = idx;
    }

    // scanline: Uint8Array | number[] (row-major, length = width * height)
    // 배경 레이어 전용 고속 경로 — sparse putPixels 대비 ~10배 빠름
    // stride: scanline 데이터의 실제 행 너비 (픽셀 단위)
    // 기본값은 renderer 너비이지만, asset이 다른 너비로 그려진 경우 명시해야 함.
    // 예: L0 renderer=1080, asset scanline=540px → stride=540
    putScanline(scanline, rgbaCache, ox = 0, oy = 0, stride = this.width) {
        const W = this.width;
        const H = this.height;
        const len = scanline.length;
        const imap = this._indexMap;

        // ── 고속 경로: 픽셀당 Map.get·나눗셈·4바이트 쓰기를 제거 ──
        // (출력 바이트는 구버전과 동일 — 같은 팔레트색·같은 idx0/미정의 스킵 규칙)
        // 1) 팔레트(Map)를 256엔트리 플랫 LUT로 1회 펼침 → 픽셀당 Map.get 제거
        const lut   = this._slLut   || (this._slLut   = new Uint32Array(256));
        const valid = this._slValid || (this._slValid = new Uint8Array(256));
        valid.fill(0);
        for (const [k, c] of rgbaCache) {
            if (k > 0 && k < 256 && c) {
                lut[k]   = ((c[0]) | (c[1] << 8) | (c[2] << 16) | (c[3] << 24)) >>> 0;
                valid[k] = 1;
            }
        }
        // 2) 버퍼의 Uint32 뷰 (픽셀당 1회 쓰기). resize 시 buffer 교체 → 일치 검사로 갱신
        if (!this._buf32 || this._buf32.buffer !== this.buf.buffer) {
            this._buf32 = new Uint32Array(this.buf.buffer);
        }
        const buf32 = this._buf32;

        // 3) 행 단위 순회 — i%stride / floor(i/stride) 픽셀당 연산 제거, sx 클립은 행마다 1회
        const rows = Math.ceil(len / stride);
        const cStart = ox < 0 ? -ox : 0;            // sx = c+ox >= 0
        for (let r = 0; r < rows; r++) {
            const sy = r + oy;
            if (sy < 0 || sy >= H) continue;
            const base = r * stride;
            let cEnd = len - base; if (cEnd > stride) cEnd = stride;   // 마지막 행 길이
            if (cEnd > W - ox) cEnd = W - ox;                         // sx < W
            const dstBase = sy * W + ox;                              // di = dstBase + c = sy*W + sx
            for (let c = cStart; c < cEnd; c++) {
                const idx = scanline[base + c];
                if (idx === 0 || !valid[idx]) continue;               // transparent / 미정의 스킵
                const di = dstBase + c;
                buf32[di] = lut[idx];
                if (imap) imap[di] = idx;
            }
        }
    }

    // imageData → canvas 반영
    // offscreen에 putImageData 후 drawImage로 합성 — 투명 픽셀이 배경을 지우지 않음
    flush() {
        this._offCtx.putImageData(this.imageData, 0, 0);
        this.ctx.drawImage(this._offscreen, 0, 0);
    }

    // 프레임 하나를 완전히 렌더 (단독 사용 시)
    render(frame, rgbaCache, bgColor = null) {
        if (bgColor) this.clear(...bgColor);
        else         this.clear();

        if (frame.pixel_map) this.putPixelMap(frame.pixel_map, rgbaCache);
        else if (frame.pixels) this.putPixels(frame.pixels, rgbaCache);

        this.flush();
    }

    resize(width, height) {
        this.width     = width;
        this.height    = height;
        this.canvas.width  = width;
        this.canvas.height = height;
        this.imageData = this.ctx.createImageData(width, height);
        this.buf       = this.imageData.data;
        if (this._indexMap) this._indexMap = new Uint16Array(width * height);
        // 오프스크린도 함께 리사이즈
        this._offscreen.width  = width;
        this._offscreen.height = height;
    }
}
