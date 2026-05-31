import { CFG } from './runner_config.js';

export default class BanditEnemy {
    constructor(avatarData, startX) {
        this.data = avatarData;
        this.width = avatarData.width || 60;
        this.height = avatarData.height || 80;
        this.x = startX;
        this.y = 220 - this.height; // 지면 Y=220 기준
        
        this.reset();
    }

    reset() {
        this.hp = 60; // 플레이어보다 체력이 적음
        this.state = 'idle'; // 'idle', 'run', 'attack', 'hit', 'dead'
        this.facingDir = -1; // 기본적으로 왼쪽(플레이어 방향)을 바라봄
        
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = true;

        this.animTimer = 0;
        this.frameIdx = 0;
        this.stateTimer = 0;
        
        this.attackCooldown = 0;
        this.isCollapsed = false;
        this.collapseParticles = [];
    }

    update(dt, playerX) {
        // 붕괴 파티클 업데이트
        if (this.isCollapsed) {
            for (const p of this.collapseParticles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 400 * dt; // 중력
                if (p.y >= 220) {
                    p.y = 220;
                    p.vy = 0;
                    p.vx *= 0.8;
                }
                p.life -= dt;
            }
            this.collapseParticles = this.collapseParticles.filter(p => p.life > 0);
            return;
        }

        // 쿨타임 및 타이머 감소
        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                if (this.state === 'attack' || this.state === 'hit') {
                    this.state = 'idle';
                }
            }
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        // 물리 연산 (중력)
        if (!this.isGrounded) {
            this.vy += CFG.GRAVITY * dt;
            this.y += this.vy * dt;
            if (this.y >= 220 - this.height) {
                this.y = 220 - this.height;
                this.vy = 0;
                this.isGrounded = true;
            }
        } else {
            this.y = 220 - this.height;
        }

        // 행동 AI 의사결정
        if (this.state !== 'dead' && this.state !== 'hit' && this.state !== 'attack') {
            const dist = Math.abs(playerX - this.x);
            this.facingDir = playerX < this.x ? -1 : 1;

            if (dist > 35) {
                // 플레이어를 향해 쫓아감
                this.state = 'run';
                this.vx = this.facingDir * 75; // 플레이어보다 느림
                this.x += this.vx * dt;
            } else {
                // 공격 사정거리 이내
                this.vx = 0;
                if (this.attackCooldown <= 0) {
                    this.performAttack();
                } else {
                    this.state = 'idle';
                }
            }
        }

        // 애니메이션 프레임 제어
        this.animTimer += dt;
        const currentMotion = this.getMotionName();
        const motionFrames = this.data.frames.filter(f => f.motion === currentMotion);
        
        if (motionFrames.length > 0) {
            const frameDuration = (motionFrames[0].delay || 150) / 1000;
            this.frameIdx = Math.floor(this.animTimer / frameDuration) % motionFrames.length;
        } else {
            this.frameIdx = 0;
        }
    }

    getMotionName() {
        switch (this.state) {
            case 'idle': return 'bandit_idle';
            case 'run': return 'bandit_run';
            case 'attack': return 'bandit_attack';
            case 'hit': return 'bandit_hit';
            case 'dead': return 'bandit_die';
            default: return 'bandit_idle';
        }
    }

    performAttack() {
        this.state = 'attack';
        this.animTimer = 0;
        this.frameIdx = 0;
        this.stateTimer = 0.5; // 500ms 선후딜
        this.attackCooldown = 1.2; // 1.2초 공격 재기 대기
    }

    takeDamage(dmg, knockbackDir) {
        if (this.state === 'dead') return false;
        
        this.hp = Math.max(0, this.hp - dmg);
        this.state = 'hit';
        this.stateTimer = 0.35;
        this.vx = knockbackDir * 120;
        this.x += knockbackDir * 12; // 넉백 거리
        
        if (this.hp <= 0) {
            this.state = 'dead';
            this.triggerCollapse();
        }
        return true;
    }

    triggerCollapse() {
        if (this.isCollapsed) return;
        this.isCollapsed = true;
        this.collapseParticles = [];
        
        // 도적 픽셀 데이터 15% 격자 샘플링하여 파티클 모래화
        const currentMotion = this.getMotionName();
        const motionFrames = this.data.frames.filter(f => f.motion === currentMotion);
        const frame = motionFrames[this.frameIdx % motionFrames.length] || this.data.frames[0];
        const palette = this.data.palette;
        
        frame.pixels.forEach(([px, py, idx]) => {
            if (Math.random() < 0.15) {
                const color = palette[idx];
                if (color && color !== 'transparent') {
                    const worldX = this.x + px;
                    const worldY = this.y + py;
                    
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 10 + Math.random() * 25;
                    
                    this.collapseParticles.push({
                        x: worldX,
                        y: worldY,
                        vx: Math.cos(angle) * speed + (this.facingDir * -10),
                        vy: -15 - Math.random() * 30,
                        color: color,
                        life: 1.2 + Math.random() * 0.8
                    });
                }
            }
        });
    }

    draw(ctx) {
        if (this.isCollapsed) {
            for (const p of this.collapseParticles) {
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 1.5, 1.5);
            }
            return;
        }

        const currentMotion = this.getMotionName();
        const motionFrames = this.data.frames.filter(f => f.motion === currentMotion);
        const frame = motionFrames[this.frameIdx % motionFrames.length] || this.data.frames[0];
        const palette = this.data.palette;
        
        ctx.save();
        
        if (this.facingDir === 1) {
            // 오른쪽을 바라볼 때
            ctx.translate(Math.round(this.x + this.width), Math.round(this.y));
            ctx.scale(-1, 1);
        } else {
            ctx.translate(Math.round(this.x), Math.round(this.y));
        }

        frame.pixels.forEach(([ox, oy, idx]) => {
            const color = palette[idx];
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                ctx.fillRect(ox, oy, 1, 1);
            }
        });
        
        ctx.restore();
    }
}
