#!/usr/bin/env python3
"""
2021_NEW_1.json (사용자가 직접 만든 색보존 근경, frames/pixels 포맷, 4898x2010, 팔레트129)
  → 2021_near.json (scanline 포맷, 3119x1280, 색보존 + 내부 구멍 메움)

frames[].pixels 의 sparse [x,y,palIdx] 데이터를 RGBA 이미지로 복원 →
기존 근경과 동일한 월드폭(3119)에 맞춰 리사이즈 → 내부 투명 구멍 전부 메움 →
메디안컷으로 scanline 재양자화(엔진 정적 렌더 fast path 사용 위해 scanline 필요).
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split_bg_layers import quantize_scanline, fill_large_holes, write_json, avg_rgb

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'games/golmok/samples/2021_NEW_1.json'
OUT  = ROOT / 'games/golmok/pixels/objects/2021_near.json'

TARGET_W = 3119
TARGET_H = 1280


def hex_to_rgba(c):
    if c == 'transparent':
        return (0, 0, 0, 0)
    c = c.lstrip('#')
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    if len(c) >= 8:
        a = int(c[6:8], 16)
    else:
        a = 255
    return (r, g, b, a)


def main():
    import json
    print('[1/4] 2021_NEW_1.json 로드...')
    with open(SRC, 'r', encoding='utf-8') as f:
        d = json.load(f)
    W, H = d['width'], d['height']
    palette = d['palette']
    pal_rgba = np.array([hex_to_rgba(c) for c in palette], dtype=np.uint8)

    print(f'  원본 {W}x{H}, 팔레트 {len(palette)}색, 픽셀수 {len(d["frames"][0]["pixels"]):,}')

    # ── sparse pixels → 인덱스 배열(전부 0=transparent로 초기화) ──
    idx_arr = np.zeros((H, W), dtype=np.int32)
    pixels = d['frames'][0]['pixels']
    arr = np.array(pixels, dtype=np.int32)  # Nx3 [x,y,idx]
    idx_arr[arr[:, 1], arr[:, 0]] = arr[:, 2]

    # ── 인덱스 → RGBA 이미지 ──
    rgba_arr = pal_rgba[idx_arr]  # HxWx4
    img = Image.fromarray(rgba_arr, 'RGBA')

    # ── 월드폭(3119)에 맞춰 리사이즈 ──
    print(f'[2/4] 리사이즈 {W}x{H} → {TARGET_W}x{TARGET_H}...')
    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    # ── 내부 투명 구멍 전부 메움 (바깥 배경은 투명 유지) ──
    print('[3/4] 내부 구멍 메움...')
    img, nfill = fill_large_holes(img, a_min=10, min_area=1)
    print(f'  내부 구멍 메움(전부): {nfill:,}px')

    # ── scanline 재양자화 (색보존, 엔진 정적 렌더용) ──
    print('[4/4] scanline 양자화...')
    pal_f, scan_f = quantize_scanline(img, max_colors=160)
    kept = sum(1 for v in scan_f if v)
    print(f'  불투명 {kept:,} ({100*kept/(TARGET_W*TARGET_H):.1f}%), 팔레트 {len(pal_f)}, 평균RGB {avg_rgb(pal_f, scan_f)}')

    write_json(OUT, TARGET_W, TARGET_H, pal_f, scan_f)
    print('완료:', OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
