#!/usr/bin/env python3
"""
Sand Engine — PNG → pixels.json 변환기 v1.1
(2026-05-27)

전색상 PNG를 Sand Engine PixelJSON Sparse v0.1 포맷으로 변환.
고정 팔레트 없이 PNG에서 실제 사용된 색상을 자동 추출.

출력 포맷 2종:
  [sparse]   { schema, width, height, palette, pixels:[[x,y,idx],...] }
             오브젝트·캐릭터 전용. 투명 배경 스프라이트에 최적.

  [scanline] { schema, width, height, palette, scanline:[idx,idx,...] }
             배경 레이어 전용. 모든 픽셀 저장 시 sparse보다 3~5배 작음.
             row-major 1-D 배열. idx=0 은 transparent.

팔레트 인덱스 예약:
  0  = transparent (스킵)
  1  = 실루엣 (검정 / 가장 어두운 색)
  9  = collision/ground  (엔진 예약)
  10 = emissive/glow
  11 = danger
  12 = fog/반투명

사용법:
  # 단일 파일 (sparse — 기본)
  python tools/png_to_pixels.py input.png

  # 배경 레이어 → scanline 포맷 (파일 크기 대폭 축소)
  python tools/png_to_pixels.py input.png --scanline

  # 출력 경로 지정
  python tools/png_to_pixels.py input.png -o assets/pixels/ch01_L0_sky.json

  # 폴더 일괄 변환 — L0/L1/L3 접두어 파일은 자동 scanline 모드
  python tools/png_to_pixels.py assets/samples/프로젝트2/ --batch

  # 프로젝트 카테고리 자동 분류 (backgrounds/characters/objects/items 하위 폴더)
  python tools/png_to_pixels.py assets/samples/프로젝트2/ --project 1974
  # → projects/1974/pixels/backgrounds/L1_alley.json 등으로 자동 저장

  # 알파 임계값 조정 (기본 10)
  python tools/png_to_pixels.py input.png --alpha-threshold 128

  # 최대 팔레트 색상 수 제한 (기본 128)
  python tools/png_to_pixels.py input.png --max-colors 64
"""

import argparse
import json
import os
import sys
from pathlib import Path
from collections import Counter

try:
    from PIL import Image
except ImportError:
    print("[오류] Pillow가 설치되지 않았습니다.")
    print("설치: pip install Pillow")
    sys.exit(1)


# ── 팔레트 예약 인덱스 ──────────────────────────────────────────────────
RESERVED = {
    0:  "transparent",
    9:  "collision/ground",
    10: "emissive/glow",
    11: "danger",
    12: "fog/반투명",
}

# 실루엣(검정) idx=1 고정
SILHOUETTE_HEX = "#000000"

# 배경 레이어 파일명 접두어 → 자동 scanline 모드
BACKGROUND_PREFIXES = ("L0_", "L1_", "L3_", "ch01_L0", "ch01_L1", "ch01_L3",
                       "ch02_L0", "ch02_L1", "ch02_L3")


# ── 색상 변환 ────────────────────────────────────────────────────────────

def rgba_to_hex(r, g, b, a=255):
    return f"#{r:02x}{g:02x}{b:02x}"


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


# ── 팔레트 빌드 ──────────────────────────────────────────────────────────

def build_palette(color_counts, max_colors=128):
    """
    빈도 순 정렬 후 max_colors 내에서 팔레트 구성.
    예약 슬롯(0, 9~12) 확보, idx=1 에 실루엣(검정/최어두움) 배치.

    반환: (palette_list, color_to_idx_map)
    """
    sorted_colors = [c for c, _ in color_counts.most_common()]

    # 실루엣 결정 (검정 우선, 없으면 최어두운 색)
    silhouette = None
    if SILHOUETTE_HEX in sorted_colors:
        silhouette = SILHOUETTE_HEX
        sorted_colors.remove(SILHOUETTE_HEX)
    elif sorted_colors:
        def brightness(h):
            r, g, b = hex_to_rgb(h)
            return 0.299*r + 0.587*g + 0.114*b
        darkest = min(sorted_colors, key=brightness)
        silhouette = darkest
        sorted_colors.remove(darkest)

    # 슬롯 배열 초기화 (최소 13개)
    palette = [""] * 13
    palette[0] = "transparent"
    palette[1] = silhouette or "#000000"
    # 예약 슬롯 플레이스홀더
    for ri in RESERVED:
        if ri > 1:
            palette[ri] = "#000000"

    color_to_idx = {}
    if silhouette:
        color_to_idx[silhouette] = 1

    # 슬롯 2~8, 13+ 순서로 할당 (9~12 건너뜀)
    available = list(range(2, 9)) + list(range(13, max_colors + 13))
    budget    = max_colors - 2  # 0,1 제외

    assigned = 0
    for color in sorted_colors:
        if assigned >= budget:
            break
        idx = available[assigned]
        if idx >= len(palette):
            palette.extend([""] * (idx - len(palette) + 1))
        palette[idx] = color
        color_to_idx[color] = idx
        assigned += 1

    # 빈 슬롯 정리
    for i in range(len(palette)):
        if not palette[i]:
            palette[i] = "#000000"

    # 맨 뒤 더미 "#000000" 트림 (예약 이후 슬롯만)
    while len(palette) > 13 and palette[-1] == "#000000":
        palette.pop()

    return palette, color_to_idx


def _fill_quantization_map(color_to_idx, palette, color_counts):
    """팔레트 미등록 색상 → 유클리드 최근접 팔레트 색으로 매핑 (in-place)."""
    pal_rgb = {}
    for i, h in enumerate(palette):
        if h and h not in ("transparent", "#000000") or i in (1,):
            try:
                pal_rgb[i] = hex_to_rgb(h)
            except Exception:
                pass
        elif h and h != "transparent":
            try:
                pal_rgb[i] = hex_to_rgb(h)
            except Exception:
                pass

    for color in list(color_counts.keys()):
        if color in color_to_idx:
            continue
        r, g, b = hex_to_rgb(color)
        best_idx, best_dist = None, float('inf')
        for idx, (pr, pg, pb) in pal_rgb.items():
            if idx == 0:
                continue
            d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
            if d < best_dist:
                best_dist, best_idx = d, idx
        if best_idx is not None:
            color_to_idx[color] = best_idx


# ── 단일 변환 ────────────────────────────────────────────────────────────

def convert_png(
    input_path: Path,
    output_path: Path,
    alpha_threshold: int = 10,
    max_colors: int = 128,
    scanline: bool = False,
    check_reserved: bool = False,
    quiet: bool = False,
):
    """
    PNG → pixels.json 변환.
    scanline=True 이면 row-major 1-D 배열 포맷 (배경 전용).
    반환: 성공 시 True, 실패 시 False.
    """
    if not input_path.exists():
        print(f"[오류] 파일 없음: {input_path}")
        return False

    img = Image.open(input_path).convert("RGBA")
    W, H = img.size
    # Pillow ≥13 호환: get_flattened_data 우선, fallback getdata
    try:
        pixels_raw = list(img.get_flattened_data())
    except AttributeError:
        pixels_raw = list(img.getdata())

    # 4-tuple 보장
    if pixels_raw and not isinstance(pixels_raw[0], (tuple, list)):
        # 이미 flat bytes라면 재구성
        pixels_raw = [
            (pixels_raw[i], pixels_raw[i+1], pixels_raw[i+2], pixels_raw[i+3])
            for i in range(0, len(pixels_raw), 4)
        ]

    mode = "scanline" if scanline else "sparse"
    if not quiet:
        print(f"\n[변환/{mode}] {input_path.name}  ({W}×{H})")

    # ── 색상 수집 ──────────────────────────────────────────────────────
    color_counts = Counter()
    for r, g, b, a in pixels_raw:
        if a < alpha_threshold:
            continue
        color_counts[rgba_to_hex(r, g, b)] += 1

    unique_colors = len(color_counts)
    if not quiet:
        print(f"  고유 색상: {unique_colors}개  → 팔레트 최대 {max_colors}개")

    if unique_colors == 0:
        print(f"  [경고] 불투명 픽셀 없음 — 스킵")
        return False

    # ── 팔레트 빌드 ───────────────────────────────────────────────────
    palette, color_to_idx = build_palette(color_counts, max_colors)

    if unique_colors > len(color_to_idx):
        over = unique_colors - len(color_to_idx)
        if not quiet:
            print(f"  [양자화] 초과 {over}색 → 최근접 팔레트 색 매핑")
        _fill_quantization_map(color_to_idx, palette, color_counts)

    # ── 픽셀 데이터 생성 ───────────────────────────────────────────────
    if scanline:
        # row-major 1-D 정수 배열 (투명=0)
        scanline_data = []
        unmapped = 0
        for r, g, b, a in pixels_raw:
            if a < alpha_threshold:
                scanline_data.append(0)
                continue
            hx  = rgba_to_hex(r, g, b)
            idx = color_to_idx.get(hx)
            if idx is None:
                scanline_data.append(0)
                unmapped += 1
            else:
                scanline_data.append(idx)
        pixels_key  = "scanline"
        pixels_data = scanline_data
    else:
        # sparse [[x,y,idx],...]
        pixels_out = []
        unmapped   = 0
        for i, (r, g, b, a) in enumerate(pixels_raw):
            if a < alpha_threshold:
                continue
            hx  = rgba_to_hex(r, g, b)
            idx = color_to_idx.get(hx)
            if idx is None:
                unmapped += 1
                continue
            if idx == 0:
                continue
            pixels_out.append([i % W, i // W, idx])
        pixels_key  = "pixels"
        pixels_data = pixels_out

    if unmapped > 0 and not quiet:
        print(f"  [경고] 매핑 실패 픽셀: {unmapped}개 (투명 처리)")

    # ── 예약 인덱스 충돌 경고 ─────────────────────────────────────────
    if check_reserved:
        if scanline:
            used = set(scanline_data)
        else:
            used = set(p[2] for p in pixels_out)
        for ri, desc in RESERVED.items():
            if ri != 0 and ri in used:
                print(f"  [예약 충돌] idx {ri}({desc}) 일반 색상 사용 중 — 엔진 특수 처리 대상")

    # ── 출력 ──────────────────────────────────────────────────────────
    output = {
        "schema":  "PixelJSON Sparse v0.1",
        "width":   W,
        "height":  H,
        "palette": palette,
        pixels_key: pixels_data,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = output_path.stat().st_size / 1024
    count   = len(pixels_data)
    if not quiet:
        print(f"  → {output_path}")
        print(f"     팔레트 {len(palette)}색 / 픽셀 {count:,}개 / {size_kb:.1f} KB")

    return True


# ── 일괄 변환 ────────────────────────────────────────────────────────────

def _is_background(name: str) -> bool:
    """파일명 접두어로 배경 레이어 여부 판단 → scanline 자동 선택."""
    for prefix in BACKGROUND_PREFIXES:
        if name.startswith(prefix):
            return True
    return False


def _infer_category(stem: str) -> str:
    """파일명 접두어로 카테고리 자동 분류 (projects/<pid>/pixels/<cat>/ 용)."""
    import re
    if re.match(r'^(L0_|L1_|L3_|.*_L0_|.*_L1_)', stem, re.IGNORECASE):
        return 'backgrounds'
    if re.search(r'(_char_|^char_)', stem, re.IGNORECASE):
        return 'characters'
    if re.match(r'^(item_|itm_)', stem, re.IGNORECASE):
        return 'items'
    return 'objects'


def batch_convert(
    folder: Path,
    output_folder: Path,
    alpha_threshold: int = 10,
    max_colors: int = 128,
    force_scanline: bool = False,
    check_reserved: bool = False,
    project_mode: bool = False,   # True → 카테고리 하위 폴더 자동 분류
):
    pngs = sorted(folder.glob("**/*.png"))
    if not pngs:
        print(f"[오류] PNG 파일 없음: {folder}")
        return

    print(f"\n[일괄 변환] {len(pngs)}개 파일  →  {output_folder}"
          + (" (프로젝트 카테고리 자동 분류)" if project_mode else ""))
    ok = fail = 0
    for png in pngs:
        rel  = png.relative_to(folder)
        sl   = force_scanline or _is_background(png.stem)

        if project_mode:
            cat = _infer_category(png.stem)
            out = output_folder / cat / rel.with_suffix(".json")
        else:
            out = output_folder / rel.with_suffix(".json")

        result = convert_png(
            png, out,
            alpha_threshold=alpha_threshold,
            max_colors=max_colors,
            scanline=sl,
            check_reserved=check_reserved,
        )
        if result:
            ok += 1
        else:
            fail += 1

    print(f"\n완료: 성공 {ok}개 / 실패 {fail}개")


# ── CLI ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sand Engine PNG → pixels.json 변환기 v1.1",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input",
                        help="PNG 파일 또는 폴더 경로 (--batch 시 폴더)")
    parser.add_argument("-o", "--output",
                        help="출력 JSON 경로 (단일 파일 모드. 기본: 입력명.json)")
    parser.add_argument("--batch",         action="store_true",
                        help="폴더 내 PNG 전부 일괄 변환")
    parser.add_argument("--out-dir",       default=None,
                        help="일괄 변환 출력 폴더 (기본: 입력 폴더)")
    parser.add_argument("--project",       default=None,
                        help="프로젝트 ID: 카테고리 자동 분류 (예: 1974) — "
                             "projects/<id>/pixels/ 하위에 backgrounds/characters 등 자동 생성")
    parser.add_argument("--scanline",      action="store_true",
                        help="scanline 포맷 강제 사용 (배경 레이어 권장)")
    parser.add_argument("--alpha-threshold", type=int, default=10,
                        help="알파 임계값: 이 값 미만은 투명 처리 (기본 10)")
    parser.add_argument("--max-colors",    type=int, default=128,
                        help="최대 팔레트 색상 수 (기본 128)")
    parser.add_argument("--check-reserved", action="store_true",
                        help="예약 인덱스(9~12) 사용 경고 출력")
    parser.add_argument("-q", "--quiet",   action="store_true",
                        help="출력 최소화")

    args = parser.parse_args()
    inp  = Path(args.input)

    if args.batch or inp.is_dir():
        if not inp.is_dir():
            print(f"[오류] 폴더가 아닙니다: {inp}")
            sys.exit(1)

        # --project 플래그: 프로젝트 루트/projects/<id>/pixels/ 자동 설정
        project_mode = False
        if args.project:
            proj_root = inp.parent.parent  # tools/../ → 프로젝트 루트 추정
            # 사용자가 --out-dir도 지정하면 그 경로 아래에 생성
            base = Path(args.out_dir) if args.out_dir else (proj_root / 'projects' / args.project / 'pixels')
            out_dir      = base
            project_mode = True
        else:
            out_dir = Path(args.out_dir) if args.out_dir else inp

        batch_convert(inp, out_dir,
                      alpha_threshold=args.alpha_threshold,
                      max_colors=args.max_colors,
                      force_scanline=args.scanline,
                      check_reserved=args.check_reserved,
                      project_mode=project_mode)
    else:
        out = Path(args.output) if args.output else inp.with_suffix(".json")
        convert_png(inp, out,
                    alpha_threshold=args.alpha_threshold,
                    max_colors=args.max_colors,
                    scanline=args.scanline,
                    check_reserved=args.check_reserved,
                    quiet=args.quiet)


if __name__ == "__main__":
    main()
