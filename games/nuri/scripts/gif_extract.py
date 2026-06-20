"""GIF → PNG 프레임 추출 + meta.json 업데이트 (투명도 기반 bbox 크롭)"""
import os, sys, json
from PIL import Image, ImageSequence

SAMPLES = r'C:\1974\games\nuri\samples'
OUT_DIR = r'C:\1974\games\nuri\pixels\characters\jump'
META    = os.path.join(OUT_DIR, 'meta.json')

GIF_MAP = {
    'jump_loop': '신규 도착 루프.gif',
    'jump_land': '신규 착지.gif',
}

def calc_union_bbox(frames_rgba):
    """모든 프레임 RGBA를 합산해 전체 비투명 영역의 union bbox 계산"""
    min_x, min_y = 9999, 9999
    max_x, max_y = 0, 0
    for img in frames_rgba:
        alpha = img.split()[3]
        bbox = alpha.getbbox()  # (left, upper, right, lower) or None
        if bbox:
            min_x = min(min_x, bbox[0])
            min_y = min(min_y, bbox[1])
            max_x = max(max_x, bbox[2])
            max_y = max(max_y, bbox[3])
    if min_x > max_x:
        return None
    # 약간 패딩
    pad = 4
    return (max(0, min_x - pad), max(0, min_y - pad), max_x + pad, max_y + pad)

def extract():
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)

    for key, fname in GIF_MAP.items():
        path = os.path.join(SAMPLES, fname)
        with Image.open(path) as im:
            frames_raw = list(ImageSequence.Iterator(im))
            frames_rgba = [f.convert('RGBA') for f in frames_raw]
            print(f"Processing {fname}: {im.size}, {len(frames_rgba)} frames")

        bbox = calc_union_bbox(frames_rgba)
        if not bbox:
            print(f"  WARNING: no opaque pixels found, using full size")
            bbox = (0, 0, frames_rgba[0].width, frames_rgba[0].height)
        print(f"  Crop bbox: {bbox} → size {bbox[2]-bbox[0]}x{bbox[3]-bbox[1]}")

        # 기존 PNG 삭제
        for old in meta.get(key, {}).get('frames', []):
            old_path = os.path.join(OUT_DIR, old['file'])
            if os.path.exists(old_path):
                os.remove(old_path)
                print(f"  Removed {old['file']}")

        # 새 프레임 저장
        new_frames = []
        for i, rgba in enumerate(frames_rgba):
            cropped = rgba.crop(bbox)
            out_name = f'{key}_{i}.png'
            out_path = os.path.join(OUT_DIR, out_name)
            cropped.save(out_path)
            dur = frames_raw[i].info.get('duration', 70)
            new_frames.append({
                'file': out_name,
                'duration_ms': dur,
                'width': cropped.width,
                'height': cropped.height,
            })
            print(f"  Saved {out_name} ({cropped.width}x{cropped.height}, {dur}ms)")

        meta[key] = {'frames': new_frames}

    with open(META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("\nmeta.json updated.")

if __name__ == '__main__':
    extract()
