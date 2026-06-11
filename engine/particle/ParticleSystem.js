/**
 * Sand Engine — ParticleSystem
 * 지원 타입:
 *   vortex      — 중심 회전·소멸 (기존)
 *   stardust    — Z축 3D 배경 입자 (기존)
 *   sand_rain   — 위→아래 낙하, 중력, 지면 쌓임 (ACT 1 인트로)
 *   burst       — 방사형 폭발 (ACT 1 클릭, ACT 2)
 *   convergence — 역폭발, 외부→중심 수렴 (ACT 2 아이템 흡수)
 *   erosion     — 내부→외부 픽셀 분해 (ACT 5 게임오버)
 *   streak      — 수평 속도선 (ACT 7 부스트)
 *   wake        — 통과 지점 좌우 갈림 (ACT 7 부스트)
 *   drift       — 미세 부유 먼지 (ACT 6 배경)
 *   text_form   — 텍스트 픽셀로 수렴 (타이틀/인트로 연출)
 *
 * emit(type, config) — config 공통 키:
 *   count, layer, palIdx
 *
 * emitTextForm(config) — text_form 전용 이미터:
 *   text, cx, cy, fontSize, speed, layer, palIdx
 */
export default class ParticleSystem {
    constructor(entitySystem, paletteMgr) {
        this._es        = entitySystem;
        this._palette   = paletteMgr;
        this._particles = [];
    }

    // ── 이미터 ────────────────────────────────────────────────────

    emit(type, config) {
        const count = config.count ?? 20;
        for (let i = 0; i < count; i++) {
            const p = this._acquire();
            switch (type) {
                case 'vortex':      this._initVortex(p, config);      break;
                case 'stardust':    this._initStardust(p, config);    break;
                case 'sand_rain':   this._initSandRain(p, config);    break;
                case 'burst':       this._initBurst(p, config);       break;
                case 'convergence': this._initConvergence(p, config); break;
                case 'erosion':     this._initErosion(p, config);     break;
                case 'streak':      this._initStreak(p, config);      break;
                case 'wake':        this._initWake(p, config);        break;
                case 'drift':       this._initDrift(p, config);       break;
                case 'pixel_burst': this._initPixelBurst(p, config);  break;
            }
        }
    }

    /**
     * 텍스트를 픽셀로 분해한 뒤 수렴 파티클 생성
     * @param {object} cfg
     * @param {string}  cfg.text
     * @param {number} [cfg.cx]       — 중심 X (기본: 화면 중앙)
     * @param {number} [cfg.cy]       — 중심 Y (기본: 화면 중앙)
     * @param {number} [cfg.fontSize=13]
     * @param {number} [cfg.speed=0.07] — lerp 계수 (0~1, 클수록 빠름)
     * @param {number} [cfg.layer=3]
     * @param {number} [cfg.palIdx=1]
     */
    emitTextForm(cfg = {}) {
        const text = cfg.text ?? 'TEXT';
        const sz   = cfg.fontSize ?? 13;

        // 오프스크린 캔버스에 텍스트를 렌더링해 픽셀 좌표 추출
        const oc   = document.createElement('canvas');
        const octx = oc.getContext('2d');
        octx.font  = `bold ${sz}px "Courier New",monospace`;
        const tw   = Math.ceil(octx.measureText(text).width) + 4;
        const th   = Math.ceil(sz * 1.35) + 2;
        oc.width   = tw;
        oc.height  = th;
        octx.font  = `bold ${sz}px "Courier New",monospace`;
        octx.fillStyle   = '#fff';
        octx.textBaseline = 'top';
        octx.fillText(text, 2, 1);

        const imgData = octx.getImageData(0, 0, tw, th).data;
        const pts = [];
        for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) {
                if (imgData[(y * tw + x) * 4 + 3] > 80) pts.push([x, y]);
            }
        }

        const W  = this._es.width  ?? 320;
        const H  = this._es.height ?? 240;
        const cx = cfg.cx ?? W / 2;
        const cy = cfg.cy ?? H / 2;
        const ox = cx - tw / 2;
        const oy = cy - th / 2;

        for (const [px, py] of pts) {
            const p = this._acquire();
            this._initTextForm(p, cfg, ox + px, oy + py, W, H);
        }
    }

    // 특정 타입 파티클 전체 제거
    clear(type) {
        for (const p of this._particles) {
            if (!type || p.type === type) p.alive = false;
        }
    }

    // ── 게임 루프 ─────────────────────────────────────────────────

    update(deltaMs) {
        const dt = deltaMs / 1000;
        for (const p of this._particles) {
            if (!p.alive) continue;
            switch (p.type) {
                case 'vortex':      this._updateVortex(p, dt);      break;
                case 'stardust':    this._updateStardust(p, dt);    break;
                case 'sand_rain':   this._updateSandRain(p, dt);    break;
                case 'burst':       this._updateBurst(p, dt);       break;
                case 'convergence': this._updateConvergence(p, dt); break;
                case 'erosion':     this._updateErosion(p, dt);     break;
                case 'streak':      this._updateStreak(p, dt);      break;
                case 'wake':        this._updateWake(p, dt);        break;
                case 'drift':       this._updateDrift(p, dt);       break;
                case 'text_form':   this._updateTextForm(p, dt);    break;
                case 'pixel_burst': this._updatePixelBurst(p, dt);  break;
            }
        }
    }

    // 살아있는 파티클을 해당 레이어에 렌더
    render(cameraX = 0) {
        const byLayer = new Map();
        for (const p of this._particles) {
            if (!p.alive) continue;
            if (!byLayer.has(p.layer)) byLayer.set(p.layer, []);
            byLayer.get(p.layer).push(p);
        }

        for (const [layerIdx, particles] of byLayer) {
            const renderer = this._es.getRenderer(layerIdx);
            if (!renderer) continue;
            const rgbaCache = this._palette.rgbaCache;

            for (const p of particles) {
                // streak은 선으로 렌더 (별도 처리)
                if (p.type === 'streak') {
                    this._renderStreak(p, renderer, rgbaCache, cameraX, layerIdx);
                    continue;
                }
                const rgba = rgbaCache.get(p.palIdx);
                if (!rgba) continue;
                const sx = Math.round(layerIdx === 2 ? p.x - cameraX : p.x);
                const sy = Math.round(p.y);
                
                const sz = p.size ?? 1;
                if (sz <= 1) {
                    renderer.putPixel(sx, sy, rgba, p.palIdx);
                } else {
                    for (let dy = 0; dy < sz; dy++) {
                        for (let dx = 0; dx < sz; dx++) {
                            renderer.putPixel(sx + dx, sy + dy, rgba, p.palIdx);
                        }
                    }
                }
            }
            renderer.flush();
        }
    }

    // ══════════════════════════════════════════════════════════════
    // VORTEX — 회전·소멸 (기존)
    // ══════════════════════════════════════════════════════════════
    _initVortex(p, cfg) {
        p.type   = 'vortex';
        p.alive  = true;
        p.cx     = cfg.cx ?? 64;
        p.cy     = cfg.cy ?? 64;
        p.angle  = Math.random() * Math.PI * 2;
        p.dist   = (cfg.initialDist ?? 30) * (0.3 + Math.random() * 0.7);
        p.angVel = (cfg.angularVelocity ?? 2.5) * (Math.random() > 0.5 ? 1 : -1);
        p.decay  = cfg.decayRate ?? 0.985;
        p.layer  = cfg.layer ?? 1;
        p.palIdx = cfg.palIdx ?? 1;
        p.x      = p.cx + Math.cos(p.angle) * p.dist;
        p.y      = p.cy + Math.sin(p.angle) * p.dist;
    }
    _updateVortex(p, dt) {
        p.angle += p.angVel * dt;
        p.dist  *= Math.pow(p.decay, dt * 60);
        p.x      = p.cx + Math.cos(p.angle) * p.dist;
        p.y      = p.cy + Math.sin(p.angle) * p.dist;
        if (p.dist < 0.8) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // STARDUST — Z축 3D 배경 입자 (기존)
    // ══════════════════════════════════════════════════════════════
    _initStardust(p, cfg) {
        p.type  = 'stardust';
        p.alive = true;
        p.cx    = cfg.cx ?? 64;
        p.cy    = cfg.cy ?? 64;
        const spread = cfg.spread ?? 200;
        p.wx    = (Math.random() - 0.5) * spread * 2;
        p.wy    = (Math.random() - 0.5) * spread * 2;
        p.z     = (cfg.minZ ?? 0.2) + Math.random() * ((cfg.maxZ ?? 2.0) - (cfg.minZ ?? 0.2));
        p.speed = (cfg.speed ?? 0.3) * (0.5 + Math.random() * 0.5);
        p.wrap  = cfg.wrap ?? true;
        p.layer = cfg.layer ?? 0;
        p.palIdx    = cfg.palIdx ?? 1;
        p.palIdxDim = cfg.palIdxDim ?? p.palIdx;
        this._calcStardustScreen(p);
    }
    _updateStardust(p, dt) {
        p.z -= p.speed * dt;
        if (p.z <= 0.05) {
            if (p.wrap) {
                const spread = 200;
                p.wx = (Math.random() - 0.5) * spread * 2;
                p.wy = (Math.random() - 0.5) * spread * 2;
                p.z  = 1.5 + Math.random() * 0.5;
            } else {
                p.alive = false; return;
            }
        }
        this._calcStardustScreen(p);
        p.palIdx = p.z < 0.5 ? p.palIdx : p.palIdxDim;
    }
    _calcStardustScreen(p) {
        p.x = p.cx + p.wx / p.z;
        p.y = p.cy + p.wy / p.z;
    }

    // ══════════════════════════════════════════════════════════════
    // SAND_RAIN — 위→아래 낙하, 중력, 지면 쌓임 (ACT 1)
    // config: screenW, groundY, gravity(px/s²), palIdx, palIdxRange
    // ══════════════════════════════════════════════════════════════
    _initSandRain(p, cfg) {
        p.type    = 'sand_rain';
        p.alive   = true;
        p.x       = (cfg.screenW ?? 480) * Math.random();
        p.y       = -(Math.random() * 40);         // 화면 위 랜덤 시작
        p.vy      = (cfg.minSpeed ?? 60) + Math.random() * (cfg.maxSpeed ?? 140);
        p.gravity = cfg.gravity ?? 80;
        p.groundY = cfg.groundY ?? 220;
        p.layer   = cfg.layer ?? 2;
        // 팔레트 인덱스 범위 랜덤 선택
        const range = cfg.palIdxRange ?? [1, 1];
        p.palIdx  = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
        p.settled = false;
    }
    _updateSandRain(p, dt) {
        if (p.settled) return;
        p.vy += p.gravity * dt;
        p.y  += p.vy * dt;
        if (p.y >= p.groundY) {
            p.y       = p.groundY;
            p.settled = true;
            // 짧은 시간 후 사라짐 (쌓임 표현 — 지속 시간 설정 가능)
            p._settleTimer = (0.8 + Math.random() * 1.2);
        }
    }
    // settled 파티클 타이머 처리 (update에서 공통으로 호출)
    // → _updateSandRain에 합침
    // update 오버라이드: settled 타이머
    // (별도 처리 — update loop에서 직접)

    // ══════════════════════════════════════════════════════════════
    // BURST — 방사형 폭발 (ACT 1 클릭, ACT 2 변신 완성)
    // config: cx, cy, speed, spreadAngle(0=전방향), palIdx, gravity
    // ══════════════════════════════════════════════════════════════
    _initBurst(p, cfg) {
        p.type    = 'burst';
        p.alive   = true;
        p.cx      = cfg.cx ?? 240;
        p.cy      = cfg.cy ?? 135;
        const baseAngle = cfg.baseAngle ?? 0;
        const spread    = cfg.spreadAngle ?? (Math.PI * 2);
        const angle     = baseAngle + (Math.random() - 0.5) * spread;
        const speed     = (cfg.minSpeed ?? 40) + Math.random() * (cfg.maxSpeed ?? 120);
        p.vx      = Math.cos(angle) * speed;
        p.vy      = Math.sin(angle) * speed;
        p.gravity = cfg.gravity ?? 200;
        p.life    = (cfg.minLife ?? 0.3) + Math.random() * (cfg.maxLife ?? 0.5);
        p.maxLife = p.life;
        p.x       = p.cx;
        p.y       = p.cy;
        p.layer   = cfg.layer ?? 2;
        p.palIdx  = cfg.palIdx ?? 1;
    }
    _updateBurst(p, dt) {
        p.vx   *= (1 - dt * 2);   // 공기 저항
        p.vy   += p.gravity * dt;
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // CONVERGENCE — 역폭발, 외부→중심 수렴 (ACT 2 아이템 흡수)
    // config: cx, cy, radius, speed, palIdx
    // ══════════════════════════════════════════════════════════════
    _initConvergence(p, cfg) {
        p.type   = 'convergence';
        p.alive  = true;
        p.tx     = cfg.cx ?? 240;  // 목표점
        p.ty     = cfg.cy ?? 135;
        const radius = (cfg.minRadius ?? 20) + Math.random() * (cfg.maxRadius ?? 60);
        const angle  = Math.random() * Math.PI * 2;
        p.x      = p.tx + Math.cos(angle) * radius;
        p.y      = p.ty + Math.sin(angle) * radius;
        p.speed  = (cfg.minSpeed ?? 80) + Math.random() * (cfg.maxSpeed ?? 160);
        p.life   = (cfg.minLife ?? 0.2) + Math.random() * (cfg.maxLife ?? 0.4);
        p.layer  = cfg.layer ?? 2;
        p.palIdx = cfg.palIdx ?? 1;
    }
    _updateConvergence(p, dt) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) { p.alive = false; return; }
        const step = Math.min(p.speed * dt, dist);
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // EROSION — 내부→외부 픽셀 분해 (ACT 5 게임오버)
    // config: cx, cy, halfW, halfH, gravity, palIdx
    // ══════════════════════════════════════════════════════════════
    _initErosion(p, cfg) {
        p.type    = 'erosion';
        p.alive   = true;
        const hw  = cfg.halfW ?? 8;
        const hh  = cfg.halfH ?? 8;
        // 캐릭터 영역 안 랜덤 위치에서 시작 (안→밖 감각)
        p.x       = (cfg.cx ?? 240) + (Math.random() * 2 - 1) * hw;
        p.y       = (cfg.cy ?? 135) + (Math.random() * 2 - 1) * hh;
        // 중심에서 바깥 방향으로 초기 속도
        const dx  = p.x - (cfg.cx ?? 240);
        const dy  = p.y - (cfg.cy ?? 135);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const spd = (cfg.minSpeed ?? 20) + Math.random() * (cfg.maxSpeed ?? 80);
        p.vx      = (dx / len) * spd + (Math.random() - 0.5) * 30;
        p.vy      = (dy / len) * spd - Math.random() * 20;  // 살짝 위로
        p.gravity = cfg.gravity ?? 300;
        p.life    = (cfg.minLife ?? 0.4) + Math.random() * (cfg.maxLife ?? 0.8);
        p.maxLife = p.life;
        p.layer   = cfg.layer ?? 2;
        p.palIdx  = cfg.palIdx ?? 3;
    }
    _updateErosion(p, dt) {
        p.vy  += p.gravity * dt;
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.vx  *= (1 - dt * 1.5);
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // STREAK — 수평 속도선 (ACT 7 부스트)
    // config: x, y, length, palIdx
    // ══════════════════════════════════════════════════════════════
    _initStreak(p, cfg) {
        p.type   = 'streak';
        p.alive  = true;
        p.x      = cfg.x ?? 480;
        p.y      = cfg.y ?? 135;
        p.length = (cfg.minLen ?? 60) + Math.random() * (cfg.maxLen ?? 60);
        p.speed  = (cfg.speed ?? 400) + Math.random() * 200;
        p.life   = (cfg.minLife ?? 0.05) + Math.random() * (cfg.maxLife ?? 0.1);
        p.maxLife = p.life;
        p.layer  = cfg.layer ?? 2;
        p.palIdx = cfg.palIdx ?? 1;
    }
    _updateStreak(p, dt) {
        p.x    -= p.speed * dt;
        p.life -= dt;
        if (p.life <= 0 || p.x + p.length < 0) p.alive = false;
    }
    _renderStreak(p, renderer, rgbaCache, cameraX, layerIdx) {
        const rgba = rgbaCache.get(p.palIdx);
        if (!rgba) return;
        const alpha = p.life / p.maxLife;          // 페이드아웃
        const len   = Math.round(p.length * alpha);
        const sx    = Math.round(layerIdx === 2 ? p.x - cameraX : p.x);
        const sy    = Math.round(p.y);
        for (let i = 0; i < len; i++) {
            const px = sx + i;
            if (px < 0) continue;
            renderer.putPixel(px, sy, rgba, p.palIdx);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // WAKE — 통과 지점 좌우 갈림 (ACT 7 부스트)
    // config: cx, cy, palIdx
    // ══════════════════════════════════════════════════════════════
    _initWake(p, cfg) {
        p.type    = 'wake';
        p.alive   = true;
        p.x       = cfg.cx ?? 240;
        p.y       = cfg.cy ?? 220;
        const side = Math.random() > 0.5 ? 1 : -1;   // 좌 또는 우
        const vx   = (30 + Math.random() * 60) * side;
        const vy   = -(20 + Math.random() * 60);
        p.vx      = vx;
        p.vy      = vy;
        p.gravity = cfg.gravity ?? 200;
        p.life    = 0.2 + Math.random() * 0.3;
        p.layer   = cfg.layer ?? 2;
        p.palIdx  = cfg.palIdx ?? 3;
    }
    _updateWake(p, dt) {
        p.vy  += p.gravity * dt;
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.vx  *= (1 - dt * 3);
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // DRIFT — 미세 부유 먼지 (ACT 6 배경)
    // config: screenW, screenH, speedMult, palIdx
    // ══════════════════════════════════════════════════════════════
    _initDrift(p, cfg) {
        p.type   = 'drift';
        p.alive  = true;
        const sw = cfg.screenW ?? 480;
        const sh = cfg.screenH ?? 270;
        p.x      = Math.random() * sw;
        p.y      = Math.random() * sh;
        p.vx     = -(10 + Math.random() * 20) * (cfg.speedMult ?? 1);
        p.vy     = (Math.random() - 0.5) * 8;
        p.life   = 2 + Math.random() * 3;
        p.maxLife = p.life;
        p.layer  = cfg.layer ?? 0;
        p.palIdx = cfg.palIdx ?? 2;
        p.wrap   = cfg.wrap ?? true;
        p.screenW = sw;
    }
    _updateDrift(p, dt) {
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.life -= dt;
        if (p.wrap && p.x < -2) {
            p.x    = p.screenW + 2;
            p.life = p.maxLife;   // 랩 시 수명 리셋
        }
        if (!p.wrap && p.life <= 0) p.alive = false;
    }

    // ══════════════════════════════════════════════════════════════
    // TEXT_FORM — 텍스트 픽셀로 수렴 (인트로/타이틀 연출)
    // 직접 호출하지 말 것 — emitTextForm() 을 사용할 것
    // ══════════════════════════════════════════════════════════════
    _initTextForm(p, cfg, tx, ty, W, H) {
        p.type   = 'text_form';
        p.alive  = true;
        p.tx     = tx;
        p.ty     = ty;
        // 화면 임의 위치에서 시작
        p.x      = Math.random() * (W ?? 320);
        p.y      = Math.random() * (H ?? 240);
        p.speed  = cfg.speed  ?? 0.07;   // lerp 계수
        p.layer  = cfg.layer  ?? 3;
        p.palIdx = cfg.palIdx ?? 1;
    }
    _updateTextForm(p, dt) {
        // 지수 감쇠 lerp — 프레임레이트 독립적
        const f = 1 - Math.pow(1 - p.speed, dt * 60);
        p.x += (p.tx - p.x) * f;
        p.y += (p.ty - p.y) * f;
        // 목표에 충분히 근접하면 고정 (불필요한 연산 방지)
        if (Math.abs(p.tx - p.x) < 0.5 && Math.abs(p.ty - p.y) < 0.5) {
            p.x = p.tx;
            p.y = p.ty;
        }
    }

    // ── 풀 관리 ───────────────────────────────────────────────────
    _acquire() {
        for (const p of this._particles) {
            if (!p.alive) return p;
        }
        const p = { alive: false, type: null };
        this._particles.push(p);
        return p;
    }

    // ══════════════════════════════════════════════════════════════
    // PIXEL_BURST — 총구 픽셀 불꽃 (V12 추가)
    // config: cx, cy, dir(사격 방향: 1 우, -1 좌), palIndices(선택가능한 팔레트 색상 배열)
    // ══════════════════════════════════════════════════════════════
    _initPixelBurst(p, cfg) {
        p.type    = 'pixel_burst';
        p.alive   = true;
        p.x       = cfg.cx ?? 240;
        p.y       = cfg.cy ?? 135;
        p.gravity = cfg.gravity ?? 180;
        p.life    = 0.12 + Math.random() * 0.18;
        p.maxLife = p.life;
        p.layer   = cfg.layer ?? 2;
        
        // 픽셀 크기 랜덤 지정 (1 ~ 3px)
        p.size    = cfg.size ?? (Math.random() < 0.4 ? 1 : Math.random() < 0.7 ? 2 : 3);
        
        const dir = cfg.dir ?? 1;
        const sp   = 100 + Math.random() * 150;
        p.vx      = dir * sp + (Math.random() - 0.5) * 60;
        p.vy      = (Math.random() - 0.5) * 110;
        
        if (cfg.palIndices && cfg.palIndices.length) {
            p.palIdx = cfg.palIndices[Math.floor(Math.random() * cfg.palIndices.length)];
        } else {
            p.palIdx = cfg.palIdx ?? 1;
        }
    }
    _updatePixelBurst(p, dt) {
        p.vx   *= (1 - dt * 2.5);
        p.vy   += p.gravity * dt;
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
    }

    get liveCount() {
        return this._particles.filter(p => p.alive).length;
    }
}
