/**
 * ShapeCharacter — 다중 도형 캐릭터 (네모, 세모, 동그라미 순환 및 차별화된 물리 적용)
 */
import { CFG } from './runner_config.js';

// 고해상도 여우 캐릭터 이미지 사전 로드 (대기 및 뛰기 3동작)
const foxStandImg = new Image(); foxStandImg.src = './assets/fox_stand.png?v=1';
const foxRun1Img = new Image();  foxRun1Img.src = './assets/fox_run1.png?v=1';
const foxRun2Img = new Image();  foxRun2Img.src = './assets/fox_run2.png?v=1';
const foxRun3Img = new Image();  foxRun3Img.src = './assets/fox_run3.png?v=1';


export default class ShapeCharacter {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 60;                 // 변신 게이트 중첩 방지를 위해 좌측 시작 X=60으로 조정
        this.y = 190 - 8;            // 하단 조립 Y
        this.width = 16;
        this.height = 16;

        // 현재 도형 상태: 'square' | 'triangle' | 'circle'
        this.shape = 'square';
        this.speed = 180;            // 네모 기본 속도 (보통)

        // 회전 (굴러가기) 각도 및 이동 방향
        this.rollAngle = 0;
        this._movingDir = 0;         // -1: 좌, 0: 정지, 1: 우

        // 목표 X 좌표 (유저가 클릭한 위치)
        this.targetX = this.x;

        // 약한 스피드 꼬리 파티클 풀
        this.trails = [];

        // 변신 연출용 멤버 변수 초기화
        this.transformTimer = 0;
        this.transformDuration = 0.5; // 0.5초 지속
        this.transformStars = [];
        this.nextShape = null;
        this.nextSpeed = 0;

        // 주인공 변환 기믹 관련 변수 추가
        this.heroMode = 'none';       // 'none' | 'mario' | 'jururu' | 'fox'
        this.insidePortal = false;
        this.nextHeroMode = null;

        // 애니메이션 관련 변수 추가
        this.facingDir = 1;          // 1: 우, -1: 좌
        this.walkAnimTimer = 0;
        this.walkBounceY = 0;        // 여우 통통 튀기 오프셋
        this.walkPitchAngle = 0;     // 여우 기울기 오프셋
        this.walkFrameIndex = -1;    // -1: 서있기, 0: 왼발들기, 1: 오른발들기
    }

    get isHero() {
        return this.heroMode !== 'none';
    }

    _getFoxPixelCoords() {
        const coords = [];
        const colors = ['#8a2542', '#e8b0b8', '#ffffff', '#2d1b24', '#e0a810', '#fcd8a8'];
        // ox: -6 ~ 5, oy: -8 ~ 7 범위에서 약 200개의 무작위 좌표 생성 (변신 시 스파크 렉 방지)
        for (let i = 0; i < 200; i++) {
            const ox = Math.floor(Math.random() * 12) - 6;
            const oy = Math.floor(Math.random() * 16) - 8;
            const color = colors[Math.floor(Math.random() * colors.length)];
            coords.push({ ox, oy, color });
        }
        return coords;
    }

    _getShapePixelCoords(shape) {
        const coords = [];
        if (shape === 'square') {
            for (let oy = -8; oy < 8; oy++) {
                for (let ox = -8; ox < 8; ox++) {
                    const color = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#41916c';
                    coords.push({ ox, oy, color });
                }
            }
        } else if (shape === 'triangle') {
            // 17x15px 정삼각형 좌표셋
            const limits = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8];
            for (let oy = -7; oy <= 7; oy++) {
                const limit = limits[oy + 7];
                for (let ox = -8; ox <= 8; ox++) {
                    if (ox >= -limit && ox <= limit) {
                        const color = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#e03030';
                        coords.push({ ox, oy, color });
                    }
                }
            }
        } else if (shape === 'circle') {
            for (let oy = -8; oy < 8; oy++) {
                for (let ox = -8; ox < 8; ox++) {
                    if (ox * ox + oy * oy <= 8 * 8) {
                        const color = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#20d0ff';
                        coords.push({ ox, oy, color });
                    }
                }
            }
        }
        return coords;
    }

    _getMarioPixelCoords() {
        const coords = [];
        const R = '#e03030';
        const P = '#003fc0';
        const S = '#fcd8a8';
        const _ = null;

        const sprite = [
            [_, _, _, R, R, R, R, R, _, _, _, _], // oy = -8
            [_, _, R, R, R, R, R, R, R, R, R, _], // oy = -7
            [_, _, P, P, P, S, S, P, S, _, _, _], // oy = -6
            [_, P, S, P, S, S, S, P, S, S, S, _], // oy = -5
            [_, P, S, P, P, S, S, S, P, S, S, P], // oy = -4
            [_, P, P, S, S, S, S, P, P, P, P, _], // oy = -3
            [_, _, _, S, S, S, S, S, S, S, _, _], // oy = -2
            [_, _, P, P, R, P, P, P, _, _, _, _], // oy = -1
            [_, P, P, P, R, P, P, R, P, P, P, _], // oy = 0
            [P, P, P, P, R, R, R, R, P, P, P, P], // oy = 1
            [S, S, P, R, R, R, R, R, R, P, S, S], // oy = 2
            [S, S, S, R, R, R, R, R, R, S, S, S], // oy = 3
            [_, _, R, R, R, R, R, R, R, R, _, _], // oy = 4
            [_, _, R, R, R, _, _, R, R, R, _, _], // oy = 5
            [_, P, P, P, _, _, _, _, P, P, P, _], // oy = 6
            [P, P, P, P, _, _, _, _, P, P, P, P]  // oy = 7
        ];

        for (let oy = -8; oy <= 7; oy++) {
            const row = sprite[oy + 8];
            for (let ox = -6; ox <= 5; ox++) {
                const color = row[ox + 6];
                if (color) {
                    coords.push({ ox, oy, color });
                }
            }
        }
        return coords;
    }

    _getJururuPixelCoords() {
        const coords = [];
        const H = '#ff007f';
        const B = '#ffcc00';
        const S = '#fcd8a8';
        const E = '#301010';
        const C = '#201020';
        const W = '#ffffff';
        const _ = null;

        const sprite = [
            [_, _, H, H, B, B, H, H, _, _, _, _], // oy = -8
            [_, H, H, H, H, H, H, H, H, _, _, _], // oy = -7
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -6
            [H, H, S, E, S, S, E, S, H, H, _, _], // oy = -5
            [H, H, S, S, S, S, S, S, H, H, _, _], // oy = -4
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -3
            [_, _, H, W, C, C, W, H, _, _, _, _], // oy = -2
            [_, _, C, W, W, W, W, C, _, _, _, _], // oy = -1
            [_, H, C, C, W, W, C, C, H, _, _, _], // oy = 0
            [_, H, C, C, W, W, C, C, H, _, _, _], // oy = 1
            [_, H, C, C, C, C, C, C, H, _, _, _], // oy = 2
            [_, _, C, C, C, C, C, C, _, _, _, _], // oy = 3
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 4
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 5
            [_, H, H, _, _, _, _, H, H, _, _, _], // oy = 6
            [_, H, H, _, _, _, _, H, H, _, _, _]  // oy = 7
        ];

        for (let oy = -8; oy <= 7; oy++) {
            const row = sprite[oy + 8];
            for (let ox = -6; ox <= 5; ox++) {
                const color = row[ox + 6];
                if (color) {
                    coords.push({ ox, oy, color });
                }
            }
        }
        return coords;
    }

    cycleShape() {
        if (this.transformTimer > 0) return; // 이미 변신 중이면 중복 방지
        if (this.isHero) return;             // 마리오 상태일 땐 클릭 도형변신 비활성화

        let nextShape = 'square';
        let nextSpeed = 180;

        if (this.shape === 'square') {
            nextShape = 'triangle';
            nextSpeed = 120;
        } else if (this.shape === 'triangle') {
            nextShape = 'circle';
            nextSpeed = 280;
        } else {
            nextShape = 'square';
            nextSpeed = 180;
        }

        this.nextShape = nextShape;
        this.nextSpeed = nextSpeed;
        this.nextHeroMode = 'none';
        this.transformTimer = this.transformDuration;

        // 기존 도형의 픽셀 좌표와 다음 도형의 픽셀 좌표 추출
        const srcCoords = this._getShapePixelCoords(this.shape);
        const destCoords = this._getShapePixelCoords(nextShape);

        // 좌표 랜덤성 셔플
        for (let i = srcCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [srcCoords[i], srcCoords[j]] = [srcCoords[j], srcCoords[i]];
        }
        for (let i = destCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [destCoords[i], destCoords[j]] = [destCoords[j], destCoords[i]];
        }

        // 파티클 개수는 두 픽셀 갯수의 최댓값으로 설정해 빈틈없이 메움
        const pCount = Math.max(srcCoords.length, destCoords.length);
        this.transformStars = [];

        const cx = this.x + 8;
        const cy = this.y + 8;

        for (let i = 0; i < pCount; i++) {
            const src = srcCoords[i] ?? srcCoords[Math.floor(Math.random() * srcCoords.length)];
            const dest = destCoords[i] ?? destCoords[Math.floor(Math.random() * destCoords.length)];

            // 튕겨나갈 중간 오프셋 (외곽 방향 분산)
            const pushDirX = src.ox === 0 ? (Math.random() - 0.5) * 8 : src.ox;
            const pushDirY = src.oy === 0 ? (Math.random() - 0.5) * 8 : src.oy;

            const midOffsetX = src.ox + pushDirX * 1.5 + (Math.random() - 0.5) * 10;
            const midOffsetY = src.oy + pushDirY * 1.5 + (Math.random() - 0.5) * 10;

            this.transformStars.push({
                srcX: src.ox,
                srcY: src.oy,
                midX: midOffsetX,
                midY: midOffsetY,
                destX: dest.ox,
                destY: dest.oy,
                currentX: cx + src.ox,
                currentY: cy + src.oy,
                color1: src.color,
                color2: dest.color,
                color: src.color,
                size: 1 + Math.floor(Math.random() * 2)
            });
        }

        this.trails = []; // 이전 꼬리 즉각 정리
    }

    startPortalTransform(targetMode, portalX) {
        if (this.transformTimer > 0) return; // 이미 변신 중이면 중복 방지

        const isDestHero = (targetMode !== 'none');
        // 여우(fox)는 대기상태 48px(1배 규격), 미니여우(fox_mini)는 24px(마리오 크기)
        const isFox = (targetMode === 'fox');
        const isFoxMini = (targetMode === 'fox_mini');
        const halfW = isFox ? 13 : (isFoxMini ? 7 : (isDestHero ? 12 : 8));
        const maxYVal = isFox ? 40 : (isFoxMini ? 16 : (isDestHero ? 16 : 8));

        this.x = portalX - halfW;
        this.targetX = this.x;
        this.y = 190 - maxYVal;

        this.nextHeroMode = targetMode;
        this.nextShape = this.shape;
        this.nextSpeed = this.speed;
        this.transformTimer = this.transformDuration;

        const getCoords = (mode) => {
            if (mode === 'none') return this._getShapePixelCoords(this.shape);
            if (mode === 'mario') return this._getMarioPixelCoords();
            if (mode === 'jururu') return this._getJururuPixelCoords();
            if (mode === 'fox') return this._getFoxPixelCoords();
            return this._getShapePixelCoords(this.shape);
        };

        const srcCoords = getCoords(this.heroMode);
        const destCoords = getCoords(targetMode);

        // 좌표 랜덤성 셔플
        for (let i = srcCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [srcCoords[i], srcCoords[j]] = [srcCoords[j], srcCoords[i]];
        }
        for (let i = destCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [destCoords[i], destCoords[j]] = [destCoords[j], destCoords[i]];
        }

        const pCount = Math.max(srcCoords.length, destCoords.length);
        this.transformStars = [];

        const cx = this.x + halfW;
        const cy = this.y + (targetMode === 'fox' ? 12 : (targetMode === 'fox_mini' ? 6 : (isDestHero ? 12 : 8)));

        const srcScale = (this.heroMode === 'none') ? 1.0 : 1.5;
        const destScale = (targetMode === 'fox_mini') ? 0.75 : (isDestHero ? 1.5 : 1.0);

        for (let i = 0; i < pCount; i++) {
            const src = srcCoords[i] ?? srcCoords[Math.floor(Math.random() * srcCoords.length)];
            const dest = destCoords[i] ?? destCoords[Math.floor(Math.random() * destCoords.length)];

            const pushDirX = src.ox === 0 ? (Math.random() - 0.5) * 8 : src.ox;
            const pushDirY = src.oy === 0 ? (Math.random() - 0.5) * 8 : src.oy;

            const midOffsetX = (src.ox + pushDirX * 1.5 + (Math.random() - 0.5) * 10) * (isDestHero ? 1.3 : 1.0);
            const midOffsetY = (src.oy + pushDirY * 1.5 + (Math.random() - 0.5) * 10) * (isDestHero ? 1.3 : 1.0);

            this.transformStars.push({
                srcX: src.ox * srcScale,
                srcY: src.oy * srcScale,
                midX: midOffsetX,
                midY: midOffsetY,
                destX: dest.ox * destScale,
                destY: dest.oy * destScale,
                currentX: cx + src.ox * srcScale,
                currentY: cy + src.oy * srcScale,
                color1: src.color,
                color2: dest.color,
                color: src.color,
                size: isDestHero ? (1.5 + Math.random() * 2) : (1 + Math.floor(Math.random() * 2))
            });
        }

        this.trails = [];
    }

    setTargetX(mx) {
        this.targetX = Math.max(0, Math.min(1200 - this.width, mx - this.width / 2));
    }

    // 클릭 터치 지점 판정 AABB
    containsPoint(mx, my) {
        const margin = 4;
        return mx >= this.x - margin && mx <= this.x + this.width + margin &&
               my >= this.y - margin && my <= this.y + this.height + margin;
    }

    _spawnTrailParticle() {
        const isFox = (this.heroMode === 'fox');
        const isFoxMini = (this.heroMode === 'fox_mini');
        let drawW = 27;
        if (isFox || isFoxMini) {
            const baseW = isFox ? 27 : 13;
            const run1W = isFox ? 42 : 21;
            const run2W = isFox ? 52 : 26;
            const run3W = isFox ? 40 : 20;
            drawW = baseW;
            if (this._movingDir !== 0) {
                if (this.walkFrameIndex === 0) drawW = run1W;
                else if (this.walkFrameIndex === 1) drawW = run2W;
                else drawW = run3W;
            }
        }
        const cx = this.x + ((isFox || isFoxMini) ? drawW / 2 : (this.isHero ? 12 : 8));
        const cy = this.y + (isFox ? 24 : (isFoxMini ? 12 : (this.isHero ? 12 : 8)));
        
        let speedMult = 1.0;
        let spawnChance = 0.50;
        let colors = ['#EDEBE4', '#41916c']; // 기본 네모 꼬리

        if (isFox || isFoxMini) {
            speedMult = isFox ? 1.3 : 1.0;
            spawnChance = isFox ? 0.70 : 0.40;
            colors = ['#8a2542', '#e8b0b8', '#ffffff']; // 여우(붉은 보라/연핑크/흰색)
        } else if (this.isHero) {
            speedMult = 1.2;
            spawnChance = 0.60;
            colors = ['#e03030', '#003fc0', '#fcd8a8']; // 마리오/주르르
        } else {
            // 각 도형 속도 및 컬러에 맞춘 꼬리 이펙트 차별화
            if (this.shape === 'triangle') {
                speedMult = 0.6;
                spawnChance = 0.25;             // 세모: 느림, 띄엄띄엄 스폰
                colors = ['#EDEBE4', '#e03030']; // 빨강 포인트
            } else if (this.shape === 'circle') {
                speedMult = 1.6;
                spawnChance = 0.85;             // 동그라미: 초고속, 아주 조밀 스폰
                colors = ['#EDEBE4', '#20d0ff', '#66ffcc']; // 민트/하늘빛 포인트
            }
        }

        if (Math.random() > spawnChance) return;

        const vx = -this._movingDir * (40 + Math.random() * 50) * speedMult;
        const vy = (Math.random() - 0.5) * 20 * speedMult;

        const offsetMultiplier = isFox ? 1.25 : (isFoxMini ? 0.6 : (this.isHero ? 1.5 : 1.0));
        this.trails.push({
            x: cx - this._movingDir * (8 * offsetMultiplier) + (Math.random() - 0.5) * (4 * offsetMultiplier),
            y: cy + (Math.random() - 0.5) * (10 * offsetMultiplier),
            vx: vx,
            vy: vy,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 0.9,
            life: (0.12 + Math.random() * 0.12) * (this.shape === 'circle' ? 1.5 : 1.0)
        });
    }

    update(dt) {
        // 상태별 동적 캐릭터 충돌박스 너비/높이 분기
        if (this.heroMode === 'fox') {
            this.width = 27; // 충돌 너비는 1배 대기 상태 가로폭 27px로 고정
            this.height = 48; // 높이도 1배 규격인 48px로 고정
        } else if (this.heroMode === 'fox_mini') {
            this.width = 13; // 미니 여우: 마리오 사이즈 너비 13px로 고정
            this.height = 24; // 높이도 마리오 크기인 24px로 고정
        } else {
            this.width = this.isHero ? 24 : 16;
            this.height = this.isHero ? 24 : 16;
        }

        // 변신 연출 업데이트 (도형 변환 및 포탈 주인공 변환 모두 포함)
        if (this.transformTimer > 0) {
            this.transformTimer -= dt;
            const elapsed = this.transformDuration - this.transformTimer; // 0 -> 0.5

            const nextIsHero = (this.nextHeroMode !== null && this.nextHeroMode !== 'none');
            const nextIsFox = (this.nextHeroMode === 'fox');
            const nextIsFoxMini = (this.nextHeroMode === 'fox_mini');
            const cx = this.x + (nextIsFox ? 13 : (nextIsFoxMini ? 7 : (nextIsHero ? 12 : 8)));
            const cy = this.y + (nextIsFox ? 24 : (nextIsFoxMini ? 12 : (nextIsHero ? 12 : 8)));

            if (elapsed <= 0.20) {
                // 1단계: 해체 및 흩어짐 (0.0 ~ 0.2초)
                const u = elapsed / 0.20;
                const p = Math.sin((u * Math.PI) / 2); // Ease-Out 곡선 적용

                for (const star of this.transformStars) {
                    const ox = star.srcX + (star.midX - star.srcX) * p;
                    const oy = star.srcY + (star.midY - star.srcY) * p;
                    star.currentX = cx + ox;
                    star.currentY = cy + oy;
                    star.color = star.color1;
                }
            } else {
                // 2단계: 가속 수렴 및 조립 (0.2 ~ 0.5초)
                const v = Math.min(1.0, (elapsed - 0.20) / (this.transformDuration - 0.20));
                const p = v * v * v; // Cubic Ease-In (가속)

                for (const star of this.transformStars) {
                    const ox = star.midX + (star.destX - star.midX) * p;
                    const oy = star.midY + (star.destY - star.midY) * p;
                    star.currentX = cx + ox;
                    star.currentY = cy + oy;
                    // 중간 수렴 시점부터 다음 도형 색깔 블렌딩
                    star.color = v > 0.5 ? star.color2 : star.color1;
                }
            }

            if (this.transformTimer <= 0) {
                if (this.nextHeroMode !== null) {
                    this.heroMode = this.nextHeroMode;
                }
                this.shape = this.nextShape;
                this.speed = this.nextSpeed;
                this.transformStars = [];
                this.nextShape = null;
                this.nextHeroMode = null;
            }
        }

        // X축 목표 위치 추적 이동
        const diffX = this.targetX - this.x;
        const absDiff = Math.abs(diffX);
        const step = this.speed * dt;

        if (absDiff <= 1.0 || absDiff <= step) {
            this.x = this.targetX;
            this._movingDir = 0;

            // 정지 상태일 때 애니메이션 리셋 (서있기 자세로)
            this.walkFrameIndex = -1;
            this.walkAnimTimer = 0;
            this.walkBounceY = 0;
            this.walkPitchAngle = 0;

            // 영웅 주인공 상태일 땐 회전 각도 무조건 0으로 정지
            if (this.isHero) {
                this.rollAngle = 0;
            } else {
                // 멈췄을 때: 무조건 첫 화면처럼 0도로 복구 정렬 (일그러짐 원천 차단)
                const targetAngle = 0;
                const diffAngle = targetAngle - this.rollAngle;

                if (Math.abs(diffAngle) < 0.01) {
                    this.rollAngle = 0;
                } else {
                    this.rollAngle += diffAngle * 0.25;
                }
            }
        } else {
            // 목표 지점을 향해 등속 구르기 이동
            this._movingDir = Math.sign(diffX);
            this.x += this._movingDir * step;

            if (this.isHero) {
                this.rollAngle = 0;
                this.facingDir = this._movingDir;
                
                this.walkAnimTimer += dt;
                if (this.heroMode === 'fox' || this.heroMode === 'fox_mini') {
                    // 여우 또는 미니 여우: 3동작 이미지 루핑 및 걷는 물리 오프셋 적용
                    this.walkFrameIndex = Math.floor(this.walkAnimTimer / 0.065) % 3;
                    this.walkBounceY = Math.sin(this.walkAnimTimer * 20.0) * (this.heroMode === 'fox' ? 1.5 : 0.75);
                    this.walkPitchAngle = this.facingDir * 0.05 * Math.sin(this.walkAnimTimer * 20.0);
                } else {
                    // 마리오, 주르르: 3프레임 도트 애니메이션
                    if (this.walkFrameIndex === -1) {
                        this.walkFrameIndex = 0;
                    }
                    if (this.walkAnimTimer >= 0.065) {
                        this.walkFrameIndex = (this.walkFrameIndex + 1) % 3;
                        this.walkAnimTimer = 0;
                    }
                    this.walkBounceY = 0;
                    this.walkPitchAngle = 0;
                }
            } else {
                // 구르기 각도 누적 (원래 크기인 반경 8px 기준 회전)
                this.rollAngle += this._movingDir * (step / 8);

                // 각도 범위 정규화 (0 ~ 2*PI)
                this.rollAngle = this.rollAngle % (Math.PI * 2);
                if (this.rollAngle < 0) this.rollAngle += Math.PI * 2;
            }

            // 이동 중에만 스피드 꼬리 방출
            this._spawnTrailParticle();
        }

        // 회전 각도에 따른 실시간 Y축 지면 밀착 물리 (maxY 계산)
        let maxY = 8;
        if (this.heroMode === 'fox') {
            maxY = 40; // 여우: 세로 48px 중 접지 오프셋
        } else if (this.heroMode === 'fox_mini') {
            maxY = 16; // 미니 여우: 세로 24px 중 접지 오프셋
        } else if (this.isHero) {
            maxY = 16;
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

        // 최하단 픽셀을 항상 지면(Y: 190)에 밀착 + 걷기 바운스 적용
        this.y = 190 - maxY + this.walkBounceY;

        // 꼬리 파티클 업데이트
        for (const p of this.trails) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.alpha = Math.max(0, p.alpha - dt * (this.shape === 'circle' ? 2.2 : 3.5));
        }
        this.trails = this.trails.filter(p => p.life > 0);

        // 범위 제한 방어 — 월드 한계 1200px로 확장 적용
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > 1200) {
            this.x = 1200 - this.width;
        }
    }

    _drawShapeByName(ctx, name) {
        if (name === 'square') {
            this._drawSquare(ctx);
        } else if (name === 'triangle') {
            this._drawTriangle(ctx);
        } else if (name === 'circle') {
            this._drawCircle(ctx);
        }
    }

    _drawJururu(ctx) {
        // 이세계아이돌 주르르 12x16px 고퀄리티 도안 데이터 (6색 스펙)
        // H: 핫핑크 머리(#ff007f), B: 노란 리본(#ffcc00), S: 피부색(#fcd8a8)
        // E: 눈동자(#301010), C: 드레스 검은색(#201020), W: 드레스 흰색(#ffffff), _: 투명
        const H = '#ff007f';
        const B = '#ffcc00';
        const S = '#fcd8a8';
        const E = '#301010';
        const C = '#201020';
        const W = '#ffffff';
        const _ = null;

        // 1. 제자리 대기 1 (숨을 들이쉬어 척추가 늘어난 상태)
        const spriteStand = [
            [_, _, H, H, B, B, H, H, _, _, _, _], // oy = -8
            [_, H, H, H, H, H, H, H, H, _, _, _], // oy = -7
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -6
            [H, H, S, E, S, S, E, S, H, H, _, _], // oy = -5
            [H, H, S, S, S, S, S, S, H, H, _, _], // oy = -4
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -3
            [_, _, H, W, C, C, W, H, _, _, _, _], // oy = -2 (흰 깃 W)
            [_, _, C, W, W, W, W, C, _, _, _, _], // oy = -1 (에이프런 C/W)
            [_, H, C, C, W, W, C, C, H, _, _, _], // oy = 0  (양갈래 머리가 어깨 아래로 처짐)
            [_, H, C, C, W, W, C, C, H, _, _, _], // oy = 1
            [_, H, C, C, C, C, C, C, H, _, _, _], // oy = 2
            [_, _, C, C, C, C, C, C, _, _, _, _], // oy = 3
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 4  (곧게 뻗은 다리)
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 5
            [_, H, H, _, _, _, _, H, H, _, _, _], // oy = 6  (핑크 구두 H)
            [_, H, H, _, _, _, _, H, H, _, _, _]  // oy = 7
        ];

        // 2. 달리기 프레임 1 (오른다리 딛고 왼다리 차기, 오른쪽 머리 뒤로 휘날림)
        const spriteWalk1 = [
            [_, _, _, H, H, B, B, H, H, _, _, _], // oy = -8
            [_, H, H, H, H, H, H, H, H, _, _, _], // oy = -7
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -6
            [H, H, S, E, S, S, E, S, H, H, _, _], // oy = -5
            [_, H, H, S, S, S, S, H, H, _, H, H], // oy = -4 (오른쪽 트윈테일 흩날림)
            [_, H, H, S, S, S, S, H, H, H, H, _], // oy = -3
            [_, _, H, W, C, C, W, H, H, _, _, _], // oy = -2
            [_, _, C, W, W, W, W, C, _, _, _, _], // oy = -1
            [_, H, C, C, W, W, C, C, H, _, S, _], // oy = 0  (앞팔 굽혀서 손 노출 S)
            [_, H, C, C, W, W, C, C, H, S, S, _], // oy = 1
            [_, _, C, C, C, C, C, C, _, _, _, _], // oy = 2
            [_, _, C, C, C, C, C, C, _, _, _, _], // oy = 3
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 4  (다리 교차)
            [_, S, S, S, _, _, _, S, S, S, _, _], // oy = 5
            [_, H, H, _, _, _, _, _, H, H, _, _], // oy = 6  (양발 찢어짐)
            [_, _, _, _, _, _, _, _, H, H, H, _]  // oy = 7
        ];

        // 3. 제자리 대기 2 (숨을 내쉬어 상체가 1px 하강한 상태 - 지연 물리 적용)
        const spriteWalk2 = [
            [_, _, _, _, _, _, _, _, _, _, _, _], // oy = -8 (상체 하강에 따른 윗줄 비움)
            [_, _, H, H, B, B, H, H, _, _, _, _], // oy = -7
            [_, H, H, H, H, H, H, H, H, _, _, _], // oy = -6
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -5
            [H, H, S, E, S, S, E, S, H, H, _, _], // oy = -4
            [H, H, S, S, S, S, S, S, H, H, _, _], // oy = -3
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -2
            [_, _, H, W, C, C, W, H, _, _, _, _], // oy = -1 (옷 라인이 1px 하강)
            [_, _, C, W, W, W, W, C, _, _, _, _], // oy = 0
            [_, H, C, C, W, W, C, C, H, _, _, _], // oy = 1  (머리가 관성으로 인해 양끝이 위로 살짝 휘어짐)
            [_, H, C, C, C, C, C, C, H, _, _, _], // oy = 2
            [_, _, C, C, C, C, C, C, _, _, _, _], // oy = 3
            [_, _, S, S, _, _, S, S, _, _, _, _], // oy = 4  (다리가 짧아져 무릎 굽힌 물리 연출)
            [_, H, H, _, _, _, _, H, H, _, _, _], // oy = 5  (구두 지면 밀착 보존)
            [_, H, H, _, _, _, _, H, H, _, _, _], // oy = 6
            [_, _, _, _, _, _, _, _, _, _, _, _]  // oy = 7
        ];

        // 4. 달리기 프레임 2 (왼다리 딛고 오른다리 차기, 왼쪽 머리 뒤로 휘날림)
        const spriteWalk3 = [
            [_, _, _, H, H, B, B, H, H, _, _, _], // oy = -8
            [_, H, H, H, H, H, H, H, H, _, _, _], // oy = -7
            [_, H, H, S, S, S, S, H, H, _, _, _], // oy = -6
            [H, H, S, E, S, S, E, S, H, H, _, _], // oy = -5
            [H, H, _, H, H, S, S, S, S, H, H, _], // oy = -4 (왼쪽 트윈테일 흩날림)
            [_, H, H, H, H, S, S, S, S, H, H, _], // oy = -3
            [_, _, H, H, W, C, C, W, H, _, _, _], // oy = -2
            [_, _, _, C, W, W, W, W, C, _, _, _], // oy = -1
            [_, S, _, H, C, C, W, W, C, C, H, _], // oy = 0  (뒷손/앞손 굽히기 반대)
            [_, S, S, H, C, C, W, W, C, C, H, _], // oy = 1
            [_, _, _, C, C, C, C, C, C, _, _, _], // oy = 2
            [_, _, _, C, C, C, C, C, C, _, _, _], // oy = 3
            [_, _, _, S, S, _, _, S, S, _, _, _], // oy = 4  (다리 교차 반대)
            [_, _, S, S, S, _, _, _, S, S, S, _], // oy = 5
            [_, _, H, H, _, _, _, _, _, H, H, _], // oy = 6
            [_, H, H, H, _, _, _, _, _, _, _, _]  // oy = 7
        ];

        let sprite = spriteStand;
        
        if (this._movingDir === 0) {
            // [제자리 대기 상태]: 대기 프레임 1 (spriteStand)과 대기 프레임 2 (spriteWalk2)를 
            // 0.4초 주기로 교차 재생하여 미세 호흡 바운스 및 양갈래 머리 관성 연출 작동!
            const idleFrame = Math.floor(performance.now() / 400) % 3;
            if (idleFrame === 0) {
                sprite = spriteStand;
            } else if (idleFrame === 1) {
                sprite = spriteWalk2; // 하강
            } else {
                // 눈 깜빡임 프레임 적용을 위해 눈동자(E)를 피부색(S)으로 덮은 대기 복구본 생성
                const spriteBlink = spriteStand.map(row => 
                    row.map(color => color === E ? S : color)
                );
                sprite = spriteBlink;
            }
        } else {
            // [이동(달리기) 상태]: 3프레임 역동적 달리기 재생
            if (this.walkFrameIndex === 0) {
                sprite = spriteWalk1;
            } else if (this.walkFrameIndex === 1) {
                sprite = spriteWalk2; // 중간 모음 과도기
            } else if (this.walkFrameIndex === 2) {
                sprite = spriteWalk3;
            }
        }

        for (let oy = -8; oy <= 7; oy++) {
            const row = sprite[oy + 8];
            for (let ox = -6; ox <= 5; ox++) {
                const color = row[ox + 6];
                if (color) {
                    ctx.fillStyle = color;
                    // facingDir가 -1 이면 가로 대칭(-ox - 1)
                    const drawX = this.facingDir === -1 ? -ox - 1 : ox;
                    ctx.fillRect(drawX, oy, 1, 1);
                }
            }
        }
    }

    _drawMario(ctx) {
        // 아케이드 원작 마리오 12x16px 도안 데이터 (R, P, S 3색 스펙)
        // R: 빨강(#e03030), P: 파랑(#003fc0), S: 살색(#fcd8a8), _: 투명
        const R = '#e03030';
        const P = '#003fc0';
        const S = '#fcd8a8';
        const _ = null;

        const spriteStand = [
            [_, _, _, R, R, R, R, R, _, _, _, _], // oy = -8
            [_, _, R, R, R, R, R, R, R, R, R, _], // oy = -7
            [_, _, P, P, P, S, S, P, S, _, _, _], // oy = -6
            [_, P, S, P, S, S, S, P, S, S, S, _], // oy = -5
            [_, P, S, P, P, S, S, S, P, S, S, P], // oy = -4
            [_, P, P, S, S, S, S, P, P, P, P, _], // oy = -3
            [_, _, _, S, S, S, S, S, S, S, _, _], // oy = -2
            [_, _, P, P, R, P, P, P, _, _, _, _], // oy = -1
            [_, P, P, P, R, P, P, R, P, P, P, _], // oy = 0
            [P, P, P, P, R, R, R, R, P, P, P, P], // oy = 1
            [S, S, P, R, R, R, R, R, R, P, S, S], // oy = 2
            [S, S, S, R, R, R, R, R, R, S, S, S], // oy = 3
            [_, _, R, R, R, R, R, R, R, R, _, _], // oy = 4
            [_, _, R, R, R, _, _, R, R, R, _, _], // oy = 5
            [_, P, P, P, _, _, _, _, P, P, P, _], // oy = 6
            [P, P, P, P, _, _, _, _, P, P, P, P]  // oy = 7
        ];

        const spriteWalk1 = [
            [_, _, _, R, R, R, R, R, _, _, _, _], // oy = -8
            [_, _, R, R, R, R, R, R, R, R, R, _], // oy = -7
            [_, _, P, P, P, S, S, P, S, _, _, _], // oy = -6
            [_, P, S, P, S, S, S, P, S, S, S, _], // oy = -5
            [_, P, S, P, P, S, S, S, P, S, S, P], // oy = -4
            [_, P, P, S, S, S, S, P, P, P, P, _], // oy = -3
            [_, _, _, S, S, S, S, S, S, S, _, _], // oy = -2
            [_, _, P, R, R, R, P, P, _, _, S, _], // oy = -1 (앞팔 굽히고, 뒷손 노출)
            [_, P, P, R, R, R, P, R, P, S, S, _], // oy = 0  (상체 앞으로 살짝 쏠림)
            [P, P, P, R, R, R, R, R, P, P, P, _], // oy = 1  (멜빵바지 면적 증가)
            [S, S, P, R, R, R, R, R, R, P, S, S], // oy = 2
            [S, S, S, R, R, R, R, R, R, S, S, S], // oy = 3
            [_, _, R, R, R, R, R, R, R, R, _, _], // oy = 4
            [_, R, R, R, R, _, _, R, R, R, R, _], // oy = 5  (앞다리 앞으로 뻗고, 뒷다리는 뒤로 차올림)
            [_, P, P, P, _, _, _, _, P, P, P, _], // oy = 6  (발 모양이 찢어짐)
            [_, _, _, _, _, _, _, _, P, P, P, P]  // oy = 7  (지면에서 앞발이 살짝 뜸)
        ];

        const spriteWalk2 = [
            [_, _, _, _, _, _, _, _, _, _, _, _], // oy = -8 (몸 전체가 1px 내려가서 맨 윗라인은 비움)
            [_, _, _, R, R, R, R, R, _, _, _, _], // oy = -7
            [_, _, R, R, R, R, R, R, R, R, R, _], // oy = -6
            [_, _, P, P, P, S, S, P, S, _, _, _], // oy = -5
            [_, P, S, P, S, S, S, P, S, S, S, _], // oy = -4
            [_, P, S, P, P, S, S, S, P, S, S, P], // oy = -3
            [_, P, P, S, S, S, S, P, P, P, P, _], // oy = -2
            [_, _, _, S, S, S, S, S, S, S, _, _], // oy = -1
            [_, _, P, P, R, P, P, P, _, _, _, _], // oy = 0  (팔이 몸통 측면에 수직으로 놓임)
            [_, P, P, P, R, P, P, R, P, P, P, _], // oy = 1
            [P, P, P, P, R, R, R, R, P, P, P, P], // oy = 2
            [S, S, P, R, R, R, R, R, R, P, S, S], // oy = 3
            [S, S, S, R, R, R, R, R, R, S, S, S], // oy = 4
            [_, _, R, R, R, R, R, R, R, R, _, _], // oy = 5  (다리가 거의 수직으로 모임)
            [_, P, P, P, _, _, _, P, P, P, _, _], // oy = 6
            [P, P, P, P, _, _, _, P, P, P, P, _]  // oy = 7
        ];

        const spriteWalk3 = [
            [_, _, _, R, R, R, R, R, _, _, _, _], // oy = -8
            [_, _, R, R, R, R, R, R, R, R, R, _], // oy = -7
            [_, _, P, P, P, S, S, P, S, _, _, _], // oy = -6
            [_, P, S, P, S, S, S, P, S, S, S, _], // oy = -5
            [_, P, S, P, P, S, S, S, P, S, S, P], // oy = -4
            [_, P, P, S, S, S, S, P, P, P, P, _], // oy = -3
            [_, _, _, S, S, S, S, S, S, S, _, _], // oy = -2
            [_, _, _, P, R, R, R, P, _, _, _, _], // oy = -1 (팔 스윙 반대)
            [_, _, P, P, R, R, R, P, R, P, S, _], // oy = 0  (팔 스윙 반대)
            [_, P, P, P, R, R, R, R, R, P, P, _], // oy = 1  (팔 스윙 반대)
            [_, S, S, P, R, R, R, R, R, P, S, S], // oy = 2
            [_, S, S, S, R, R, R, R, R, S, S, S], // oy = 3
            [_, _, R, R, R, R, R, R, R, R, _, _], // oy = 4
            [_, R, R, R, R, _, _, R, R, R, R, _], // oy = 5  (다리 찢어짐 반대)
            [_, _, P, P, P, _, _, _, P, P, P, _], // oy = 6
            [P, P, P, P, _, _, _, _, _, _, _, _]  // oy = 7
        ];

        let sprite = spriteStand;
        if (this._movingDir === 0) {
            sprite = spriteStand;
        } else {
            if (this.walkFrameIndex === 0) {
                sprite = spriteWalk1;
            } else if (this.walkFrameIndex === 1) {
                sprite = spriteWalk2;
            } else if (this.walkFrameIndex === 2) {
                sprite = spriteWalk3;
            }
        }

        for (let oy = -8; oy <= 7; oy++) {
            const row = sprite[oy + 8];
            for (let ox = -6; ox <= 5; ox++) {
                const color = row[ox + 6];
                if (color) {
                    ctx.fillStyle = color;
                    const drawX = this.facingDir === -1 ? -ox - 1 : ox;
                    ctx.fillRect(drawX, oy, 1, 1);
                }
            }
        }
    }

    _drawFox(ctx) {
        let img = foxStandImg;
        const isFox = (this.heroMode === 'fox');
        
        const baseW = isFox ? 27 : 13;
        const run1W = isFox ? 42 : 21;
        const run2W = isFox ? 52 : 26;
        const run3W = isFox ? 40 : 20;
        const h = isFox ? 48 : 24;

        let drawW = baseW;

        if (this._movingDir !== 0) {
            // 달리기 상태: 3프레임 도트 롤링
            if (this.walkFrameIndex === 0) {
                img = foxRun1Img;
                drawW = run1W;
            } else if (this.walkFrameIndex === 1) {
                img = foxRun2Img;
                drawW = run2W;
            } else {
                img = foxRun3Img;
                drawW = run3W;
            }
        }

        if (!img.complete) {
            // 이미지 로딩 대기 시 붉은보라색 박스로 임시 표시
            ctx.fillStyle = '#8a2542';
            ctx.fillRect(-drawW / 2, -h / 2, drawW, h);
            return;
        }

        ctx.save();
        // facingDir가 -1 이면 가로 대칭
        if (this.facingDir === -1) {
            ctx.scale(-1, 1);
        }
        // 중심 (0,0)에 맞춰 드로잉
        ctx.drawImage(img, -drawW / 2, -h / 2, drawW, h);
        ctx.restore();
    }

    draw(ctx) {
        ctx.save();

        // 1. 도형별 속도 맞춤형 꼬리 그리기 (동그라미는 좀 더 선명하게)
        const tailSize = this.isHero ? 2.0 : ((this.shape === 'circle') ? 2.0 : 1.5);
        for (const p of this.trails) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), tailSize, tailSize);
        }
        ctx.globalAlpha = 1.0;

        // 2. 굴러가는 몸체 렌더링
        const isFox = (this.heroMode === 'fox');
        const isFoxMini = (this.heroMode === 'fox_mini');
        let drawW = 27;
        if (isFox || isFoxMini) {
            const baseW = isFox ? 27 : 13;
            const run1W = isFox ? 42 : 21;
            const run2W = isFox ? 52 : 26;
            const run3W = isFox ? 40 : 20;
            drawW = baseW;
            if (this._movingDir !== 0) {
                if (this.walkFrameIndex === 0) drawW = run1W;
                else if (this.walkFrameIndex === 1) drawW = run2W;
                else drawW = run3W;
            }
        }
        const cx = Math.round(this.x + ((isFox || isFoxMini) ? drawW / 2 : (this.isHero ? 12 : 8)));
        const cy = Math.round(this.y + (isFox ? 24 : (isFoxMini ? 12 : (this.isHero ? 12 : 8))));

        ctx.translate(cx, cy);

        // 여우 이동 시의 기울기 피칭 대입
        if (this.heroMode === 'fox' && this._movingDir !== 0) {
            ctx.rotate(this.walkPitchAngle);
        }
        
        // 영웅 모드일 때만 1.5배 렌더링 스케일 적용 (여우는 이미 원본 스케일에 대응하므로 제외)
        if (this.isHero && this.heroMode !== 'fox') {
            ctx.scale(1.5, 1.5);
        }
        
        // 정지 상태일 때 호흡하듯 bobby하는 squash & stretch 효과 적용 (도형 상태 및 여우 캐릭터)
        if (this._movingDir === 0 && this.transformTimer <= 0) {
            if (this.heroMode === 'fox' || this.heroMode === 'fox_mini') {
                const breath = Math.sin(performance.now() * 0.005) * 0.02;
                ctx.scale(1, 1 - breath);
            } else if (!this.isHero) {
                const breath = Math.sin(performance.now() * 0.008) * 0.04;
                ctx.scale(1 + breath, 1 - breath);
            }
        }
        
        if (this.transformTimer > 0) {
            // 변신 중에는 본체를 아예 그리지 않음
        } else if (this.isHero) {
            if (this.heroMode === 'mario') {
                this._drawMario(ctx);
            } else if (this.heroMode === 'jururu') {
                this._drawJururu(ctx);
            } else if (this.heroMode === 'fox' || this.heroMode === 'fox_mini') {
                this._drawFox(ctx);
            }
        } else {
            ctx.rotate(this.rollAngle); // 롤 회전 대입
            this._drawShapeByName(ctx, this.shape);
        }

        ctx.restore();

        // 3. 변신 도트 파티클 렌더링 (회전과 무관하게 월드 좌표계에서 렌더링)
        if (this.transformTimer > 0) {
            for (const star of this.transformStars) {
                ctx.fillStyle = star.color;
                ctx.fillRect(Math.round(star.currentX), Math.round(star.currentY), star.size, star.size);
            }
        }
    }

    _drawSquare(ctx) {
        for (let oy = -8; oy < 8; oy++) {
            for (let ox = -8; ox < 8; ox++) {
                ctx.fillStyle = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#41916c';
                ctx.fillRect(ox, oy, 1, 1);
            }
        }
    }

    _drawTriangle(ctx) {
        // 꼭짓점이 정중앙 (ox = 0)에 오도록 설계된 17x15px 완벽 대칭 정삼각형
        const limits = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8]; // idx = oy + 7 (oy: -7 ~ 7)
        for (let oy = -7; oy <= 7; oy++) {
            const limit = limits[oy + 7];
            for (let ox = -8; ox <= 8; ox++) {
                if (ox >= -limit && ox <= limit) {
                    ctx.fillStyle = ((ox + oy) % 2 === 0) ? '#EDEBE4' : '#e03030';
                    ctx.fillRect(ox, oy, 1, 1);
                }
            }
        }
    }

    _drawCircle(ctx) {
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
