"""
ch01_player.json run 프레임 재생성 v3
- 발 스팬 기반 균일 스케일: 가장 넓은 프레임도 양발이 PLAYER_W 안에 들어오도록 자동 계산
- 최하단 픽셀 → GROUND_Y 고정(상하 튀김 방지)
- 발 중심 수평 배치(프레임 간 수평 튀김 방지)
"""
import json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import gif_to_sprite as G

ROOT      = Path(__file__).resolve().parent.parent
SAMP      = ROOT / 'games/golmok/samples'
OUT_F     = ROOT / 'games/golmok/pixels/characters/ch01_player.json'

PLAYER_W   = 149
PLAYER_H   = 259
BOTTOM_PAD = 2
GROUND_Y   = PLAYER_H - BOTTOM_PAD - 1   # 256 — 발이 항상 이 y에 닿음
ALPHA_T    = 24
FOOT_FRAC  = 0.20   # 하단 20%를 '발 영역'으로 정의
CANVAS_MARGIN = 4   # 양쪽 여백


def _foot_span(img):
    """scaled 이미지의 하단 FOOT_FRAC 픽셀 x 범위 반환 (lo, hi)."""
    px = img.load(); W, H = img.size
    y0 = int(H * (1.0 - FOOT_FRAC))
    xs = [x for y in range(y0, H) for x in range(W) if px[x, y][3] > ALPHA_T]
    if not xs:
        # fallback: 전체 픽셀 중 최하단 30%
        y0 = int(H * 0.70)
        xs = [x for y in range(y0, H) for x in range(W) if px[x, y][3] > ALPHA_T]
    return (min(xs), max(xs)) if xs else (W // 4, W * 3 // 4)


def _lowest_y(img):
    """이미지에서 불투명 픽셀의 최하단 y 반환."""
    px = img.load(); W, H = img.size
    for y in range(H - 1, -1, -1):
        for x in range(W):
            if px[x, y][3] > ALPHA_T:
                return y
    return H - 1


def compute_scale(raw_frames):
    """
    1차: CHAR_H(255) 기준 스케일 계산
    2차: 그 스케일에서 최대 발 스팬이 PLAYER_W - CANVAS_MARGIN 초과하면 축소
    """
    bbs = [f.getbbox() for f in raw_frames]
    heights = [b[3] - b[1] for b in bbs if b]
    rh = max(heights)
    sc_h = 255 / rh
    print(f'  높이 기준 스케일: {sc_h:.4f}  (max bbox_h={rh})')

    max_foot_span = 0
    for f, bb in zip(raw_frames, bbs):
        if not bb:
            continue
        c = f.crop(bb)
        tw = max(1, round(c.width * sc_h))
        th = max(1, round(c.height * sc_h))
        scaled = c.resize((tw, th), Image.NEAREST)
        lo, hi = _foot_span(scaled)
        span = hi - lo
        print(f'    frame {raw_frames.index(f)}: scaled {tw}x{th}, foot_span={span} ({lo}~{hi})')
        if span > max_foot_span:
            max_foot_span = span

    target = PLAYER_W - CANVAS_MARGIN
    if max_foot_span > target:
        sc_final = sc_h * (target / max_foot_span)
        print(f'  발 스팬 {max_foot_span}px > {target}px → 스케일 축소: {sc_h:.4f} → {sc_final:.4f}')
    else:
        sc_final = sc_h
        print(f'  발 스팬 {max_foot_span}px ≤ {target}px → 축소 불필요')

    return sc_final


def paste_grounded(f, sc):
    """
    스케일 적용 후 캔버스에 배치:
      y: 최하단 픽셀 → GROUND_Y
      x: 발 중심 → PLAYER_W / 2  (± 클램프)
    """
    bb = f.getbbox()
    if not bb:
        return Image.new('RGBA', (PLAYER_W, PLAYER_H), (0, 0, 0, 0))

    c = f.crop(bb)
    tw = max(1, round(c.width * sc))
    th = max(1, round(c.height * sc))
    scaled = c.resize((tw, th), Image.NEAREST)

    # ── Y: 최하단 픽셀을 GROUND_Y에 고정 ─────────────────────────────
    ly = _lowest_y(scaled)
    y_off = GROUND_Y - ly

    # ── X: 발 중심을 PLAYER_W / 2에 배치 ─────────────────────────────
    lo, hi = _foot_span(scaled)
    foot_cx = (lo + hi) / 2
    x_off = round(PLAYER_W / 2 - foot_cx)

    # 발 범위가 캔버스를 벗어나면 균등 클램프
    canvas_lo = lo + x_off
    canvas_hi = hi + x_off
    if canvas_lo < 0 and canvas_hi > PLAYER_W - 1:
        # 양쪽 다 넘침 → 발 중심 고정(어쩔 수 없음)
        pass
    elif canvas_lo < 0:
        x_off -= canvas_lo
    elif canvas_hi > PLAYER_W - 1:
        x_off -= canvas_hi - (PLAYER_W - 1)

    cv = Image.new('RGBA', (PLAYER_W, PLAYER_H), (0, 0, 0, 0))
    cv.paste(scaled, (x_off, max(0, y_off)), scaled)
    return cv


def nearest_palette_idx(r, g, b, pal_rgb):
    best = 0; best_d = 1e18
    for i, (pr, pg, pb) in enumerate(pal_rgb):
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_d:
            best_d = d; best = i
    return best + 1


def main():
    data = json.loads(OUT_F.read_text(encoding='utf-8'))
    palette = data['palette']
    run_frame_indices = data['stateDef']['states']['run']['frames']
    print(f'run frame indices: {run_frame_indices}')

    pal_rgb = [(int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)) for h in palette[1:]]

    gif_path = SAMP / '1990 여성뛰는 모습.gif'
    im = Image.open(gif_path)
    raw_frames = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        raw_frames.append(G.clean_blobs(G.dekey(im.convert('RGBA'))))
    print(f'gif frames: {len(raw_frames)}')

    sc = compute_scale(raw_frames)
    print(f'\n최종 스케일: {sc:.4f}')

    pasted = [paste_grounded(f, sc) for f in raw_frames]

    # ── 결과 확인 ─────────────────────────────────────────────────────
    print('\n[배치 결과]')
    for i, cv in enumerate(pasted):
        px = cv.load()
        xs = [x for y in range(PLAYER_H) for x in range(PLAYER_W) if px[x, y][3] > ALPHA_T]
        ys = [y for y in range(PLAYER_H) for x in range(PLAYER_W) if px[x, y][3] > ALPHA_T]
        if xs and ys:
            print(f'  frame {i}: x[{min(xs)},{max(xs)}] y[{min(ys)},{max(ys)}]  bottom={max(ys)}')

    # ── 팔레트 양자화 ──────────────────────────────────────────────────
    new_pixel_frames = []
    for cv in pasted:
        pxd = cv.load()
        pixels = []
        for y in range(PLAYER_H):
            for x in range(PLAYER_W):
                r, g, b, a = pxd[x, y]
                if a < ALPHA_T:
                    continue
                pixels.append([x, y, nearest_palette_idx(r, g, b, pal_rgb)])
        new_pixel_frames.append({'pixels': pixels})

    # ── JSON 덮어쓰기 (run 프레임만) ──────────────────────────────────
    for json_idx, frame_data in zip(run_frame_indices, new_pixel_frames):
        data['frames'][json_idx] = frame_data

    OUT_F.write_text(json.dumps(data), encoding='utf-8')
    print(f'\n완료: {OUT_F}')
    print(f'scale={sc:.4f}, 팔레트/idle/walk/run_stop 변경 없음.')


if __name__ == '__main__':
    main()
