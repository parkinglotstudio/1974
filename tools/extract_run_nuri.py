"""
Nuri 캐릭터 달리기 전용 스프라이트 추출  v1.0
GIF: games/golmok/samples/1990 여성뛰는 모습.gif  (그린스크린, ~20 frames)
출력: games/nuri/pixels/characters/ch01_player_run.json

개선 vs 기존 golmok run 프레임 (149x259, GROUND_Y=256):
  - 캔버스 200x340  →  발 클립 완전 해소 (기존 대비 +30% 크기)
  - 전 프레임 단일 균일 스케일 (최대 bbox 높이 기준 → 어느 프레임도 잘림 없음)
  - X 정렬: bbox 수평 중심 → PLAYER_W/2  (프레임별 좌우 편차 없음)
  - Y 정렬: 최하단 불투명 픽셀 → GROUND_Y  (프레임별 상하 편차 없음)
  - 전 프레임 통합 메디안컷 팔레트 (200색, 프레임 간 색 흔들림 없음)
"""
import json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import gif_to_sprite as G

ROOT      = Path(__file__).resolve().parent.parent
GIF_SRC   = ROOT / 'games/golmok/samples/1990 여성뛰는 모습.gif'
OUT_DIR   = ROOT / 'games/nuri/pixels/characters'
OUT_FILE  = OUT_DIR / 'ch01_player_run.json'

PLAYER_W   = 200
PLAYER_H   = 340
BOTTOM_PAD = 4
GROUND_Y   = PLAYER_H - BOTTOM_PAD - 1   # = 335
ALPHA_T    = G.ALPHA_T   # 24
MAX_COLORS = 200
FPS        = 20
LOOP       = True


def _lowest_y(img):
    px = img.load(); W, H = img.size
    for y in range(H - 1, -1, -1):
        for x in range(W):
            if px[x, y][3] > ALPHA_T:
                return y
    return H - 1


def compute_scale(raw_frames):
    """
    모든 프레임 bbox 높이 최대값 기준 스케일 계산.
    target = PLAYER_H - BOTTOM_PAD - top_margin  →  어떤 프레임도 하단 클립 없음.
    """
    max_h = 0
    for f in raw_frames:
        bb = f.getbbox()
        if bb:
            h = bb[3] - bb[1]
            if h > max_h:
                max_h = h
    if max_h == 0:
        return 1.0
    target = PLAYER_H - BOTTOM_PAD - 6   # 상단 여백 6px
    sc = target / max_h
    print(f'  max bbox height: {max_h}px  →  scale: {sc:.4f}  (target {target}px)')
    return sc


def paste_grounded(f, sc):
    """
    스케일 후 캔버스에 배치:
      Y: 최하단 불투명 픽셀 → GROUND_Y  (수직 안정)
      X: bbox 수평 중심 → PLAYER_W/2   (수평 안정)
    """
    bb = f.getbbox()
    if not bb:
        return Image.new('RGBA', (PLAYER_W, PLAYER_H), (0, 0, 0, 0))

    cropped = f.crop(bb)
    tw = max(1, round(cropped.width * sc))
    th = max(1, round(cropped.height * sc))
    scaled = cropped.resize((tw, th), Image.NEAREST)

    ly    = _lowest_y(scaled)
    y_off = GROUND_Y - ly
    x_off = round(PLAYER_W / 2 - tw / 2)
    x_off = max(0, min(PLAYER_W - tw, x_off))

    cv = Image.new('RGBA', (PLAYER_W, PLAYER_H), (0, 0, 0, 0))
    cv.paste(scaled, (x_off, max(0, y_off)), scaled)
    return cv


def quantize_all(frames):
    """전 프레임 세로 이어붙여 1회 메디안컷 → 공통 팔레트."""
    W, H = frames[0].size
    strip = Image.new('RGBA', (W, H * len(frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (0, i * H))
    rgb = strip.convert('RGB')
    q   = rgb.quantize(colors=MAX_COLORS - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    praw = q.getpalette()
    palette = ['transparent']
    for i in range(MAX_COLORS - 1):
        palette.append(f'#{praw[i*3]:02x}{praw[i*3+1]:02x}{praw[i*3+2]:02x}')
    qdata = list(q.getdata())
    adata = [p[3] for p in strip.getdata()]
    out_frames = []
    for i in range(len(frames)):
        pixels = []
        base = i * H * W
        for j in range(H * W):
            k = base + j
            if adata[k] < ALPHA_T:
                continue
            pixels.append([j % W, j // W, qdata[k] + 1])
        out_frames.append({'pixels': pixels})
    return palette, out_frames


def main():
    print(f'GIF: {GIF_SRC}')
    im = Image.open(GIF_SRC)
    n  = getattr(im, 'n_frames', 1)
    print(f'  {n} 프레임 감지')

    raw = []
    for i in range(n):
        im.seek(i)
        f = G.clean_blobs(G.dekey(im.convert('RGBA')))
        raw.append(f)
    print(f'  {len(raw)} 프레임 디키 완료')

    sc = compute_scale(raw)

    pasted = [paste_grounded(f, sc) for f in raw]

    print('\n[배치 결과]')
    clipped = 0
    for i, cv in enumerate(pasted):
        px = cv.load()
        ys = [y for y in range(PLAYER_H) for x in range(PLAYER_W) if px[x, y][3] > ALPHA_T]
        xs = [x for y in range(PLAYER_H) for x in range(PLAYER_W) if px[x, y][3] > ALPHA_T]
        if xs and ys:
            bottom = max(ys)
            if bottom >= PLAYER_H - 1:
                clipped += 1
            print(f'  frame {i:2d}: x[{min(xs):3d},{max(xs):3d}] y[{min(ys):3d},{max(ys):3d}]  bottom={bottom}{"  ⚠클립" if bottom >= PLAYER_H-1 else ""}')
        else:
            print(f'  frame {i:2d}: (empty)')

    if clipped:
        print(f'\n[경고] {clipped}개 프레임 클립 감지 -> PLAYER_H 또는 BOTTOM_PAD 조정 필요')
    else:
        print(f'\n[OK] 클립 없음 (GROUND_Y={GROUND_Y})')

    palette, frames_out = quantize_all(pasted)
    print(f'팔레트 {len(palette)}색, {len(frames_out)} 프레임 양자화 완료')

    stateDef = {
        'sprite': 'ch01_player_run',
        'states': {
            'run': {'frames': list(range(len(frames_out))), 'loop': LOOP, 'fps': FPS}
        }
    }

    out = {
        'name': 'ch01_player_run',
        'width': PLAYER_W, 'height': PLAYER_H,
        'palette': palette,
        'frames': frames_out,
        'stateDef': stateDef,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out), encoding='utf-8')

    total_px = sum(len(f['pixels']) for f in frames_out)
    print(f'\n완료: {OUT_FILE}')
    print(f'  크기: {PLAYER_W}x{PLAYER_H}, {len(frames_out)} frames, {len(palette)} colors')
    print(f'  총 픽셀: {total_px:,}  (평균 {total_px//len(frames_out):,}/frame)')
    print(f'  GROUND_Y={GROUND_Y}, scale={sc:.4f}')
    print(f'  기존 골목길 run (149x259) 대비 {PLAYER_W/149*100:.0f}%x {PLAYER_H/259*100:.0f}%H')


if __name__ == '__main__':
    main()
