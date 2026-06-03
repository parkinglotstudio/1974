#!/usr/bin/env python3
"""
golmok 근경/원경 레이어 분리 변환기
(2026-06-03)  — 메디안컷 적응형 팔레트 사용 (빈도순 X, 따뜻한 색 보존)

샘플 명명 규칙 (era 예: 1960_1):
  {era}.png        = 원본 합성 (사용 안 함)
  {era}_1.png      = 원경(far) 스카이라인  → objects/{era}_far.json  (scanline 풀컬러)
  {era}_1_1.png    = 근경(near) 흰배경 실루엣 → objects/{era}_near.json (scanline, 흰색 투명)

사용법:
  python tools/split_bg_layers.py 1960_1
  python tools/split_bg_layers.py 1960_1 1970_1 1980_1 2020_1
"""
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/objects'
TW, TH = 1706, 960          # 월드/뷰포트에 맞춘 변환 크기 (기존 배경과 동일)
KEEP_LUM = 150              # 근경: 이 밝기 미만만 유지(실루엣), 이상은 투명(하늘/흰배경)
ALPHA_T  = 16               # 알파 임계


def quantize_scanline(rgba, max_colors, alpha_t=ALPHA_T):
    """
    RGBA 이미지를 메디안컷 적응형 팔레트로 양자화 → (palette, scanline).
    idx 0 = transparent 예약. 알파<alpha_t 픽셀은 idx0.
    """
    W, H = rgba.size
    rgb  = rgba.convert('RGB')
    # 메디안컷 적응형 — 색 범위를 부피로 분할해 따뜻한 색/노을도 보존
    pal_img = rgb.quantize(colors=max_colors - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    pal_raw = pal_img.getpalette()           # [r,g,b, r,g,b, ...]
    ncol    = max_colors - 1
    # JSON 팔레트: 0=transparent, 1..ncol = 적응형 색 (quantize idx +1)
    palette = ['transparent']
    for i in range(ncol):
        r, g, b = pal_raw[i*3], pal_raw[i*3+1], pal_raw[i*3+2]
        palette.append(f'#{r:02x}{g:02x}{b:02x}')

    qdata = list(pal_img.getdata())          # 0-based 적응형 인덱스
    adata = [p[3] for p in rgba.getdata()]   # 알파
    scan  = [0] * (W * H)
    for i in range(W * H):
        scan[i] = 0 if adata[i] < alpha_t else (qdata[i] + 1)
    return palette, scan


def quantize_scanline_soft(rgba, max_colors, fade_lo=0.25, fade_hi=0.85, abands=8):
    """
    근경용 — 색은 메디안컷으로 유지하되, 픽셀 불투명도를 '밝기(흰색 농도)'에 따라 페이드.
    어두움(lum<=fade_lo) = 불투명, 밝음(lum>=fade_hi) = 투명, 사이 = 램프.
    팔레트는 #rrggbbaa(엔진 지원). 알파는 abands 단계로 양자화해 팔레트 폭증 방지.
    """
    W, H = rgba.size
    rgb  = rgba.convert('RGB')
    pal_img = rgb.quantize(colors=max_colors, method=Image.MEDIANCUT, dither=Image.NONE)
    pal_raw = pal_img.getpalette()
    qcol = list(pal_img.getdata())          # 픽셀별 양자화 색 인덱스
    src  = list(rgba.getdata())             # (r,g,b,a) 원본

    palette = ['transparent']
    key2idx = {}
    scan = [0] * (W * H)
    span = max(1e-6, fade_hi - fade_lo)
    for i in range(W * H):
        r0, g0, b0, a0 = src[i]
        if a0 < 8:
            continue
        lum = (0.299*r0 + 0.587*g0 + 0.114*b0) / 255.0
        # 밝을수록 알파↓
        f = 1.0 if lum <= fade_lo else (0.0 if lum >= fade_hi else 1 - (lum - fade_lo)/span)
        a = a0 * f
        if a < 12:
            continue                         # 거의 투명 → 스킵
        # 알파 양자화
        aq = max(1, min(abands, round(a/255*abands)))
        ab = round(aq/abands*255)
        ci = qcol[i]
        r, g, b = pal_raw[ci*3], pal_raw[ci*3+1], pal_raw[ci*3+2]
        key = f'#{r:02x}{g:02x}{b:02x}{ab:02x}'
        idx = key2idx.get(key)
        if idx is None:
            idx = len(palette); palette.append(key); key2idx[key] = idx
        scan[i] = idx
    return palette, scan


def black_silhouette_scanline(rgba, abands=12, a_min=8):
    """
    근경용 — 색은 전부 블랙(#000000)으로 강제, 불투명도는 파일 알파 그대로 유지.
    흰색/유색 픽셀이 있어도 모두 검은 실루엣이 되고, 가장자리 반투명(파일 알파)은 보존.
    팔레트 = transparent + 검정 alpha 단계(#000000aa) 뿐 → 검은색 계열만.
    """
    W, H = rgba.size
    src  = list(rgba.getdata())
    palette = ['transparent']
    key2idx = {}
    scan = [0] * (W * H)
    for i in range(W * H):
        a0 = src[i][3]
        if a0 < a_min:
            continue                          # 투명 유지
        aq = max(1, min(abands, round(a0 / 255 * abands)))
        ab = round(aq / abands * 255)
        key = f'#000000{ab:02x}'              # 항상 검정, 알파만 변동
        idx = key2idx.get(key)
        if idx is None:
            idx = len(palette); palette.append(key); key2idx[key] = idx
        scan[i] = idx
    return palette, scan


def write_json(path, W, H, palette, scanline):
    out = {"schema": "PixelJSON Sparse v0.1", "width": W, "height": H,
           "palette": palette, "scanline": scanline}
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    kb = path.stat().st_size / 1024
    print(f'  → {path.name}  팔레트 {len(palette)}색 / {kb:.0f} KB')


def avg_rgb(palette, scanline):
    def hx(h):
        h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
    r=g=b=n=0
    for i in range(0, len(scanline), 37):
        idx = scanline[i]
        if idx == 0: continue
        c = palette[idx]
        if c == 'transparent': continue
        pr,pg,pb = hx(c); r+=pr; g+=pg; b+=pb; n+=1
    return (r//n, g//n, b//n) if n else (0,0,0)


def process(era):
    # 명명 규칙 (era 예: 1960_1):
    #   {era}_1_1_1.png    = 근경(near)  — 배경 제거된 실루엣(알파 포함)
    #   {era}_1_1_1_1.png  = 원경(far)   — 풀컬러 스카이라인
    near_png = SAMP / f'{era}_1_1.png'      # = {era}_1_1_1.png (era 자체가 ..._1)
    far_png  = SAMP / f'{era}_1_1_1.png'    # = {era}_1_1_1_1.png
    if not far_png.exists() or not near_png.exists():
        print(f'[skip] {era}: 샘플 없음 ({far_png.name} / {near_png.name})')
        return

    # ── 원경(far): 리사이즈 → 메디안컷 scanline 풀컬러 ──
    far = Image.open(far_png).convert('RGBA').resize((TW, TH), Image.LANCZOS)
    pal, scan = quantize_scanline(far, max_colors=220)
    print(f'  원경 변환 평균 RGB: {avg_rgb(pal, scan)}')
    write_json(OUT / f'{era}_far.json', TW, TH, pal, scan)

    # ── 근경(near): 색 전부 블랙, 불투명도(파일 알파) 유지 — 검은 실루엣 ──
    img  = Image.open(near_png).convert('RGBA').resize((TW, TH), Image.LANCZOS)
    pal2, scan2 = black_silhouette_scanline(img, abands=12)
    kept = sum(1 for v in scan2 if v)
    print(f'  근경 불투명 픽셀: {kept:,} ({100*kept/(TW*TH):.1f}%), 팔레트 {len(pal2)} (검정 alpha)')
    write_json(OUT / f'{era}_near.json', TW, TH, pal2, scan2)


if __name__ == '__main__':
    eras = sys.argv[1:] or ['1960_1']
    for era in eras:
        print(f'\n=== {era} ===')
        process(era)
