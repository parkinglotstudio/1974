"""
마법 스킬(G) 캐스팅 포즈 GIF -> ch01_gun.json 포맷 pixelJSON 변환.
입력: games/golmok/samples/마법 일반 스킬_준비.gif (18f), 마법 일반 스킬_캐스팅.gif (3f)
출력: games/golmok/pixels/characters/ch01_magic.json (170x255, stateDef: cast_start/cast_loop/cast_end)
"""
from PIL import Image
import numpy as np
import json

SAMPLES = r"C:\1974\games\golmok\samples"
OUT = r"C:\1974\games\golmok\pixels\characters\ch01_magic.json"

BG = np.array([9, 125, 39])
CROP = (300, 0, 780, 720)   # x0,y0,x1,y1 - 캐릭터 + 마법 구슬 코어 영역
OUT_W, OUT_H = 183, 274   # 캐릭터(원본 y32~703, 671px)가 캔버스의 ~255px를 채우도록 스케일 (플레이어/총과 동일 크기)
ALPHA_LOW, ALPHA_HIGH = 15, 60  # diff 임계값 (그린스크린 제거, AA 페더링)


def despill(rgb):
    # 그린스크린 합성 잔여 녹색기 제거: G가 R,B 최댓값보다 큰 만큼 깎아낸다.
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    maxrb = np.maximum(r, b)
    spill = np.clip(g - maxrb, 0, None)
    g2 = g - spill
    return np.stack([r, g2, b], axis=-1)


def load_rgba(im, idx):
    im.seek(idx)
    rgb = np.array(im.convert('RGB')).astype(int)
    diff = np.abs(rgb - BG).sum(axis=2)
    alpha = np.clip((diff - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW), 0, 1) * 255
    rgb = despill(rgb)
    rgba = np.dstack([rgb, alpha]).astype('uint8')
    img = Image.fromarray(rgba, 'RGBA')
    img = img.crop(CROP).resize((OUT_W, OUT_H), Image.LANCZOS)
    return np.array(img)


def rgb_to_hex(c):
    return '#%02x%02x%02x' % (int(c[0]), int(c[1]), int(c[2]))


prep = Image.open(f"{SAMPLES}\\마법 일반 스킬_준비.gif")
cast = Image.open(f"{SAMPLES}\\마법 일반 스킬_캐스팅.gif")

prep_idx = [0, 2, 4, 6, 8, 10, 12, 14, 17]   # 9 frames -> cast_start
cast_idx = [0, 1, 2]                          # 3 frames -> cast_loop

frames_rgba = [load_rgba(prep, i) for i in prep_idx] + [load_rgba(cast, i) for i in cast_idx]
N = len(frames_rgba)  # 12

# ── 팔레트 양자화 (전체 프레임 합쳐서 199색 + transparent) ──
combined = Image.new('RGB', (OUT_W * N, OUT_H))
for i, arr in enumerate(frames_rgba):
    combined.paste(Image.fromarray(arr[:, :, :3], 'RGB'), (i * OUT_W, 0))
quant = combined.quantize(colors=199, method=Image.MEDIANCUT)
pal_flat = quant.getpalette()[:199 * 3]
palette = ['transparent'] + [rgb_to_hex(pal_flat[i*3:i*3+3]) for i in range(199)]

frames_out = []
for arr in frames_rgba:
    img = Image.fromarray(arr[:, :, :3], 'RGB')
    qarr = np.array(img.quantize(palette=quant))
    pixels = []
    for y in range(OUT_H):
        for x in range(OUT_W):
            if arr[y, x, 3] < 128:
                continue
            pixels.append([x, y, int(qarr[y, x]) + 1])
    frames_out.append({'pixels': pixels})

state_def = {
    'sprite': 'ch01_magic',
    'states': {
        'cast_start': {'frames': [0, 1, 2, 3, 4, 5, 6, 7, 8], 'loop': False, 'fps': 14},
        'cast_loop':  {'frames': [9, 10, 11], 'loop': True, 'fps': 12},
        'cast_end':   {'frames': [6, 4, 2, 0], 'loop': False, 'fps': 12},
    },
}

out = {
    'name': 'ch01_magic',
    'width': OUT_W,
    'height': OUT_H,
    'palette': palette,
    'frames': frames_out,
    'stateDef': state_def,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f)

print('wrote', OUT)
print('frame pixel counts', [len(fr['pixels']) for fr in frames_out])
