"""
ch01_player.json 의 run 상태(frames 107-118) 재생성.
뒷발 잘림 현상 수정: 기존 torso-center 정렬 대신 발 우선 오프셋으로 재중심.
소스: games/golmok/samples/1990 여성뛰는 모습.gif
기존 팔레트 재사용(idle/walk/run_stop 프레임 변경 없음).
"""
import json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import gif_to_sprite as G

ROOT    = Path(__file__).resolve().parent.parent
SAMP    = ROOT / 'games/golmok/samples'
OUT_F   = ROOT / 'games/golmok/pixels/characters/ch01_player.json'

PLAYER_W   = 149
PLAYER_H   = 259
CHAR_H     = 255
BOTTOM_PAD = 2
ALPHA_T    = 24


def _feet_cx(img):
    px = img.load(); W, H = img.size
    y0 = max(0, int(H * 0.88)); sx = n = 0
    for y in range(y0, H):
        for x in range(W):
            if px[x, y][3] > ALPHA_T:
                sx += x; n += 1
    return (sx / n) if n else W / 2.0


def _torso_cx(img):
    px = img.load(); W, H = img.size
    y_end = int(H * 0.70); sx = n = 0
    for y in range(0, y_end):
        for x in range(W):
            if px[x, y][3] > ALPHA_T:
                sx += x; n += 1
    return (sx / n) if n else W / 2.0


def paste_foot_priority(scaled_img):
    """발(하단 12%) 우선 중심 — 뒷발이 캔버스 내 유지되도록 오프셋 조정."""
    W, H = scaled_img.size
    bb = scaled_img.getbbox()
    if not bb:
        cv = Image.new('RGBA', (PLAYER_W, PLAYER_H), (0,0,0,0))
        return cv

    # 1) 몸통 기반 초기 오프셋
    tc = _torso_cx(scaled_img)
    x = round(PLAYER_W / 2 - tc)

    # 2) 발 픽셀의 캔버스 내 범위 확인
    px = scaled_img.load()
    y_foot_top = max(0, int(H * 0.88))
    foot_xs = [cx for cy in range(y_foot_top, H) for cx in range(W) if px[cx, cy][3] > ALPHA_T]

    if foot_xs:
        foot_min = min(foot_xs) + x   # 캔버스 공간의 뒷발 최소 x
        foot_max = max(foot_xs) + x   # 캔버스 공간의 앞발 최대 x
        # 3) 발이 캔버스 밖이면 클램프
        if foot_min < 0:
            x -= foot_min              # 오른쪽으로 밀어서 뒷발 표시
        if foot_max > PLAYER_W - 1:
            x -= (foot_max - (PLAYER_W - 1))   # 왼쪽으로 밀어서 앞발 표시

    # 4) 전체 bbox도 가능한 한 캔버스 내 유지(클램프)
    px_min_all = bb[0] + x
    px_max_all = bb[2] - 1 + x
    if px_min_all < 0:
        x -= px_min_all
    if px_max_all > PLAYER_W - 1:
        x -= (px_max_all - (PLAYER_W - 1))

    y = PLAYER_H - H - BOTTOM_PAD
    cv = Image.new('RGBA', (PLAYER_W, PLAYER_H), (0,0,0,0))
    cv.paste(scaled_img, (x, max(0, y)), scaled_img)
    return cv


def nearest_palette_idx(r, g, b, pal_rgb):
    """기존 팔레트(RGB 튜플 배열)에서 가장 가까운 색 인덱스 반환 (idx+1 = JSON 팔레트 기준)."""
    best = 0; best_d = 1e18
    for i, (pr, pg, pb) in enumerate(pal_rgb):
        d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
        if d < best_d:
            best_d = d; best = i
    return best + 1   # idx0=transparent


def main():
    # ── 기존 JSON 로드 ──────────────────────────────────────────────
    data = json.loads(OUT_F.read_text(encoding='utf-8'))
    palette = data['palette']   # palette[0]='transparent', palette[1..] = '#rrggbb'
    run_state = data['stateDef']['states']['run']
    run_frame_indices = run_state['frames']    # [107..118]
    print(f'run frames: {run_frame_indices}')

    # 팔레트를 RGB 튜플로 변환 (idx0 skip)
    pal_rgb = []
    for h in palette[1:]:
        pal_rgb.append((int(h[1:3],16), int(h[3:5],16), int(h[5:7],16)))

    # ── GIF 로드 + 디키 + 클린 ──────────────────────────────────────
    gif_path = SAMP / '1990 여성뛰는 모습.gif'
    im = Image.open(gif_path)
    raw_frames = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        raw_frames.append(G.clean_blobs(G.dekey(im.convert('RGBA'))))
    print(f'gif frames: {len(raw_frames)}')

    # ── 높이 정규화 (CHAR_H 기준 균일 스케일) ──────────────────────
    bbs = [f.getbbox() for f in raw_frames]
    heights = [b[3]-b[1] for b in bbs if b]
    rh = max(heights)
    sc = CHAR_H / rh
    print(f'scale={sc:.4f} (rh={rh})')

    scaled = []
    for f, b in zip(raw_frames, bbs):
        if not b:
            scaled.append(Image.new('RGBA', (1, CHAR_H), (0,0,0,0))); continue
        c = f.crop(b)
        tw = max(1, round(c.width * sc))
        th = max(1, round(c.height * sc))
        scaled.append(c.resize((tw, th), Image.NEAREST))
        print(f'  scaled frame: {tw}x{th}')

    # ── 발 우선 정렬 → 149x259 캔버스 ─────────────────────────────
    pasted = [paste_foot_priority(f) for f in scaled]

    # ── 기존 팔레트로 양자화 (최근접 색 매핑) ──────────────────────
    new_pixel_frames = []
    for cv in pasted:
        px = cv.load(); W, H = cv.size
        pixels = []
        for y in range(H):
            for x in range(W):
                r, g, b, a = px[x, y]
                if a < ALPHA_T:
                    continue
                idx = nearest_palette_idx(r, g, b, pal_rgb)
                pixels.append([x, y, idx])
        new_pixel_frames.append({'pixels': pixels})

    # bbox 확인
    for i, pf in enumerate(new_pixel_frames):
        xs = [p[0] for p in pf['pixels']]; ys = [p[1] for p in pf['pixels']]
        print(f'  run frame {i}: bbox x[{min(xs)},{max(xs)}] y[{min(ys)},{max(ys)}] n={len(pf["pixels"])}')

    # ── JSON에 덮어쓰기 (run 프레임만) ──────────────────────────────
    for json_idx, frame_data in zip(run_frame_indices, new_pixel_frames):
        data['frames'][json_idx] = frame_data

    OUT_F.write_text(json.dumps(data), encoding='utf-8')
    print(f'\n완료: {OUT_F}')
    print('run 프레임만 교체, 팔레트/idle/walk/run_stop 변경 없음.')


if __name__ == '__main__':
    main()
