#!/usr/bin/env python3
"""
2021 배경 변환 (가로/landscape 기준) — 근경 1장(이미 배경제거/알파) + 원경 2장(풀컬러)
(2026-06-10, 가로 모드로 재변환)

split_bg_layers.py 의 헬퍼를 재사용한다.
  - 근경(2021_근경_1): 알파 있는 검정 실루엣 → black_silhouette_scanline (색 검정, 파일 알파 유지)
  - 원경(2021_원경_2 / _7): 풀컬러 → quantize_scanline (메디안컷 적응형 팔레트)

가로 씬(main_landscape, 뷰 1760×740) 기준:
  - 근경: 종횡비 유지, 높이 NEAR_H=1280 → 폭 = 월드폭. 씬에서 y 시프트로 하단 740 노출.
  - 원경: 종횡비 유지, 높이 FAR_H=960 → 폭. 원경은 거리감 있어 해상도 약간 낮춤(파일 절감).

출력 (games/golmok/pixels/objects/):
  2021_near.json   ← 2021_근경_1   (L1 근경, 검정 실루엣)
  2021_far.json    ← 2021_원경_2   (L0 원경, 시작)
  2021_far7.json   ← 2021_원경_7   (L0 원경, 중간 교체 대상)
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split_bg_layers import (
    quantize_scanline, black_silhouette_scanline, fill_large_holes, write_json, avg_rgb,
)

ROOT = Path(__file__).resolve().parent.parent
SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/objects'

NEAR_H = 1280   # 근경 높이 (가로 뷰 740 위에서 하단 노출용 — 기존 2020 가로 관행과 동일)
FAR_H  = 960    # 원경 높이 (거리감 — 해상도 약간 낮춰 파일 절감)


def uni(src_w, src_h, target_h):
    """종횡비 유지로 높이=target_h 일 때의 (폭, 높이)."""
    return (round(src_w * target_h / src_h), target_h)


def main():
    near_png = SAMP / '2021_근경_1.png'
    far2_png = SAMP / '2021_원경_2.png'
    far7_png = SAMP / '2021_원경_7.png'
    for p in (near_png, far2_png, far7_png):
        if not p.exists():
            print(f'[err] 샘플 없음: {p.name}'); return 1

    # ── 근경: 종횡비 유지, 높이 NEAR_H → 폭 = 월드폭 ──
    nimg = Image.open(near_png).convert('RGBA')
    nW0, nH0 = nimg.size
    world_w, near_h = uni(nW0, nH0, NEAR_H)
    nimg = nimg.resize((world_w, near_h), Image.LANCZOS)
    # 내부 투명 구멍 전부 메움(아치·난간틈 등 모두) → far 안 비침. 바깥 배경만 투명 유지.
    nimg, nfill = fill_large_holes(nimg, a_min=10, min_area=1)
    print(f'  내부 구멍 메움(전부): {nfill:,}px')
    # 전부 검정 실루엣(알파 유지) — 처음 상태로 복귀
    pal_n, scan_n = black_silhouette_scanline(nimg, abands=12)
    kept = sum(1 for v in scan_n if v)
    print(f'근경 {nW0}x{nH0} → {world_w}x{near_h}  불투명 {kept:,} ({100*kept/(world_w*near_h):.1f}%), 팔레트 {len(pal_n)} (색보존)')
    write_json(OUT / '2021_near.json', world_w, near_h, pal_n, scan_n)
    print(f'\n월드폭 = {world_w}  (가로 씬 bounds.worldWidth / 근경 pw 에 사용)\n')

    # ── 원경 2장: 종횡비 유지, 높이 FAR_H (풀컬러 메디안컷) ──
    for src, out_name in [(far2_png, '2021_far.json'), (far7_png, '2021_far7.json')]:
        fimg = Image.open(src).convert('RGBA')
        fW0, fH0 = fimg.size
        fw, fh = uni(fW0, fH0, FAR_H)
        fimg = fimg.resize((fw, fh), Image.LANCZOS)
        pal_f, scan_f = quantize_scanline(fimg, max_colors=220)
        print(f'원경 {src.name} {fW0}x{fH0} → {fw}x{fh}  평균RGB {avg_rgb(pal_f, scan_f)}')
        write_json(OUT / out_name, fw, fh, pal_f, scan_f)

    return 0


if __name__ == '__main__':
    sys.exit(main())
