"""
convert_spritesheet.py — 스프라이트시트 → Sand Engine frames[] JSON
Photoroom RGBA PNG (투명 배경) 기준

출력: projects/1974/pixels/characters/ch01_char_70s.json
  {
    width, height, palette, frames: [{pixels}...],
    stateDef: { states: { walk: {frames:[0..8], loop:true, fps:8} } }
  }
"""
import json, os
from PIL import Image

SRC   = r'C:\Users\dmaxd\Downloads\Gemini_Generated_Image_h0ixx4h0ixx4h0ix-Photoroom.png'
OUT   = r'C:\1974\projects\1974\pixels\characters\ch01_char_70s.json'

COLS        = 5
ROWS        = 2
N_FRAMES    = 9        # 마지막 슬롯 비어있음
ALPHA_THRESH = 32      # 이 값 미만 알파 = 투명 처리
N_COLORS    = 64       # 팔레트 색상 수 (+ 1 transparent)
RESERVED    = {9,10,11,12}   # Sand Engine 예약 인덱스 건너뜀
TARGET_W    = 182      # 출력 프레임 너비  (장면 pw)
TARGET_H    = 327      # 출력 프레임 높이  (장면 ph)
FPS         = 8

# ── 1. 이미지 로드 + 프레임 분리 ──────────────────────────────────────
img  = Image.open(SRC).convert('RGBA')
W, H = img.size
fw, fh = W // COLS, H // ROWS
print(f'Source: {W}×{H}, frame: {fw}×{fh}')

frames_rgba = []
for idx in range(N_FRAMES):
    row, col = divmod(idx, COLS)
    x0, y0 = col * fw, row * fh
    frame = img.crop((x0, y0, x0 + fw, y0 + fh))
    frames_rgba.append(frame)

# ── 2. 전체 프레임에 걸친 캐릭터 바운딩박스 계산 ──────────────────────
# 모든 프레임의 비투명 픽셀 범위를 합산해 공통 바운딩박스 산출
# → 프레임마다 같은 크기/원점으로 잘라야 위치가 안 튄다
bx0_all, by0_all = fw, fh
bx1_all, by1_all = 0, 0

for frame in frames_rgba:
    px = frame.load()
    for y in range(fh):
        for x in range(fw):
            if px[x, y][3] >= ALPHA_THRESH:
                bx0_all = min(bx0_all, x)
                by0_all = min(by0_all, y)
                bx1_all = max(bx1_all, x)
                by1_all = max(by1_all, y)

# 약간의 여백 추가 (8px)
PAD = 8
bx0_all = max(0, bx0_all - PAD)
by0_all = max(0, by0_all - PAD)
bx1_all = min(fw - 1, bx1_all + PAD)
by1_all = min(fh - 1, by1_all + PAD)
print(f'Character bounding box: ({bx0_all},{by0_all}) → ({bx1_all},{by1_all})')
print(f'Crop size: {bx1_all-bx0_all}×{by1_all-by0_all} → resize to {TARGET_W}×{TARGET_H}')

# ── 3. 각 프레임 크롭 + 리사이즈 ─────────────────────────────────────
frames_resized = []
for i, frame in enumerate(frames_rgba):
    cropped = frame.crop((bx0_all, by0_all, bx1_all + 1, by1_all + 1))
    resized = cropped.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    frames_resized.append(resized)
    print(f'  Frame {i}: cropped+resized OK')

# ── 4. 전체 프레임 합산 이미지로 팔레트 양자화 ───────────────────────
# 불투명 픽셀을 모아 단일 대표 이미지 생성 → 공통 팔레트 추출
combined_w = TARGET_W * N_FRAMES
combined = Image.new('RGB', (combined_w, TARGET_H), (0, 0, 0))
masks = []
for i, f in enumerate(frames_resized):
    px = f.load()
    mask = [[False]*TARGET_W for _ in range(TARGET_H)]
    patch = Image.new('RGB', (TARGET_W, TARGET_H), (255, 255, 255))
    ppx = patch.load()
    for y in range(TARGET_H):
        for x in range(TARGET_W):
            r,g,b,a = px[x,y]
            if a >= ALPHA_THRESH:
                ppx[x,y] = (r,g,b)
                mask[y][x] = True
    combined.paste(patch, (i * TARGET_W, 0))
    masks.append(mask)

# Quantize 대표 이미지
combined_q = combined.quantize(colors=N_COLORS,
                                method=Image.Quantize.MEDIANCUT,
                                dither=Image.Dither.NONE)
qt_palette_raw = combined_q.getpalette()
print(f'Quantized palette: {N_COLORS} colors')

# ── 5. 예약 인덱스 9-12 건너뛰어 팔레트 슬롯 배정 ────────────────────
slot_for_qt = {}
slot = 1
for qi in range(N_COLORS):
    while slot in RESERVED:
        slot += 1
    slot_for_qt[qi] = slot
    slot += 1

max_slot = max(slot_for_qt.values())
palette_list = ['transparent'] * (max_slot + 1)
for qi, ps in slot_for_qt.items():
    r = qt_palette_raw[qi * 3]
    g = qt_palette_raw[qi * 3 + 1]
    b = qt_palette_raw[qi * 3 + 2]
    palette_list[ps] = f'#{r:02x}{g:02x}{b:02x}'

# ── 6. 각 프레임을 팔레트 인덱스로 매핑 + pixels[] 생성 ──────────────
def rgb_to_lab(r, g, b):
    def lin(v):
        v /= 255.0
        return v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4
    lr, lg, lb = lin(r), lin(g), lin(b)
    X = (lr*0.4124 + lg*0.3576 + lb*0.1805) / 0.95047
    Y = (lr*0.2126 + lg*0.7152 + lb*0.0722) / 1.00000
    Z = (lr*0.0193 + lg*0.1192 + lb*0.9505) / 1.08883
    def f(v): return v**(1/3) if v > 0.008856 else 7.787*v + 16/116
    return (116*f(Y)-16, 500*(f(X)-f(Y)), 200*(f(Y)-f(Z)))

# 팔레트 LAB 캐시
lab_cache = {}
for ps, c in enumerate(palette_list):
    if c and c != 'transparent' and c.startswith('#'):
        h = c[1:]
        r,g,b = int(h[:2],16), int(h[2:4],16), int(h[4:6],16)
        lab_cache[ps] = rgb_to_lab(r,g,b)

def nearest_slot(r, g, b):
    lab = rgb_to_lab(r, g, b)
    best_slot, best_d = 1, float('inf')
    for ps, plab in lab_cache.items():
        d = (lab[0]-plab[0])**2 + (lab[1]-plab[1])**2 + (lab[2]-plab[2])**2
        if d < best_d:
            best_d = d
            best_slot = ps
    return best_slot

frames_data = []
for i, (frame, mask) in enumerate(zip(frames_resized, masks)):
    px = frame.load()
    pixels = []
    for y in range(TARGET_H):
        for x in range(TARGET_W):
            if not mask[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a < ALPHA_THRESH:
                continue
            s = nearest_slot(r, g, b)
            pixels.append([x, y, s])
    frames_data.append({'pixels': pixels})
    print(f'  Frame {i}: {len(pixels)} pixels')

# ── 7. stateDef 생성 (walk 8fps loop) ────────────────────────────────
state_def = {
    'sprite': 'ch01_char_70s',
    'states': {
        'walk': {
            'frames': list(range(N_FRAMES)),
            'loop': True,
            'fps': FPS,
        }
    }
}

# ── 8. JSON 저장 ──────────────────────────────────────────────────────
output = {
    'width':    TARGET_W,
    'height':   TARGET_H,
    'palette':  palette_list,
    'frames':   frames_data,
    'stateDef': state_def,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

total_px = sum(len(fd['pixels']) for fd in frames_data)
print(f'\n완료: {OUT}')
print(f'frames={N_FRAMES}, palette={len(palette_list)}색, total pixels={total_px:,}')
print(f'pw={TARGET_W}, ph={TARGET_H}, fps={FPS}')
