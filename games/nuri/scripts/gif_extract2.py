"""GIF → PNG 프레임 추출 (초록 크로마키 제거 + 스필 억제 + bbox 크롭) + meta.json 갱신"""
import os, json
import numpy as np
from PIL import Image, ImageSequence

SAMPLES = r'C:\1974\games\nuri\samples'
OUT_DIR = r'C:\1974\games\nuri\pixels\characters\jump'
META    = os.path.join(OUT_DIR, 'meta.json')

# 추출할 GIF → meta 키
GIF_MAP = {
    'land_new':  '신규 착지.gif',        # 신규 착지 (현 착지 동작 교체용)
}

# 크로마키 임계 (greenness = g - max(r,b))
KEY_HARD = 40    # 이상이면 완전 투명
KEY_SOFT = 10    # 이하면 완전 유지, 사이는 부드럽게

def chroma_key(rgba):
    """초록 배경 → 투명. 부드러운 엣지 + 그린 스필 억제."""
    arr = np.asarray(rgba).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    maxrb = np.maximum(r, b)
    greenness = g - maxrb

    # 알파: greenness>=HARD → 0, <=SOFT → 유지, 사이 선형
    alpha = a.astype(np.float32)
    soft = np.clip((KEY_HARD - greenness) / (KEY_HARD - KEY_SOFT), 0.0, 1.0)
    alpha = alpha * soft
    alpha[greenness >= KEY_HARD] = 0

    # 그린 스필 억제: 남은 픽셀에서 g가 r,b보다 크면 깎음
    spill = g > maxrb
    g2 = np.where(spill, maxrb, g)

    out = np.stack([r, g2, b, np.round(alpha)], axis=-1).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def union_bbox(frames):
    mnx, mny, mxx, mxy = 9999, 9999, 0, 0
    for img in frames:
        bb = img.split()[3].getbbox()
        if bb:
            mnx, mny = min(mnx, bb[0]), min(mny, bb[1])
            mxx, mxy = max(mxx, bb[2]), max(mxy, bb[3])
    if mnx > mxx:
        return None
    pad = 4
    return (max(0, mnx - pad), max(0, mny - pad), mxx + pad, mxy + pad)

def main():
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)

    for key, fname in GIF_MAP.items():
        path = os.path.join(SAMPLES, fname)
        keyed, durs = [], []
        with Image.open(path) as im:
            # 반드시 반복 중에 변환·복사 (나중에 일괄 변환하면 모든 프레임이 마지막 장으로 붕괴됨)
            for frame in ImageSequence.Iterator(im):
                keyed.append(chroma_key(frame.convert('RGBA').copy()))
                durs.append(frame.info.get('duration', 70))
        print(f"{fname}: {len(keyed)} frames")

        bbox = union_bbox(keyed) or (0, 0, keyed[0].width, keyed[0].height)
        print(f"  bbox {bbox} -> {bbox[2]-bbox[0]}x{bbox[3]-bbox[1]}")

        # 기존 프레임 삭제
        for old in meta.get(key, {}).get('frames', []):
            op = os.path.join(OUT_DIR, old['file'])
            if os.path.exists(op):
                os.remove(op)

        new_frames = []
        for i, img in enumerate(keyed):
            c = img.crop(bbox)
            out_name = f'{key}_{i}.png'
            c.save(os.path.join(OUT_DIR, out_name))
            new_frames.append({'file': out_name, 'duration_ms': durs[i],
                               'width': c.width, 'height': c.height})
        meta[key] = {'frames': new_frames}
        print(f"  saved {len(new_frames)} -> key '{key}'")

    with open(META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("meta.json updated.")

if __name__ == '__main__':
    main()
