#!/usr/bin/env python3
"""
golmok 캐릭터 모션 변환기 — 그린스크린 GIF 여러 개 → 단일 스프라이트 JSON (다중 상태)
(2026-06-04)

파이프라인:
  1) 각 GIF 프레임 RGBA 로드
  2) 그린스크린 제거(크로마키) + 디스필(초록 끼 제거)
  3) 모든 프레임 공통 bbox로 크롭(상태 간 캐릭터 위치 정합 → 안 튐)
  4) 목표 높이로 균일 스케일
  5) 전 프레임 통합 메디안컷 팔레트로 양자화(프레임마다 색 안 흔들리게)
  6) PixelJSON 스프라이트로 출력 + stateDef(상태=프레임범위/fps/loop)

사용:
  python tools/gif_to_sprite.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/characters'

# 변환할 모션: (gif 파일명 일부매칭, 상태명, fps, loop, 후처리)
# ※ 첫 항목(atk_start) 0프레임 = 스케일/정합 기준. 모든 클립이 같은 bbox·스케일로 정합됨.
# 후처리: 'clean'=작은 분리 blob(탄피 등) 제거 / 'white2black'=흰색 부분을 검정으로
CLIPS = [
    ('서서총준비',      'atk_start',   16, False, None),
    ('서서총쏘기',      'atk_active',  14, True,  None),    # 발동은 누르는 동안 루프
    ('내리기',          'atk_recover', 16, False, 'clean'),       # 떨어지는 탄피 제거
    ('서있는 공격 대기', 'standby',     10, False, 'white2black'), # 발밑 흰색 잔여 → 검정
]
TARGET_H   = 259        # 플레이어 스프라이트(149x259) 키와 맞춤
ALPHA_T    = 24         # 양자화 알파 임계
GREEN_DOM  = 38         # g - max(r,b) 가 이 값 이상이면 그린스크린 후보
GREEN_MIN  = 70         # 그 후보 중 g 가 이 값 이상이어야 배경으로 간주
SPRITE_OUT = 'ch01_gun'


def find_gif(token):
    for p in SAMP.glob('*.gif'):
        if token in p.name:
            return p
    return None


# ── 마커 픽셀(소켓) 앵커 ──────────────────────────────────────────
# 소스 프레임의 부착점에 고유색 점을 찍어두면, 프레임마다 그 위치를 앵커로 기록하고
# 렌더에선 제거한다. 작가는 부착점에 아래 색 점만 찍으면 됨(2~3px 권장 — 다운스케일 생존).
ANCHOR_COLORS = {
    (255, 0, 255): 'muzzle',   # 마젠타 = 총구
    (0, 255, 255): 'hand',     # 시안 = 손(보조 그립)
    (255, 255, 0): 'eject',    # 노랑 = 탄피 배출구
}
ANCHOR_TOL = 40


def extract_anchors(rgba):
    """마커색 픽셀을 찾아 {name:(cx,cy)} 반환하고, 그 픽셀은 투명 제거. (de-key 후 호출)"""
    px = rgba.load(); W, H = rgba.size
    acc = {}   # name -> [sx, sy, n]
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            for (cr, cg, cb), name in ANCHOR_COLORS.items():
                if abs(r - cr) < ANCHOR_TOL and abs(g - cg) < ANCHOR_TOL and abs(b - cb) < ANCHOR_TOL:
                    s = acc.setdefault(name, [0, 0, 0]); s[0] += x; s[1] += y; s[2] += 1
                    px[x, y] = (0, 0, 0, 0)   # 마커 제거(렌더 X)
                    break
    return {name: (s[0] / s[2], s[1] / s[2]) for name, s in acc.items()}


def white_to_black(rgba):
    """흰색ish(밝은) 픽셀을 검정으로 (그린 키잉 잔여/바닥 흰덩어리 제거용)."""
    px = rgba.load(); W, H = rgba.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > ALPHA_T and r > 188 and g > 188 and b > 188:
                px[x, y] = (14, 13, 16, a)
    return rgba


def clean_blobs(rgba, min_size=48):
    """알파>임계 픽셀의 4방향 연결요소 중 작은 것(탄피 등)을 투명 제거. 큰 캐릭터 본체는 유지."""
    import collections
    W, H = rgba.size; px = rgba.load()
    seen = bytearray(W * H)
    for sy in range(H):
        row = sy * W
        for sx in range(W):
            i0 = row + sx
            if seen[i0]:
                continue
            if px[sx, sy][3] <= ALPHA_T:
                seen[i0] = 1; continue
            comp = []; q = collections.deque([(sx, sy)]); seen[i0] = 1
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        ii = ny * W + nx
                        if not seen[ii] and px[nx, ny][3] > ALPHA_T:
                            seen[ii] = 1; q.append((nx, ny))
            if len(comp) < min_size:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    return rgba


def dekey(rgba):
    """그린스크린 제거 + 디스필. 반환: 알파 적용된 RGBA."""
    px = rgba.load()
    W, H = rgba.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            mx = max(r, b)
            if g - mx >= GREEN_DOM and g >= GREEN_MIN:
                px[x, y] = (r, g, b, 0)               # 배경 → 투명
            elif g > mx:                              # 가장자리 초록 끼 → 디스필
                px[x, y] = (r, mx, b, a)
    return rgba


def union_bbox(frames):
    box = None
    for f in frames:
        b = f.getbbox()                               # 알파>0 영역
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                     max(box[2], b[2]), max(box[3], b[3]))
    return box


def quantize_all(frames, max_colors=200):
    """전 프레임을 세로로 이어붙여 1회 메디안컷 → 공통 팔레트. idx0=transparent."""
    W = frames[0].width
    H = frames[0].height
    strip = Image.new('RGBA', (W, H * len(frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (0, i * H))
    rgb = strip.convert('RGB')
    q   = rgb.quantize(colors=max_colors - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    praw = q.getpalette()
    palette = ['transparent']
    for i in range(max_colors - 1):
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
    return palette, out_frames, W, H


def main():
    # 1~2) 로드 + 키 제거 + 마커 앵커 추출(원본 좌표)
    clip_frames  = []   # [(state, fps, loop, [RGBA frames], fx)]
    clip_anchors = []   # [[{name:(cx,cy)} per frame]]  — 원본(de-key) 좌표
    n_anchor = 0
    for token, state, fps, loop, fx in CLIPS:
        gif = find_gif(token)
        if not gif:
            print(f'  ! gif not found for "{token}"'); continue
        im = Image.open(gif)
        fr = []; fa = []
        for i in range(getattr(im, 'n_frames', 1)):
            im.seek(i)
            f = dekey(im.convert('RGBA'))
            a = extract_anchors(f)           # 마커 픽셀 → 앵커 + 제거
            n_anchor += len(a)
            fr.append(f); fa.append(a)
        clip_frames.append((state, fps, loop, fr, fx))
        clip_anchors.append(fa)
        print(f'  {gif.name} → {state}: {len(fr)} frames')
    if n_anchor:
        print(f'  마커 앵커 {n_anchor}개 추출됨')

    # 3) 공통 bbox 크롭
    all_fr = [f for _, _, _, fr, _ in clip_frames for f in fr]
    box = union_bbox(all_fr)
    print(f'  union bbox = {box}')
    cropped = [[f.crop(box) for f in fr] for _, _, _, fr, _ in clip_frames]

    # 4) 균일 스케일 — 기준은 합집합 bbox가 아니라 "서있는 캐릭터(준비 0프레임) 머리~발 높이".
    #    (합집합엔 탄피·머즐 등 캐릭터보다 위로 튄 효과가 섞여 캐릭터가 작아짐 → 플레이어와 키 안 맞음)
    cw, ch = box[2] - box[0], box[3] - box[1]
    ref_box = clip_frames[0][3][0].getbbox()                 # atk_start 첫 프레임(서있음)
    ref_h   = (ref_box[3] - ref_box[1]) if ref_box else ch
    scale   = TARGET_H / ref_h                               # 서있는 키 → TARGET_H(=플레이어 259)
    tw, th  = max(1, round(cw * scale)), max(1, round(ch * scale))
    scaled = [[f.resize((tw, th), Image.NEAREST) for f in fr] for fr in cropped]

    # 4.5) 클립별 후처리 (스케일 후 작은 프레임에서 — 탄피 제거 / 흰색→검정)
    for i, (state, fps, loop, _, fx) in enumerate(clip_frames):
        if fx == 'clean':
            scaled[i] = [clean_blobs(f) for f in scaled[i]]
            print(f'  · {state}: 작은 blob(탄피) 제거')
        elif fx == 'white2black':
            scaled[i] = [white_to_black(f) for f in scaled[i]]
            print(f'  · {state}: 흰색 → 검정')

    # 5) 통합 양자화
    flat = [f for fr in scaled for f in fr]
    palette, frames, W, H = quantize_all(flat)

    # 5.5) 마커 앵커 좌표 변환(원본 → 크롭·스케일된 최종 좌표) 후 프레임에 부착
    flat_anchors = [a for fa in clip_anchors for a in fa]
    for i, fr_out in enumerate(frames):
        a = flat_anchors[i] if i < len(flat_anchors) else None
        if a:
            fr_out['anchors'] = {name: [max(0, round((cx - box[0]) * scale)), max(0, round((cy - box[1]) * scale))]
                                 for name, (cx, cy) in a.items()}

    # 6) stateDef 구성 (프레임 순서대로 범위 배정)
    states = {}
    idx = 0
    for (state, fps, loop, _, _), fr in zip(clip_frames, scaled):
        n = len(fr)
        states[state] = {'frames': list(range(idx, idx + n)), 'loop': loop, 'fps': fps}
        idx += n

    out = {
        'name': SPRITE_OUT, 'width': W, 'height': H,
        'palette': palette, 'frames': frames,
        'stateDef': {'sprite': SPRITE_OUT, 'states': states},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f'{SPRITE_OUT}.json'
    dest.write_text(json.dumps(out), encoding='utf-8')
    print(f'  → {dest}  ({W}x{H}, {len(frames)} frames, pal {len(palette)})')
    print(f'  states: ' + ', '.join(f'{k}[{v["frames"][0]}..{v["frames"][-1]}]' for k, v in states.items()))


if __name__ == '__main__':
    main()
