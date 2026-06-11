#!/usr/bin/env python3
"""
2021_far.json / 2021_far7.json 좌측 1~2px 투명 라인 수정.
원본 원경 PNG 자체가 좌측 가장자리 alpha~0 (배경제거 흔적) → quantize_scanline이
idx0(transparent)로 처리 → 해당 칸에서 L0가 비어 비네트(VignetteSystem, multiply
배경 투명 시 source 그대로 통과)가 흰 줄로 노출됨.

원경(L0, 하늘/스카이라인)은 항상 화면 전체를 덮는 배경이라 투명이 있을 이유가
없음 → alpha_t=0 으로 강제 완전불투명 재변환.
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split_bg_layers import quantize_scanline, write_json, avg_rgb

ROOT = Path(__file__).resolve().parent.parent
SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/objects'
FAR_H = 960


def uni(src_w, src_h, target_h):
    return (round(src_w * target_h / src_h), target_h)


def main():
    for src_name, out_name in [('2021_원경_2.png', '2021_far.json'), ('2021_원경_7.png', '2021_far7.json')]:
        src = SAMP / src_name
        fimg = Image.open(src).convert('RGBA')
        fW0, fH0 = fimg.size
        fw, fh = uni(fW0, fH0, FAR_H)
        fimg = fimg.resize((fw, fh), Image.LANCZOS)
        # 원경은 항상 화면 전체를 덮는 배경 — alpha_t=0으로 완전불투명 강제
        pal_f, scan_f = quantize_scanline(fimg, max_colors=220, alpha_t=0)
        n_transp = sum(1 for v in scan_f if v == 0)
        print(f'{src_name} {fW0}x{fH0} → {fw}x{fh}  투명픽셀 {n_transp} (강제0), 평균RGB {avg_rgb(pal_f, scan_f)}')
        write_json(OUT / out_name, fw, fh, pal_f, scan_f)
    return 0


if __name__ == '__main__':
    sys.exit(main())
