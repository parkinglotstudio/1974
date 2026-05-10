export default class PixelToolScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.loadedImage = null;
        this.isActive = false;
    }

    async enter() {
        this.isActive = true;
        this.loadedImage = null;
        document.getElementById('ui-layer').innerHTML = this.buildHTML();
        this.bindEvents();
        await this.refreshFileList();
    }

    buildHTML() {
        return `
        <style>
            #pt-container {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: #0a0a0a; display: flex; flex-direction: column;
                font-family: 'VT323', monospace; color: #fff; z-index: 10000;
                overflow: hidden;
            }
            #pt-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 14px 25px; border-bottom: 2px solid #1a1a1a;
                background: #0d0d0d; flex-shrink: 0;
            }
            #pt-header h1 {
                font-size: 34px; color: #0ff;
                text-shadow: 0 0 12px rgba(0,255,255,0.6);
                letter-spacing: 5px; margin: 0;
            }
            #pt-back-btn {
                background: transparent; border: 2px solid #444; color: #777;
                padding: 7px 18px; font-family: 'VT323'; font-size: 20px;
                cursor: pointer; transition: all 0.15s; letter-spacing: 1px;
            }
            #pt-back-btn:hover { border-color: #fff; color: #fff; }

            #pt-body { display: flex; flex: 1; overflow: hidden; }

            /* ── LEFT: 파일 목록 ── */
            #pt-sidebar {
                width: 230px; border-right: 2px solid #1a1a1a;
                display: flex; flex-direction: column; background: #0d0d0d; flex-shrink: 0;
            }
            #pt-sidebar-hd {
                padding: 13px 18px; border-bottom: 1px solid #1a1a1a;
                display: flex; justify-content: space-between; align-items: center;
            }
            #pt-sidebar-hd span { font-size: 17px; color: #555; letter-spacing: 3px; }
            #pt-refresh-btn {
                background: transparent; border: 1px solid #2a2a2a; color: #555;
                padding: 3px 9px; font-family: 'VT323'; font-size: 16px;
                cursor: pointer; transition: all 0.15s;
            }
            #pt-refresh-btn:hover { border-color: #0ff; color: #0ff; }
            #pt-file-list { flex: 1; overflow-y: auto; padding: 6px 0; }
            #pt-file-list::-webkit-scrollbar { width: 4px; }
            #pt-file-list::-webkit-scrollbar-thumb { background: #222; }
            .pt-file-item {
                padding: 9px 18px; font-size: 16px; color: #555;
                cursor: pointer; transition: all 0.12s;
                border-left: 3px solid transparent;
                display: flex; justify-content: space-between; align-items: center;
                gap: 6px;
            }
            .pt-file-item:hover { color: #ccc; background: #141414; border-left-color: #333; }
            .pt-file-item.active { color: #0ff; background: #081818; border-left-color: #0ff; }
            .pt-file-name {
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
            }
            .pt-del-btn {
                background: transparent; border: none; color: #333;
                font-family: 'VT323'; font-size: 16px; cursor: pointer;
                padding: 0 2px; transition: color 0.12s; flex-shrink: 0;
            }
            .pt-del-btn:hover { color: #f44; }
            .pt-edit-btn {
                background: transparent; border: none; color: #333;
                font-family: 'VT323'; font-size: 16px; cursor: pointer;
                padding: 0 2px; transition: color 0.12s; flex-shrink: 0;
            }
            .pt-edit-btn:hover { color: #0ff; }
            #pt-empty-msg { padding: 20px 18px; font-size: 15px; color: #2a2a2a; }

            /* ── CENTER: 프리뷰 (듀얼 패널) ── */
            #pt-preview-panel {
                flex: 1; display: flex; flex-direction: column;
                padding: 20px; gap: 20px; border-right: 2px solid #1a1a1a;
                background: #080808; overflow-y: auto;
            }
            #pt-dual-preview {
                display: flex; align-items: center; justify-content: center;
                gap: 30px; width: 100%; height: 100%;
            }
            .pt-view-box {
                display: flex; flex-direction: column; align-items: center; gap: 12px;
            }
            .pt-view-label {
                font-size: 14px; color: #444; letter-spacing: 2px;
                background: #111; padding: 4px 12px; border-radius: 10px;
            }
            .pt-canvas-wrap {
                width: 300px; height: 300px;
                background: repeating-conic-gradient(#161616 0% 25%, #111 0% 50%) 0 0 / 16px 16px;
                display: flex; align-items: center; justify-content: center;
                border: 2px solid #1e1e1e; overflow: hidden;
                box-shadow: 0 0 20px rgba(0,0,0,0.5);
            }
            .pt-view-box canvas { image-rendering: pixelated; max-width: 300px; max-height: 300px; }
            .pt-view-info { font-size: 17px; color: #555; text-align: center; line-height: 1.4; }
            #pt-view-arrow { font-size: 30px; color: #222; }

            /* ── RIGHT: 컨트롤 ── */
            #pt-ctrl-panel {
                width: 270px; flex-shrink: 0;
                display: flex; flex-direction: column;
                padding: 28px 22px; gap: 16px; justify-content: center;
                background: #0d0d0d;
            }
            .pt-step-label {
                font-size: 14px; color: #3a3a3a; letter-spacing: 3px; margin-bottom: 6px;
            }
            .pt-btn {
                background: transparent; border: 2px solid #333; color: #777;
                padding: 11px 10px; font-family: 'VT323'; font-size: 21px;
                cursor: pointer; transition: all 0.15s; letter-spacing: 2px;
                width: 100%; text-align: center;
            }
            .pt-btn:hover:not(:disabled) { border-color: #fff; color: #fff; }
            .pt-btn.primary  { border-color: #0aa; color: #0cc; }
            .pt-btn.primary:hover:not(:disabled) { background: #0cc; color: #000; }
            .pt-btn.success  { border-color: #080; color: #0d0; }
            .pt-btn.success:hover:not(:disabled) { background: #0d0; color: #000; }
            .pt-btn:disabled { border-color: #1e1e1e; color: #2a2a2a; cursor: not-allowed; }
            #pt-filename-input {
                background: #080808; border: 2px solid #2a2a2a; color: #ccc;
                padding: 10px 12px; font-family: 'VT323'; font-size: 21px;
                width: 100%; box-sizing: border-box; letter-spacing: 1px;
            }
            #pt-filename-input:focus { outline: none; border-color: #0cc; color: #fff; }
            #pt-filename-input::placeholder { color: #2a2a2a; }
            #pt-sep { border: none; border-top: 1px solid #181818; margin: 4px 0; }
            #pt-status {
                font-size: 16px; min-height: 22px; text-align: center;
                color: #444; letter-spacing: 1px; line-height: 1.5;
            }
        </style>

        <div id="pt-container">
            <div id="pt-header">
                <h1>[ PIXEL TOOL ]</h1>
                <button id="pt-back-btn">&lt; BACK</button>
            </div>
            <div id="pt-body">

                <div id="pt-sidebar">
                    <div id="pt-sidebar-hd">
                        <span>ASSETS</span>
                        <button id="pt-refresh-btn" title="새로고침">↺</button>
                    </div>
                    <div id="pt-file-list">
                        <div id="pt-empty-msg">— EMPTY —</div>
                    </div>
                </div>

                <div id="pt-preview-panel">
                    <div id="pt-dual-preview">
                        <div class="pt-view-box">
                            <div class="pt-view-label">ORIGINAL PNG</div>
                            <div class="pt-canvas-wrap">
                                <canvas id="pt-orig-canvas" width="1" height="1"></canvas>
                            </div>
                            <div id="pt-orig-info" class="pt-view-info">—</div>
                        </div>
                        
                        <div id="pt-view-arrow">▶</div>

                        <div class="pt-view-box">
                            <div class="pt-view-label">PIXEL RESULT (JSON)</div>
                            <div class="pt-canvas-wrap">
                                <canvas id="pt-res-canvas" width="1" height="1"></canvas>
                            </div>
                            <div id="pt-res-info" class="pt-view-info">—</div>
                        </div>
                    </div>
                </div>

                <div id="pt-ctrl-panel">
                    <div>
                        <div class="pt-step-label">STEP 1 — SOURCE</div>
                        <input type="file" id="pt-file-input" accept="image/png" style="display:none">
                        <button class="pt-btn primary" id="pt-load-btn">▶ LOAD PNG</button>
                    </div>

                    <hr id="pt-sep">

                    <div>
                        <div class="pt-step-label">STEP 2 — FILENAME</div>
                        <input type="text" id="pt-filename-input" placeholder="sprite_name" maxlength="64" autocomplete="off" />
                    </div>

                    <div>
                        <div class="pt-step-label">STEP 3 — EXPORT</div>
                        <button class="pt-btn success" id="pt-save-btn" disabled>✦ CONVERT &amp; SAVE</button>
                    </div>

                    <div id="pt-status">PNG 파일을 불러오세요.</div>
                </div>

            </div>
        </div>`;
    }

    bindEvents() {
        document.getElementById('pt-back-btn').onclick   = () => this.exit();
        document.getElementById('pt-load-btn').onclick   = () => document.getElementById('pt-file-input').click();
        document.getElementById('pt-file-input').onchange = (e) => this.loadPNG(e);
        document.getElementById('pt-save-btn').onclick   = () => this.convertAndSave();
        document.getElementById('pt-refresh-btn').onclick = () => this.refreshFileList();
    }

    // ── PNG 불러오기 ────────────────────────────────────────────────
    loadPNG(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        this.setStatus('로딩 중...', '#666');

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                this.loadedImage = img;
                this.renderImagePreview(img);
                const name = file.name.replace(/\.png$/i, '');
                document.getElementById('pt-filename-input').value = name;
                document.getElementById('pt-save-btn').disabled = false;
                this.setStatus('변환 준비 완료.', '#0d0');
            };
            img.onerror = () => this.setStatus('이미지 로드 실패.', '#f44');
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ── 이미지(PNG) → 캔버스 프리뷰 ────────────────────────────────
    renderImagePreview(img) {
        const canvas = document.getElementById('pt-orig-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width  = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);

        const raw = ctx.getImageData(0, 0, img.width, img.height).data;
        let count = 0;
        for (let i = 3; i < raw.length; i += 4) { if (raw[i] > 10) count++; }

        document.getElementById('pt-orig-info').innerHTML = `PNG: ${img.width} × ${img.height}<br>Pixels: ${count.toLocaleString()}`;
        
        // 결과창 초기화
        const resCanvas = document.getElementById('pt-res-canvas');
        resCanvas.width = 1; resCanvas.height = 1;
        document.getElementById('pt-res-info').textContent = '—';
    }

    // ── 저장된 JSON → 캔버스 프리뷰 ────────────────────────────────
    renderJSONPreview(data) {
        const canvas = document.getElementById('pt-res-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width  = data.width;
        canvas.height = data.height;
        ctx.clearRect(0, 0, data.width, data.height);

        for (const [x, y, color] of data.pixels) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
        document.getElementById('pt-res-info').innerHTML = `JSON: ${data.width} × ${data.height}<br>Pixels: ${data.pixels.length.toLocaleString()}`;
    }

    // ── 변환 & 저장 ────────────────────────────────────────────────
    async convertAndSave() {
        if (!this.loadedImage) return;

        const filename = document.getElementById('pt-filename-input').value.trim();
        if (!filename) {
            this.setStatus('파일명을 입력해주세요.', '#f84');
            return;
        }

        this.setStatus('변환 중...', '#888');
        document.getElementById('pt-save-btn').disabled = true;

        // PNG → pixel array
        const img = this.loadedImage;
        const off = document.createElement('canvas');
        off.width  = img.width;
        off.height = img.height;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0);
        const raw = octx.getImageData(0, 0, img.width, img.height).data;

        const pixels = [];
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const i = (y * img.width + x) * 4;
                if (raw[i + 3] > 10) {
                    const hex = '#' +
                        raw[i    ].toString(16).padStart(2, '0') +
                        raw[i + 1].toString(16).padStart(2, '0') +
                        raw[i + 2].toString(16).padStart(2, '0');
                    pixels.push([x, y, hex]);
                }
            }
        }

        const pixelJSON = { width: img.width, height: img.height, pixels };
        const content   = JSON.stringify(pixelJSON);
        const payload   = JSON.stringify({ filename, content });

        console.log("Sending payload size:", (payload.length / 1024).toFixed(2), "KB");

        try {
            const res = await fetch('/api/save-pixelart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            const result = await res.json();

            if (result.success) {
                this.setStatus(`저장 완료 → ${result.filename}`, '#0d0');
                await this.refreshFileList();
                this.highlightFile(result.filename);
            } else {
                this.setStatus('저장 실패.', '#f44');
                console.error("Save failed server-side:", result);
            }
        } catch (err) {
            this.setStatus('서버 오류: ' + err.message, '#f44');
            console.error("Fetch error details:", err);
        }

        document.getElementById('pt-save-btn').disabled = false;
    }

    // ── 파일 목록 갱신 ─────────────────────────────────────────────
    async refreshFileList() {
        try {
            const res   = await fetch('/api/list-pixelart');
            const files = await res.json();
            this.renderFileList(Array.isArray(files) ? files : []);
        } catch {
            /* 서버가 아직 v3 아닐 경우 무시 */
        }
    }

    renderFileList(files) {
        const list = document.getElementById('pt-file-list');
        if (!files.length) {
            list.innerHTML = '<div id="pt-empty-msg">— EMPTY —</div>';
            return;
        }
        list.innerHTML = files.map(f => `
            <div class="pt-file-item" data-file="${f}">
                <span class="pt-file-name" title="${f}">▸ ${f}</span>
                <div style="display:flex; gap:4px;">
                    <button class="pt-edit-btn" data-edit="${f}" title="이름 변경">✎</button>
                    <button class="pt-del-btn" data-del="${f}" title="삭제">✕</button>
                </div>
            </div>`
        ).join('');

        list.querySelectorAll('.pt-file-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.dataset.del || e.target.dataset.edit) return;
                this.loadSavedFile(el.dataset.file);
            };
        });
        list.querySelectorAll('.pt-edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.renameFile(btn.dataset.edit);
            };
        });
        list.querySelectorAll('.pt-del-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.del);
            };
        });
    }

    highlightFile(filename) {
        document.querySelectorAll('.pt-file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.file === filename);
        });
    }

    // ── 이름 변경 ──────────────────────────────────────────────────
    async renameFile(oldName) {
        const pureName = oldName.replace(/\.json$/i, '');
        const newName = prompt(`"${oldName}"의 새로운 이름을 입력하세요:`, pureName);
        
        if (!newName || newName === pureName) return;

        try {
            const res = await fetch('/api/rename-pixelart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName, newName })
            });
            const result = await res.json();
            if (result.success) {
                this.setStatus('이름 변경 완료.', '#0d0');
                await this.refreshFileList();
                this.highlightFile(result.newName);
            } else {
                this.setStatus('변경 실패: ' + (result.error || 'unknown'), '#f44');
            }
        } catch (err) {
            this.setStatus('서버 오류.', '#f44');
        }
    }

    // ── 저장된 파일 불러오기 (프리뷰) ──────────────────────────────
    async loadSavedFile(filename) {
        this.highlightFile(filename);
        this.setStatus('로딩...', '#666');
        try {
            const res  = await fetch(`/assets/pixelart/${filename}`);
            const data = await res.json();
            this.loadedImage = null;
            document.getElementById('pt-filename-input').value = filename.replace(/\.json$/i, '');
            document.getElementById('pt-save-btn').disabled = true;
            this.renderJSONPreview(data);
            this.setStatus(`${filename}`, '#0aa');
        } catch {
            this.setStatus('파일 로드 실패.', '#f44');
        }
    }

    // ── 파일 삭제 ──────────────────────────────────────────────────
    async deleteFile(filename) {
        if (!confirm(`"${filename}" 을 삭제할까요?`)) return;
        try {
            const res    = await fetch(`/api/delete-pixelart/${filename}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                this.setStatus(`${filename} 삭제됨.`, '#888');
                // 삭제된 파일이 프리뷰 중이면 초기화
                const canvas = document.getElementById('pt-res-canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 1; canvas.height = 1;
                document.getElementById('pt-res-info').textContent = '—';
                await this.refreshFileList();
            }
        } catch {
            this.setStatus('삭제 실패.', '#f44');
        }
    }

    setStatus(msg, color = '#444') {
        const el = document.getElementById('pt-status');
        if (el) { el.textContent = msg; el.style.color = color; }
    }

    exit() {
        this.isActive = false;
        this.loadedImage = null;
        document.getElementById('ui-layer').innerHTML = '';
        this.gm.changeScene('ChapterScene', 1);
    }
}
