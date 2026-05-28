import { Scene }          from '../../../engine/scene/SceneManager.js';
import { CFG }            from './runner_config.js';
import ShapeCharacter     from './ShapeCharacter.js?v=21';

const W = CFG.GAME_W;
const H = CFG.GAME_H;

export default class RunnerScene extends Scene {
    constructor(overlayCanvas) {
        super('runner');
        this._overlay    = overlayCanvas;
        this._overlayCtx = overlayCanvas.getContext('2d');

        this.char = new ShapeCharacter();

        // 씬 상태: 'spawn' | 'converge' | 'playing'
        this._state = 'spawn';
        this._timer = 0;

        // 별 파티클 풀
        this._stars = [];
        this._maxStars = 256; // 16x16 네모의 총 픽셀 개수와 매치
        
        // 입력 상태
        this._isPointerDown = false;
        this._pointerX = 0;
        this._pointerScreenX = 0;

        // 카메라 시스템 (캐릭터 추적 부드러운 스크롤)
        this.cameraX = 0;
        this.targetCameraX = 0;

        // 포탈 상승 일렁임 및 버스트 파티클 풀
        this.portalParticles = [];

        // 🦍 돈킹콩 오프닝 연출 관련 상태 변수들
        this.cutsceneActive = false;
        this.cutsceneStep = 0;
        this.cutsceneTimer = 0;
        this.girderSlants = [0, 0, 0, 0]; // 1층, 2층, 3층, 4층 경사도 (0.0: 평지 ~ 1.0: 경사)
        this.screenShake = 0;
        
        // 연출 전용 돈킹콩 상태 객체
        this.dkCutscene = {
            x: 530,      // 1번 사다리 밑 (돈킹콩 40x36 크기에 맞춰 X=530으로 시작해서 중심 550에 기어오름)
            y: 162,      // 지면 Y=198 위
            state: 'walk_ground',
            frame: 0,
            animTimer: 0
        };

        this._engine = null;
    }

    async onInit(engine) {
        this._engine = engine;

        // 오버레이 캔버스 크기 동기화
        this._overlay.width  = W;
        this._overlay.height = H;

        // 이벤트 리스너 등록
        const canvas = engine.canvas;
        
        const handleDown = (e) => {
            const rect = this._overlay.getBoundingClientRect();
            const sx = (e.clientX - rect.left) * (W / rect.width);
            const mx = sx + this.cameraX; // 카메라 X 보정 대입
            const my = (e.clientY - rect.top) * (H / rect.height);

            // 캐릭터 영역 클릭 감지 시 순환 변신 (월드 좌표 mx 기준으로 판정)
            if (this._state === 'playing' && this.char.containsPoint(mx, my)) {
                this.char.cycleShape();
                return;
            }

            this._isPointerDown = true;
            this._pointerScreenX = sx;
            this._pointerX = mx;
        };

        const handleMove = (e) => {
            if (!this._isPointerDown) return;
            const rect = this._overlay.getBoundingClientRect();
            this._pointerScreenX = (e.clientX - rect.left) * (W / rect.width);
            this._pointerX = this._pointerScreenX + this.cameraX;
        };

        const handleUp = () => {
            this._isPointerDown = false;
        };

        canvas.addEventListener('pointerdown', handleDown);
        this._overlay.addEventListener('pointerdown', handleDown);
        
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);

        // 키보드 보조 조작 지원
        this._keys = {};
        window.addEventListener('keydown', (e) => {
            this._keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this._keys[e.code] = false;
        });

        this._startSequence();
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
        this.char.reset();
        this._isPointerDown = false;
        this._pointerScreenX = 0;
        this.cameraX = 0;
        this.targetCameraX = 0;
        this.portalParticles = [];

        // 🦍 연출 변수 초기화
        this.cutsceneActive = false;
        this.cutsceneStep = 0;
        this.cutsceneTimer = 0;
        this.girderSlants = [0, 0, 0, 0];
        this.screenShake = 0;
        this.dkCutscene = {
            x: 530,
            y: 162,
            state: 'walk_ground',
            frame: 0,
            animTimer: 0
        };

        // 엔진 클리어 (기존 개체 제거)
        if (this._engine) {
            this._engine.entities._entities.clear();
            this._engine.layers.clearAll();
            if (!this._engine._running) this._engine.start();
        }
    }

    // ── 페이즈 점프 기능 ───────────────────────────────────────────────
    // Phase 1: 처음부터 (별 생성 애니 포함)
    // Phase 2: 마리오 변신 상태 (포탈 1 지난 직후, X=310)
    // Phase 3: 주르르 변신 상태 (포탈 2 지난 직후, X=560)
    // Phase 4: 여우 변신 상태 (포탈 3 지난 직후, X=810)
    _jumpToPhase(phase) {
        // 공통 초기화
        this._state = 'playing';
        this._timer = 0;
        this._stars = [];
        this._isPointerDown = false;
        this._pointerScreenX = 0;
        this.portalParticles = [];
        this.cutsceneActive = false;
        this.cutsceneStep = 0;
        this.cutsceneTimer = 0;
        this.girderSlants = [0, 0, 0, 0];
        this.screenShake = 0;
        this.dkCutscene = {
            x: 530, y: 162, state: 'walk_ground', frame: 0, animTimer: 0
        };

        if (this._engine) {
            this._engine.entities._entities.clear();
            this._engine.layers.clearAll();
            if (!this._engine._running) this._engine.start();
        }

        this.char.reset();

        if (phase === 1) {
            // Phase 1: 처음부터 전체 시퀀스
            this._startSequence();
            return;

        } else if (phase === 2) {
            // Phase 2: 마리오 변신 완료 상태 (포탈 1 통과 직후)
            this.char.heroMode = 'mario';
            this.char.shape = 'square';
            this.char.speed = 180;
            this.char.x = 310;
            this.char.y = 174;
            this.char.targetX = 310;
            this.char.facingDir = 1;
            this.char.walkFrameIndex = -1;
            this.cameraX = 100;
            this.targetCameraX = 100;

        } else if (phase === 3) {
            // Phase 3: 주르르 변신 완료 상태 (포탈 2 통과 직후)
            this.char.heroMode = 'jururu';
            this.char.shape = 'square';
            this.char.speed = 180;
            this.char.x = 560;
            this.char.y = 174;
            this.char.targetX = 560;
            this.char.facingDir = 1;
            this.char.walkFrameIndex = -1;
            this.cameraX = 328;
            this.targetCameraX = 328;

        } else if (phase === 4) {
            // Phase 4: 여우 변신 완료 상태 (포탈 3 통과 직후)
            this.char.heroMode = 'fox';
            this.char.shape = 'square';
            this.char.speed = 180;
            this.char.x = 810;
            this.char.y = 150; // 여우 접지 Y = 190 - 40 = 150 (1배 스케일링)
            this.char.targetX = 810;
            this.char.facingDir = 1;
            this.char.walkFrameIndex = -1;
            this.cameraX = 578;
            this.targetCameraX = 578;
        } else if (phase === 5) {
            // Phase 5: 미니 여우 변신 완료 상태 (포탈 4 통과 직후)
            this.char.heroMode = 'fox_mini';
            this.char.shape = 'square';
            this.char.speed = 180;
            this.char.x = 1010;
            this.char.y = 174; // 미니 여우 접지 Y = 190 - 16 = 174 (마리오 스케일)
            this.char.targetX = 1010;
            this.char.facingDir = 1;
            this.char.walkFrameIndex = -1;
            this.cameraX = 720;
            this.targetCameraX = 720;
        }
    }

    // ── 업데이트 & 렌더링 루프 ─────────────────────────────────────────────
    onUpdate(now, dtMs, input) {
        const dt = Math.min(dtMs / 1000, 0.05);

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

        // 포탈 일렁이는 입자 및 버스트 파티클 업데이트
        this._updatePortalParticles(dt);

        this._render(now);
    }

    // 1. 별들의 시간차 출현 (Phase 0)
    _updateSpawn(dt) {
        this._timer += dt;

        // 매 프레임 시간차를 주며 새로운 별 1~3개씩 스폰
        const spawnCount = Math.floor(Math.random() * 3) + 1;
        if (this._stars.length < this._maxStars) {
            for (let i = 0; i < spawnCount; i++) {
                if (this._stars.length >= this._maxStars) break;
                
                this._stars.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    alpha: 0,
                    fadeSpeed: 0.8 + Math.random() * 1.5,
                    color: Math.random() < 0.5 ? '#EDEBE4' : '#41916c',
                    settled: false
                });
            }
        }

        // 별들 알파 페이드인 업데이트
        let allVisible = true;
        for (const star of this._stars) {
            if (star.alpha < 1) {
                star.alpha = Math.min(1, star.alpha + star.fadeSpeed * dt);
                allVisible = false;
            }
        }

        // 모든 별이 생성되었고 전부 투명도가 다 차면 수렴 상태로 전환 (최소 2.2초 대기)
        if (this._stars.length >= this._maxStars && allVisible && this._timer >= 2.2) {
            this._state = 'converge';
            this._timer = 0;
            this._assignTargets();
        }
    }

    _assignTargets() {
        const startX = 60; // 변신 게이트 중첩 방지를 위해 좌측 시작 X=60 조립 수렴
        const startY = 190 - 8; // 하단 Y: 190 조립

        const coords = [];
        for (let oy = 0; oy < 16; oy++) {
            for (let ox = 0; ox < 16; ox++) {
                coords.push({ tx: startX + ox, ty: startY + oy });
            }
        }

        // 좌표 목록 셔플 (무작위 결합 효과 극대화)
        for (let i = coords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [coords[i], coords[j]] = [coords[j], coords[i]];
        }

        for (let i = 0; i < this._stars.length; i++) {
            const star = this._stars[i];
            const coord = coords[i] ?? { tx: W / 2, ty: 190 };
            star.tx = coord.tx;
            star.ty = coord.ty;
            star.speed = 100 + Math.random() * 150; // 기본 수렴 이동 속도
        }
    }

    // 2. 별들의 수렴 (Phase 1)
    _updateConverge(dt) {
        let allSettled = true;

        for (const star of this._stars) {
            if (star.settled) continue;

            const dx = star.tx - star.x;
            const dy = star.ty - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 1.0) {
                star.x = star.tx;
                star.y = star.ty;
                star.settled = true;
            } else {
                allSettled = false;
                const step = Math.min(star.speed * dt, dist);
                star.x += (dx / dist) * step;
                star.y += (dy / dist) * step;
                star.speed += 350 * dt; // 수렴 속도 누적 가속
            }
        }

        if (allSettled) {
            this._state = 'playing';
            this._stars = []; // 수렴이 끝났으므로 별무리 파기
        }
    }

    // 3. 터치 및 좌우 이동 (Phase 2 / 3)
    _updatePlaying(dt) {
        // 변신 중(transformTimer > 0)일 때는 키보드/마우스 컨트롤을 무시
        if (this.char.transformTimer > 0) {
            // startPortalTransform 내부에서 고정해준 targetX를 유지
        } else {
            // 터치/마우스 조작: 홀딩 및 드래그 중인 지점으로 실시간 targetX를 갱신 (스크롤 변화량 반영)
            if (this._isPointerDown) {
                this._pointerX = this._pointerScreenX + this.cameraX;
                this.char.setTargetX(this._pointerX);
            }

            // 키보드 조작 백업 (캐릭터 너비에 기반한 중심점 자동 계산)
            if (this._keys['ArrowLeft'] || this._keys['KeyA']) {
                const halfW = this.char.width / 2;
                this.char.setTargetX(this.char.x + halfW - 15);
            }
            if (this._keys['ArrowRight'] || this._keys['KeyD']) {
                const halfW = this.char.width / 2;
                this.char.setTargetX(this.char.x + halfW + 15);
            }
        }

        this.char.update(dt);

        // [주인공 변환 포탈 장치 충돌 판정]
        // 포탈 1 (X=250, 범위 238~262): none <-> mario
        // 포탈 2 (X=500, 범위 488~512): mario <-> jururu
        // 포탈 3 (X=750, 범위 738~762): jururu <-> fox
        // 포탈 4 (X=950, 범위 938~962): fox <-> fox_mini
        const charCenterX = this.char.x + this.char.width / 2; // 캐릭터 너비가 고정되면서 중심점도 흔들림 없이 고정됨 (좌우 이동 덜덜 떨림 현상 완벽 방지)
        const inPortal1 = (charCenterX >= 238 && charCenterX <= 262);
        const inPortal2 = (charCenterX >= 488 && charCenterX <= 512);
        const inPortal3 = (charCenterX >= 738 && charCenterX <= 762);
        const inPortal4 = (charCenterX >= 938 && charCenterX <= 962);

        if (inPortal1) {
            if (!this.char.insidePortal && this.char.transformTimer <= 0) {
                this.char.insidePortal = true;
                if (this.char.heroMode === 'none') {
                    this.char.startPortalTransform('mario', 250);
                    this._spawnPortalBurst(250);
                } else if (this.char.heroMode === 'mario') {
                    this.char.startPortalTransform('none', 250);
                    this._spawnPortalBurst(250);
                }
            }
        } else if (inPortal2) {
            if (!this.char.insidePortal && this.char.transformTimer <= 0) {
                this.char.insidePortal = true;
                if (this.char.heroMode === 'mario') {
                    this.char.startPortalTransform('jururu', 500);
                    this._spawnPortalBurst(500);
                } else if (this.char.heroMode === 'jururu') {
                    this.char.startPortalTransform('mario', 500);
                    this._spawnPortalBurst(500);
                }
            }
        } else if (inPortal3) {
            if (!this.char.insidePortal && this.char.transformTimer <= 0) {
                this.char.insidePortal = true;
                if (this.char.heroMode === 'jururu') {
                    this.char.startPortalTransform('fox', 750);
                    this._spawnPortalBurst(750);
                } else if (this.char.heroMode === 'fox') {
                    this.char.startPortalTransform('jururu', 750);
                    this._spawnPortalBurst(750);
                }
            }
        } else if (inPortal4) {
            if (!this.char.insidePortal && this.char.transformTimer <= 0) {
                this.char.insidePortal = true;
                if (this.char.heroMode === 'fox') {
                    this.char.startPortalTransform('fox_mini', 950);
                    this._spawnPortalBurst(950);
                } else if (this.char.heroMode === 'fox_mini') {
                    this.char.startPortalTransform('fox', 950);
                    this._spawnPortalBurst(950);
                }
            }
        } else {
            // 포탈들을 완전히 벗어났고 변신이 끝났을 때만 플래그 해제
            if (this.char.transformTimer <= 0) {
                this.char.insidePortal = false;
            }
        }

        // 카메라 가로 스크롤 업데이트 (캐릭터 중심 부드러운 트래킹, 1200px 확장에 따라 한계 480 -> 720으로 확장)
        this.targetCameraX = Math.max(0, Math.min(720, this.char.x - 232));
        this.cameraX += (this.targetCameraX - this.cameraX) * 0.08;

        // 화면 진동 감쇠
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 25.0);
        }
    }

    // 포탈 일렁이는 파티클 갱신
    _updatePortalParticles(dt) {
        // 매 프레임 1~2개씩 포탈 내부 바닥에서 상승 파티클 생성 (포탈 1: X=250, 포탈 2: X=500, 포탈 3: X=750, 포탈 4: X=950)
        if (Math.random() < 0.5) {
            const portals = [250, 500, 750, 950];
            for (const px of portals) {
                this.portalParticles.push({
                    x: (px - 12) + Math.random() * 24,
                    y: 198,
                    vy: -(30 + Math.random() * 40),
                    alpha: 0.8,
                    color: Math.random() < 0.7 ? '#20d0ff' : '#003fc0',
                    size: 1 + Math.floor(Math.random() * 2),
                    type: 'rise'
                });
            }
        }

        for (const p of this.portalParticles) {
            if (p.type === 'burst') {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.alpha -= dt * 2.0;
            } else {
                p.y += p.vy * dt;
                p.alpha -= dt * 1.5; // 위로 가면서 서서히 사라짐
            }
        }
        this.portalParticles = this.portalParticles.filter(p => p.alpha > 0 && p.y >= 158);
    }

    // 포탈 진입 시 뿜어져 나오는 펄스 폭발 파티클
    _spawnPortalBurst(portalX) {
        for (let i = 0; i < 24; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 60;
            this.portalParticles.push({
                x: portalX,
                y: 178,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1.0,
                color: Math.random() < 0.6 ? '#20d0ff' : '#66ffcc',
                size: 1.5 + Math.random() * 1.5,
                type: 'burst'
            });
        }
    }

    // ── 렌더링 ────────────────────────────────────────────────────────
    _render(now) {
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, W, H);

        // 1. 변화가 있는 그라데이션 배경 그리기 (화면 고정)
        this._drawBackground(ctx);

        ctx.save();
        
        // 화면 흔들림 오프셋 계산
        let shakeDx = 0;
        let shakeDy = 0;
        if (this.screenShake > 0) {
            shakeDx = (Math.random() - 0.5) * this.screenShake;
            shakeDy = (Math.random() - 0.5) * this.screenShake;
        }

        // 월드 스크롤 및 화면 흔들림 오프셋 투영
        ctx.translate(-Math.round(this.cameraX) + shakeDx, shakeDy);

        // 2. 상태별 요소 그리기
        if (this._state === 'spawn' || this._state === 'converge') {
            // 별무리 그리기
            for (const star of this._stars) {
                ctx.globalAlpha = star.alpha;
                ctx.fillStyle = star.color;
                ctx.fillRect(Math.round(star.x), Math.round(star.y), 1, 1);
            }
            ctx.globalAlpha = 1.0;
        } else if (this._state === 'playing') {
            // 네 개의 포탈 그리기 (X: 250, X: 500, X: 750, X: 950)
            this._drawPortal(ctx, 250);
            this._drawPortal(ctx, 500);
            this._drawPortal(ctx, 750);
            this._drawPortal(ctx, 950);

            // 네모세모동그라미 몸체
            this.char.draw(ctx);
        }

        ctx.restore();
    }

    _drawBackground(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a0914'); 
        grad.addColorStop(0.5, '#050409'); 
        grad.addColorStop(1, '#000000'); 
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // 🌀 포탈 그리기 (상하단 원판 + 반투명 장막 + 반짝이 도트)
    _drawPortal(ctx, x) {
        // 1. 반투명한 푸른빛 에너지 실린더 장막 그리기
        ctx.save();
        ctx.globalAlpha = 0.22;
        
        const grad = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
        grad.addColorStop(0, 'rgba(0,63,192,0.1)');
        grad.addColorStop(0.5, 'rgba(32,208,255,0.7)');
        grad.addColorStop(1, 'rgba(0,63,192,0.1)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 16, 158, 32, 40);
        ctx.restore();

        // 2. 일렁이는 포탈 파티클 렌더링 (이 포탈 x범위 내에 속하는 파티클만 필터링하여 렌더링)
        for (const p of this.portalParticles) {
            if (p.type === 'rise' && (p.x < x - 16 || p.x > x + 16)) continue;
            // burst 파티클은 제한 없이 렌더링
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        ctx.globalAlpha = 1.0;

        // 3. 상단 및 하단 에너지 고리 원판 (타원형 고리 느낌)
        ctx.fillStyle = '#003fc0';
        ctx.fillRect(x - 14, 157, 28, 2);
        ctx.fillRect(x - 16, 158, 32, 1);
        ctx.fillStyle = '#20d0ff';
        ctx.fillRect(x - 10, 157, 20, 1);

        ctx.fillStyle = '#003fc0';
        ctx.fillRect(x - 14, 197, 28, 2);
        ctx.fillRect(x - 16, 198, 32, 1);
        ctx.fillStyle = '#20d0ff';
        ctx.fillRect(x - 10, 197, 20, 1);
    }

    onRender() {}
}
