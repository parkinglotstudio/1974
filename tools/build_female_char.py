#!/usr/bin/env python3
"""
golmok 여성 캐릭터(1990) 빌드 — 남자 캐릭터 대체용.
(2026-06-06)

- 총 스프라이트(ch01_gun): 준비/발사루프/넣기 → atk_start/atk_active/atk_recover
    · 동일 해상도(1280x720) → union-bbox + 균일 스케일(준비 기준) → 상태 간 정합.
- 플레이어 스프라이트(ch01_player): 여성 서있기 → idle, 남자 WALK.gif → walk(임시).
    · 해상도가 달라서(여성 720p / 남자 270p) 클립별 정규화 후 149x259 고정 캔버스에 발밑 정렬.
    · 149x259 = 기존 남자 플레이어와 동일 → 다운스트림(발 위치·바운드) 변경 없음.

gif_to_sprite.py 의 검증된 함수(dekey/union_bbox/quantize_all/clean_blobs) 재사용.
사용: python tools/build_female_char.py
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import gif_to_sprite as G   # dekey, union_bbox, quantize_all, clean_blobs

SAMP = ROOT / 'games/golmok/samples'
OUT  = ROOT / 'games/golmok/pixels/characters'
CHAR_H = 255            # 서있는 캐릭터 목표 높이(플레이어/총 공통 → 화면상 같은 키)
PLAYER_W, PLAYER_H = 149, 259   # 남자 플레이어와 동일 캔버스
PLAYER_BOTTOM_PAD = 2


def find(token):
    for p in sorted(SAMP.glob('*.gif')):
        if token in p.name:
            return p
    raise SystemExit('gif 없음: ' + token)


def load_clip(path):
    im = Image.open(path)
    out = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        out.append(G.dekey(im.convert('RGBA')))
    return out


# ── 총: union-bbox + 균일 스케일(준비[0] 기준) ──────────────────────────
def build_gun():
    CLIPS = [
        ('1990여성_ 총사격 준비', 'atk_start',   14, False, None),
        ('1990여성_ 총사격 발사', 'atk_active',  12, True,  None),     # 발사: 플래시 보존 위해 clean 안 함
        ('1990여성_ 총사격 넣기', 'atk_recover', 12, False, 'clean'),  # 넣기: 떨어지는 탄피 제거
    ]
    clips = [(st, fps, lp, load_clip(find(tok)), fx) for tok, st, fps, lp, fx in CLIPS]
    all_fr = [f for _, _, _, fr, _ in clips for f in fr]
    box = G.union_bbox(all_fr)
    cw, ch = box[2] - box[0], box[3] - box[1]
    ref = clips[0][3][0].getbbox()                  # 준비 0프레임(서있음) = 스케일 기준
    ref_h = (ref[3] - ref[1]) if ref else ch
    scale = CHAR_H / ref_h
    tw, th = max(1, round(cw * scale)), max(1, round(ch * scale))
    scaled = [[f.crop(box).resize((tw, th), Image.NEAREST) for f in fr] for _, _, _, fr, _ in clips]
    for i, (_, _, _, _, fx) in enumerate(clips):
        if fx == 'clean':
            scaled[i] = [G.clean_blobs(f) for f in scaled[i]]
    flat = [f for fr in scaled for f in fr]
    palette, frames, W, H = G.quantize_all(flat)
    states, idx = {}, 0
    for (st, fps, lp, _, _), fr in zip(clips, scaled):
        n = len(fr); states[st] = {'frames': list(range(idx, idx + n)), 'loop': lp, 'fps': fps}; idx += n
    out = {'name': 'ch01_gun', 'width': W, 'height': H, 'palette': palette, 'frames': frames,
           'stateDef': {'sprite': 'ch01_gun', 'states': states}}
    (OUT / 'ch01_gun.json').write_text(json.dumps(out), encoding='utf-8')
    print('  GUN    %dx%d %d프레임 %s' % (W, H, len(frames), {k: len(v['frames']) for k, v in states.items()}))


# ── 플레이어: 클립별 정규화 → 149x259 고정 캔버스 발밑 정렬 ──────────────
def _feet_cx(img):
    """이미지 하단 12% 불투명 픽셀의 중심 x (발 중심) — 정렬 기준(걸음 미끄러짐 방지)."""
    px = img.load(); W, H = img.size
    y0 = max(0, int(H * 0.88)); sx = n = 0
    for y in range(y0, H):
        for x in range(W):
            if px[x, y][3] > 24:
                sx += x; n += 1
    return (sx / n) if n else W / 2.0


def normalize_to_char_h(frames, per_frame=False):
    """'가장 곧게 선(최대 높이) 프레임'을 CHAR_H로 스케일 → idle·walk 키 일치.
    per_frame=False: union-bbox 크롭 (제자리 클립=idle).
    per_frame=True : 프레임별 자기 bbox 크롭 (가로 이동 클립=walk → 제자리걸음화. 발 중심 정렬은 paste에서)."""
    bbs = [f.getbbox() for f in frames]
    heights = [b[3] - b[1] for b in bbs if b]
    rh = max(heights) if heights else 1
    sc = CHAR_H / rh
    if per_frame:
        maxw = max(((b[2] - b[0]) for b in bbs if b), default=1)
        if maxw * sc > (PLAYER_W - 6):              # 개별 프레임 최대폭 기준 캡(이동거리 무관)
            sc = (PLAYER_W - 6) / maxw
        out = []
        for f, b in zip(frames, bbs):
            if not b:
                out.append(Image.new('RGBA', (1, 1), (0, 0, 0, 0))); continue
            c = f.crop(b)
            out.append(c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.NEAREST))
        return out
    box = G.union_bbox(frames)
    cw, ch = box[2] - box[0], box[3] - box[1]
    if cw * sc > (PLAYER_W - 6):
        sc = (PLAYER_W - 6) / cw
    tw, th = max(1, round(cw * sc)), max(1, round(ch * sc))
    return [f.crop(box).resize((tw, th), Image.NEAREST) for f in frames]


def build_player():
    idle_fr = normalize_to_char_h(load_clip(find('서 있는 idel2')))
    # 뒤에 3프레임(49, 50, 51) 삭제
    idle_fr = idle_fr[:-3]
    # 핑퐁(Ping-pong) 보간 적용
    idle_fr = idle_fr + idle_fr[-2:0:-1]

    clips = [
        ('idle', 6,  True, idle_fr),  # 1990 여성 서 있는 idel2.gif
        ('walk', 12, True, normalize_to_char_h([G.clean_blobs(f) for f in load_clip(find('여성걷는'))], per_frame=True)),   # 1990 여성걷는 모습.gif (clean=스트레이 픽셀 제거→폭 이상치 방지)
    ]
    pasted, states, idx = [], {}, 0
    for name, fps, lp, fr in clips:
        rng = []
        for f in fr:
            cv = Image.new('RGBA', (PLAYER_W, PLAYER_H), (0, 0, 0, 0))
            x = round(PLAYER_W / 2 - _feet_cx(f))          # 발 중심을 캔버스 중앙에 (걸음 미끄러짐 방지)
            y = PLAYER_H - f.height - PLAYER_BOTTOM_PAD     # 발밑 하단 정렬
            cv.paste(f, (x, max(0, y)), f)
            pasted.append(cv); rng.append(idx); idx += 1
        states[name] = {'frames': rng, 'loop': lp, 'fps': fps}
    palette, frames, W, H = G.quantize_all(pasted)
    out = {'name': 'ch01_player', 'width': W, 'height': H, 'palette': palette, 'frames': frames,
           'stateDef': {'sprite': 'ch01_player', 'states': states}}
    (OUT / 'ch01_player.json').write_text(json.dumps(out), encoding='utf-8')
    print('  PLAYER %dx%d %d프레임 %s' % (W, H, len(frames), {k: len(v['frames']) for k, v in states.items()}))


if __name__ == '__main__':
    print('여성 캐릭터 빌드:')
    build_gun()
    build_player()
    print('완료 → games/golmok/pixels/characters/ (ch01_gun.json, ch01_player.json)')
