import { CFG } from './runner_config.js';

export default class SamuraiCharacter {
    constructor(avatarData) {
        this.data = avatarData;
        this.reset();
    }

    reset() {
        this.width = this.data.width || 70;
        this.height = this.data.height || 75;
        this.x = 80;
        this.y = 220 - this.height; // 지면(Y=220) 발끝 기준
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = true;

        this.hp = 100;
        this.state = 'idle'; // 'idle', 'run', 'attack', 'attack_heavy', 'roll', 'hit', 'dead'
        this.facingDir = 1;

        this.animTimer = 0;
        this.frameIdx = 0;
        
        // 쿨타임 및 타이머
        this.stateTimer = 0;
        this.isInvincible = false;
        
        // 잔상 및 붕괴 파티클용
        this.trails = [];
        this.collapseParticles = [];
        this.isCollapsed = false;
    }

    update(dt) {
        // 잔상 업데이트
        for (const p of this.trails) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= dt * 3.0;
        }
        this.trails = this.trails.filter(p => p.alpha > 0);

        // 붕괴 파티클 업데이트
        if (this.isCollapsed) {
            for (const p of this.collapseParticles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 400 * dt; // 중력 가속도
                // 지면에 닿으면 멈춤 및 스르륵 퍼지기
                if (p.y >= 220) {
                    p.y = 220;
                    p.vy = 0;
                    p.vx *= 0.8; // 마찰력
                }
                p.life -= dt;
            }
            this.collapseParticles = this.collapseParticles.filter(p => p.life > 0);
            return;
        }

        // 상태 타이머 갱신
        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                if (this.state === 'attack' || this.state === 'attack_heavy' || this.state === 'roll' || this.state === 'hit') {
                    this.state = 'idle';
                    this.isInvincible = false;
                }
            }
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

        // 회피 구르기 특수 이동
        if (this.state === 'roll') {
            this.x += this.facingDir * 240 * dt;
            // 구르기 잔상 생성
            if (Math.random() < 0.4) {
                this.trails.push({
                    x: this.x,
                    y: this.y,
                    vx: -this.facingDir * 20,
                    vy: 0,
                    alpha: 0.6,
                    color: '#66ffcc'
                });
            }
        } else if (this.state === 'run') {
            this.x += this.vx * dt;
        }

        // 경계 제한 (1200px 맵 크기 기준)
        this.x = Math.max(0, Math.min(1200 - this.width, this.x));

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
            case 'idle': return 'samurai_idle';
            case 'run': return 'samurai_run';
            case 'attack': return 'samurai_attack';
            case 'attack_heavy': return 'samurai_attack'; // 픽셀 JSON의 attack 모션 공유
            case 'roll': return 'samurai_roll';
            case 'hit': return 'samurai_hit';
            case 'dead': return 'samurai_hit'; // 쓰러진 모습은 피격 모션 사용
            default: return 'samurai_idle';
        }
    }

    move(dir) {
        if (this.state === 'dead' || this.state === 'attack' || this.state === 'attack_heavy' || this.state === 'roll' || this.state === 'hit') return;
        if (dir !== 0) {
            this.facingDir = dir;
            this.state = 'run';
            this.vx = dir * 160;
        } else {
            this.state = 'idle';
            this.vx = 0;
        }
    }

    jump() {
        if (this.state === 'dead' || this.state === 'roll' || this.state === 'hit') return;
        if (this.isGrounded) {
            this.vy = -CFG.JUMP_IMPULSE;
            this.isGrounded = false;
        }
    }

    attack(type = 'light') {
        if (this.state === 'dead' || this.state === 'roll' || this.state === 'hit') return;
        this.vx = 0;
        this.animTimer = 0;
        this.frameIdx = 0;
        
        if (type === 'heavy') {
            this.state = 'attack_heavy';
            this.stateTimer = 0.45; // 450ms 선후딜
        } else {
            this.state = 'attack';
            this.stateTimer = 0.3; // 300ms 선후딜
        }
    }

    roll() {
        if (this.state === 'dead' || this.state === 'roll' || this.state === 'hit' || !this.isGrounded) return;
        this.state = 'roll';
        this.animTimer = 0;
        this.frameIdx = 0;
        this.isInvincible = true;
        this.stateTimer = 0.4; // 400ms 구르기 시간
    }

    takeDamage(dmg, knockbackDir) {
        if (this.isInvincible || this.state === 'dead') return false;
        this.hp = Math.max(0, this.hp - dmg);
        this.state = 'hit';
        this.stateTimer = 0.3;
        this.vx = knockbackDir * 150;
        this.x += knockbackDir * 10; // 순간 넉백
        
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
        
        // 플레이어 캐릭터 픽셀 데이터를 15% 격자 샘플링하여 모래 픽셀화
        const currentMotion = this.getMotionName();
        const motionFrames = this.data.frames.filter(f => f.motion === currentMotion);
        const frame = motionFrames[this.frameIdx % motionFrames.length] || this.data.frames[0];
        const palette = this.data.palette;
        
        frame.pixels.forEach(([px, py, idx]) => {
            // 성능 최적화: 15% 확률 샘플링
            if (Math.random() < 0.15) {
                const color = palette[idx];
                if (color && color !== 'transparent') {
                    // 월드 스페이스 좌표 계산
                    const worldX = this.x + px;
                    const worldY = this.y + py;
                    
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 10 + Math.random() * 30;
                    
                    this.collapseParticles.push({
                        x: worldX,
                        y: worldY,
                        vx: Math.cos(angle) * speed + (this.facingDir * -10),
                        vy: -20 - Math.random() * 40,
                        color: color,
                        life: 1.5 + Math.random() * 1.0
                    });
                }
            }
        });
    }

    draw(ctx) {
        // 잔상 그리기
        ctx.save();
        for (const p of this.trails) {
            ctx.globalAlpha = p.alpha;
            this._drawFixedFrame(ctx, p.x, p.y);
        }
        ctx.restore();

        // 붕괴 파티클 그리기
        if (this.isCollapsed) {
            for (const p of this.collapseParticles) {
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 1.5, 1.5);
            }
            return; // 본체는 그리지 않음
        }

        // 본체 그리기
        this._drawFixedFrame(ctx, this.x, this.y);
    }

    _drawFixedFrame(ctx, tx, ty) {
        const currentMotion = this.getMotionName();
        const motionFrames = this.data.frames.filter(f => f.motion === currentMotion);
        const frame = motionFrames[this.frameIdx % motionFrames.length] || this.data.frames[0];
        const palette = this.data.palette;
        
        ctx.save();
        
        // 방향 전환 시 스케일 처리
        if (this.facingDir === -1) {
            ctx.translate(Math.round(tx + this.width), Math.round(ty));
            ctx.scale(-1, 1);
        } else {
            ctx.translate(Math.round(tx), Math.round(ty));
        }

        // 픽셀 그리기
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
