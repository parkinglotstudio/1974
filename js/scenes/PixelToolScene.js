import ChapterScene from './ChapterScene.js';

export default class PixelToolScene {
    constructor(gm) {
        this.gm = gm;
        this.isActive = false;
        this.canvasSize = 128;
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.currentFrameIdx = 0;
        this.frames = [{ width: 128, height: 128, pixels: [] }];
        this.isPlaying = false;
        this.fps = 4;
        this.chatLog = [{ sender: 'Dani', text: "오빠! 단이가 이제 도화지를 '강제로' 화면에 고정했어! 💋 이번엔 절대 못 도망가!" }];
    }

    createNewFrame(size) {
        return { width: size, height: size, pixels: [] };
    }

    async enter() {
        this.isActive = true;
        window.antigravity = { scene: this }; 
        
        // Nuclear option: Hide Phaser canvas
        const mc = document.getElementById('main-canvas');
        if(mc) mc.style.visibility = 'hidden';
        
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.innerHTML = this.buildHTML();
        this.bindEvents();
        this.renderAll();
    }

    buildHTML() {
        return `
        <style>
            #pt-root {
                position: fixed; inset: 0; background: #000; color: #eee;
                display: flex; flex-direction: column; z-index: 999999; font-family: sans-serif;
            }
            #pt-header { height: 50px; background: #222; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 2px solid #007bff; }
            
            /* The Core Layout Fix: GRID */
            #pt-main { 
                flex: 1; display: grid; grid-template-columns: 260px 1fr 340px; overflow: hidden; background: #111; 
            }
            
            .pt-col { height: 100%; display: flex; flex-direction: column; border-right: 1px solid #333; overflow: hidden; }
            .pt-col-right { border-right: none; border-left: 1px solid #333; }
            
            .pt-label { background: #252526; padding: 10px; font-size: 11px; font-weight: bold; color: #888; }
            
            #pt-timeline { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
            .frame-slot { 
                width: 100%; height: 120px; border: 2px solid #333; border-radius: 6px; 
                background: #1a1a1a; cursor: pointer; position: relative; display: flex; align-items: center; justify-content: center;
            }
            .frame-slot.active { border-color: #007bff; background: #222; }
            .frame-slot canvas { width: 100px; height: 100px; image-rendering: pixelated; background: #fff; }
            
            /* Workspace Fix */
            #pt-workspace { 
                height: 100%; background: #121212 !important; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;
            }
            #pt-editor-canvas { 
                background: #fff; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); 
                box-shadow: 0 0 40px #000; image-rendering: pixelated; outline: 2px solid #007bff;
            }
            
            #pt-play-ui {
                position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.8); padding: 12px 24px; border-radius: 40px; display: flex; gap: 15px; border: 1px solid #007bff;
            }
            .ui-btn { width: 40px; height: 40px; border-radius: 50%; border: none; color: white; cursor: pointer; font-weight: bold; }

            #pt-asset-browser { height: 400px; overflow-y: auto; background: #1a1a1a; border-bottom: 1px solid #333; padding: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
            .asset-item { background: #252526; border: 1px solid #333; border-radius: 4px; padding: 4px; cursor: pointer; text-align: center; }
            .asset-item:hover { border-color: #007bff; background: #2d2d2d; }
            .asset-item canvas { width: 100%; height: 60px; image-rendering: pixelated; background: #fff; border-radius: 2px; }
            .asset-item { position: relative; border: 1px solid #333; transition: all 0.2s; }
            .asset-item.selected { border-color: #007bff; box-shadow: inset 0 0 10px rgba(0,123,255,0.3); background: #2d2d2d; }
            .play-mark { position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: #28a745; font-size: 10px; padding: 2px 4px; border-radius: 3px; pointer-events: none; }
            .asset-item span { font-size: 9px; color: #888; display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            #pt-chat-area { flex: 1; overflow-y: auto; padding: 15px; font-size: 13px; display: flex; flex-direction: column; gap: 10px; background: #121212; }
            .msg { padding: 8px 12px; border-radius: 6px; max-width: 85%; }
            .msg.dani { background: #333; align-self: flex-start; }
            .msg.user { background: #007bff; align-self: flex-end; }
            
            #pt-footer { height: 50px; background: #222; display: flex; align-items: center; padding: 0 20px; gap: 15px; border-top: 1px solid #333; }
            .f-item { display: flex; align-items: center; gap: 5px; font-size: 12px; }
            input, select { background: #111; border: 1px solid #444; color: white; padding: 5px; border-radius: 3px; }
        </style>
        <div id="pt-root">
            <div id="pt-header">
                <div style="font-weight:bold; color:#007bff;">PIXEL ART PRO 6.0 (STABLE GRID)</div>
                <div style="display:flex; gap:10px;">
                    <button onclick="location.reload()" style="padding:6px 12px; background:#444; color:white; border:none; cursor:pointer; border-radius:4px;">REFRESH</button>
                    <button onclick="antigravity.scene.exit()" style="padding:6px 12px; background:#d33; color:white; border:none; cursor:pointer; border-radius:4px;">EXIT</button>
                </div>
            </div>
            <div id="pt-main">
                <div class="pt-col">
                    <div class="pt-label">TIMELINE</div>
                    <div id="pt-timeline"></div>
                    <div style="padding:10px;"><button id="btn-dup" style="width:100%; padding:10px; background:#007bff; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">+ DUPLICATE FRAME</button></div>
                </div>
                <div id="pt-workspace">
                    <canvas id="pt-editor-canvas"></canvas>
                    <div id="pt-play-ui">
                        <button id="btn-play" class="ui-btn" style="background:#28a745;">▶</button>
                        <button id="btn-stop" class="ui-btn" style="background:#dc3545;">■</button>
                    </div>
                </div>
                <div class="pt-col pt-col-right">
                    <div class="pt-label">ASSET EXPLORER</div>
                    <div style="padding:10px; background:#222; display:flex; gap:5px; border-bottom:1px solid #333;">
                        <input type="text" id="pt-asset-folder" style="flex:1;" value="assets/pixelart/">
                        <button id="btn-asset-refresh" style="background:#444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🔄</button>
                    </div>
                    <div id="pt-asset-browser"></div>
                    <div class="pt-label">AI DANI ASSISTANT</div>
                    <div id="pt-chat-area"></div>
                    <div style="padding:15px; background:#222;"><input type="text" id="ai-input" style="width:100%;" placeholder="단이에게 명령을 입력하세요..."></div>
                </div>
            </div>
            <div id="pt-footer">
                <div class="f-item">SIZE: <select id="sel-size"><option value="32">32x32</option><option value="64">64x64</option><option value="128" selected>128x128</option></select></div>
                <div class="f-item">FILE: <input type="text" id="inp-filename" style="width:120px;" placeholder="filename"></div>
                <button id="btn-save" style="padding:8px 15px; background:#28a745; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">SAVE</button>
                <button id="btn-load" style="padding:8px 15px; background:#007bff; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">LOAD JSON</button>
                <button id="btn-load-png" style="padding:8px 15px; background:#6a1b9a; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">LOAD PNG</button>
            </div>
            <input type="file" id="f-json" accept=".json" style="display:none">
            <input type="file" id="f-png" accept="image/png" style="display:none">
        </div>
        `;
    }

    bindEvents() {
        const get = (id) => document.getElementById(id);
        get('btn-save').onclick = () => this.save();
        get('btn-load').onclick = () => get('f-json').click();
        get('f-json').onchange = (e) => this.handleJson(e);
        get('btn-load-png').onclick = () => get('f-png').click();
        get('f-png').onchange = (e) => this.handlePng(e);
        get('btn-dup').onclick = () => { this.frames.splice(this.currentFrameIdx+1, 0, JSON.parse(JSON.stringify(this.frames[this.currentFrameIdx]))); this.currentFrameIdx++; this.renderAll(); };
        get('btn-play').onclick = () => this.play();
        get('btn-stop').onclick = () => this.stop();
        get('ai-input').onkeydown = (e) => { if(e.key === 'Enter') this.ai(e.target.value); };
        get('pt-asset-folder').onkeydown = (e) => { if(e.key === 'Enter') this.refreshAssetList(); };
        get('btn-asset-refresh').onclick = () => this.refreshAssetList();
        
        const ws = get('pt-workspace');
        ws.onmousedown = (e) => { if(e.button===0) this.paint(e); else { this.isPanning=true; this.lx=e.clientX; this.ly=e.clientY; } };
        ws.onmousemove = (e) => { if(this.isPanning) { this.panX += e.clientX-this.lx; this.panY += e.clientY-this.ly; this.lx=e.clientX; this.ly=e.clientY; this.renderEditor(); } else if(e.buttons===1) this.paint(e); };
        window.onmouseup = () => this.isPanning = false;
        ws.onwheel = (e) => { e.preventDefault(); this.zoom = Math.min(10, Math.max(0.1, this.zoom + (-e.deltaY*0.001))); this.renderEditor(); };
        
        this.renderChat();
        this.refreshAssetList();
    }

    paint(e) {
        const canvas = document.getElementById('pt-editor-canvas'); if(!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.canvasSize);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.canvasSize);
        if (x >= 0 && x < this.canvasSize && y >= 0 && y < this.canvasSize) {
            const f = this.frames[this.currentFrameIdx];
            f.pixels = f.pixels.filter(p => p[0] !== x || p[1] !== y);
            f.pixels.push([x, y, '#000000']);
            this.renderAll();
        }
    }

    renderEditor() {
        const canvas = document.getElementById('pt-editor-canvas'); if (!canvas) return;
        const size = 512 * this.zoom;
        canvas.width = this.canvasSize; canvas.height = this.canvasSize;
        canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
        canvas.style.left = `calc(50% + ${this.panX}px)`; canvas.style.top = `calc(50% + ${this.panY}px)`;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,this.canvasSize,this.canvasSize);
        for(const [x,y,col] of this.frames[this.currentFrameIdx].pixels) { ctx.fillStyle = col; ctx.fillRect(x,y,1,1); }
    }

    renderFrameSlots() {
        const list = document.getElementById('pt-timeline'); if(!list) return;
        list.innerHTML = '';
        this.frames.forEach((f, i) => {
            const slot = document.createElement('div'); slot.className = `frame-slot ${i === this.currentFrameIdx ? 'active' : ''}`;
            const mini = document.createElement('canvas'); mini.width = this.canvasSize; mini.height = this.canvasSize;
            const mctx = mini.getContext('2d'); mctx.fillStyle = '#fff'; mctx.fillRect(0,0,this.canvasSize,this.canvasSize);
            for(const [x,y,col] of f.pixels) { mctx.fillStyle = col; mctx.fillRect(x,y,1,1); }
            slot.appendChild(mini); slot.onclick = () => { this.currentFrameIdx = i; this.renderAll(); };
            list.appendChild(slot);
        });
    }

    renderAll() { this.renderEditor(); this.renderFrameSlots(); }

    play() {
        if(this.isPlaying) return; this.isPlaying = true; this.orig = this.currentFrameIdx; let p = 0;
        const tick = () => { if(!this.isPlaying || !this.isActive) return; this.currentFrameIdx = p; this.renderEditor(); p = (p+1)%this.frames.length; setTimeout(tick, 250); };
        tick();
    }
    stop() { 
        this.isPlaying = false; 
        if(this.orig !== undefined) this.currentFrameIdx = this.orig;
        this.orig = undefined;
        this.renderAll(); 
    }

    async save() {
        const fn = document.getElementById('inp-filename').value || 'art';
        const palMap = new Map(), pal = ['transparent'];
        const getIdx = (c) => { if(!palMap.has(c)) { palMap.set(c, pal.length); pal.push(c); } return palMap.get(c); };
        const data = { width: this.canvasSize, fps: 4, palette: pal, frames: this.frames.map(f => ({ pixels: f.pixels.map(p => [p[0], p[1], getIdx(p[2])]) })) };
        await fetch('/api/save-pixelart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: fn + '.json', content: JSON.stringify(data), folder: 'assets/pixelart/' }) });
        alert("저장 완료! 💋");
    }

    handleJson(e) {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = JSON.parse(ev.target.result); this.canvasSize = data.width || 128;
            const pal = data.palette || []; this.frames = (data.frames || []).map(f => ({ pixels: (f.pixels || []).map(p => [p[0], p[1], typeof p[2] === 'number' ? pal[p[2]] : p[2]]) }));
            this.currentFrameIdx = 0; this.renderAll();
        };
        reader.readAsText(file);
    }

    handlePng(e) {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const off = document.createElement('canvas'); off.width = this.canvasSize; off.height = this.canvasSize;
                const octx = off.getContext('2d'); octx.drawImage(img, 0, 0, this.canvasSize, this.canvasSize);
                const raw = octx.getImageData(0, 0, this.canvasSize, this.canvasSize).data, px = [];
                for(let y=0; y<this.canvasSize; y++) { for(let x=0; x<this.canvasSize; x++) { const i=(y*this.canvasSize+x)*4; if(raw[i+3]>10) px.push([x,y,'#'+raw[i].toString(16).padStart(2,'0')+raw[i+1].toString(16).padStart(2,'0')+raw[i+2].toString(16).padStart(2,'0')]); } }
                this.frames[this.currentFrameIdx].pixels = px; this.renderAll();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    ai(txt) {
        const msg = document.getElementById('pt-chat-area'); if(!msg) return;
        msg.innerHTML += `<div class="msg user">${txt}</div>`;
        setTimeout(() => {
            if(txt.includes('지워')) { this.frames[this.currentFrameIdx].pixels = []; this.renderAll(); }
            msg.innerHTML += `<div class="msg dani">오빠, 명령 완료! 💋</div>`;
            msg.scrollTop = msg.scrollHeight;
        }, 500);
        document.getElementById('ai-input').value = '';
    }

    renderChat() { document.getElementById('pt-chat-area').innerHTML = `<div class="msg dani">오빠, 단이가 진짜 마지막으로 도화지 꽉 잡아왔어! 💋</div>`; }

    async refreshAssetList() {
        const browser = document.getElementById('pt-asset-browser'); if(!browser) return;
        let folder = document.getElementById('pt-asset-folder').value.trim();
        if(folder && !folder.endsWith('/')) folder += '/';
        
        browser.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:20px;">단이가 열심히 찾는 중... 💋</div>';
        
        const tryFetch = async (f) => {
            const res = await fetch(`/api/list-pixelart?folder=${f}`);
            if(!res.ok) throw new Error(`Status: ${res.status}`);
            return await res.json();
        };

        try {
            let fileNames;
            try {
                fileNames = await tryFetch(folder);
            } catch(e) {
                if(folder.endsWith('/')) fileNames = await tryFetch(folder.slice(0, -1));
                else throw e;
            }
            
            browser.innerHTML = '';
            if(!fileNames || fileNames.length === 0) { 
                browser.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#888;">'${folder}'에 JSON 파일이 없어, 오빠... 😢</div>`; 
                return; 
            }

            for(const name of fileNames) {
                const item = document.createElement('div'); item.className = 'asset-item';
                item.innerHTML = `<span>${name}</span>`;
                const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
                item.prepend(canvas);
                const fullPath = folder.endsWith('/') ? `${folder}${name}` : `${folder}/${name}`;
                item.onclick = () => {
                    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                };
                browser.appendChild(item);
                this.renderThumbnail(fullPath, canvas, item);
            }
        } catch(e) { 
            browser.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#d33;">
                폴더를 못 찾겠어, 오빠! 😭<br>
                <span style="font-size:10px; color:#666;">(${e.message})</span><br>
                경로가 맞는지 다시 확인해줘!
            </div>`; 
        }
    }

    async renderThumbnail(path, canvas, item) {
        try {
            const res = await fetch(`/${path}`);
            const data = await res.json();
            
            // Add play mark if animated
            if(data.frames && data.frames.length > 1) {
                const mark = document.createElement('div'); mark.className = 'play-mark'; mark.innerText = '▶';
                item.appendChild(mark);
            }

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0,0,64,64);
            
            const frame = data.frames?.[0]; if(!frame) return;
            const pal = data.palette || [];
            const pix = (frame.pixels || []).map(p => [p[0], p[1], typeof p[2] === 'number' ? pal[p[2]] : p[2]]);
            const size = data.width || 128;
            const scale = 64 / size;
            for(const [x,y,col] of pix) { ctx.fillStyle = col; ctx.fillRect(x*scale, y*scale, scale, scale); }
        } catch(e) {}
    }

    async loadFile(path) {
        try {
            this.stop(); // Stop playback before loading new file to prevent crashes
            const res = await fetch(`/${path}`);
            if(!res.ok) throw new Error(`파일을 찾을 수 없어! (Status: ${res.status})`);
            const data = await res.json();
            this.handleJsonContent(data, path.split('/').pop());
        } catch(e) { alert(`못 불러왔어 오빠... 😭\n사유: ${e.message}`); }
    }

    handleJsonContent(data, name) {
        this.canvasSize = data.width || 128;
        const pal = data.palette || [];
        this.frames = (data.frames || []).map(f => ({ pixels: (f.pixels || []).map(p => [p[0], p[1], typeof p[2] === 'number' ? pal[p[2]] : p[2]]) }));
        if(this.frames.length === 0) this.frames = [this.createNewFrame(this.canvasSize)];
        this.currentFrameIdx = 0;
        document.getElementById('inp-filename').value = name.replace('.json','');
        this.renderAll();
    }

    exit() { this.isActive = false; const mc = document.getElementById('main-canvas'); if(mc) mc.style.visibility = 'visible'; document.getElementById('ui-layer').innerHTML = ''; this.gm.changeScene('ChapterScene', 1); }
}
