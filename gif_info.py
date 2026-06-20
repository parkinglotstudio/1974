from PIL import Image, ImageSequence
import os

files = [
    r'games\nuri\samples\점프 준비.gif',
    r'games\nuri\samples\점프 엔딩 루핑.gif',
    r'games\nuri\samples\점프 엔딩 착지.gif',
]
for f in files:
    img = Image.open(f)
    n = 0
    durations = []
    try:
        while True:
            durations.append(img.info.get('duration', 33))
            n += 1
            img.seek(n)
    except EOFError:
        pass
    total_ms = sum(durations)
    avg = total_ms // n if n else 0
    name = os.path.basename(f)
    print(f"{name}: {img.width}x{img.height}, {n}프레임, 총{total_ms}ms, 평균{avg}ms/f, {1000//avg if avg else 0}fps")
