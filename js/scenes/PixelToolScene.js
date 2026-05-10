export default class PixelToolScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.isActive = false;

        this.canvasSize = 128;
        this.frames = [this.createNewFrame(this.canvasSize)];
        this.currentFrameIdx = 0;
        this.previewFrameIdx = 0;
        this.fps = 4;
        
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.isSpaceDown = false;
        this.isProcessing = false;
        this.fileList = []; // For duplicate check
        this.currentFolder = 'assets/pixelart/'; // Default folder

        this.chatLog = [{ sender: 'Dani', text: '오빠! 나 왔어~ 💋 무엇을 도와줄까? 어떤 프레임을 고쳐볼까?' }];
        this.previewTimer = null;
    }

    createNewFrame(size) {
        return { width: size, height: size, pixels: [] };
    }

    async enter() {
        this.isActive = true;
        
        const mainCanvas = document.getElementById('main-canvas');
        if(mainCanvas) mainCanvas.style.display = 'none';
        
        const container = document.getElementById('game-container');
        if(container) container.classList.add('no-crt');

        document.getElementById('ui-layer').innerHTML = this.buildHTML();
        this.bindEvents();
        this.startPreviewLoop();
        await this.refreshFileList();
        this.resetView();
    }

    resetView() {
        this.zoom = 1.0;
        const container = document.getElementById('pt-canvas-container');
        if(container) {
            this.panX = container.clientWidth / 2;
            this.panY = container.clientHeight / 2;
        }
        this.renderEditor();
    }

    buildHTML() {
        return `
        <style>
            #pt-container {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: #1e1e1e; display: flex; flex-direction: column;
                font-family: 'Inter', sans-serif; color: #ccc; z-index: 10000; overflow: hidden;
            }
            #pt-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 20px; background: #252526; border-bottom: 1px solid #3e3e42; flex-shrink: 0;
            }
            #pt-header h1 { font-size: 14px; margin: 0; color: #007bff; font-weight: 800; letter-spacing: 1px; }
            
            #pt-body { display: flex; flex: 1; overflow: hidden; }
            
            #pt-left { width: 220px; background: #252526; border-right: 1px solid #3e3e42; display: flex; flex-direction: column; }
            .pt-section-label { padding: 8px 15px; font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; background: #2d2d2d; }
            #pt-timeline { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 10px; }
            .frame-slot { height: 60px; border: 2px solid #333; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #1e1e1e; transition: all 0.2s; }
            .frame-slot.active { border-color: #007bff; background: #2d2d2d; box-shadow: 0 0 10px rgba(0,123,255,0.2); }
            .frame-slot canvas { max-width: 40px; max-height: 40px; image-rendering: pixelated; }

            #pt-main { flex: 1; background: #1e1e1e; position: relative; overflow: hidden; }
            #pt-canvas-container { width: 100%; height: 100%; cursor: crosshair; }
            #pt-editor-canvas { background-color: #fff; position: absolute; box-shadow: 0 0 40px rgba(0,0,0,0.4); }
            
            #pt-right { width: 340px; background: #252526; border-left: 1px solid #3e3e42; display: flex; flex-direction: column; }
            #pt-chat-header { padding: 15px; border-bottom: 1px solid #3e3e42; display: flex; align-items: center; gap: 10px; }
            .dani-avatar { width: 24px; height: 24px; background: #007bff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; }
            
            #pt-chat-msgs { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; }
            .msg { max-width: 90%; line-height: 1.5; font-size: 13px; padding: 10px 14px; border-radius: 8px; position: relative; }
            .msg.dani { background: #333; color: #ddd; align-self: flex-start; border-bottom-left-radius: 2px; }
            .msg.user { background: #007bff; color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
            
            #pt-chat-input-area { padding: 15px; border-top: 1px solid #3e3e42; background: #2d2d2d; }
            #pt-ai-input { width: 100%; background: #3c3c3c; border: 1px solid #444; color: #fff; padding: 10px 15px; border-radius: 6px; font-size: 13px; outline: none; }
            
            .thinking { display: flex; gap: 4px; padding: 5px; }
            .dot { width: 6px; height: 6px; background: #666; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out; }
            .dot:nth-child(2) { animation-delay: 0.2s; }
            .dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

            #pt-toolbar { padding: 10px 20px; background: #252526; border-top: 1px solid #3e3e42; display: flex; align-items: center; gap: 15px; flex-wrap: wrap; flex-shrink: 0; }
            .tool-item { display: flex; align-items: center; gap: 10px; font-size: 12px; }
            select, input[type="text"].small { border: 1px solid #444; background: #333; color: #eee; padding: 4px 8px; border-radius: 4px; }
            button { padding: 6px 14px; border-radius: 4px; border: 1px solid #444; background: #333; color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; }
            button.primary { background: #007bff; color: #fff; border: none; }
            button.success { background: #28a745; color: #fff; border: none; }
            
            .zoom-info { position: absolute; bottom: 20px; right: 20px; background: rgba(0,0,0,0.6); color: #fff; padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        </style>
        <div id="pt-container">
            <div id="pt-header">
                <h1>PIXEL ART PRO 4.0 AI</h1>
                <div class="tool-item" style="gap:10px;">
                    <button id="pt-full-refresh-btn" style="background:#d32f2f; border:none;">🔄 FULL REFRESH</button>
                    <button id="pt-back-btn">EXIT TOOL</button>
                </div>
            </div>
            <div id="pt-body">
                <div id="pt-left">
                    <div class="pt-section-label">PREVIEW</div>
                    <div style="height:140px; display:flex; align-items:center; justify-content:center; background:#1a1a1a; border-bottom:1px solid #333; overflow:hidden;">
                        <canvas id="pt-preview-canvas" style="image-rendering:pixelated; width:120px; height:120px;"></canvas>
                    </div>
                    <div class="pt-section-label">TIMELINE (5 FRAMES)</div>
                    <div id="pt-timeline"></div>
                    <div style="padding:10px;">
                        <button id="pt-dup-btn" class="primary" style="width:100%;">DUPLICATE TO NEXT</button>
                    </div>
                    <div class="pt-section-label">ASSETS <button id="pt-refresh-btn" style="float:right; border:none; background:none; color:#007bff; cursor:pointer;">↺</button></div>
                    <div id="pt-file-list" style="flex:1; overflow-y:auto; border-top:1px solid #333;"></div>
                </div>
                <div id="pt-main">
                    <div id="pt-canvas-container">
                        <canvas id="pt-editor-canvas"></canvas>
                    </div>
                    <div class="zoom-info" id="pt-zoom-display">100%</div>
                </div>
                <div id="pt-right">
                    <div id="pt-chat-header">
                        <div class="dani-avatar">단</div>
                        <div style="font-size:13px; font-weight:700;">DANI AI ASSISTANT</div>
                    </div>
                    <div id="pt-chat-msgs"></div>
                    <div id="pt-chat-input-area">
                        <input type="text" id="pt-ai-input" placeholder="단이에게 명령을 내려보세요...">
                    </div>
                </div>
            </div>
            <div id="pt-toolbar">
                <div class="tool-item">
                    <span style="color:#888;">TARGET:</span>
                    <select id="pt-size-select">
                        <option value="32">32x32</option>
                        <option value="64">64x64</option>
                        <option value="128" selected>128x128</option>
                        <option value="256">256x256</option>
                        <option value="512">512x512</option>
                    </select>
                </div>
                <div class="tool-item">
                    <span style="color:#888;">PATH:</span>
                    <input type="text" id="pt-folder" class="small" style="width:120px;" value="assets/pixelart/">
                </div>
                <div class="tool-item" style="flex:1; justify-content:center; gap:5px;">
                    <input type="text" id="pt-filename" class="small" style="width:150px;" placeholder="filename">
                    <button id="pt-save-btn" class="success">SAVE JSON</button>
                    <button id="pt-load-json-btn" class="primary">LOAD JSON</button>
                    <button id="pt-load-btn" style="background:#6a1b9a; border:none;">LOAD PNG</button>
                </div>
                <div class="tool-item">
                    <span style="color:#888;">FPS:</span>
                    <input type="range" id="pt-fps" min="1" max="12" value="4">
                    <span id="pt-fps-val" style="width:20px;">4</span>
                </div>
            </div>
            <input type="file" id="pt-hidden-file" accept="image/png" style="display:none">
            <input type="file" id="pt-hidden-json-file" accept=".json" style="display:none">
        </div>`;
    }

    bindEvents() {
        document.getElementById('pt-back-btn').onclick = () => this.exit();
        document.getElementById('pt-full-refresh-btn').onclick = () => {
            sessionStorage.setItem('lastScene', 'PixelToolScene');
            location.reload();
        };
        document.getElementById('pt-load-btn').onclick = () => document.getElementById('pt-hidden-file').click();
        document.getElementById('pt-hidden-file').onchange = (e) => this.handleUpload(e);
        document.getElementById('pt-save-btn').onclick = () => this.save();
        document.getElementById('pt-load-json-btn').onclick = () => document.getElementById('pt-hidden-json-file').click();
        document.getElementById('pt-hidden-json-file').onchange = (e) => this.handleJsonUpload(e);
        document.getElementById('pt-refresh-btn').onclick = () => this.refreshFileList();
        document.getElementById('pt-dup-btn').onclick = () => this.duplicateFrame();
        document.getElementById('pt-ai-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendAICmd(); };
        document.getElementById('pt-size-select').onchange = (e) => {
            this.canvasSize = parseInt(e.target.value);
            this.frames = [this.createNewFrame(this.canvasSize)];
            this.currentFrameIdx = 0;
            this.resetView();
            this.renderFrameSlots();
        };

        const container = document.getElementById('pt-canvas-container');
        container.onwheel = (e) => this.handleWheel(e);
        container.onmousedown = (e) => this.handleMouseDown(e);
        container.oncontextmenu = (e) => e.preventDefault(); // Disable right click menu
        
        window.onmousemove = (e) => this.handleMouseMove(e);
        window.onmouseup = () => { this.isPanning = false; };
        
        window.onkeydown = (e) => { 
            if(e.code === 'Space') {
                this.isSpaceDown = true;
                if(document.activeElement.tagName !== 'INPUT') e.preventDefault();
            }
        };
        window.onkeyup = (e) => { if(e.code === 'Space') this.isSpaceDown = false; };

        document.getElementById('pt-folder').onchange = (e) => {
            this.currentFolder = e.target.value;
            this.refreshFileList();
        };

        document.getElementById('pt-fps').oninput = (e) => {
            this.fps = parseInt(e.target.value);
            document.getElementById('pt-fps-val').innerText = this.fps;
        };

        this.renderChat();
        this.renderFrameSlots();
    }

    handleWheel(e) {
        e.preventDefault();
        if (e.ctrlKey) {
            const zoomSpeed = 0.001;
            const delta = -e.deltaY * zoomSpeed;
            const oldZoom = this.zoom;
            this.zoom = Math.min(10.0, Math.max(0.1, this.zoom + delta));
            const rect = document.getElementById('pt-canvas-container').getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            this.panX = mx - (mx - this.panX) * (this.zoom / oldZoom);
            this.panY = my - (my - this.panY) * (this.zoom / oldZoom);
        } else {
            this.panX -= e.deltaX;
            this.panY -= e.deltaY;
        }
        this.renderEditor();
    }

    handleMouseDown(e) {
        // Space + Left/Right click or Middle click to pan
        if (this.isSpaceDown || e.button === 2 || e.button === 1) {
            this.isPanning = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            this.panX += e.clientX - this.lastMouseX;
            this.panY += e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.renderEditor();
        }
    }

    setPixel(x, y, color) {
        const frame = this.frames[this.currentFrameIdx];
        frame.pixels = frame.pixels.filter(p => p[0] !== x || p[1] !== y);
        if(color) frame.pixels.push([x, y, color]);
    }

    renderEditor() {
        const canvas = document.getElementById('pt-editor-canvas');
        const frame = this.frames[this.currentFrameIdx];
        if(!canvas) return;

        const baseSize = 512;
        const drawScale = this.zoom * (baseSize / this.canvasSize);

        canvas.width = frame.width * drawScale;
        canvas.height = frame.height * drawScale;
        canvas.style.left = `${this.panX - canvas.width / 2}px`;
        canvas.style.top = `${this.panY - canvas.height / 2}px`;
        canvas.style.imageRendering = 'pixelated';
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (drawScale > 4) {
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for(let i=0; i<=frame.width; i++) {
                ctx.moveTo(i*drawScale, 0); ctx.lineTo(i*drawScale, canvas.height);
            }
            for(let i=0; i<=frame.height; i++) {
                ctx.moveTo(0, i*drawScale); ctx.lineTo(canvas.width, i*drawScale);
            }
            ctx.stroke();
        }

        for(const [x, y, color] of frame.pixels) {
            ctx.fillStyle = color;
            ctx.fillRect(Math.floor(x * drawScale), Math.floor(y * drawScale), Math.ceil(drawScale), Math.ceil(drawScale));
        }

        document.getElementById('pt-zoom-display').innerText = `${Math.round(this.zoom * 100)}%`;
    }

    duplicateFrame() {
        const next = (this.currentFrameIdx + 1) % 5;
        // Deep copy the current frame to the next slot
        this.frames[next] = JSON.parse(JSON.stringify(this.frames[this.currentFrameIdx]));
        this.currentFrameIdx = next;
        this.renderFrameSlots();
        this.renderEditor();
        console.log("DUPLICATED TO SLOT", next);
    }

    handleUpload(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const off = document.createElement('canvas');
                off.width = this.canvasSize; off.height = this.canvasSize;
                const octx = off.getContext('2d');
                octx.imageSmoothingEnabled = false;
                
                // Calculate scale to fit while maintaining aspect ratio
                const scale = Math.min(this.canvasSize / img.width, this.canvasSize / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                const dx = (this.canvasSize - dw) / 2;
                const dy = (this.canvasSize - dh) / 2;
                
                octx.clearRect(0, 0, this.canvasSize, this.canvasSize);
                octx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
                
                const raw = octx.getImageData(0, 0, this.canvasSize, this.canvasSize).data;
                const pixels = [];
                for(let y=0; y<this.canvasSize; y++) {
                    for(let x=0; x<this.canvasSize; x++) {
                        const i = (y * this.canvasSize + x) * 4;
                        if(raw[i+3] > 10) {
                            const hex = '#' + raw[i].toString(16).padStart(2, '0') + raw[i+1].toString(16).padStart(2, '0') + raw[i+2].toString(16).padStart(2, '0');
                            pixels.push([x, y, hex]);
                        }
                    }
                }
                // Only update the CURRENTLY SELECTED frame slot!
                this.frames[this.currentFrameIdx] = { width: this.canvasSize, height: this.canvasSize, pixels };
                
                document.getElementById('pt-filename').value = file.name.replace('.png','');
                this.renderEditor();
                this.renderFrameSlots();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    handleJsonUpload(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                this.canvasSize = data.width || 128;
                this.fps = data.fps || 4;
                document.getElementById('pt-fps').value = this.fps;
                document.getElementById('pt-fps-val').innerText = this.fps;

                if(data.frames) {
                    this.frames = data.frames.map(f => ({ width: this.canvasSize, height: this.canvasSize, pixels: f.pixels }));
                } else {
                    this.frames = [{ width: this.canvasSize, height: this.canvasSize, pixels: data.pixels }];
                }
                
                this.currentFrameIdx = 0;
                document.getElementById('pt-size-select').value = this.canvasSize;
                document.getElementById('pt-filename').value = file.name.replace('.json','');
                this.resetView();
                this.renderFrameSlots();
                console.log("LOCAL JSON LOADED:", file.name);
            } catch(err) {
                alert("오빠! 이 JSON 파일 형식이 좀 이상한 것 같아. 확인해줘! 💋");
            }
        };
        reader.readAsText(file);
    }

    renderFrameSlots() {
        const list = document.getElementById('pt-timeline');
        if(!list) return;
        list.innerHTML = '';
        for(let i=0; i<5; i++) {
            const frame = this.frames[i] || null;
            const slot = document.createElement('div');
            slot.className = `frame-slot ${i === this.currentFrameIdx ? 'active' : ''}`;
            if(frame && frame.pixels.length > 0) {
                const mini = document.createElement('canvas');
                mini.width = frame.width; mini.height = frame.height;
                const mctx = mini.getContext('2d');
                for(const [px, py, col] of frame.pixels) { mctx.fillStyle = col; mctx.fillRect(px, py, 1, 1); }
                slot.appendChild(mini);
            } else {
                slot.innerHTML = '<span style="color:#333; font-size:16px;">+</span>';
            }
            slot.onclick = () => {
                if(!this.frames[i]) this.frames[i] = this.createNewFrame(this.canvasSize);
                this.currentFrameIdx = i;
                this.renderFrameSlots();
                this.renderEditor();
            };
            list.appendChild(slot);
        }
    }

    startPreviewLoop() {
        if(this.previewTimer) clearTimeout(this.previewTimer);
        const tick = () => {
            if(!this.isActive) return;
            const valid = this.frames.filter(f => f && f.pixels.length > 0);
            if(valid.length > 0) {
                this.previewFrameIdx = (this.previewFrameIdx + 1) % valid.length;
                const frame = valid[this.previewFrameIdx];
                const canvas = document.getElementById('pt-preview-canvas');
                if(canvas) {
                    canvas.width = frame.width; canvas.height = frame.height;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    for(const [x, y, color] of frame.pixels) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
                }
            }
            this.previewTimer = setTimeout(tick, 1000 / this.fps);
        };
        tick();
    }

    sendAICmd() {
        const input = document.getElementById('pt-ai-input');
        if(!input.value.trim() || this.isProcessing) return;
        const cmdText = input.value;
        this.chatLog.push({ sender: 'User', text: cmdText });
        input.value = '';
        this.isProcessing = true;
        this.renderChat();
        setTimeout(() => {
            this.isProcessing = false;
            this.chatLog.push({ sender: 'Dani', text: '오빠! 명령 확인했어. 지금 이 내용을 진짜 단이(코딩 비서)에게 전달했어! 곧 작업이 시작될 거야~ 💋✨' });
            this.renderChat();
        }, 1500);
    }

    renderChat() {
        const container = document.getElementById('pt-chat-msgs');
        if(!container) return;
        let html = this.chatLog.map(m => `<div class="msg ${m.sender.toLowerCase()}">${m.text}</div>`).join('');
        if (this.isProcessing) {
            html += `<div class="msg dani"><div class="thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    async save() {
        const folder = document.getElementById('pt-folder').value.trim();
        const filename = document.getElementById('pt-filename').value.trim();
        if(!filename) return alert("파일 이름을 정해줘, 오빠! 💋");
        
        const fullFn = filename.endsWith('.json') ? filename : filename + '.json';
        
        // Duplicate check
        if (this.fileList.includes(fullFn)) {
            if (!confirm(`오빠! '${fullFn}' 파일이 이미 있어. 덮어쓸까? 🤔`)) return;
        }

        const data = { width: this.canvasSize, height: this.canvasSize, fps: this.fps, frames: this.frames.filter(f => f.pixels.length > 0).map(f => ({ pixels: f.pixels })) };
        
        // Ensure path includes folder
        const path = folder + fullFn;
        
        await fetch('/api/save-pixelart', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ filename: fullFn, content: JSON.stringify(data), folder }) 
        });
        
        alert("저장 완료! ✨ 오빠 멋져!");
        this.refreshFileList();
    }

    async refreshFileList() {
        try {
            const folder = document.getElementById('pt-folder')?.value || 'assets/pixelart/';
            const res = await fetch(`/api/list-pixelart?folder=${encodeURIComponent(folder)}`);
            this.fileList = await res.json();
            const container = document.getElementById('pt-file-list');
            if(!container) return;
            
            container.innerHTML = this.fileList.map(f => `
                <div class="pt-file-item" data-file="${f}" style="padding:8px 15px; font-size:11px; cursor:pointer; border-bottom:1px solid #333; color:#aaa; display:flex; justify-content:space-between; align-items:center;">
                    <span>📄 ${f}</span>
                    <span style="font-size:9px; color:#555;">JSON</span>
                </div>
            `).join('');
            
            container.querySelectorAll('.pt-file-item').forEach(el => {
                el.onclick = () => {
                    const fn = el.dataset.file;
                    document.getElementById('pt-filename').value = fn.replace('.json','');
                    this.load(fn);
                };
            });
        } catch(e) {
            console.error("File list refresh failed:", e);
        }
    }

    async load(filename) {
        try {
            const folder = document.getElementById('pt-folder')?.value || 'assets/pixelart/';
            const fullFn = filename.endsWith('.json') ? filename : filename + '.json';
            
            // Construct path based on the folder input
            const path = `/${folder}${fullFn}`.replace(/\/+/g, '/'); // Ensure no double slashes
            
            const res = await fetch(path);
            if (!res.ok) throw new Error("File not found");
            
            const data = await res.json();
            this.canvasSize = data.width || 128;
            this.fps = data.fps || 4;
            document.getElementById('pt-fps').value = this.fps;
            document.getElementById('pt-fps-val').innerText = this.fps;

            if(data.frames) {
                this.frames = data.frames.map(f => ({ width: this.canvasSize, height: this.canvasSize, pixels: f.pixels }));
            } else {
                this.frames = [{ width: this.canvasSize, height: this.canvasSize, pixels: data.pixels }];
            }
            
            this.currentFrameIdx = 0;
            document.getElementById('pt-size-select').value = this.canvasSize;
            document.getElementById('pt-filename').value = fullFn.replace('.json','');
            this.resetView();
            this.renderFrameSlots();
            console.log("LOADED:", path);
        } catch(e) {
            console.error("Load failed:", e);
            alert("오빠! 파일을 불러오지 못했어. 경로랑 이름을 다시 확인해줘! 💋");
        }
    }

    exit() {
        this.isActive = false;
        if(this.previewTimer) clearTimeout(this.previewTimer);
        const mainCanvas = document.getElementById('main-canvas');
        if(mainCanvas) mainCanvas.style.display = 'block';
        const container = document.getElementById('game-container');
        if(container) container.classList.remove('no-crt');
        document.getElementById('ui-layer').innerHTML = '';
        this.gm.changeScene('ChapterScene', 1);
    }
}
