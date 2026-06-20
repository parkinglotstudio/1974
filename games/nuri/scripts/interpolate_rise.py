"""jump_loop 7프레임 → jump_rise 15프레임 크로스페이드 보간 + meta.json 갱신.
   느린 재생 시 캐릭터 내부 동작이 부드럽게 보이도록 중간 프레임 생성."""
import os, json
import numpy as np
from PIL import Image

OUT_DIR = r'C:\1974\games\nuri\pixels\characters\jump'
META    = os.path.join(OUT_DIR, 'meta.json')
SRC_KEY = 'jump_loop'
DST_KEY = 'jump_rise'
N_OUT   = 15

def main():
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)
    src_frames = meta[SRC_KEY]['frames']
    imgs = [np.asarray(Image.open(os.path.join(OUT_DIR, fr['file'])).convert('RGBA')).astype(np.float32)
            for fr in src_frames]
    n_src = len(imgs)
    print(f"src {SRC_KEY}: {n_src} frames, size {imgs[0].shape[1]}x{imgs[0].shape[0]}")

    # 기존 jump_rise 삭제
    for old in meta.get(DST_KEY, {}).get('frames', []):
        op = os.path.join(OUT_DIR, old['file'])
        if os.path.exists(op):
            os.remove(op)

    new_frames = []
    for k in range(N_OUT):
        t = k * (n_src - 1) / (N_OUT - 1)   # 0 .. n_src-1
        i = int(np.floor(t)); f = t - i
        if i >= n_src - 1:
            blended = imgs[n_src - 1]
        else:
            blended = imgs[i] * (1 - f) + imgs[i + 1] * f
        out = np.clip(blended, 0, 255).astype(np.uint8)
        name = f'{DST_KEY}_{k}.png'
        Image.fromarray(out, 'RGBA').save(os.path.join(OUT_DIR, name))
        new_frames.append({'file': name, 'duration_ms': 70,
                           'width': out.shape[1], 'height': out.shape[0]})
    meta[DST_KEY] = {'frames': new_frames}

    with open(META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"saved {N_OUT} frames -> key '{DST_KEY}'")

if __name__ == '__main__':
    main()
