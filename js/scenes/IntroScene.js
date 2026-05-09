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
        console.log("Entering Cinematic Intro Scene - Action Mode");
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.innerHTML = `
            <div id="intro-container" class="intro-world">
                <canvas id="intro-canvas"></canvas>
                <div id="intro-ui-overlay"></div>
                <button id="skip-btn" class="kbtn sm" style="position:absolute; bottom:20px; right:20px; opacity:0.3; z-index:10000; border:1px solid #444; color:#444;">SKIP >></button>
            </div>
        `;

        this.canvas = document.getElementById('intro-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 400; // Resolution internal
        this.canvas.height = 400;
        
        document.getElementById('skip-btn').onclick = () => this.skip();

        this.initBGParticles();
        this.playSequence();
        this.animate(0);
    }

    initBGParticles() {
        this.bgParticles = [];
        for (let i = 0; i < 100; i++) {
            this.bgParticles.push({
                x: Math.random() * 400,
                y: Math.random() * 400,
                z: Math.random() * 400,
                v: Math.random() * 2 + 1
            });
        }
    }

    async playSequence() {
        for (let i = 0; i < IntroCutscene.length; i++) {
            if (this.isSkipped) break;
            this.currentSceneIdx = i;
            const data = IntroCutscene[i];
            this.initScene(data);
            await this.delay(data.duration);
        }
        if (!this.isSkipped) this.finish();
    }

    initScene(data) {
        this.frame = 0;
        this.camera.shake = data.effect === 'camera_shake' ? 10 : 0;
        this.camera.zoom = data.effect === 'zoom_in' ? 1.5 : 1;
        
        if (data.effect === 'vortex_decay') this.createVortexParticles(data.main);
        if (data.type.includes('action')) {
            this.charState.state = data.state || 'run';
            this.charState.x = data.type.includes('timeline') ? -20 : 200;
        }
    }

    createVortexParticles(text) {
        this.particles = [];
        this.ctx.font = "bold 60px 'VT323'";
        const metrics = this.ctx.measureText(text);
        const tx = (400 - metrics.width) / 2;
        const ty = 200;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const cx = tx + i * 35;
            for (let py = -20; py < 20; py += 3) {
                for (let px = -12; px < 12; px += 3) {
                    this.particles.push({
                        x: cx + px, y: ty + py,
                        angle: Math.atan2(py, px),
                        dist: Math.sqrt(px*px + py*py),
                        speed: Math.random() * 2 + 2,
                        life: 1.0, active: false
                    });
                }
            }
        }
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
        const data = IntroCutscene[this.currentSceneIdx];
        if (!data) return;

        // Particle update (Vortex)
        if (data.effect === 'vortex_decay' && this.frame > 20) {
            this.particles.forEach(p => {
                p.active = true;
                p.angle += 0.1;
                p.dist += p.speed;
                p.x = 200 + Math.cos(p.angle) * p.dist;
                p.y = 200 + Math.sin(p.angle) * p.dist;
                p.life -= 0.015;
            });
        }

        // BG Particles update
        this.bgParticles.forEach(p => {
            if (data.bgEffect === 'speed_lines') {
                p.x -= p.v * 10;
                if (p.x < 0) p.x = 400;
            } else if (data.bgEffect === 'stardust') {
                p.z -= 2;
                if (p.z < 1) p.z = 400;
            }
        });

        // Camera shake
        if (this.camera.shake > 0) this.camera.shake *= 0.9;
    }

    draw() {
        const data = IntroCutscene[this.currentSceneIdx];
        if (!data) return;

        this.ctx.save();
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 400, 400);

        // Shake & Zoom
        if (this.camera.shake > 0) {
            this.ctx.translate((Math.random()-0.5)*this.camera.shake, (Math.random()-0.5)*this.camera.shake);
        }
        
        this.drawBackground(data);

        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        
        switch (data.type) {
            case 'cinematic_text':
                this.ctx.font = "30px 'VT323'";
                this.ctx.globalAlpha = Math.min(1, this.frame / 15);
                this.ctx.fillText(data.content, 200, 200);
                break;
            case 'pulse_dither':
                this.drawDitheredPulse(data);
                break;
            case 'title_active':
                this.drawActiveTitle(data);
                break;
            case 'growth_active':
                this.drawActiveGrowth(data);
                break;
            case 'timeline_action':
                this.drawTimelineAction(data);
                break;
            case 'arcade_cinematic':
                this.drawArcadeCinematic();
                break;
            case 'title_cinematic':
                this.ctx.font = "50px 'VT323'";
                this.ctx.fillText(data.main, 200, 180);
                this.ctx.font = "18px 'VT323'";
                this.ctx.fillText(data.sub, 200, 230);
                break;
        }

        this.drawDitheringBorder();
        this.ctx.restore();
    }

    drawBackground(data) {
        if (data.bgEffect === 'stardust') {
            this.ctx.fillStyle = '#fff';
            this.bgParticles.forEach(p => {
                const sx = (p.x - 200) * (400 / p.z) + 200;
                const sy = (p.y - 200) * (400 / p.z) + 200;
                const size = (400 / p.z) * 1.5;
                if (sx > 0 && sx < 400 && sy > 0 && sy < 400) {
                    this.ctx.fillRect(sx, sy, size, size);
                }
            });
        } else if (data.bgEffect === 'grid_warp') {
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1;
            for (let i = 0; i < 400; i += 40) {
                this.ctx.beginPath();
                this.ctx.moveTo(i, 0);
                this.ctx.bezierCurveTo(i + Math.sin(this.frame*0.1)*50, 200, i, 400, i, 400);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(0, i);
                this.ctx.lineTo(400, i);
                this.ctx.stroke();
            }
        } else if (data.bgEffect === 'speed_lines') {
            this.ctx.fillStyle = '#444';
            this.bgParticles.forEach(p => {
                this.ctx.fillRect(p.x, p.y, p.v * 20, 1);
            });
        }
    }

    drawDitheredPulse(data) {
        const r = (this.frame * 8) % 300;
        this.ctx.strokeStyle = '#fff';
        for (let i = 0; i < 360; i += 10) {
            if ((i + this.frame * 5) % 20 < 10) continue;
            const x = 200 + Math.cos(i * Math.PI / 180) * r;
            const y = 200 + Math.sin(i * Math.PI / 180) * r;
            this.ctx.fillRect(x, y, 4, 4);
        }
        this.ctx.font = "24px 'VT323'";
        this.ctx.fillText(data.content, 200, 200);
    }

    drawActiveTitle(data) {
        if (this.frame < 25) {
            this.ctx.font = "bold 60px 'VT323'";
            const glitch = this.frame % 5 === 0 ? (Math.random()-0.5)*10 : 0;
            this.ctx.fillText(data.main, 200 + glitch, 200);
        }
        this.particles.forEach(p => {
            if (p.active && p.life > 0) {
                this.ctx.globalAlpha = p.life;
                this.ctx.fillRect(p.x, p.y, 4, 4);
            }
        });
        this.ctx.globalAlpha = 1.0;
    }

    drawActiveGrowth(data) {
        const x = 200;
        const y = 250;
        this.drawSprite(data.state, x, y);
        this.ctx.font = "20px 'VT323'";
        this.ctx.fillText(data.content, 200, 150);
    }

    drawTimelineAction(data) {
        const years = [1974, 1975, 1976, 1977, 1978, 1979, 1980];
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(0, 300, 400, 2);
        
        years.forEach((y, i) => {
            const x = (i * 250 - this.frame * 15) % (years.length * 250);
            if (x > -100 && x < 500) {
                this.ctx.fillStyle = '#fff';
                this.ctx.font = "30px 'VT323'";
                this.ctx.fillText(y, x, 280);
                this.ctx.fillRect(x - 50, 300, 100, 4);
            }
        });
        this.drawSprite('run', 200, 300);
    }

    drawArcadeCinematic() {
        const cx = 200; const cy = 200;
        this.ctx.strokeStyle = '#fff';
        this.ctx.strokeRect(cx - 60, cy - 100, 120, 200);
        
        const colors = ['#0ff', '#f0f', '#ff0'];
        const c = colors[Math.floor(this.frame / 2) % 3];
        this.ctx.fillStyle = c;
        this.ctx.shadowBlur = 20; this.ctx.shadowColor = c;
        this.ctx.fillRect(cx - 50, cy - 90, 100, 80);
        this.ctx.shadowBlur = 0;

        this.ctx.fillStyle = '#fff';
        this.ctx.font = "18px 'VT323'";
        this.ctx.fillText("INSERT COIN", cx, cy + 30);
        this.drawSprite('idle', cx - 30, cy + 100);
    }

    drawSprite(state, x, y) {
        this.ctx.fillStyle = '#fff';
        const f = Math.floor(this.frame / 2) % 2;
        if (state === 'baby') {
            this.ctx.fillRect(x - 15, y - 10, 30, 15);
            this.ctx.fillRect(x - 5, y - 25, 12, 12);
        } else if (state === 'run') {
            const bob = f === 0 ? 0 : -5;
            this.ctx.fillRect(x - 8, y - 50 + bob, 16, 30);
            this.ctx.fillRect(x - 5, y - 65 + bob, 12, 12);
            if (f === 0) {
                this.ctx.fillRect(x - 15, y - 20, 10, 20);
                this.ctx.fillRect(x + 5, y - 20, 10, 20);
            } else {
                this.ctx.fillRect(x - 5, y - 20, 10, 25);
            }
        } else {
            this.ctx.fillRect(x - 6, y - 40, 12, 25);
            this.ctx.fillRect(x - 4, y - 55, 10, 10);
            this.ctx.fillRect(x - (f === 0 ? 8 : 2), y - 15, 6, 15);
        }
    }

    drawDitheringBorder() {
        this.ctx.fillStyle = '#000';
        for (let i = 0; i < 400; i += 4) {
            for (let j = 0; j < 400; j += 4) {
                if (i < 20 || i > 380 || j < 20 || j > 380) {
                    if ((i + j + this.frame) % 8 === 0) {
                        this.ctx.fillRect(i, j, 4, 4);
                    }
                }
            }
        }
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    skip() { this.isSkipped = true; this.finish(); }
    finish() { this.exit(); this.gm.changeScene('ChapterScene', 2); }
    exit() { document.getElementById('ui-layer').innerHTML = ''; }
}
