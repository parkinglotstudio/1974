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
        this.camera.shake = data.type.includes('shatter') ? 15 : 0;
        this.camera.zoom = data.type.includes('apex') ? 1.8 : 1;
        
        if (data.type === 'vortex_text') this.createSpiralParticles(data.content);
        if (data.type === 'dissolve_burst') this.createRadialBurst();
        
        if (data.type.includes('action') || data.type.includes('jump')) {
            this.charState.state = 'run';
            this.charState.vy = 0;
            this.charState.ay = 0.6; // Gravity
        }
    }

    createSpiralParticles(text) {
        this.particles = [];
        this.ctx.font = "bold 60px 'VT323'";
        const metrics = this.ctx.measureText(text);
        const tx = (400 - metrics.width) / 2;
        const ty = 200;
        
        for (let i = 0; i < 100; i++) {
            this.particles.push({
                x: 200, y: 200,
                angle: (i / 100) * Math.PI * 8,
                radius: 300,
                targetX: tx + Math.random() * metrics.width,
                targetY: ty + (Math.random() - 0.5) * 40,
                speed: 2 + Math.random() * 3,
                active: true, life: 1.0
            });
        }
    }

    createRadialBurst() {
        this.particles.forEach(p => {
            const ang = Math.random() * Math.PI * 2;
            const spd = Math.random() * 10 + 5;
            p.vx = Math.cos(ang) * spd;
            p.vy = Math.sin(ang) * spd;
            p.active = true;
            p.life = 1.0;
        });
    }

    update() {
        const data = IntroCutscene[this.currentSceneIdx];
        if (!data) return;

        // Spiral update
        if (data.type === 'vortex_text') {
            this.particles.forEach(p => {
                if (p.radius > 0) p.radius -= p.speed * 2;
                p.x = 200 + Math.cos(p.angle + this.frame * 0.1) * p.radius;
                p.y = 200 + Math.sin(p.angle + this.frame * 0.1) * p.radius;
            });
        }

        // Action Physics (Better Jump)
        if (data.type.includes('action') || data.type.includes('jump')) {
            // Auto Jump logic for years
            if (this.frame % 40 === 0 && this.charState.y >= 300) {
                this.charState.vy = -12; // Jump Force
            }

            if (this.charState.y < 300) {
                let grav = 0.6;
                if (this.charState.vy > 0) grav *= 1.5; // Better Jump: faster fall
                this.charState.vy += grav;
            } else {
                this.charState.vy = 0;
                this.charState.y = 300;
            }
            this.charState.y += this.charState.vy;
        }

        // BG Particles
        this.bgParticles.forEach(p => {
            p.x -= (data.speed === 'fast' ? 15 : 5);
            if (p.x < 0) p.x = 400;
        });

        if (this.camera.shake > 0) this.camera.shake *= 0.9;
    }

    draw() {
        const data = IntroCutscene[this.currentSceneIdx];
        if (!data) return;

        this.ctx.save();
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 400, 400);

        if (this.camera.shake > 0) {
            this.ctx.translate((Math.random()-0.5)*this.camera.shake, (Math.random()-0.5)*this.camera.shake);
        }
        
        this.drawBackground(data);

        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        
        switch (data.type) {
            case 'vortex_text':
                this.drawActiveTitle(data);
                break;
            case 'dissolve_burst':
                this.drawBurstParticles();
                break;
            case 'spawn_actor':
                this.drawSprite(data.state, 200, 300);
                this.ctx.font = "24px 'VT323'";
                this.ctx.fillText(data.content, 200, 200);
                break;
            case 'action_run':
                this.drawActionRun(data);
                break;
            case 'the_wall':
                this.drawTheWall(data);
                break;
            case 'super_jump_apex':
                this.drawSuperJump();
                break;
            case 'color_shatter':
                this.drawColorShatter();
                break;
            case 'arcade_dive':
                this.drawArcadeDive();
                break;
        }

        this.drawDitheringBorder();
        this.ctx.restore();
    }

    drawActionRun(data) {
        const yearX = 400 - (this.frame * 10) % 600;
        this.ctx.font = "bold 40px 'VT323'";
        this.ctx.fillText(data.startYear, yearX, 300);
        this.ctx.fillRect(0, 305, 400, 2);
        
        // Squash and Stretch based on vy
        let stretch = 1.0;
        let squash = 1.0;
        if (this.charState.vy < 0) stretch = 1.2, squash = 0.8;
        if (this.charState.vy > 0) stretch = 0.8, squash = 1.2;
        
        this.drawSprite('run', 100, this.charState.y, stretch, squash);
    }

    drawTheWall(data) {
        this.ctx.fillRect(300, 100, 100, 300);
        this.ctx.font = "40px 'VT323'";
        this.ctx.save();
        this.ctx.translate(350, 250);
        this.ctx.rotate(-Math.PI/2);
        this.ctx.fillText(data.year, 0, 0);
        this.ctx.restore();
        this.drawSprite('run', 100, 300);
    }

    drawSuperJump() {
        const jumpY = 300 - Math.min(200, this.frame * 10);
        const apexHold = this.frame > 20 ? 0 : (this.frame > 15 ? 0 : 5);
        this.drawSprite('run', 250, jumpY + apexHold, 1.5, 0.7);
        this.ctx.fillRect(300, 100, 100, 300);
    }

    drawColorShatter() {
        const colors = ['#0ff', '#f0f', '#ff0'];
        for (let i = 0; i < 50; i++) {
            this.ctx.fillStyle = colors[i % 3];
            this.ctx.fillRect(Math.random() * 400, Math.random() * 400, 10, 10);
        }
        this.ctx.fillStyle = '#fff';
        this.ctx.font = "30px 'VT323'";
        this.ctx.fillText("AWAKENING", 200, 200);
    }

    drawArcadeDive() {
        const r = Math.max(0, 200 - this.frame * 5);
        this.ctx.strokeStyle = '#0ff';
        this.ctx.strokeRect(200 - r, 200 - r, r * 2, r * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText("INSERT COIN", 200, 200);
    }

    drawSprite(state, x, y, stretch = 1, squash = 1) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(squash, stretch);
        this.ctx.fillStyle = '#fff';
        
        if (state === 'baby') {
            this.ctx.fillRect(-15, -10, 30, 15);
            this.ctx.fillRect(-5, -25, 12, 12);
        } else {
            this.ctx.fillRect(-8, -50, 16, 30); // body
            this.ctx.fillRect(-5, -65, 12, 12); // head
            this.ctx.fillRect(-10, -20, 8, 20); // legs
            this.ctx.fillRect(2, -20, 8, 20);
        }
        this.ctx.restore();
    }

    drawBurstParticles() {
        this.particles.forEach(p => {
            if (p.active) {
                p.x += p.vx; p.y += p.vy;
                p.life -= 0.02;
                this.ctx.globalAlpha = p.life;
                this.ctx.fillRect(p.x, p.y, 4, 4);
            }
        });
        this.ctx.globalAlpha = 1;
    }

    drawActiveTitle(data) {
        this.particles.forEach(p => {
            this.ctx.fillRect(p.x, p.y, 4, 4);
        });
        this.ctx.font = "bold 60px 'VT323'";
        this.ctx.fillText(data.content, 200, 200);
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
