"""
누리 점프 GIF → 크로마키 제거 PNG 시퀀스 추출
출력: games/nuri/pixels/characters/jump/
"""
import os
from PIL import Image
import json

SRC = r'games\nuri\samples'
OUT = r'games\nuri\pixels\characters\jump'
os.makedirs(OUT, exist_ok=True)

GIFS = [
    ('점프 준비.gif',      'jump_start'),
    ('점프 엔딩 루핑.gif',  'jump_loop'),
    ('점프 엔딩 착지.gif',  'jump_land'),
    ('신규 도착 루프.gif',  'arrive_loop'),
    ('신규 착지.gif',      'new_land'),
]

def remove_chroma(img_rgba):
    data = img_rgba.load()
    w, h = img_rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            if g > r * 1.35 and g > b * 1.35 and g > 60:
                data[x, y] = (0, 0, 0, 0)
    return img_rgba

def get_union_bbox(frames_rgba):
    min_x, min_y = 99999, 99999
    max_x, max_y = 0, 0
    for img in frames_rgba:
        w, h = img.size
        data = img.load()
        for y in range(h):
            for x in range(w):
                if data[x, y][3] > 10:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
    if min_x > max_x:
        return (0, 0, 1, 1)
    pad = 16
    return (max(0, min_x - pad), max(0, min_y - pad),
            min(frames_rgba[0].width,  max_x + pad + 1),
            min(frames_rgba[0].height, max_y + pad + 1))

meta = {}

# 기존 meta.json 있으면 로드 (다른 키 보존)
meta_path = os.path.join(OUT, 'meta.json')
if os.path.exists(meta_path):
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)

for gif_name, prefix in GIFS:
    path = os.path.join(SRC, gif_name)
    if not os.path.exists(path):
        print(f'[skip] {gif_name} 없음')
        continue

    gif = Image.open(path)
    frames_rgba = []
    durations   = []
    idx = 0
    while True:
        try:
            gif.seek(idx)
        except EOFError:
            break
        frame = gif.convert('RGBA')
        frame = remove_chroma(frame)
        frames_rgba.append(frame)
        durations.append(gif.info.get('duration', 70))
        idx += 1

    bbox = get_union_bbox(frames_rgba)
    print(f'{gif_name}: {len(frames_rgba)}f  bbox={bbox}')

    # 기존 PNG 삭제 (같은 prefix)
    for f in os.listdir(OUT):
        if f.startswith(prefix + '_') and f.endswith('.png'):
            os.remove(os.path.join(OUT, f))

    saved = []
    for i, (frame, dur) in enumerate(zip(frames_rgba, durations)):
        cropped = frame.crop(bbox)
        fname   = f'{prefix}_{i}.png'
        fpath   = os.path.join(OUT, fname)
        cropped.save(fpath, 'PNG')
        saved.append({'file': fname, 'duration_ms': dur,
                      'width': cropped.width, 'height': cropped.height})
        print(f'  saved: {fname}  ({cropped.width}x{cropped.height})')

    meta[prefix] = {'frames': saved, 'bbox': list(bbox),
                    'src_size': [gif.width, gif.height]}

with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f'\nmeta saved: {meta_path}')
