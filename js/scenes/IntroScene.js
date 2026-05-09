import { IntroCutscene } from '../data/IntroCutscene.js';

export default class IntroScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.db = gameManager.db;
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.currentSceneIdx = 0;
        this.isSkipped = false;
        this.lastTick = 0;
        this.fps = 12;
        this.tickInterval = 1000 / this.fps;
        this.frame = 0;
        this.camera = { x: 0, y: 0, zoom: 1, shake: 0 };
        this.bgParticles = [];
        this.charState = { x: 0, y: 0, pose: 0, state: 'idle' };
    }

    async enter() {
        console.log("Entering Accelerating Chaos Intro Scene");
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.innerHTML = `
            <style>
                #intro-container {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: #000; display: flex; align-items: center; justify-content: center;
                    overflow: hidden; z-index: 10000;
                }
                #intro-canvas {
                    max-width: 100%; max-height: 100%; object-fit: contain;
                    box-shadow: 0 0 50px rgba(255,255,255,0.1);
                }
                #no-memory-tag {
                    position: absolute; top: 30px; left: 30px;
                    font-family: 'VT323'; font-size: 32px; color: #fff;
                    text-shadow: 2px 2px 0 #000; z-index: 10001; pointer-events: none;
                }
                #skip-btn {
                    position: absolute; top: 30px; right: 30px;
                    background: rgba(255,255,255,0.1); border: 2px solid #fff;
                    color: #fff; padding: 10px 25px; font-family: 'VT323'; font-size: 24px;
                    cursor: pointer; z-index: 10001; transition: all 0.2s;
                }
                #skip-btn:hover { background: #fff; color: #000; }
            </style>
            <div id="intro-container">
                <canvas id="intro-canvas"></canvas>
                <div id="intro-ui-overlay" style="position:absolute; width:100%; height:100%; pointer-events:none;"></div>
                <div id="no-memory-tag">NO MEMORY</div>
                <button id="skip-btn">SKIP >></button>
            </div>
        `;

        this.canvas = document.getElementById('intro-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 400;
        this.canvas.height = 400;
        
        document.getElementById('skip-btn').onclick = () => this.skip();

        // Assets Loading
        this.bgImages = [];
        for (let i = 1; i <= 7; i++) {
            const img = new Image();
            img.src = `assets/bg_${i}.jpg`;
            await new Promise(r => { img.onload = r; img.onerror = r; });
            this.bgImages.push(img);
        }

        this.historyImages = {};
        this.milestones = [1974, 1977, 1980];
        for (const y of this.milestones) {
            const img = new Image();
            img.src = `assets/${y}.png`;
            await new Promise(r => { img.onload = r; img.onerror = r; });
            this.historyImages[y] = img;
        }

        this.balls = [];
        this.starBursts = [];
        this.flashCircle = { radius: 0, active: false, x: 200, y: 200 };
        this.years = [1974, 1975, 1976, 1977, 1978, 1979, 1980];
        
        this.currentBgIdx = 0;
        this.frame = 0;
        this.lastTick = 0;
        this.isSkipped = false;
        this.fps = 60;
        this.tickInterval = 1000 / this.fps;

        this.startSequence();
        this.animate(0);
    }

    async startSequence() {
        let loopCount = 0;
        let baseDelay = 2000;
        
        while (!this.isSkipped) {
            for (let i = 0; i < this.years.length; i++) {
                if (this.isSkipped) break;
                
                this.spawnBall(this.years[i]);
                
                // Acceleration: Faster each ball, and even faster each loop
                let currentDelay = baseDelay - (i * 150) - (loopCount * 200);
                if (currentDelay < 400) currentDelay = 400; // Cap at max speed
                
                await this.delay(currentDelay);
            }
            
            // On first loop end, spawn NEXT ball
            if (loopCount === 0 && !this.isSkipped) {
                this.spawnNextBall();
            }
            
            loopCount++;
            baseDelay -= 300; // Speed up the next full cycle
            if (baseDelay < 800) baseDelay = 800;
            
            await this.delay(500); // Short pause before next cycle
        }
    }

    spawnBall(year) {
        this.balls.push({
            year: year,
            x: -30, y: 150,
            vx: 4.5, vy: -12,
            radius: 25, gravity: 0.7, bounce: 0.75,
            squash: 1, stretch: 1,
            state: 'bouncing',
            isFinal: false
        });
    }

    spawnNextBall() {
        this.balls.push({
            year: 'NEXT',
            x: -30, y: 150,
            vx: 5, vy: -14,
            radius: 35, gravity: 0.7, bounce: 0.8,
            squash: 1, stretch: 1,
            state: 'bouncing',
            isFinal: true,
            floatFrame: 0
        });
    }

    animate(now) {
        if (this.isSkipped) return;
        requestAnimationFrame((t) => this.animate(t));
        if (now - this.lastTick < this.tickInterval) return;
        this.lastTick = now;
        this.frame++;
        this.update();
        this.draw();
    }

    update() {
        // Flash Circle
        if (this.flashCircle.active) {
            this.flashCircle.radius += 20;
            if (this.flashCircle.radius > 600) this.flashCircle.active = false;
        }

        // Star Bursts
        for (let i = this.starBursts.length - 1; i >= 0; i--) {
            const s = this.starBursts[i];
            s.scale += 0.15; s.life -= 0.05;
            if (s.life <= 0) this.starBursts.splice(i, 1);
        }

        this.balls.forEach((ball, idx) => {
            if (ball.isFinal && ball.state === 'final_stop') {
                ball.floatFrame += 0.05;
                ball.y = 200 + Math.sin(ball.floatFrame) * 8;
                return;
            }

            ball.vy += ball.gravity;
            ball.x += ball.vx;
            ball.y += ball.vy;

            if (ball.y + ball.radius > 360) {
                ball.y = 360 - ball.radius;
                ball.vy *= -ball.bounce;
                ball.squash = 0.3; ball.stretch = 1.7;
                
                this.currentBgIdx = (this.currentBgIdx + 1) % this.bgImages.length;
                this.flashCircle.active = true;
                this.flashCircle.x = ball.x;
                this.flashCircle.y = 360;
                this.flashCircle.radius = 0;
                this.starBursts.push({ x: ball.x, y: 360, scale: 0.1, life: 1.0 });

                if (ball.isFinal && ball.x > 180 && ball.x < 220) {
                    ball.state = 'final_stop';
                    ball.x = 200; ball.y = 200;
                    ball.vx = 0; ball.vy = 0;
                    this.showStartPrompt();
                }
            } else {
                ball.squash += (1 - ball.squash) * 0.2;
                ball.stretch += (1 - ball.stretch) * 0.2;
            }
            if (!ball.isFinal && ball.x > 500) this.balls.splice(idx, 1);
        });
    }

    showStartPrompt() {
        const skipBtn = document.getElementById('skip-btn');
        if (!skipBtn) return;
        
        // Transform SKIP button to START button
        skipBtn.innerHTML = "START CHAPTER 2 >";
        skipBtn.style.background = "#fff";
        skipBtn.style.color = "#000";
        skipBtn.style.fontSize = "28px";
        skipBtn.style.padding = "15px 35px";
        skipBtn.style.boxShadow = "0 0 30px #fff";
        skipBtn.style.animation = "blink-btn 0.8s infinite";
        
        // Add dynamic blink animation if not exists
        if (!document.getElementById('intro-blink-style')) {
            const style = document.createElement('style');
            style.id = 'intro-blink-style';
            style.innerHTML = `
                @keyframes blink-btn { 
                    0% { opacity: 0.6; transform: scale(1); } 
                    50% { opacity: 1; transform: scale(1.05); } 
                    100% { opacity: 0.6; transform: scale(1); } 
                }
            `;
            document.head.appendChild(style);
        }
    }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 400, 400);

        if (this.flashCircle.active || this.starBursts.length > 0) {
            this.ctx.save();
            this.ctx.beginPath();
            if (this.flashCircle.active) this.ctx.arc(this.flashCircle.x, this.flashCircle.y, this.flashCircle.radius, 0, Math.PI * 2);
            this.starBursts.forEach(s => {
                this.ctx.moveTo(s.x, s.y);
                this.ctx.arc(s.x, s.y, s.scale * 160, 0, Math.PI * 2);
            });
            this.ctx.clip();
            const img = this.bgImages[this.currentBgIdx];
            if (img) this.ctx.drawImage(img, 0, 0, 400, 400);
            this.ctx.restore();
        }

        if (this.flashCircle.active) {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(this.flashCircle.x, this.flashCircle.y, this.flashCircle.radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - this.flashCircle.radius/600)})`;
            this.ctx.lineWidth = 6; this.ctx.stroke();
            this.ctx.restore();
        }

        this.starBursts.forEach(s => this.drawPixelStar(s.x, s.y, s.scale, s.life));

        this.balls.forEach(ball => {
            this.ctx.save();
            this.ctx.translate(ball.x, ball.y);
            this.ctx.scale(ball.stretch, ball.squash);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#fff'; this.ctx.fill();
            this.ctx.fillStyle = '#000';
            this.ctx.font = ball.isFinal ? "bold 22px 'VT323'" : "bold 18px 'VT323'";
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ball.year, 0, ball.isFinal ? 8 : 6);
            this.ctx.restore();
        });

        this.drawDitheringBorder();
    }

    drawPixelStar(x, y, scale, life) {
        this.ctx.save();
        this.ctx.translate(x, y); this.ctx.scale(scale, scale);
        this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 5;
        this.ctx.setLineDash([8, 8]); this.ctx.globalAlpha = life;
        this.ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            this.ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * 100, -Math.sin((18 + i * 72) / 180 * Math.PI) * 100);
            this.ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * 40, -Math.sin((54 + i * 72) / 180 * Math.PI) * 40);
        }
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawMemorySlide() {
        const slideWidth = 400;
        this.bgImages.forEach((img, i) => {
            if (!img) return;
            let x = (i * slideWidth) - (this.bgScrollX % (this.bgImages.length * slideWidth));
            if (x < -slideWidth) x += (this.bgImages.length * slideWidth);
            this.ctx.save();
            this.ctx.globalAlpha = 0.5;
            this.ctx.drawImage(img, x, 50, 400, 300);
            this.ctx.restore();
        });
    }

    drawDitheringBorder() {
        this.ctx.fillStyle = '#000';
        for (let i = 0; i < 400; i += 4) {
            for (let j = 0; j < 400; j += 4) {
                if (i < 10 || i > 390 || j < 10 || j > 390) {
                    if ((i + j + this.frame) % 8 === 0) this.ctx.fillRect(i, j, 4, 4);
                }
            }
        }
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    skip() { this.isSkipped = true; this.finish(); }
    finish() { this.exit(); this.gm.changeScene('ChapterScene', 2); }
    exit() { document.getElementById('ui-layer').innerHTML = ''; }
}
