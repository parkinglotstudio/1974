#!/usr/bin/env python3
"""
2020 배경(원경/근경 쌍) → 엔진 배경 JSON (1280 높이 기준).
(2026-06-06)

입력(samples/):
  2020-원경1.png / 2020-근경1.png  → objects/2020a_far.json / 2020a_near.json
  2020-원경2.png / 2020-근경2.png  → objects/2020b_far.json / 2020b_near.json

- 원경(far): 불투명 풀컬러 → quantize_scanline (전체 1280 높이로 리사이즈)
- 근경(near): 알파 실루엣 → 폭을 월드폭에 맞춰 리사이즈 후 1280 캔버스 '하단'에 배치
              → black_silhouette_scanline (검은 실루엣 + 파일 알파 보존, 엔진 근경 스타일)
- 월드폭은 원경1 기준(2433)으로 통일 → bgCycle에서 worldWidth 일정.
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import split_bg_layers as S   # quantize_scanline, black_silhouette_scanline, write_json

SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/objects'

WORLD_W, WORLD_H = 2433, 1280     # 높이 1280 기준(반응형 표준), 폭=원경1 비율
FAR_COLORS  = 64                  # 원경 팔레트 색 수

PAIRS = [
    ('2020a', '2020-원경1', '2020-근경1'),
    ('2020b', '2020-원경2', '2020-근경2'),
]


def conv_far(name):
    im = Image.open(SAMP / f'{name}.png').convert('RGBA').resize((WORLD_W, WORLD_H), Image.LANCZOS)
    pal, scan = S.quantize_scanline(im, FAR_COLORS)
    return pal, scan


def conv_near(name):
    src = Image.open(SAMP / f'{name}.png').convert('RGBA')
    sw, sh = src.size
    nh = max(1, round(sh * WORLD_W / sw))               # 폭을 월드폭에 맞춤
    strip = src.resize((WORLD_W, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (WORLD_W, WORLD_H), (0, 0, 0, 0))
    canvas.paste(strip, (0, WORLD_H - nh), strip)        # 하단 배치(지면=캔버스 바닥)
    pal, scan = S.black_silhouette_scanline(canvas)
    return pal, scan


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for era, far_png, near_png in PAIRS:
        fp, fs = conv_far(far_png)
        S.write_json(OUT / f'{era}_far.json', WORLD_W, WORLD_H, fp, fs)
        print(f'  {era}_far  ({WORLD_W}x{WORLD_H}, pal {len(fp)})  ← {far_png}')
        np_, ns = conv_near(near_png)
        S.write_json(OUT / f'{era}_near.json', WORLD_W, WORLD_H, np_, ns)
        print(f'  {era}_near ({WORLD_W}x{WORLD_H}, pal {len(np_)})  ← {near_png}')
    print('완료 → games/golmok/pixels/objects/ (2020a/2020b _far/_near)')


if __name__ == '__main__':
    main()
