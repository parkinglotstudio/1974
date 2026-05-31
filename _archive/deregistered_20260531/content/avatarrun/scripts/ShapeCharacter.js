import { CFG } from './runner_config.js';

export default class ShapeCharacter {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 60;                 // 스폰 X
        this.y = 190 - 8;            // 스폰 Y (기본)
        this.width = 16;
        this.height = 16;

        this.shape = 'square';
        this.speed = 180;
        this.rollAngle = 0;
        this._movingDir = 0;
        this.targetX = this.x;
        this.trails = [];

        // 변신 연출용
        this.transformTimer = 0;
        this.transformDuration = 0.5;
        this.transformStars = [];
        this.nextShape = null;
        this.nextSpeed = 0;

        this.heroMode = 'none';      // 'none' | 'custom'
        this.insidePortal = false;
        this.nextHeroMode = null;

        this.facingDir = 1;
        this.walkAnimTimer = 0;
        this.walkBounceY = 0;
        this.walkPitchAngle = 0;
        this.walkFrameIndex = -1;

        // 실시간 로드된 커스텀 아바타 데이터 메타
        this.customAvatar = null;
    }

    get isHero() {
        return this.heroMode !== 'none';
    }

    // index.html의 API 통신을 통해 로드된 픽셀 JSON 아바타 데이터를 이식받음
    applyCustomAvatar(asset) {
        this.customAvatar = asset;
        this.heroMode = 'custom';
        this.shape = 'square';
        
        // 에셋의 실제 가로/세로 크기 이식
        this.width = asset.width || 16;
        this.height = asset.height || 16;
        
        // 지면 높이 갱신 (190 - maxY)
        const maxY = this.height - 8;
        this.y = 190 - maxY;
        this.targetX = this.x;
    }

    setTargetX(mx) {
        this.targetX = Math.max(0, Math.min(1200 - this.width, mx - this.width / 2));
    }

    containsPoint(mx, my) {
        const margin = 4;
        return mx >= this.x - margin && mx <= this.x + this.width + margin &&
               my >= this.y - margin && my <= this.y + this.height + margin;
    }

    _spawnTrailParticle() {
        const isCustom = (this.heroMode === 'custom');
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        
        let speedMult = 1.0;
        let spawnChance = 0.50;
        let colors = ['#EDEBE4', '#41916c'];

        if (isCustom && this.customAvatar) {
            speedMult = 1.2;
            spawnChance = 0.65;
            // 아바타 팔레트 중 유효한 컬러 2~3개 추출
            colors = this.customAvatar.palette.filter(c => c && c !== 'transparent').slice(1, 4);
            if (colors.length === 0) colors = ['#ffffff', '#ff007f'];
        }

        if (Math.random() > spawnChance) return;

        const vx = -this._movingDir * (40 + Math.random() * 50) * speedMult;
        const vy = (Math.random() - 0.5) * 20 * speedMult;

        const offsetMultiplier = isCustom ? 1.2 : 1.0;
        this.trails.push({
            x: cx - this._movingDir * (8 * offsetMultiplier) + (Math.random() - 0.5) * (4 * offsetMultiplier),
            y: cy + (Math.random() - 0.5) * (10 * offsetMultiplier),
            vx: vx,
            vy: vy,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 0.9,
            life: 0.12 + Math.random() * 0.12
        });
    }

    update(dt) {
        // 커스텀 아바타일 때 크기 고정 적용
        if (this.heroMode === 'custom' && this.customAvatar) {
            this.width = this.customAvatar.width || 16;
            this.height = this.customAvatar.height || 16;
        } else {
            this.width = 16;
            this.height = 16;
        }

        const diffX = this.targetX - this.x;
        const absDiff = Math.abs(diffX);
        const step = this.speed * dt;

        if (absDiff <= 1.0 || absDiff <= step) {
            this.x = this.targetX;
            this._movingDir = 0;

            this.walkFrameIndex = -1;
            this.walkAnimTimer = 0;
            this.walkBounceY = 0;
            this.walkPitchAngle = 0;
            
            if (this.isHero) {
                this.rollAngle = 0;
            } else {
                const targetAngle = 0;
                const diffAngle = targetAngle - this.rollAngle;
                if (Math.abs(diffAngle) < 0.01) {
                    this.rollAngle = 0;
                } else {
                    this.rollAngle += diffAngle * 0.25;
                }
            }
        } else {
            this._movingDir = Math.sign(diffX);
            this.x += this._movingDir * step;

            if (this.isHero) {
                this.rollAngle = 0;
                this.facingDir = this._movingDir;
                
                this.walkAnimTimer += dt;
                
                // 아바타 걷는 애니메이팅 프레임 순환
                if (this.heroMode === 'custom' && this.customAvatar) {
                    const frameCount = this.customAvatar.frames.length;
                    const fps = this.customAvatar.fps || 6;
                    const frameDuration = 1.0 / fps;
                    
                    this.walkFrameIndex = Math.floor(this.walkAnimTimer / frameDuration) % frameCount;
                    
                    // 호흡/바운싱 적용
                    this.walkBounceY = Math.sin(this.walkAnimTimer * 20.0) * 1.5;
                    this.walkPitchAngle = this.facingDir * 0.05 * Math.sin(this.walkAnimTimer * 20.0);
                }
            } else {
                this.rollAngle += this._movingDir * (step / 8);
                this.rollAngle = this.rollAngle % (Math.PI * 2);
                if (this.rollAngle < 0) this.rollAngle += Math.PI * 2;
            }

            this._spawnTrailParticle();
        }

        // 지면 밀착 물리 (maxY) 계산
        let maxY = 8;
        if (this.heroMode === 'custom' && this.customAvatar) {
            maxY = this.height - 8; // 골든 룰: maxY = height - 8
        } else {
            if (this.shape === 'square') {
                maxY = 8 * Math.abs(Math.sin(this.rollAngle)) + 8 * Math.abs(Math.cos(this.rollAngle));
            } else if (this.shape === 'triangle') {
                const y0 = -7 * Math.cos(this.rollAngle);
                const y1 = 8 * Math.sin(this.rollAngle) + 7 * Math.cos(this.rollAngle);
                const y2 = -8 * Math.sin(this.rollAngle) + 7 * Math.cos(this.rollAngle);
                maxY = Math.max(y0, y1, y2);
            } else if (this.shape === 'circle') {
                maxY = 8;
            }
        }

        this.y = 190 - maxY + this.walkBounceY;

        // 꼬리 파티클
        for (const p of this.trails) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.alpha = Math.max(0, p.alpha - dt * 3.5);
        }
        this.trails = this.trails.filter(p => p.life > 0);

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > 1200) {
            this.x = 1200 - this.width;
        }
    }

    _drawCustomAvatar(ctx) {
        if (!this.customAvatar) return;

        const frameCount = this.customAvatar.frames.length;
        const frameIdx = this.walkFrameIndex === -1 ? 0 : (this.walkFrameIndex % frameCount);
        const frame = this.customAvatar.frames[frameIdx];
        const palette = this.customAvatar.palette;
        
        ctx.save();
        if (this.facingDir === -1) {
            ctx.scale(-1, 1);
        }

        // 각 픽셀을 한 땀 한 땀 드로잉
        frame.pixels.forEach(([ox, oy, colorIdx]) => {
            const color = palette[colorIdx];
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                // 중심 (0,0)에 맞춰 렌더링 오프셋 계산
                const drawX = ox - this.customAvatar.width / 2;
                const drawY = oy - this.customAvatar.height / 2;
                ctx.fillRect(drawX, drawY, 1, 1);
            }
        });

        ctx.restore();
    }

    draw(ctx) {
        ctx.save();

        // 1. 꼬리 그리기
        const tailSize = 1.5;
        for (const p of this.trails) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), tailSize, tailSize);
        }
        ctx.globalAlpha = 1.0;

        // 2. 몸체
        const cx = Math.round(this.x + this.width / 2);
        const cy = Math.round(this.y + this.height / 2);

        ctx.translate(cx, cy);

        if (this.heroMode === 'custom' && this._movingDir !== 0) {
            ctx.rotate(this.walkPitchAngle);
        }

        // 정지 상태 호흡 squash
        if (this._movingDir === 0 && this.transformTimer <= 0) {
            const breath = Math.sin(performance.now() * 0.005) * 0.02;
            ctx.scale(1, 1 - breath);
        }

        if (this.heroMode === 'custom') {
            this._drawCustomAvatar(ctx);
        } else {
            ctx.rotate(this.rollAngle);
            this._drawShapeByName(ctx, this.shape);
        }

        ctx.restore();
    }

    _drawShapeByName(ctx, name) {
        if (name === 'square') {
            for (let oy = -8; oy < 8; oy++) {
                for (let ox = -8; ox < 8; ox++) {
                    ctx.fillStyle = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#41916c';
                    ctx.fillRect(ox, oy, 1, 1);
                }
            }
        } else if (name === 'triangle') {
            const limits = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8];
            for (let oy = -7; oy <= 7; oy++) {
                const limit = limits[oy + 7];
                for (let ox = -8; ox <= 8; ox++) {
                    if (ox >= -limit && ox <= limit) {
                        ctx.fillStyle = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#e03030';
                        ctx.fillRect(ox, oy, 1, 1);
                    }
                }
            }
        } else if (name === 'circle') {
            for (let oy = -8; oy < 8; oy++) {
                for (let ox = -8; ox < 8; ox++) {
                    if (ox * ox + oy * oy <= 8 * 8) {
                        ctx.fillStyle = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#20d0ff';
                        ctx.fillRect(ox, oy, 1, 1);
                    }
                }
            }
        }
    }
}
