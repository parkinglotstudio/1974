#!/usr/bin/env python3
"""
흰 배경 근경(검은 실루엣) PNG → 엔진 배경 JSON (검은 실루엣 scanline).
(2026-06-06)

입력: 2020-근경2_1.png (흰 하늘 + 검은 전경, 4904×1256)
출력: objects/2020long_near.json (WORLD_W × 1280, 하단 배치)

- 흰색(밝음)→투명, 어두움→검정 실루엣(밝기로 알파 페이드 → 전선 등 안티에일리어싱 보존).
- 폭을 WORLD_W로 맞춰 리사이즈 후 1280 캔버스 하단에 배치(지면=바닥).
"""
import sys, json
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import split_bg_layers as S   # black_silhouette_scanline, write_json

SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/objects'
WORLD_W, WORLD_H = 4896, 1280
LO, HI = 100, 205     # lum<LO=불투명 검정, lum>HI=투명, 사이=페이드


def white_bg_to_silhouette(im):
    """흰배경 → 검은 실루엣. '위(하늘)에 연결된 흰색만' flood-fill로 제거,
    바닥 안에 갇힌 밝은 반사/틈은 실루엣으로 채움(= 바닥 구멍 방지)."""
    rgba = im.convert('RGBA')
    arr = np.asarray(rgba)
    H, W = arr.shape[:2]
    lum = arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114
    white = (lum > 180).astype(np.uint8) * 255      # 흰색 후보
    white[arr[..., 3] < 16] = 255                    # 원본 투명도 흰색 취급
    # 전선 등 얇은 검정 선을 메워(dilate) flood-fill이 그 아래 하늘까지 통과하게 함
    dil = Image.fromarray(white, 'L').filter(ImageFilter.MaxFilter(9))
    step = max(1, W // 24)
    for x in range(0, W, step):
        if dil.getpixel((x, 1)) == 255:
            ImageDraw.floodfill(dil, (x, 1), 128, thresh=25)
    dilA = np.asarray(dil)
    sky = (dilA == 128) & (white == 255)             # 채워진 영역 ∩ 원래 흰색 = 진짜 하늘(전선·바닥틈 제외)
    out = arr.copy()                                  # ⚠ 검은색 강제 대신 원본의 실제 색상(RGB)을 복사해 보존합니다!
    out[..., 3] = np.where(sky, 0, arr[..., 3]).astype(np.uint8) # 하늘 영역만 투명으로 변환
    return Image.fromarray(out, 'RGBA')


def main():
    # 진짜 가로모드용 풀컬러 원본 이미지인 2020-근경3.png를 사용합니다.
    src = Image.open(SAMP / '2020-근경3.png').convert('RGBA')
    # 2020-근경3.png는 이미 알파 채널이 완벽히 투명 처리되어 있으므로 화이트백 변환 작업을 건너뜁니다.
    sw, sh = src.size
    nh = max(1, round(sh * WORLD_W / sw))
    strip = src.resize((WORLD_W, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (WORLD_W, WORLD_H), (0, 0, 0, 0))
    canvas.paste(strip, (0, WORLD_H - nh), strip)
    # 검은 실루엣 대신, 원본 색상을 그대로 보존하기 위해 64색 적응형 메디안컷 양자화를 적용합니다.
    pal, scan = S.quantize_scanline(canvas, max_colors=64)
    OUT.mkdir(parents=True, exist_ok=True)
    S.write_json(OUT / '2020long_near.json', WORLD_W, WORLD_H, pal, scan)
    print(f'  2020long_near ({WORLD_W}x{WORLD_H}, pal {len(pal)}, 실루엣높이 {nh})  ← 2020-근경3.png')


if __name__ == '__main__':
    main()
