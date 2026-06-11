"""개발용 HTTP 서버 — Cache-Control: no-store 헤더로 모듈 캐시 방지"""
import http.server, sys, os, json
from urllib.request import urlopen
from urllib.parse import urlparse, parse_qs, unquote, quote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9193
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        print(f"[REQUEST POST] path={self.path}", flush=True)
        if self.path == '/api/log':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body   = json.loads(self.rfile.read(length))
                level  = body.get('level', 'LOG')
                msg    = body.get('message', '')
                print(f"[BROWSER {level}] {msg}", flush=True)
            except Exception as e:
                print(f"[ERROR parsing browser log] {e}", flush=True)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return

        elif self.path == '/api/create-project':
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            pid    = body.get('id', '')
            gj     = body.get('gameJson', {})

            # ── 폴더 구조 생성 ──────────────────────────────────
            proj_dir = os.path.join(ROOT, 'games', pid)
            for sub in ['scenes', 'prefabs', 'palettes', 'scripts', 'pixels']:
                os.makedirs(os.path.join(proj_dir, sub), exist_ok=True)

            # ── game.json 저장 ──────────────────────────────────
            gj_path = os.path.join(proj_dir, 'game.json')
            with open(gj_path, 'w', encoding='utf-8') as f:
                json.dump(gj, f, ensure_ascii=False, indent=2)

            # ── scenes/main.scene.json 생성 (없을 때만) ─────────
            scene_src = gj.get('scenes', {})
            for sname, sdef in scene_src.items():
                if sdef.get('type') == 'json' and sdef.get('src'):
                    scene_path = os.path.join(proj_dir, sdef['src'])
                    if not os.path.exists(scene_path):
                        os.makedirs(os.path.dirname(scene_path), exist_ok=True)
                        w = gj.get('resolution', {}).get('width', 270)
                        h = gj.get('resolution', {}).get('height', 480)
                        scene_template = {
                            "schema": "SandEngine.Scene.v1",
                            "name": sname,
                            "resolution": {"width": w, "height": h},
                            "layers": [
                                {"id": "L0", "parallax": 0.15, "children": []},
                                {"id": "L1", "parallax": 0.60, "children": []},
                                {"id": "L2", "parallax": 1.00, "children": []},
                                {"id": "L3", "parallax": 0.00, "children": []}
                            ],
                            "entities": []
                        }
                        with open(scene_path, 'w', encoding='utf-8') as f:
                            json.dump(scene_template, f, ensure_ascii=False, indent=2)
                        print(f'[API] created scene: {sdef["src"]}', flush=True)

            # ── 기본 팔레트 복사 (palettes/ 에 아직 없으면) ────────
            pal_src = gj.get('palette', '')
            if pal_src and pal_src.startswith('palettes/'):
                pal_dst = os.path.join(proj_dir, pal_src)
                if not os.path.exists(pal_dst):
                    # 공용 assets/palettes/ 에서 복사
                    pal_name = pal_src.split('/')[-1]
                    shared_pal = os.path.join(ROOT, 'assets', 'palettes', pal_name)
                    if os.path.isfile(shared_pal):
                        import shutil
                        shutil.copy2(shared_pal, pal_dst)

            # ── index.html 채널 API 템플릿 생성 (없을 때만) ─────
            html_path = os.path.join(proj_dir, 'index.html')
            if not os.path.exists(html_path):
                game_name    = gj.get('name', pid)
                game_w       = gj.get('resolution', {}).get('width',  270)
                game_h       = gj.get('resolution', {}).get('height', 480)
                default_scene = gj.get('defaultScene', 'main')
                html_content = f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <title>{game_name}</title>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#000; display:flex; align-items:center; justify-content:center;
            height:100vh; overflow:hidden; }}
    canvas {{ display:block; image-rendering:pixelated; image-rendering:crisp-edges; }}
  </style>
</head>
<body>
<canvas id="game-canvas"></canvas>
<script type="module">
import SandEngine from '../../engine/SandEngine.js';

// ── 채널 API ────────────────────────────────────────────────
const isEmbed = window !== window.top;

const game = {{
    _engine: null,
    _paused: false,
    start()  {{ this._engine?.start(); }},
    pause()  {{ this._engine?.stop();  this._paused = true; }},
    resume() {{ if (this._paused) {{ this._engine?.start(); this._paused = false; }} }},
    complete(result) {{
        if (isEmbed) window.parent.postMessage({{ type: 'complete', result }}, '*');
    }},
    score(value) {{
        if (isEmbed) window.parent.postMessage({{ type: 'score', value }}, '*');
    }},
    exit() {{
        if (isEmbed) window.parent.postMessage({{ type: 'exit' }}, '*');
    }},
}};
window._game = game;

window.addEventListener('message', (e) => {{
    if (!e.data?.type) return;
    if (e.data.type === 'start')  game.start();
    if (e.data.type === 'pause')  game.pause();
    if (e.data.type === 'resume') game.resume();
}});

// ── 초기화 ──────────────────────────────────────────────────
async function init() {{
    const canvas = document.getElementById('game-canvas');

    // game.json 로드
    const gj = await fetch('./game.json', {{ cache: 'no-store' }}).then(r => r.json());
    const {{ width, height }} = gj.resolution;

    game._engine = new SandEngine({{ canvas, gameWidth: width, gameHeight: height }});
    await game._engine.init();

    if (gj.palette) {{
        await game._engine.loadPalette(
            gj.palette.startsWith('/') ? gj.palette : './' + gj.palette
        );
    }}

    // 기본 씬 로드
    const defaultScene = gj.defaultScene ?? '{default_scene}';
    const sceneDef     = gj.scenes?.[defaultScene];
    if (sceneDef?.type === 'json' && sceneDef.src) {{
        const sceneJSON = await game._engine.assets.load(
            sceneDef.src.startsWith('/') ? sceneDef.src : './' + sceneDef.src
        );
        await game._engine.applyScene(sceneJSON);
    }}

    game._engine.start();

    // 준비 완료 알림
    if (isEmbed) window.parent.postMessage({{ type: 'ready' }}, '*');
}}

init().catch(e => console.error('[{pid}]', e));
</script>
</body>
</html>'''
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(html_content)
                print(f'[API] created index.html: {pid}', flush=True)

            # ── games/index.json 업데이트 ─────────────────────
            idx_path = os.path.join(ROOT, 'games', 'index.json')
            if os.path.exists(idx_path):
                with open(idx_path, encoding='utf-8') as f:
                    idx = json.load(f)
            else:
                idx = {'games': []}
            
            key_name = 'games' if 'games' in idx else 'projects'
            if key_name not in idx:
                idx[key_name] = []

            if not any(p['id'] == pid for p in idx[key_name]):
                w = gj.get('resolution', {}).get('width', '?')
                h = gj.get('resolution', {}).get('height', '?')
                ch = gj.get('chapter', '')
                idx[key_name].append({
                    'id':      pid,
                    'name':    gj.get('name', pid),
                    'icon':    '🎮',
                    'chapter': ch,
                    'desc':    f"{w}×{h}" + (f" · Ch.{ch}" if ch else '')
                })
                with open(idx_path, 'w', encoding='utf-8') as f:
                    json.dump(idx, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'ok': True,
                'created': {
                    'gameJson':  True,
                    'indexHtml': os.path.exists(html_path),
                    'scenesDir': True,
                }
            }).encode())
            print(f'[API] create-project: {pid}', flush=True)
            return

        elif self.path == '/api/save-game':
            # game.json만 갱신 — 폴더 구조 재생성 없음
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            pid    = body.get('id', '')
            gj     = body.get('gameJson', {})

            if not pid or '..' in pid or '/' in pid or '\\' in pid:
                self.send_response(400)
                self.end_headers()
                return

            gj_path = os.path.join(ROOT, 'games', pid, 'game.json')
            if not os.path.isfile(gj_path):
                # 레거시 지원
                gj_path_legacy = os.path.join(ROOT, 'content', pid, 'game.json')
                if os.path.isfile(gj_path_legacy):
                    gj_path = gj_path_legacy
                else:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"ok":false,"error":"project not found"}')
                    return

            with open(gj_path, 'w', encoding='utf-8') as f:
                json.dump(gj, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            print(f'[API] save-game: {pid}', flush=True)
            return

        elif self.path == '/api/save-scene':
            length   = int(self.headers.get('Content-Length', 0))
            body     = json.loads(self.rfile.read(length))
            rel_path = body.get('path', '')
            content  = body.get('content', '')

            # games/, content/ 또는 projects/ 경로 허용
            if not (rel_path.startswith('games/') or rel_path.startswith('content/') or rel_path.startswith('projects/')) \
               or '..' in rel_path:
                self.send_response(403)
                self.end_headers()
                return

            full_path = os.path.join(ROOT, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            print(f'[API] save-scene: {rel_path}', flush=True)
            return

        elif self.path == '/api/save-pixel':
            length   = int(self.headers.get('Content-Length', 0))
            body     = json.loads(self.rfile.read(length))
            rel_path = body.get('path', '')
            content  = body.get('json', '')
            name     = body.get('name', 'unknown')

            # games/, projects/ 또는 assets/pixels/ 경로 허용
            allowed = (rel_path.startswith('games/') or
                       rel_path.startswith('projects/') or
                       rel_path.startswith('assets/pixels/'))
            if not allowed or '..' in rel_path:
                self.send_response(403)
                self.end_headers()
                return

            full_path = os.path.join(ROOT, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            print(f'[API] save-pixel: {rel_path}', flush=True)
            return

        elif self.path == '/api/delete-pixel':
            length   = int(self.headers.get('Content-Length', 0))
            body     = json.loads(self.rfile.read(length))
            name     = body.get('name', '')
            project  = body.get('project', '')
            category = body.get('category', '')

            # 이름 안전성 검사 (경로 탈출 방지)
            if not name or '..' in name or '/' in name or '\\' in name:
                self.send_response(403)
                self.end_headers()
                return

            # 프로젝트 경로 우선, 없으면 레거시 경로
            if project and category:
                safe_proj = project.replace('..', '').replace('/', '').replace('\\', '')
                safe_cat  = category.replace('..', '').replace('/', '').replace('\\', '')
                full_path = os.path.join(ROOT, 'games', safe_proj, 'pixels', safe_cat, f'{name}.json')
                if not os.path.isfile(full_path):
                    full_path = os.path.join(ROOT, 'projects', safe_proj, 'pixels', safe_cat, f'{name}.json')
                
                if not os.path.isfile(full_path):
                    # 카테고리 내 검색 (games)
                    proj_dir = os.path.join(ROOT, 'games', safe_proj, 'pixels')
                    full_path = None
                    for cat_name in ['backgrounds','characters','objects','items']:
                        p = os.path.join(proj_dir, cat_name, f'{name}.json')
                        if os.path.isfile(p):
                            full_path = p
                            break
                    # 카테고리 내 검색 (projects 레거시)
                    if not full_path or not os.path.isfile(full_path):
                        proj_dir_legacy = os.path.join(ROOT, 'projects', safe_proj, 'pixels')
                        for cat_name in ['backgrounds','characters','objects','items']:
                            p = os.path.join(proj_dir_legacy, cat_name, f'{name}.json')
                            if os.path.isfile(p):
                                full_path = p
                                break
            else:
                full_path = os.path.join(ROOT, 'assets', 'pixels', f'{name}.json')

            if full_path and os.path.isfile(full_path):
                os.remove(full_path)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
                print(f'[API] delete-pixel: {name}', flush=True)
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":false,"error":"not found"}')
            return

        elif self.path == '/api/convert-gif':
            # ── GIF → 애니 픽셀 JSON 변환 (Pillow 필요) ──────────
            try:
                from PIL import Image
            except ImportError:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'ok': False,
                    'error': 'Pillow not installed — pip install Pillow'
                }).encode())
                return

            import base64, io as _io

            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            scale_pct = max(10, min(200, int(body.get('scale', 100))))
            name      = body.get('name', 'animated')

            # 소스: base64(업로드) or 로컬 경로(샘플)
            gif_bytes = None
            if 'gifBase64' in body:
                gif_bytes = base64.b64decode(body['gifBase64'])
            elif 'gifPath' in body:
                raw_path = body['gifPath']
                if '://' in raw_path:
                    parsed = urlparse(raw_path)
                    rel = parsed.path.lstrip('/')
                else:
                    rel = raw_path.lstrip('/')
                rel = unquote(rel)
                if '..' in rel:
                    self.send_response(403); self.end_headers(); return
                full = os.path.join(ROOT, rel)
                if not os.path.isfile(full):
                    self.send_response(404); self.end_headers(); return
                with open(full, 'rb') as f:
                    gif_bytes = f.read()

            if not gif_bytes:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":false,"error":"no gif data"}')
                return

            img      = Image.open(_io.BytesIO(gif_bytes))
            n_frames = getattr(img, 'n_frames', 1)
            orig_w, orig_h = img.size

            # crop if requested
            trim_lr = max(0, int(body.get('trimLR', 0)))
            trim_tb = max(0, int(body.get('trimTB', 0)))
            cw = max(1, orig_w - 2 * trim_lr)
            ch = max(1, orig_h - 2 * trim_tb)

            tw = max(1, round(cw * scale_pct / 100))
            th = max(1, round(ch * scale_pct / 100))

            # ── 전체 프레임 픽셀 수집 ─────────────────────────────
            all_colors = {}
            raw_frames = []
            for i in range(n_frames):
                img.seek(i)
                delay = img.info.get('duration', 100)
                f_rgba = img.convert('RGBA')
                if trim_lr > 0 or trim_tb > 0:
                    f_rgba = f_rgba.crop((trim_lr, trim_tb, orig_w - trim_lr, orig_h - trim_tb))
                frame = f_rgba.resize((tw, th), Image.NEAREST)
                pdata = list(frame.getdata())
                raw_frames.append({'pixels': pdata, 'delay': delay})
                for r, g, b, a in pdata:
                    if a < 64:
                        continue
                    key = (r << 16) | (g << 8) | b
                    all_colors[key] = all_colors.get(key, 0) + 1

            # ── 통합 팔레트 (빈도 상위 255색) ────────────────────
            sorted_colors = sorted(all_colors.items(), key=lambda x: -x[1])[:255]
            palette = ['transparent'] + [
                '#{:02x}{:02x}{:02x}'.format((k >> 16) & 0xFF, (k >> 8) & 0xFF, k & 0xFF)
                for k, _ in sorted_colors
            ]
            color_to_idx = {k: i + 1 for i, (k, _) in enumerate(sorted_colors)}
            pal_rgb      = [((k >> 16) & 0xFF, (k >> 8) & 0xFF, k & 0xFF)
                            for k, _ in sorted_colors]

            nearest_cache = {}
            def nearest(r, g, b):
                color_key = (r, g, b)
                if color_key in nearest_cache:
                    return nearest_cache[color_key]
                best_d, best_i = float('inf'), 1
                for ci, (cr, cg, cb) in enumerate(pal_rgb):
                    d = (r-cr)**2*0.299 + (g-cg)**2*0.587 + (b-cb)**2*0.114
                    if d < best_d:
                        best_d, best_i = d, ci + 1
                nearest_cache[color_key] = best_i
                return best_i

            # ── 프레임별 픽셀 인덱스 변환 ─────────────────────────
            frames = []
            for raw in raw_frames:
                pixels = []
                for pi, (r, g, b, a) in enumerate(raw['pixels']):
                    if a < 64:
                        continue
                    x, y  = pi % tw, pi // tw
                    key   = (r << 16) | (g << 8) | b
                    idx   = color_to_idx.get(key) or nearest(r, g, b)
                    pixels.append([x, y, idx])
                frames.append({'pixels': pixels, 'delay': raw['delay']})

            result = {
                'ok': True, 'name': name, 'animated': True,
                'palette': palette, 'frames': frames,
                'width': tw, 'height': th,
                'frameCount': n_frames,
                'origWidth': orig_w, 'origHeight': orig_h
            }
            data = json.dumps(result).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            print(f'[API] convert-gif: {name} ({n_frames}f, {tw}×{th})', flush=True)
            return

        elif self.path == '/api/save-gif':
            # ── 클라이언트에서 가공된 GIF 프레임들을 받아 GIF 파일로 조립 및 저장 ──
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            
            project     = body.get('project', '1974')
            category    = body.get('category', 'objects')
            name        = body.get('name', 'edited_animation')
            frames_data = body.get('frames', []) # [{'base64': '...', 'delay': 100}, ...]
            
            if not frames_data or not name:
                self.send_response(400)
                self.end_headers()
                return

            safe_name = name.replace('..', '').replace('/', '').replace('\\', '')
            safe_cat  = category.replace('..', '').replace('/', '').replace('\\', '')
            safe_proj = project.replace('..', '').replace('/', '').replace('\\', '')

            # 임시 폴더에 혹은 프로젝트 samples 폴더에 저장
            if safe_cat == '프로젝트샘플':
                dst_dir = os.path.join(ROOT, 'games', safe_proj, 'samples')
            else:
                dst_dir = os.path.join(ROOT, 'assets', 'samples', safe_cat)
            os.makedirs(dst_dir, exist_ok=True)
            dst_path = os.path.join(dst_dir, f"{safe_name}.gif")

            try:
                from PIL import Image
                import io, base64

                imgs = []
                delays = []
                for f in frames_data:
                    b64_data = f['base64']
                    img_bytes = base64.b64decode(b64_data)
                    img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
                    imgs.append(img)
                    delays.append(f.get('delay', 100))

                # GIF 저장
                imgs[0].save(
                    dst_path,
                    save_all=True,
                    append_images=imgs[1:],
                    duration=delays,
                    loop=0,
                    transparency=0,
                    disposal=2
                )
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
                print(f'[API] save-gif: {dst_path} ({len(imgs)}f)', flush=True)

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode('utf-8'))
            return

        elif self.path == '/api/extract-gif-frames':
            # ── GIF 이미지의 프레임들을 픽셀 연산 없이 PNG 이미지 바이트로 추출해주는 고속 API ──
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            
            gif_bytes = None
            if 'gifBase64' in body:
                gif_bytes = base64.b64decode(body['gifBase64'])
            elif 'gifPath' in body:
                raw_path = body['gifPath']
                print(f"[DEBUG] raw_path = {raw_path}", flush=True)
                if '://' in raw_path:
                    parsed = urlparse(raw_path)
                    rel = parsed.path.lstrip('/')
                else:
                    rel = raw_path.lstrip('/')
                rel = unquote(rel)
                print(f"[DEBUG] rel_path = {rel}", flush=True)
                if '..' in rel:
                    print(f"[DEBUG] Forbidden (..) path: {rel}", flush=True)
                    self.send_response(403); self.end_headers(); return
                full = os.path.join(ROOT, rel)
                print(f"[DEBUG] full_path = {full} (exists: {os.path.exists(full)}, isfile: {os.path.isfile(full)})", flush=True)
                if not os.path.isfile(full):
                    self.send_response(404); self.end_headers(); return
                with open(full, 'rb') as f:
                    gif_bytes = f.read()

            if not gif_bytes:
                self.send_response(400)
                self.end_headers()
                return

            try:
                from PIL import Image
                import io, base64

                img = Image.open(io.BytesIO(gif_bytes))
                n_frames = getattr(img, 'n_frames', 1)
                width, height = img.size

                frames = []
                for i in range(n_frames):
                    img.seek(i)
                    buf = io.BytesIO()
                    img.convert('RGBA').save(buf, format='PNG')
                    b64 = base64.b64encode(buf.getvalue()).decode()
                    frames.append({
                        'base64': b64,
                        'delay': img.info.get('duration', 100)
                    })

                result = {
                    'ok': True,
                    'width': width,
                    'height': height,
                    'frameCount': n_frames,
                    'frames': frames
                }
                data = json.dumps(result).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                print(f'[API] extract-gif-frames: {n_frames} frames ({width}x{height})', flush=True)

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode('utf-8'))
            return

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        print(f"[REQUEST GET] path={self.path}", flush=True)
        # ── 프로젝트별 에셋 데이터 ─────────────────────────────────────
        if self.path.startswith('/api/project-data'):
            from urllib.parse import urlparse, parse_qs
            qs      = parse_qs(urlparse(self.path).query)
            pid     = (qs.get('project', ['1974'])[0]).replace('..', '').replace('/', '').replace('\\', '')
            # games 디렉토리 우선 스캔
            proj_dir = os.path.join(ROOT, 'games', pid)
            if not os.path.isdir(proj_dir):
                proj_dir = os.path.join(ROOT, 'projects', pid)

            # ── 픽셀 JSON: games/<pid>/pixels/<category>/*.json ──
            px_root = os.path.join(proj_dir, 'pixels')
            PIXEL_CATS = ['backgrounds', 'characters', 'objects', 'items']
            pixel_data = {}   # { category: [pixelJSON, ...] }
            if os.path.isdir(px_root):
                for cat in PIXEL_CATS:
                    cat_dir = os.path.join(px_root, cat)
                    if not os.path.isdir(cat_dir):
                        continue
                    entries = []
                    for fname in sorted(os.listdir(cat_dir)):
                        if fname.endswith('.json'):
                            try:
                                with open(os.path.join(cat_dir, fname), encoding='utf-8') as f:
                                    d = json.load(f)
                                    d['_category'] = cat
                                    # 파일명(확장자 제외)을 name으로 보장
                                    if not d.get('name'):
                                        d['name'] = os.path.splitext(fname)[0]
                                    entries.append(d)
                            except Exception:
                                pass
                    if entries:
                        pixel_data[cat] = entries

            # ── 팔레트: games/<pid>/palettes/*.json (기존 identity) ──────────────
            id_dir   = os.path.join(proj_dir, 'palettes')
            if not os.path.isdir(id_dir):
                id_dir = os.path.join(proj_dir, 'identity')
            palettes = []
            if os.path.isdir(id_dir):
                for fname in sorted(os.listdir(id_dir)):
                    if fname.endswith('.json'):
                        palettes.append(fname)

            # ── 샘플 사진: assets/samples/<cat>/<img> ───────────────
            sm_dir = os.path.join(ROOT, 'assets', 'samples')
            sample_files = {}
            EXTS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')
            if os.path.isdir(sm_dir):
                from urllib.parse import quote as _quote
                for cat in sorted(os.listdir(sm_dir)):
                    cat_dir2 = os.path.join(sm_dir, cat)
                    if os.path.isdir(cat_dir2):
                        imgs = sorted([
                            f'assets/samples/{_quote(cat)}/{_quote(fn)}'
                            for fn in os.listdir(cat_dir2)
                            if fn.lower().endswith(EXTS)
                        ])
                        if imgs:
                            sample_files[cat] = imgs

            # ── 프로젝트 메타 ────────────────────────────────────────
            meta_path = os.path.join(proj_dir, 'project.json')
            meta = {}
            if os.path.isfile(meta_path):
                try:
                    with open(meta_path, encoding='utf-8') as f:
                        meta = json.load(f)
                except Exception:
                    pass

            # ── 프로젝트 로컬 샘플 사진 스캔 ──
            local_sm_dir = os.path.join(ROOT, 'games', pid, 'samples')
            if os.path.isdir(local_sm_dir):
                from urllib.parse import quote as _quote
                imgs = sorted([
                    f'games/{pid}/samples/{_quote(fn)}'
                    for fn in os.listdir(local_sm_dir)
                    if fn.lower().endswith(EXTS)
                ])
                if imgs:
                    sample_files['프로젝트샘플'] = imgs

            # learningData = 모든 카테고리 flatten (레거시 호환)
            flat_pixels = []
            for cat in PIXEL_CATS:
                flat_pixels.extend(pixel_data.get(cat, []))

            result = json.dumps({
                'projectId':    pid,
                'meta':         meta,
                'pixelData':    pixel_data,   # 카테고리별
                'learningData': flat_pixels,  # 레거시 호환 flat
                'palettes':     palettes,
                'sampleFiles':  sample_files,
                '_local':       True,
            }).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(result)))
            self.end_headers()
            self.wfile.write(result)
            print(f'[API] project-data: {pid} ({len(flat_pixels)} pixels)', flush=True)
            return

        # ── 프로젝트 픽셀 목록 ─────────────────────────────────────────
        if self.path.startswith('/api/list-project-pixels'):
            from urllib.parse import urlparse, parse_qs
            qs       = parse_qs(urlparse(self.path).query)
            pid      = (qs.get('project', ['1974'])[0]).replace('..', '').replace('/', '').replace('\\', '')
            px_root  = os.path.join(ROOT, 'games', pid, 'pixels')
            if not os.path.isdir(px_root):
                px_root  = os.path.join(ROOT, 'projects', pid, 'pixels')
            PIXEL_CATS = ['backgrounds', 'characters', 'objects', 'items']
            result = {}
            for cat in PIXEL_CATS:
                cat_dir = os.path.join(px_root, cat)
                if os.path.isdir(cat_dir):
                    names = sorted([
                        os.path.splitext(f)[0]
                        for f in os.listdir(cat_dir)
                        if f.endswith('.json')
                    ])
                    if names:
                        result[cat] = names
            data = json.dumps(result).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # 에셋 브라우저용 통합 데이터 (픽셀 JSON + 샘플 이미지)
        if self.path == '/api/data':
            # ── PixelJSON: assets/pixels/*.json ──────────────────
            px_dir = os.path.join(ROOT, 'assets', 'pixels')
            learning_data = []
            if os.path.isdir(px_dir):
                for fname in sorted(os.listdir(px_dir)):
                    if fname.endswith('.json'):
                        try:
                            with open(os.path.join(px_dir, fname), encoding='utf-8') as f:
                                learning_data.append(json.load(f))
                        except Exception:
                            pass

            # ── 샘플 사진: assets/samples/<카테고리>/<이미지> ─────
            sm_dir = os.path.join(ROOT, 'assets', 'samples')
            sample_files = {}
            EXTS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')
            if os.path.isdir(sm_dir):
                for cat in sorted(os.listdir(sm_dir)):
                    cat_dir = os.path.join(sm_dir, cat)
                    if os.path.isdir(cat_dir):
                        imgs = sorted([
                            f'assets/samples/{quote(cat)}/{quote(fn)}'
                            for fn in os.listdir(cat_dir)
                            if fn.lower().endswith(EXTS)
                        ])
                        if imgs:
                            sample_files[cat] = imgs

            data = json.dumps({
                'learningData': learning_data,
                'sampleFiles':  sample_files,
                '_local': True          # 로컬 서버 출처 표시
            }).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # assets/pixels/ 폴더 파일 목록
        if self.path == '/api/list-pixels':
            px_dir = os.path.join(ROOT, 'assets', 'pixels')
            files = []
            if os.path.isdir(px_dir):
                files = sorted([
                    os.path.splitext(f)[0]
                    for f in os.listdir(px_dir)
                    if f.endswith('.json')
                ])
            data = json.dumps(files).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # 이미지 프록시 — 9192 포트 CORS 우회
        if self.path.startswith('/api/proxy-image?'):
            qs  = parse_qs(self.path.split('?', 1)[1])
            url = unquote(qs.get('url', [''])[0])
            if not url.startswith('http://localhost:9192/'):
                self.send_response(403); self.end_headers(); return
            try:
                with urlopen(url, timeout=5) as resp:
                    data        = resp.read()
                    mime        = resp.headers.get_content_type() or 'image/png'
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(502); self.end_headers()
            return

        # assets/samples 정적 파일 한글 서빙 대응 프록시
        if self.path.startswith('/assets/samples/'):
            rel_path = unquote(self.path).lstrip('/')
            full_path = os.path.join(ROOT, rel_path)
            print(f"[DEBUG SAMPLE PROXY] request={self.path} -> rel={rel_path} -> full={full_path}", flush=True)
            if os.path.isfile(full_path):
                ext = os.path.splitext(full_path)[1].lower()
                mime = 'image/png'
                if ext in ['.jpg', '.jpeg']: mime = 'image/jpeg'
                elif ext == '.gif': mime = 'image/gif'
                elif ext == '.webp': mime = 'image/webp'
                elif ext == '.bmp': mime = 'image/bmp'
                try:
                    with open(full_path, 'rb') as f:
                        data = f.read()
                    print(f"  [OK] size={len(data)} mime={mime}", flush=True)
                    self.send_response(200)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception as e:
                    print(f"  [ERROR] read failed: {e}", flush=True)
                    self.send_response(500)
                    self.end_headers()
                    return
            else:
                print(f"  [FAIL] file not found!", flush=True)

        # games/.../samples 정적 파일 한글 서빙 대응 프록시
        if self.path.startswith('/games/') and '/samples/' in self.path:
            rel_path = unquote(self.path).lstrip('/')
            full_path = os.path.join(ROOT, rel_path)
            print(f"[DEBUG GAME SAMPLE PROXY] request={self.path} -> rel={rel_path} -> full={full_path}", flush=True)
            if os.path.isfile(full_path):
                ext = os.path.splitext(full_path)[1].lower()
                mime = 'image/png'
                if ext in ['.jpg', '.jpeg']: mime = 'image/jpeg'
                elif ext == '.gif': mime = 'image/gif'
                elif ext == '.webp': mime = 'image/webp'
                elif ext == '.bmp': mime = 'image/bmp'
                try:
                    with open(full_path, 'rb') as f:
                        data = f.read()
                    print(f"  [OK] size={len(data)} mime={mime}", flush=True)
                    self.send_response(200)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception as e:
                    print(f"  [ERROR] read failed: {e}", flush=True)
                    self.send_response(500)
                    self.end_headers()
                    return
            else:
                print(f"  [FAIL] file not found!", flush=True)

        # 단축 경로는 301 redirect — 브라우저 URL이 바뀌어야 상대경로 정상 해석
        redirects = {
            '/':                '/sand_engine/sand_engine.html',
            '/engine':          '/sand_engine/sand_engine.html',
            '/engine/':         '/sand_engine/sand_engine.html',
            '/editor':          '/sand_engine/sand_engine.html',
            '/editor/':         '/sand_engine/sand_engine.html',
            '/sand_engine.html':'/sand_engine/sand_engine.html',
        }
        if self.path in redirects:
            self.send_response(302)
            self.send_header('Location', redirects[self.path])
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    # def log_message(self, fmt, *args):
    #     pass  # 불필요한 로그 억제

if __name__ == '__main__':
    os.chdir(ROOT)
    from socketserver import ThreadingMixIn
    class ThreadedHTTPServer(ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
    with ThreadedHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Dev server: http://localhost:{PORT}/ (root: {ROOT})', flush=True)
        httpd.serve_forever()
