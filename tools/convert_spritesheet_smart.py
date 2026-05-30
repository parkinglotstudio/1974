import json
import os
import cv2
import numpy as np
from PIL import Image

SRC = r'C:\Users\dmaxd\Downloads\Gemini_Generated_Image_h0ixx4h0ixx4h0ix-Photoroom.png'
OUT = r'C:\1974\projects\1974\pixels\characters\ch01_char_70s.json'

COLS = 5
ROWS = 2
N_FRAMES = 9
ALPHA_THRESH = 32
N_COLORS = 64
RESERVED = {9, 10, 11, 12}
TARGET_W = 182
TARGET_H = 327
FPS = 8

def get_character_body(crop_img):
    """
    크롭된 프레임 이미지에서 이웃 칸의 잔여물 픽셀을 제거하고,
    중앙 부근에 위치한 가장 유효한 캐릭터 본체만 connected component로 추출한다.
    """
    h, w, c = crop_img.shape
    if c < 4:
        # 알파 채널이 없으면 알파 채널을 불투명하게 추가
        crop_img = cv2.cvtColor(crop_img, cv2.COLOR_BGR2BGRA)
        crop_img[:, :, 3] = 255

    alpha = crop_img[:, :, 3]
    # 알파 임계값을 줘서 마스크 생성
    _, binary_mask = cv2.threshold(alpha, ALPHA_THRESH, 255, cv2.THRESH_BINARY)

    # 8-연결 레이블링
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)

    if num_labels <= 1:
        return np.zeros_like(crop_img)

    # 중앙에 가깝고 면적이 유의미한 컴포넌트 찾기
    # 중앙 점: (w/2, h/2)
    cx, cy = w / 2, h / 2
    best_label = -1
    max_score = -1

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        # 너무 작은 먼지 픽셀(100픽셀 미만)은 캐릭터 본체가 아님
        if area < 100:
            continue

        lx = stats[i, cv2.CC_STAT_LEFT]
        ly = stats[i, cv2.CC_STAT_TOP]
        lw = stats[i, cv2.CC_STAT_WIDTH]
        lh = stats[i, cv2.CC_STAT_HEIGHT]

        # 컴포넌트의 중심
        comp_cx = lx + lw / 2
        comp_cy = ly + lh / 2

        # 스코어 계산: 면적이 크고 가로축 중앙에 가까울수록 가산점
        dist_x = abs(comp_cx - cx)
        # 가로 중심에서 너무 멀면 페널티
        score = area / (1.0 + dist_x * 2.0)

        if score > max_score:
            max_score = score
            best_label = i

    if best_label == -1:
        # 만약 조건에 맞는 게 없다면 면적이 제일 큰 것 선택
        best_label = 1
        max_area = 0
        for i in range(1, num_labels):
            if stats[i, cv2.CC_STAT_AREA] > max_area:
                max_area = stats[i, cv2.CC_STAT_AREA]
                best_label = i

    # 마스크 이외 영역 투명화
    cleaned_img = crop_img.copy()
    cleaned_img[labels != best_label] = (0, 0, 0, 0)

    # 타이트 바운딩 박스
    lx = stats[best_label, cv2.CC_STAT_LEFT]
    ly = stats[best_label, cv2.CC_STAT_TOP]
    lw = stats[best_label, cv2.CC_STAT_WIDTH]
    lh = stats[best_label, cv2.CC_STAT_HEIGHT]

    # 여백 없이 캐릭터 컴포넌트 자체만 정교하게 슬라이싱
    # 투명 픽셀을 제외한 정밀 bbox 계산
    nonzero = cv2.findNonZero(cleaned_img[:, :, 3])
    if nonzero is not None:
        rx, ry, rw, rh = cv2.boundingRect(nonzero)
        body = cleaned_img[ry:ry+rh, rx:rx+rw]
        return body

    return cleaned_img[ly:ly+lh, lx:lx+lw]

def main():
    # cv2로 이미지 로드
    src_img = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
    if src_img is None:
        print(f"Source file not found at {SRC}")
        return

    H, W = src_img.shape[:2]
    fw, fh = W // COLS, H // ROWS
    print(f"Source size: {W}x{H}, Grid Cell size: {fw}x{fh}")

    # 1. 각 프레임에서 이웃 침범을 제거한 캐릭터 본체만 크롭
    bodies = []
    for idx in range(N_FRAMES):
        row, col = divmod(idx, COLS)
        x0, y0 = col * fw, row * fh
        crop_img = src_img[y0:y0+fh, x0:x0+fw]
        body = get_character_body(crop_img)
        bodies.append(body)
        print(f"Frame {idx} extracted body size: {body.shape[1]}x{body.shape[0]}")

    # 2. 모든 프레임의 본체 높이 중 최댓값을 찾아서 스케일 비율 통일
    max_h_all = max(body.shape[0] for body in bodies)
    # 아래/위로 각각 16px 정도 여백을 두고 리사이즈
    margin_y = 20
    scale = (TARGET_H - margin_y * 2) / max_h_all
    print(f"Global max height: {max_h_all}px, Scale factor: {scale:.4f}")

    # 3. 각 프레임 리사이즈 및 TARGET 캔버스에 중앙 정렬하여 배치
    final_frames_pil = []
    for idx, body in enumerate(bodies):
        bh, bw = body.shape[:2]
        new_w = max(1, int(bw * scale))
        new_h = max(1, int(bh * scale))

        # OpenCV -> PIL 변환 후 리사이즈 (LANCZOS 품질 확보)
        body_rgba = cv2.cvtColor(body, cv2.COLOR_BGRA2RGBA)
        body_pil = Image.fromarray(body_rgba)
        body_resized = body_pil.resize((new_w, new_h), Image.LANCZOS)

        # 타깃 캔버스 생성 (투명)
        canvas = Image.new('RGBA', (TARGET_W, TARGET_H), (0, 0, 0, 0))

        # 가로 중앙 정렬 / 발바닥 밑바닥 정렬 (밑바닥 마진 margin_y 적용)
        pos_x = (TARGET_W - new_w) // 2
        pos_y = TARGET_H - new_h - margin_y

        canvas.paste(body_resized, (pos_x, pos_y), body_resized)
        final_frames_pil.append(canvas)
        print(f"Frame {idx} placed at: x={pos_x}, y={pos_y} (size: {new_w}x{new_h})")

    # 4. 공통 팔레트 양자화
    # 9개 프레임의 불투명 영역만 합산하여 팔레트 대표 이미지 생성
    combined_w = TARGET_W * N_FRAMES
    combined = Image.new('RGB', (combined_w, TARGET_H), (0, 0, 0))
    masks = []

    for i, canvas in enumerate(final_frames_pil):
        px = canvas.load()
        mask = [[False]*TARGET_W for _ in range(TARGET_H)]
        patch = Image.new('RGB', (TARGET_W, TARGET_H), (255, 255, 255))
        ppx = patch.load()
        for y in range(TARGET_H):
            for x in range(TARGET_W):
                r, g, b, a = px[x, y]
                if a >= ALPHA_THRESH:
                    ppx[x, y] = (r, g, b)
                    mask[y][x] = True
        combined.paste(patch, (i * TARGET_W, 0))
        masks.append(mask)

    combined_q = combined.quantize(colors=N_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    qt_palette_raw = combined_q.getpalette()

    # 5. Sand Engine 예약 인덱스(9-12) 보호 처리
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

    # 6. CIE-LAB 색상 공간 맵핑 캐시 생성
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

    lab_cache = {}
    for ps, c in enumerate(palette_list):
        if c and c != 'transparent' and c.startswith('#'):
            h = c[1:]
            r, g, b = int(h[:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            lab_cache[ps] = rgb_to_lab(r, g, b)

    def nearest_slot(r, g, b):
        lab = rgb_to_lab(r, g, b)
        best_slot, best_d = 1, float('inf')
        for ps, plab in lab_cache.items():
            d = (lab[0]-plab[0])**2 + (lab[1]-plab[1])**2 + (lab[2]-plab[2])**2
            if d < best_d:
                best_d = d
                best_slot = ps
        return best_slot

    # 7. 프레임별 픽셀 인덱스 데이터 구성
    frames_data = []
    for i, (canvas, mask) in enumerate(zip(final_frames_pil, masks)):
        px = canvas.load()
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
        print(f"Frame {i}: packed {len(pixels)} pixels")

    # 8. stateDef 정의
    state_def = {
        'sprite': 'ch01_char_70s',
        'states': {
            'idle': {
                'frames': [0],
                'loop': True,
                'fps': 2,
            },
            'walk': {
                'frames': list(range(N_FRAMES)),
                'loop': True,
                'fps': FPS,
            }
        }
    }

    # 9. 최종 JSON 저장
    output = {
        'width': TARGET_W,
        'height': TARGET_H,
        'palette': palette_list,
        'frames': frames_data,
        'stateDef': state_def,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    total_px = sum(len(fd['pixels']) for fd in frames_data)
    print(f"\n[성공] 스마트 정렬 스프라이트시트 변환 완료 -> {OUT}")
    print(f"프레임 수: {N_FRAMES}, 팔레트: {len(palette_list)}색, 총 픽셀 수: {total_px:,}")

if __name__ == '__main__':
    main()
