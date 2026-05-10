export default class IntroScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.isActive = false;
        this.frames = [];
        this.currentFrameIdx = 0;
        this.fps = 12;
        this.lastTick = 0;
        this.canvas = null;
        this.ctx = null;
    }

    async enter() {
        this.isActive = true;
        const container = document.getElementById('game-container');
        if (container) container.classList.add('no-crt');
        
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.innerHTML = `
            <style>
                #intro-container {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background: #ffffff; display: flex; align-items: center; justify-content: center;
                    overflow: hidden; z-index: 10000;
                }
                #intro-canvas {
                    max-width: 90%; max-height: 90%; object-fit: contain;
                    image-rendering: pixelated;
                }
                #intro-ui-bar {
                    position: absolute; bottom: 30px; left: 0; width: 100%;
                    display: flex; justify-content: center; gap: 10px;
                    padding: 0 20px; z-index: 10001;
                }
                .intro-btn {
                    padding: 8px 16px; font-family: 'Inter', sans-serif; font-size: 11px;
                    font-weight: 700; cursor: pointer; border-radius: 4px;
                    border: 1px solid #ddd; transition: all 0.2s;
                    letter-spacing: 1px; text-transform: uppercase;
                }
                #reset-btn { background: #fff; color: #ff4444; border-color: #ff4444; }
                #reset-btn:hover { background: #ff4444; color: #fff; }
                #tool-btn { background: #fff; color: #007bff; border-color: #007bff; }
                #tool-btn:hover { background: #007bff; color: #fff; }
                #skip-btn { background: #000; color: #fff; border-color: #000; min-width: 100px; }
                #skip-btn:hover { background: #333; border-color: #333; }
                
                #intro-loader {
                    position: absolute; font-family: 'Inter'; font-size: 12px; color: #888;
                }
            </style>
            <div id="intro-container">
                <div id="intro-loader">LOADING MEMORY...</div>
                <canvas id="intro-canvas"></canvas>
                <div id="intro-ui-bar">
                    <button id="reset-btn" class="intro-btn">RESET</button>
                    <button id="tool-btn" class="intro-btn">TOOL</button>
                    <button id="skip-btn" class="intro-btn">SKIP INTRO</button>
                </div>
            </div>
        `;

        this.canvas = document.getElementById('intro-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        document.getElementById('skip-btn').onclick = () => this.finish();
        document.getElementById('reset-btn').onclick = () => {
            if(confirm("오빠! 정말 모든 데이터를 초기화할 거야? 🤔")) {
                this.gm.resetGameData();
            }
        };
        document.getElementById('tool-btn').onclick = () => {
            this.finish();
            this.gm.changeScene('PixelToolScene');
        };

        await this.loadIntroData();
        if (document.getElementById('intro-loader')) document.getElementById('intro-loader').style.display = 'none';
        
        this.animate(0);
    }

    async loadIntroData() {
        try {
            const res = await fetch('/assets/pixelart/intro.json');
            const data = await res.json();
            this.fps = data.fps || 12;
            const palette = data.palette || [];
            
            this.canvas.width = data.width || 128;
            this.canvas.height = data.height || 128;

            this.frames = data.frames.map(f => {
                const pixels = [];
                if (f.pixel_map) {
                    for (let y = 0; y < f.pixel_map.length; y++) {
                        for (let x = 0; x < f.pixel_map[y].length; x++) {
                            const val = f.pixel_map[y][x];
                            if (val !== 0) pixels.push([x, y, palette[val] || '#000']);
                        }
                    }
                } else if (f.pixels) {
                    f.pixels.forEach(p => pixels.push([p[0], p[1], palette[p[2]] || '#000']));
                }
                return pixels;
            });
        } catch (e) {
            console.error("Intro load failed:", e);
            this.finish();
        }
    }

    animate(now) {
        if (!this.isActive) return;
        requestAnimationFrame((t) => this.animate(t));

        if (now - this.lastTick < 1000 / this.fps) return;
        this.lastTick = now;

        this.draw();
        this.currentFrameIdx = (this.currentFrameIdx + 1) % this.frames.length;
    }

    draw() {
        if (!this.ctx || this.frames.length === 0) return;
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const frame = this.frames[this.currentFrameIdx];
        for (const [x, y, color] of frame) {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y, 1, 1);
        }
    }

    finish() {
        this.isActive = false;
        const container = document.getElementById('game-container');
        if (container) container.classList.remove('no-crt');
        document.getElementById('ui-layer').innerHTML = '';
        this.gm.changeScene('ChapterScene', 1);
    }
}
