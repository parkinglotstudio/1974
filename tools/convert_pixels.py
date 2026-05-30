"""
convert_pixels.py — Sand Engine 픽셀 변환 도구
샘플 PNG → pixels.json (scanline / pixels 포맷)
Usage: python convert_pixels.py
"""

import json, os, sys
from PIL import Image

# ── 설정 ───────────────────────────────────────────────────────────────────
SAMPLES_DIR = r'C:\1974\assets\samples\프로젝트2'
OUT_DIR     = r'C:\1974\projects\1974\pixels'

# 파일명 → { 카테고리, 포맷, 타깃 크기, 색상 수 }
ASSET_MAP = {
    'ch01_L0_sky.png':       { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L0_sky_rainy.png':      { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L1_alley_basic.png':    { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L1_alley_arcade.png':   { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L1_alley_chimney.png':  { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L1_alley_rain.png':     { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L1_alley_window.png':   { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L3_wall_basic.png':     { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'L3_wall_stairs.png':    { 'cat': 'backgrounds', 'fmt': 'scanline', 'w': 540, 'h': 960, 'colors': 131 },
    'ch01_char_70s.png':     { 'cat': 'characters',  'fmt': 'pixels',   'w': 365, 'h': 654, 'colors': 64  },
}

# ── 헬퍼 ───────────────────────────────────────────────────────────────────

def rgb_to_hex(r, g, b):
    return f'#{r:02x}{g:02x}{b:02x}'

def quantize_image(img_rgba, n_colors):
    """
    RGBA 이미지 → 팔레트 인덱스 배열, 팔레트 색상 목록
    투명 픽셀(alpha < 128) → 인덱스 0 / 팔레트 0 = 'transparent'

    ★ 예약 인덱스 9-12는 건너뜀 (Sand Engine 특수 인덱스):
      9  = collision, 10 = emissive, 11 = danger, 12 = fog
      → 이미지 색상은 1-8, 13+ 에만 배치

    반환: (palette_list, index_array_2d)
      palette_list[0] = 'transparent'
      palette_list[1..] = '#rrggbb' (9-12는 'transparent' 예약)
      index_array_2d[y][x] = 팔레트 인덱스 (0 = 투명)
    """
    w, h = img_rgba.size
    rgba_pixels = img_rgba.load()

    # 불투명 마스크
    mask = [[False]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            a = rgba_pixels[x, y][3]
            mask[y][x] = (a >= 128)

    # RGB만 추출 → 팔레트 양자화
    img_rgb = img_rgba.convert('RGB')

    # Quantize
    img_q = img_rgb.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    qt_palette_raw = img_q.getpalette()   # [r,g,b, r,g,b, ...]
    qt_pixels = img_q.load()

    # 예약 인덱스 9-12를 건너뛰는 1-based 인덱스 시퀀스 생성
    # 0-based qt index i → 1-based 팔레트 slot (9,10,11,12 skip)
    RESERVED = {9, 10, 11, 12}
    slot_for_qt = {}  # qt_index → palette_slot
    slot = 1
    for qi in range(n_colors):
        while slot in RESERVED:
            slot += 1
        slot_for_qt[qi] = slot
        slot += 1

    # 팔레트 배열: 최대 슬롯+1 크기
    max_slot = max(slot_for_qt.values()) if slot_for_qt else 0
    palette_list = ['transparent'] * (max_slot + 1)
    for qi, ps in slot_for_qt.items():
        r = qt_palette_raw[qi * 3]
        g = qt_palette_raw[qi * 3 + 1]
        b = qt_palette_raw[qi * 3 + 2]
        palette_list[ps] = rgb_to_hex(r, g, b)
    # 예약 슬롯(9-12)은 'transparent' 유지

    # 인덱스 2D 배열 구성 (투명=0, 나머지 slot_for_qt[qt_idx])
    index_2d = []
    for y in range(h):
        row = []
        for x in range(w):
            if not mask[y][x]:
                row.append(0)
            else:
                qi = qt_pixels[x, y]
                row.append(slot_for_qt.get(qi, 0))
        index_2d.append(row)

    return palette_list, index_2d


def convert_scanline(png_path, cfg):
    """배경 이미지 → scanline JSON"""
    img = Image.open(png_path).convert('RGBA')
    tw, th = cfg['w'], cfg['h']
    if img.size != (tw, th):
        img = img.resize((tw, th), Image.LANCZOS)

    palette_list, index_2d = quantize_image(img, cfg['colors'])

    # 1D scanline 배열
    scanline = []
    for row in index_2d:
        scanline.extend(row)

    return {
        'width':    tw,
        'height':   th,
        'palette':  palette_list,
        'scanline': scanline,
    }


def convert_pixels_fmt(png_path, cfg):
    """캐릭터 이미지 → pixels JSON (투명 제거, sparse [[x,y,idx]]"""
    img = Image.open(png_path).convert('RGBA')
    tw, th = cfg['w'], cfg['h']
    if img.size != (tw, th):
        img = img.resize((tw, th), Image.LANCZOS)

    palette_list, index_2d = quantize_image(img, cfg['colors'])

    pixels = []
    for y, row in enumerate(index_2d):
        for x, idx in enumerate(row):
            if idx != 0:
                pixels.append([x, y, idx])

    return {
        'width':   tw,
        'height':  th,
        'palette': palette_list,
        'pixels':  pixels,
    }


# ── 메인 ───────────────────────────────────────────────────────────────────

def main():
    total = 0
    for png_name, cfg in ASSET_MAP.items():
        png_path = os.path.join(SAMPLES_DIR, png_name)
        if not os.path.exists(png_path):
            print(f'[SKIP] {png_name} — 파일 없음')
            continue

        out_name = os.path.splitext(png_name)[0] + '.json'
        out_cat  = os.path.join(OUT_DIR, cfg['cat'])
        out_path = os.path.join(out_cat, out_name)
        os.makedirs(out_cat, exist_ok=True)

        print(f'[변환] {png_name} → {cfg["cat"]}/{out_name} ...', end='', flush=True)

        if cfg['fmt'] == 'scanline':
            data = convert_scanline(png_path, cfg)
        else:
            data = convert_pixels_fmt(png_path, cfg)

        # JSON 저장 (separators로 compact 출력)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

        scanline_len = len(data.get('scanline', data.get('pixels', [])))
        print(f' 완료 (palette={len(data["palette"])}, data_len={scanline_len})')
        total += 1

    print(f'\n총 {total}개 변환 완료.')


if __name__ == '__main__':
    main()
