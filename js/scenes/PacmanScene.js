export default class PacmanScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.db = gameManager.db;
        this.cellSize = 20;
        this.level = 1;
        this.lives = 3;
        this.dots = 0;
        this.loopId = null;
    }

    enter(chapterId) {
        this.chapterId = chapterId;
        this.level = 1;
        this.lives = 3;
        this.initLevel();
    }

    initLevel() {
        this.levelData = this.db.minigameLevels.find(l => l.chapter_origin == this.chapterId && l.level_id == this.level) || this.db.minigameLevels[this.db.minigameLevels.length-1];
        console.log(`Starting Pacman Level ${this.level}`, this.levelData);
        
        this.buildMap(this.levelData.map_width, this.levelData.map_height);
        this.spawnEntities();
        this.setupUI();
        
        this.lastTime = performance.now();
        if(this.loopId) cancelAnimationFrame(this.loopId);
        this.gameLoop = this.gameLoop.bind(this);
        this.loopId = requestAnimationFrame(this.gameLoop);
    }

    buildMap(w, h) {
        this.map = [];
        this.dots = 0;
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                // simple box maze
                if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
                    row.push(1); // Wall
                } else if (y % 2 === 0 && x % 2 === 0) {
                    row.push(1); // Pillar
                } else if (x > w/2 - 2 && x < w/2 + 2 && y > h/2 - 2 && y < h/2 + 2) {
                    row.push(2); // Center ghost house (empty)
                } else {
                    row.push(0); // Dot
                    this.dots++;
                }
            }
            this.map.push(row);
        }
        
        // Add some paths through pillars
        this.map[2][2] = 0; this.dots++;
        this.map[h-3][w-3] = 0; this.dots++;
    }

    spawnEntities() {
        this.pacman = {
            x: 1, y: 1,
            vx: 0, vy: 0,
            nextVx: 0, nextVy: 0,
            speed: this.levelData.player_speed
        };
        // center coordinate
        const cx = Math.floor(this.levelData.map_width / 2);
        const cy = Math.floor(this.levelData.map_height / 2);

        this.ghosts = [];
        for (let i = 0; i < this.levelData.ghost_count; i++) {
            this.ghosts.push({
                x: cx, y: cy,
                vx: (Math.random() > 0.5 ? 1 : -1), vy: 0,
                speed: this.levelData.ghost_speed
            });
        }
    }

    setupUI() {
        const uiLayer = document.getElementById('ui-layer');
        // Clear old 3D canvas if any
        const mainCanvas = document.getElementById('main-canvas');
        if(mainCanvas) {
            // we will draw 2D here
            this.ctx = mainCanvas.getContext('2d');
            mainCanvas.width = window.innerWidth;
            mainCanvas.height = window.innerHeight;
            // hide standard canvas, use custom for pixel perfect
        }

        uiLayer.innerHTML = `
            <div class="hud" style="color: var(--theme-primary); text-shadow: 0 0 5px var(--theme-primary);">
                <div>LEVEL: ${this.level}/5</div>
                <div>LIVES: ${this.lives}</div>
                <div>SCORE: ${this.gm.state.score}</div>
            </div>
            
            <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                <canvas id="pacman-canvas" width="${this.levelData.map_width * this.cellSize}" height="${this.levelData.map_height * this.cellSize}"></canvas>
            </div>

            <div class="dpad-container" id="dpad">
                <div class="dpad-row">
                    <div class="dpad-btn" id="btn-up">▲</div>
                </div>
                <div class="dpad-row">
                    <div class="dpad-btn" id="btn-left">◀</div>
                    <div class="dpad-center"></div>
                    <div class="dpad-btn" id="btn-right">▶</div>
                </div>
                <div class="dpad-row">
                    <div class="dpad-btn" id="btn-down">▼</div>
                </div>
            </div>
        `;

        this.pctx = document.getElementById('pacman-canvas').getContext('2d');

        // Input
        this.handleInput = this.handleInput.bind(this);
        window.addEventListener('keydown', this.handleInput);

        document.getElementById('btn-up').addEventListener('mousedown', () => this.setDir(0, -1));
        document.getElementById('btn-down').addEventListener('mousedown', () => this.setDir(0, 1));
        document.getElementById('btn-left').addEventListener('mousedown', () => this.setDir(-1, 0));
        document.getElementById('btn-right').addEventListener('mousedown', () => this.setDir(1, 0));
        
        // Touch support
        document.getElementById('btn-up').addEventListener('touchstart', (e) => { e.preventDefault(); this.setDir(0, -1);});
        document.getElementById('btn-down').addEventListener('touchstart', (e) => { e.preventDefault(); this.setDir(0, 1);});
        document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); this.setDir(-1, 0);});
        document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); this.setDir(1, 0);});
    }

    handleInput(e) {
        if (e.key === 'ArrowUp') this.setDir(0, -1);
        if (e.key === 'ArrowDown') this.setDir(0, 1);
        if (e.key === 'ArrowLeft') this.setDir(-1, 0);
        if (e.key === 'ArrowRight') this.setDir(1, 0);
    }

    setDir(dx, dy) {
        this.pacman.nextVx = dx;
        this.pacman.nextVy = dy;
    }

    gameLoop(time) {
        this.loopId = requestAnimationFrame(this.gameLoop);
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(dt);
        this.draw();
    }

    update(dt) {
        const p = this.pacman;
        
        // Try to turn
        if (p.nextVx !== 0 || p.nextVy !== 0) {
            // Only turn if closely aligned to grid
            const margin = 0.2;
            const isAlignedX = Math.abs(p.x - Math.round(p.x)) < margin;
            const isAlignedY = Math.abs(p.y - Math.round(p.y)) < margin;
            
            if (isAlignedX && isAlignedY) {
                const checkX = Math.round(p.x) + p.nextVx;
                const checkY = Math.round(p.y) + p.nextVy;
                if (this.map[checkY][checkX] !== 1) {
                    p.x = Math.round(p.x);
                    p.y = Math.round(p.y);
                    p.vx = p.nextVx;
                    p.vy = p.nextVy;
                    p.nextVx = 0;
                    p.nextVy = 0;
                }
            }
        }

        // Move Pacman
        let nextX = p.x + p.vx * p.speed * dt;
        let nextY = p.y + p.vy * p.speed * dt;
        
        // Collision
        const gridX = p.vx > 0 ? Math.floor(nextX + 0.4) : Math.ceil(nextX - 0.4);
        const gridY = p.vy > 0 ? Math.floor(nextY + 0.4) : Math.ceil(nextY - 0.4);
        
        if (this.map[gridY] && this.map[gridY][gridX] !== 1) {
            p.x = nextX;
            p.y = nextY;
        }

        // Eat dot
        const rx = Math.round(p.x);
        const ry = Math.round(p.y);
        if (this.map[ry] && this.map[ry][rx] === 0) {
            this.map[ry][rx] = 2; // eaten
            this.dots--;
            this.gm.state.score += 10;
            if (this.dots <= 0) {
                this.levelComplete();
            }
        }

        // Move Ghosts
        this.ghosts.forEach(g => {
            let gx = g.x + g.vx * g.speed * dt;
            let gy = g.y + g.vy * g.speed * dt;
            
            const gGridX = g.vx > 0 ? Math.floor(gx + 0.4) : Math.ceil(gx - 0.4);
            const gGridY = g.vy > 0 ? Math.floor(gy + 0.4) : Math.ceil(gy - 0.4);
            
            if (this.map[gGridY] && this.map[gGridY][gGridX] !== 1) {
                g.x = gx;
                g.y = gy;
            } else {
                // hit wall, snap to grid and change direction randomly
                g.x = Math.round(g.x);
                g.y = Math.round(g.y);
                const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}].filter(d => this.map[g.y + d.y][g.x + d.x] !== 1);
                if(dirs.length > 0) {
                    const r = dirs[Math.floor(Math.random() * dirs.length)];
                    g.vx = r.x;
                    g.vy = r.y;
                }
            }

            // Ghost hit Pacman
            if (Math.abs(g.x - p.x) < 0.5 && Math.abs(g.y - p.y) < 0.5) {
                this.die();
            }
        });
    }

    draw() {
        if(!this.pctx) return;
        const ctx = this.pctx;
        const cs = this.cellSize;
        ctx.fillStyle = 'var(--theme-bg)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw Map
        for (let y = 0; y < this.levelData.map_height; y++) {
            for (let x = 0; x < this.levelData.map_width; x++) {
                if (this.map[y][x] === 1) {
                    ctx.fillStyle = 'var(--theme-secondary)';
                    ctx.fillRect(x * cs, y * cs, cs, cs);
                    ctx.strokeStyle = 'var(--theme-primary)';
                    ctx.strokeRect(x * cs, y * cs, cs, cs);
                } else if (this.map[y][x] === 0) {
                    ctx.fillStyle = 'var(--theme-primary)';
                    ctx.beginPath();
                    ctx.arc(x * cs + cs/2, y * cs + cs/2, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw Pacman
        ctx.fillStyle = '#00ff41'; // CRT Green
        ctx.beginPath();
        ctx.arc(this.pacman.x * cs + cs/2, this.pacman.y * cs + cs/2, cs/2 - 2, 0.2 * Math.PI, 1.8 * Math.PI);
        ctx.lineTo(this.pacman.x * cs + cs/2, this.pacman.y * cs + cs/2);
        ctx.fill();

        // Draw Ghosts
        ctx.fillStyle = '#ffffff'; // ghosts are bright
        this.ghosts.forEach(g => {
            ctx.beginPath();
            ctx.arc(g.x * cs + cs/2, g.y * cs + cs/2, cs/2 - 2, Math.PI, 0);
            ctx.lineTo(g.x * cs + cs - 2, g.y * cs + cs - 2);
            ctx.lineTo(g.x * cs + 2, g.y * cs + cs - 2);
            ctx.fill();
        });
    }

    die() {
        cancelAnimationFrame(this.loopId);
        this.lives--;
        if (this.lives <= 0) {
            this.overridePopup("GAME OVER", "SYSTEM CORRUPTED.\\n재도전 하십시오.", "RETRY", () => {
                this.exit();
                this.gm.changeScene('ChapterScene', this.chapterId);
            });
        } else {
            this.overridePopup("CAUTION", "바이러스에 피격되었습니다.\\n남은 횟수: " + this.lives, "CONTINUE", () => {
                this.spawnEntities();
                this.lastTime = performance.now();
                this.loopId = requestAnimationFrame(this.gameLoop);
            });
        }
    }

    levelComplete() {
        cancelAnimationFrame(this.loopId);
        if (this.level >= 5) {
            // ALL CLEAR
            const chapterAvatars = this.db.avatars.filter(a => a.chapter_id == this.chapterId);
            chapterAvatars.forEach(a => {
                if(!this.gm.state.unlockedAvatars.includes(a.id)) {
                    this.gm.state.unlockedAvatars.push(a.id);
                }
            });
            this.gm.state.score += this.levelData.reward_score;
            this.gm.saveState();

            this.overridePopup("MISSION COMPLETE", "시스템 버그 제거 완료!\\n모든 데이터를 복구했습니다.", "ACCESS NEXT CHAPTER", () => {
                this.exit();
                this.gm.changeScene('ChapterScene', 3);
            });
        } else {
            // Next Level
            this.gm.state.score += this.levelData.reward_score;
            this.level++;
            this.overridePopup("LEVEL CLEAR", `LEVEL ${this.level - 1} 클리어!\\n다음 구역으로 이동합니다.`, "NEXT LEVEL", () => {
                this.initLevel();
            });
        }
    }

    overridePopup(title, desc, btnText, callback) {
        const html = `
               <div class="popup-title blink">> ${title} <</div>
               <div class="popup-desc">${desc.replace(/\\n/g, '<br>')}</div>
               <button class="btn" id="popup-btn">[ ${btnText} ]</button>
           `;
       this.gm.popupManager.layer.innerHTML = `<div class="popup-box">${html}</div>`;
       this.gm.popupManager.layer.classList.remove('hidden');
       
       // remove event listeners properly by cloning node if needed, or just standard
       const btn = document.getElementById('popup-btn');
       btn.addEventListener('click', () => {
           this.gm.popupManager.hide();
           callback();
       });
   }

    exit() {
        if(this.loopId) cancelAnimationFrame(this.loopId);
        window.removeEventListener('keydown', this.handleInput);
        document.getElementById('ui-layer').innerHTML = '';
        const mainCanvas = document.getElementById('main-canvas');
        if(mainCanvas) {
            const ctx = mainCanvas.getContext('2d');
            ctx.clearRect(0,0, mainCanvas.width, mainCanvas.height);
        }
    }
}
