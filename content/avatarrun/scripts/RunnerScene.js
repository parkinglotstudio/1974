import { Scene }          from '../../../engine/scene/SceneManager.js';
import { CFG }            from './runner_config.js';
import SamuraiCharacter   from './SamuraiCharacter.js';
import BanditEnemy        from './BanditEnemy.js';

const W = CFG.GAME_W;
const H = CFG.GAME_H;

export default class RunnerScene extends Scene {
    constructor(overlayCanvas) {
        super('runner');
        this._overlay    = overlayCanvas;
        this._overlayCtx = overlayCanvas.getContext('2d');

        this._state = 'spawn';
        this._timer = 0;

        // 별 파티클 (인트로용)
        this._stars = [];
        this._maxStars = 120;
        
        this.cameraX = 0;
        this.targetCameraX = 0;

        // 파티클 (피 분수 및 피격 스파크 등)
        this.bloodParticles = [];
        this.screenShake = 0;
        this._engine = null;
        
        // 히트스톱 및 흑백 필터 타이머
        this._hitstopTimer = 0;
        this._grayscaleAmount = 0;
        
        // 리소스 캐시용
        this.skyCanvas = null;
        this.treesCanvas = null;
        this.groundCanvas = null;
        this.samuraiData = null;
        this.banditData = null;
        
        this.char = null;
        this.enemies = [];
    }

    async onInit(engine) {
        this._engine = engine;
        this._overlay.width  = W;
        this._overlay.height = H;

        // 픽셀 JSON 리소스 비동기 병렬 로드
        console.log("[RunnerScene] 픽셀 JSON 리소스 로딩 시작...");
        const [skyRes, treesRes, groundRes, samuraiRes, banditRes] = await Promise.all([
            fetch('/content/avatarrun/assets/bg_sky.json').then(r => r.json()),
            fetch('/content/avatarrun/assets/bg_trees.json').then(r => r.json()),
            fetch('/content/avatarrun/assets/bg_ground.json').then(r => r.json()),
            fetch('/assets/pixels/char_samurai.json').then(r => r.json()),
            fetch('/assets/pixels/char_bandit.json').then(r => r.json())
        ]);

        this.samuraiData = samuraiRes;
        this.banditData = banditRes;

        // 픽셀 오프스크린 캔버스로 미리 캐싱 (모래 엔진 철학 준수)
        this.skyCanvas = this._cachePixelJson(skyRes);
        this.treesCanvas = this._cachePixelJson(treesRes);
        this.groundCanvas = this._cachePixelJson(groundRes);
        
        console.log("[RunnerScene] 배경 및 아바타 모래 픽셀 캐싱 완료!");

        // 인풋 핸들러
        this._keys = {};
        window.addEventListener('keydown', (e) => {
            this._keys[e.code] = true;
            
            // 키 클릭 일회성 액션 처리
            if (this._state === 'playing' && this.char && this.char.state !== 'dead') {
                if (e.code === 'KeyJ') {
                    this.char.attack('light');
                    this._checkAttackHit('light');
                }
                if (e.code === 'KeyK') {
                    this.char.attack('heavy');
                    this._checkAttackHit('heavy');
                }
                if (e.code === 'KeyL') {
                    this.char.roll();
                }
                if (e.code === 'Space') {
                    this.char.jump();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this._keys[e.code] = false;
        });

        this._startSequence();
    }

    _cachePixelJson(data) {
        const c = document.createElement('canvas');
        c.width = data.width;
        c.height = data.height;
        const ctx = c.getContext('2d');
        const frame = data.frames[0];
        const palette = data.palette;
        
        frame.pixels.forEach(([x, y, idx]) => {
            const color = palette[idx];
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });
        return c;
    }

    async onEnter(engine) {
        this._engine = engine;
        this._startSequence();
    }

    onExit() {}

    _startSequence() {
        this._state = 'spawn';
        this._timer = 0;
        this._stars = [];
        this.bloodParticles = [];
        this.screenShake = 0;
        this._hitstopTimer = 0;
        this._grayscaleAmount = 0;

        if (this.samuraiData) {
            this.char = new SamuraiCharacter(this.samuraiData);
        }
        
        if (this.banditData) {
            // 적 도적 몹 3마리 스폰 (월드 X축에 넓게 분포)
            this.enemies = [
                new BanditEnemy(this.banditData, 420),
                new BanditEnemy(this.banditData, 780),
                new BanditEnemy(this.banditData, 1050)
            ];
        }

        if (this._engine) {
            this._engine.entities._entities.clear();
            this._engine.layers.clearAll();
            if (!this._engine._running) this._engine.start();
        }
    }

    onUpdate(now, dtMs, input) {
        const dt = Math.min(dtMs / 1000, 0.05);

        // 1. 히트스톱 일시정지 (렌더링은 돌고 update만 프리즈)
        if (this._hitstopTimer > 0) {
            this._hitstopTimer -= dt;
            if (this.screenShake > 0) {
                this.screenShake = Math.max(0, this.screenShake - dt * 25.0);
            }
            this._render(now);
            return;
        }

        switch (this._state) {
            case 'spawn':
                this._updateSpawn(dt);
                break;
            case 'converge':
                this._updateConverge(dt);
                break;
            case 'playing':
                this._updatePlaying(dt);
                break;
        }

        this._updateBloodParticles(dt);
        this._render(now);
    }

    _updateSpawn(dt) {
        this._timer += dt;
        const spawnCount = Math.floor(Math.random() * 2) + 1;
        if (this._stars.length < this._maxStars) {
            for (let i = 0; i < spawnCount; i++) {
                if (this._stars.length >= this._maxStars) break;
                this._stars.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    alpha: 0,
                    fadeSpeed: 1.0 + Math.random() * 1.5,
                    color: Math.random() < 0.5 ? '#EDEBE4' : '#c33030',
                    settled: false
                });
            }
        }

        let allVisible = true;
        for (const star of this._stars) {
            if (star.alpha < 1) {
                star.alpha = Math.min(1, star.alpha + star.fadeSpeed * dt);
                allVisible = false;
            }
        }

        if (this._stars.length >= this._maxStars && allVisible && this._timer >= 0.8) {
            this._state = 'converge';
            this._timer = 0;
            this._assignTargets();
        }
    }

    _assignTargets() {
        const startX = 80;
        const startY = 220 - (this.char ? this.char.height : 75);

        const coords = [];
        // 모래 소용돌이에서 캐릭터를 형성할 표적 좌표들
        for (let oy = 0; oy < 50; oy += 2) {
            for (let ox = 0; ox < 40; ox += 2) {
                coords.push({ tx: startX + ox, ty: startY + oy });
            }
        }

        for (let i = coords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [coords[i], coords[j]] = [coords[j], coords[i]];
        }

        for (let i = 0; i < this._stars.length; i++) {
            const star = this._stars[i];
            const coord = coords[i] ?? { tx: startX, ty: startY };
            star.tx = coord.tx;
            star.ty = coord.ty;
            star.speed = 120 + Math.random() * 160;
        }
    }

    _updateConverge(dt) {
        let allSettled = true;
        for (const star of this._stars) {
            if (star.settled) continue;

            const dx = star.tx - star.x;
            const dy = star.ty - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 2.0) {
                star.x = star.tx;
                star.y = star.ty;
                star.settled = true;
            } else {
                allSettled = false;
                const step = Math.min(star.speed * dt, dist);
                star.x += (dx / dist) * step;
                star.y += (dy / dist) * step;
                star.speed += 300 * dt;
            }
        }

        if (allSettled) {
            this._state = 'playing';
            this._stars = [];
        }
    }

    _updatePlaying(dt) {
        if (!this.char) return;

        // 인풋 조작 방향 읽기
        let moveDir = 0;
        if (this._keys['ArrowLeft'] || this._keys['KeyA']) {
            moveDir = -1;
        } else if (this._keys['ArrowRight'] || this._keys['KeyD']) {
            moveDir = 1;
        }
        
        // 캐릭터 이동 업데이트
        this.char.move(moveDir);
        this.char.update(dt);

        // 적군 AI 업데이트 및 플레이어 공격 감지
        for (const enemy of this.enemies) {
            enemy.update(dt, this.char.x);
            this._checkEnemyAttack(enemy);
        }

        // 카메라 추적 (최대 1200px 맵 크기 기준 한계 설정)
        this.targetCameraX = Math.max(0, Math.min(720, this.char.x - 200));
        this.cameraX += (this.targetCameraX - this.cameraX) * 0.08;

        // 카메라 진동
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 25.0);
        }

        // 흑백 필터 갱신 (사망 연출 시 흑백 비율 조절)
        if (this.char.state === 'dead' || this.enemies.every(e => e.state === 'dead')) {
            this._grayscaleAmount = Math.min(1.0, this._grayscaleAmount + dt * 1.5);
        } else {
            this._grayscaleAmount = Math.max(0, this._grayscaleAmount - dt * 2.0);
        }
    }

    _updateBloodParticles(dt) {
        for (const p of this.bloodParticles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 450 * dt; // 중력 적용
            p.alpha -= dt * 1.8;
            
            // 바닥 지면에 피가 묻음
            if (p.y >= 220) {
                p.y = 220;
                p.vy = 0;
                p.vx = 0;
            }
        }
        this.bloodParticles = this.bloodParticles.filter(p => p.alpha > 0);
    }

    _spawnBlood(x, y, dir, count = 25) {
        for (let i = 0; i < count; i++) {
            const angle = (dir === 1 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
            const speed = 60 + Math.random() * 120;
            this.bloodParticles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: -30 - Math.random() * 60,
                alpha: 1.0,
                color: Math.random() < 0.2 ? '#801010' : '#c32020', // 피 색상
                size: 1 + Math.random() * 1.5
            });
        }
    }

    _checkAttackHit(type) {
        if (!this.char || !this.banditData) return;
        
        const isHeavy = (type === 'heavy');
        const dmg = isHeavy ? 35 : 20;
        
        // 공격 검 베기 타격 판정 범위 (앞으로 55px 영역)
        const hitX = this.char.facingDir === 1 ? this.char.x + this.char.width : this.char.x - 55;
        const hitW = 55;
        const hitY = this.char.y + 10;
        const hitH = this.char.height - 20;

        for (const enemy of this.enemies) {
            if (enemy.state === 'dead') continue;

            // Bounding Box AABB 충돌 검사
            const overlapX = hitX < enemy.x + enemy.width && hitX + hitW > enemy.x;
            const overlapY = hitY < enemy.y + enemy.height && hitY + hitH > enemy.y;

            if (overlapX && overlapY) {
                // 적 피격 성공!
                const knocked = enemy.takeDamage(dmg, this.char.facingDir);
                if (knocked) {
                    // 타격 연출
                    this.screenShake = isHeavy ? 15.0 : 8.0;
                    this._hitstopTimer = 0.08; // 0.08초 프리즈 히트스톱
                    this._spawnBlood(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, this.char.facingDir, isHeavy ? 30 : 18);
                    
                    console.log(`[Combat] 적 타격 성공! 남은 HP: ${enemy.hp}`);
                }
            }
        }
    }

    _checkEnemyAttack(enemy) {
        if (!this.char || this.char.state === 'dead' || enemy.state !== 'attack' || enemy.frameIdx !== 0) return;
        
        // 적의 공격 판정 (휘두르는 시점)
        const hitX = enemy.facingDir === 1 ? enemy.x + enemy.width : enemy.x - 45;
        const hitW = 45;
        const hitY = enemy.y + 10;
        const hitH = enemy.height - 20;

        const overlapX = hitX < this.char.x + this.char.width && hitX + hitW > this.char.x;
        const overlapY = hitY < this.char.y + this.char.height && hitY + hitH > this.char.y;

        if (overlapX && overlapY) {
            // 플레이어 피격!
            const hitSuccess = this.char.takeDamage(15, enemy.facingDir);
            if (hitSuccess) {
                this.screenShake = 10.0;
                this._hitstopTimer = 0.08; // 플레이어도 피격 시 0.08초 히트스톱으로 타격감 동기화
                this._spawnBlood(this.char.x + this.char.width / 2, this.char.y + this.char.height / 2, enemy.facingDir, 15);
                console.log(`[Combat] 플레이어 피격! 남은 HP: ${this.char.hp}`);
            }
        }
    }

    _render(now) {
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, W, H);

        // 흑백 필터 양에 따라 필터 적용 ( Grayscale 사망 효과 )
        if (this._grayscaleAmount > 0) {
            ctx.filter = `grayscale(${Math.round(this._grayscaleAmount * 100)}%)`;
        } else {
            ctx.filter = 'none';
        }

        // 1. 패럴랙스 배경 그리기 (모래 픽셀 캐시 캔버스 활용)
        this._drawParallaxBackground(ctx);

        ctx.save();
        
        // 카메라 흔들림 및 카메라 트래킹 적용
        let shakeDx = 0, shakeDy = 0;
        if (this.screenShake > 0) {
            shakeDx = (Math.random() - 0.5) * this.screenShake;
            shakeDy = (Math.random() - 0.5) * this.screenShake;
        }

        ctx.translate(-Math.round(this.cameraX) + shakeDx, shakeDy);

        // 2. 인트로 별 파티클 드로잉
        if (this._state === 'spawn' || this._state === 'converge') {
            for (const star of this._stars) {
                ctx.globalAlpha = star.alpha;
                ctx.fillStyle = star.color;
                ctx.fillRect(Math.round(star.x), Math.round(star.y), 1.5, 1.5);
            }
            ctx.globalAlpha = 1.0;
        }

        // 3. 적군 렌더링
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
        }

        // 4. 플레이어 렌더링
        if (this.char && this._state === 'playing') {
            this.char.draw(ctx);
        }

        // 5. 피 분수 파티클 렌더링
        for (const p of this.bloodParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        ctx.globalAlpha = 1.0;

        ctx.restore();
        ctx.filter = 'none'; // 필터 해제

        // 6. UI 그리기
        this._drawUI(ctx);
    }

    _drawParallaxBackground(ctx) {
        // Layer 0: 하늘 (Parallax 0.15)
        if (this.skyCanvas) {
            const skyOffset = -Math.round(this.cameraX * 0.15) % W;
            ctx.drawImage(this.skyCanvas, skyOffset, 0);
            if (skyOffset < 0) {
                ctx.drawImage(this.skyCanvas, skyOffset + W, 0);
            }
        }

        // Layer 1: 나무 & 지면 (Parallax 0.6)
        // L2 덮어쓰기 우려를 해소하기 위해 L1에 지면까지 그려줌
        if (this.treesCanvas && this.groundCanvas) {
            const treeOffset = -Math.round(this.cameraX * 0.6) % W;
            
            // 나무 기둥들
            ctx.drawImage(this.treesCanvas, treeOffset, 0);
            if (treeOffset < 0) {
                ctx.drawImage(this.treesCanvas, treeOffset + W, 0);
            }

            // 흙길 지면
            ctx.drawImage(this.groundCanvas, treeOffset, 0);
            if (treeOffset < 0) {
                ctx.drawImage(this.groundCanvas, treeOffset + W, 0);
            }
        }
    }

    _drawUI(ctx) {
        if (!this.char || this._state !== 'playing') return;

        // 플레이어 HP 바 그리기
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(10, 10, 104, 10);
        
        ctx.fillStyle = '#c32020'; // 빨강 피격 체력바
        ctx.fillRect(12, 12, Math.round(this.char.hp), 6);

        // 조작 가이드 안내 텍스트
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillStyle = '#EDEBE4';
        ctx.fillText("A/D: 이동  SPACE: 점프  J: 약공격  K: 강공격  L: 구르기", 10, H - 10);
        
        // 적 처치 스코어 카운트
        const aliveEnemies = this.enemies.filter(e => e.state !== 'dead').length;
        ctx.fillStyle = '#EDEBE4';
        ctx.fillText(`적 잔당: ${aliveEnemies} / ${this.enemies.length}`, W - 80, 18);
        
        if (aliveEnemies === 0) {
            ctx.fillStyle = '#66ffcc';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillText("CHAPTER COMPLETE!", W / 2 - 50, H / 2 - 10);
        } else if (this.char.state === 'dead') {
            ctx.fillStyle = '#ff3333';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillText("YOU DIED", W / 2 - 25, H / 2 - 10);
        }
    }

    onRender() {}
}
