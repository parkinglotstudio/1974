/**
 * Sand Engine — PixelAnimator v1.0
 * pixels.json animations[] 파싱 + 매 프레임 픽셀 상태 보간
 * (2026-05-27 신규)
 *
 * ─── Sand Engine 핵심 철학 ───────────────────────────────────────────
 * 기본 픽셀 1장 + 움직이는 픽셀만 animations로 정의.
 * 프레임 여러 장 저장 X → 변경된 픽셀만 업데이트.
 *
 * ─── 지원 animations 타입 ────────────────────────────────────────────
 *
 * [keyframe]  — 특정 픽셀의 팔레트 인덱스를 시간에 따라 변경
 *   { "name": "lamp_flicker", "loop": true,
 *     "keyframes": [
 *       { "pixel_index": 1234, "from": 10, "to": 5, "duration": 0.3 },
 *       { "pixel_index": 1234, "from": 5,  "to": 10, "duration": 0.3 }
 *     ] }
 *
 * [direction] — 특정 픽셀 그룹을 방향/속도/진폭으로 이동
 *   { "name": "smoke_rise",
 *     "pixels": [2100, 2101, 2102],   ← flat index: y*width + x
 *     "direction": "up",
 *     "speed": 0.5, "loop": true }
 *
 *   { "name": "laundry_sway",
 *     "pixels": [3300, 3301, 3302],
 *     "direction": "left_right",
 *     "amplitude": 2, "speed": 0.8, "loop": true }
 *
 * direction 값: "up" / "down" / "left" / "right" / "left_right" / "up_down"
 *
 * ─── 사용법 ──────────────────────────────────────────────────────────
 *   // SandEngine에서 자동 처리 (applyScene 후)
 *   // 수동 제어:
 *   entity._ea.play('lamp_flicker');
 *   entity._ea.stop('lamp_flicker');
 *   entity._ea.reset();
 */

// ── EntityAnimator — 엔티티 1개의 애니메이션 상태 관리 ──────────────

export class EntityAnimator {
    /**
     * @param {object[]} animations   pixels.json animations 배열
     * @param {number}   width        픽셀 에셋 너비 (pw)
     * @param {number}   height       픽셀 에셋 높이 (ph)
     * @param {Array}    basePixels   [[x,y,idx], ...] 기본 픽셀 배열
     */
    constructor(animations, width, height, basePixels) {
        this._w = width;
        this._h = height;

        /** keyframe override 버퍼: flatIdx → palette idx */
        this._kfOverrides  = new Map();
        /** direction 픽셀 버퍼: [[x, y, idx], ...] (현재 위치) */
        this._dirPixels    = [];
        /** direction anim이 담당하는 flat indices (base 렌더에서 제외) */
        this._dirSources   = new Set();

        // direction 픽셀 색상 사전 (flatIdx → paletteIdx) — 매 프레임 재계산 방지
        this._colorLookup  = new Map();
        if (basePixels) {
            for (const [x, y, idx] of basePixels) {
                this._colorLookup.set(y * width + x, idx);
            }
        }

        /** 애니메이션 핸들 목록 */
        this._handles = [];
        for (const def of (animations ?? [])) {
            if (def.keyframes) {
                this._handles.push({ type: 'kf', def, t: 0, paused: false });
            } else if (def.direction && def.pixels?.length) {
                this._handles.push({ type: 'dir', def, t: 0, paused: false });
                for (const fi of def.pixels) this._dirSources.add(fi);
            }
        }
    }

    // ── 업데이트 ─────────────────────────────────────────────────────

    /**
     * @param {number} dt  경과 시간 (밀리초)
     */
    update(dt) {
        if (!this._handles.length) return;
        const dtSec = dt / 1000;

        this._kfOverrides.clear();
        this._dirPixels = [];

        for (const h of this._handles) {
            if (h.paused) continue;
            h.t += dtSec;
            if (h.type === 'kf')  this._tickKeyframe(h);
            else                  this._tickDirection(h);
        }
    }

    // ── keyframe 보간 ────────────────────────────────────────────────

    _tickKeyframe(h) {
        const kfs      = h.def.keyframes;
        const totalDur = kfs.reduce((s, k) => s + (k.duration ?? 0), 0);
        if (totalDur <= 0) return;

        // loop: t를 totalDur로 감싸기
        const t = h.def.loop
            ? h.t % totalDur
            : Math.min(h.t, totalDur);

        let elapsed = 0;
        for (const kf of kfs) {
            const end = elapsed + (kf.duration ?? 0);
            if (t < end) {
                // 이 keyframe 구간에서 진행도 계산
                const p   = kf.duration > 0 ? (t - elapsed) / kf.duration : 1;
                // 팔레트 인덱스 보간 (반올림 → 정수)
                const idx = Math.round(kf.from + (kf.to - kf.from) * p);
                this._kfOverrides.set(kf.pixel_index, idx);
                break;
            }
            elapsed = end;
        }
    }

    // ── direction 이동 ───────────────────────────────────────────────

    _tickDirection(h) {
        const { def, t } = h;
        const {
            pixels:    flatIndices,
            direction,
            speed     = 0.5,
            amplitude = 2,
        } = def;

        const W = this._w;
        const H = this._h;

        for (const fi of flatIndices) {
            const bx   = fi % W;
            const by   = Math.floor(fi / W);
            const pidx = this._colorLookup.get(fi) ?? 1;

            let nx = bx, ny = by;

            switch (direction) {
                // ── 진동 (sin 파형) ──────────────────────────────────
                case 'left_right':
                    nx = bx + Math.round(amplitude * Math.sin(2 * Math.PI * speed * t));
                    break;
                case 'up_down':
                    ny = by + Math.round(amplitude * Math.sin(2 * Math.PI * speed * t));
                    break;

                // ── 직선 이동 + wrap ─────────────────────────────────
                case 'up': {
                    const off = Math.round(speed * t) % (H || 1);
                    ny = ((by - off) % H + H) % H;
                    break;
                }
                case 'down': {
                    const off = Math.round(speed * t) % (H || 1);
                    ny = (by + off) % H;
                    break;
                }
                case 'left': {
                    const off = Math.round(speed * t) % (W || 1);
                    nx = ((bx - off) % W + W) % W;
                    break;
                }
                case 'right': {
                    const off = Math.round(speed * t) % (W || 1);
                    nx = (bx + off) % W;
                    break;
                }
                default:
                    break;
            }

            // 범위 체크 (진동 시 경계 초과 방지)
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            this._dirPixels.push([nx, ny, pidx]);
        }
    }

    // ── 조회 ─────────────────────────────────────────────────────────

    /**
     * keyframe override 픽셀 반환
     * [[x, y, new_idx], ...] — 원래 위치, 다른 팔레트 인덱스
     * 변경 없으면 null
     */
    getKeyframeOverrides() {
        if (!this._kfOverrides.size) return null;
        const W = this._w;
        return Array.from(this._kfOverrides, ([fi, idx]) => [fi % W, Math.floor(fi / W), idx]);
    }

    /**
     * direction 픽셀 반환 (현재 위치)
     * [[x, y, idx], ...] | null
     */
    getDirectionPixels() {
        return this._dirPixels.length ? this._dirPixels : null;
    }

    /** direction anim 대상 flatIdx Set — PrefabSystem에서 base 분리 시 사용 */
    get directionSources() { return this._dirSources; }

    /** 애니메이션 정의 존재 여부 */
    get hasAnimations() { return this._handles.length > 0; }

    // ── 제어 ─────────────────────────────────────────────────────────

    /** 특정 애니메이션 재시작 */
    play(name) {
        const h = this._handles.find(h => h.def.name === name);
        if (h) { h.t = 0; h.paused = false; }
    }

    /** 특정 애니메이션 정지 */
    stop(name) {
        const h = this._handles.find(h => h.def.name === name);
        if (h) h.paused = true;
    }

    /** 전체 리셋 */
    reset() {
        for (const h of this._handles) { h.t = 0; h.paused = false; }
        this._kfOverrides.clear();
        this._dirPixels = [];
    }
}

// ── PixelAnimator — 시스템 레벨 매니저 ──────────────────────────────

/**
 * SandEngine.animator 로 등록되는 시스템.
 * 모든 애니메이션 엔티티를 관리하고 EntitySystem과 연동.
 *
 * SandEngine에서 자동 호출:
 *   applyScene() → 애니메이션 엔티티 attach
 *   _update()    → update(dt)
 */
export default class PixelAnimator {
    constructor() {
        /** entityId → EntityAnimator */
        this._map = new Map();
    }

    /**
     * 엔티티에 애니메이션 부착
     * @param {string}  entityId
     * @param {object}  pixelsData  { pixels, animations, width, height }
     * @param {object}  entity      EntitySystem Entity 인스턴스
     */
    attach(entityId, pixelsData, entity) {
        const { pixels, animations, width, height } = pixelsData;
        if (!animations?.length) return;

        const ea = new EntityAnimator(animations, width, height, pixels);

        // direction 애니메이션 대상 픽셀을 base에서 제외
        // → EntitySystem이 base 렌더 시 해당 픽셀 건너뜀
        let staticPixels = pixels;
        if (ea.directionSources.size > 0) {
            const W = width;
            staticPixels = pixels.filter(([x, y]) => !ea.directionSources.has(y * W + x));
        }

        // Entity에 직접 부착 (EntitySystem 렌더 루프에서 참조)
        entity._ea           = ea;
        entity._staticPixels = staticPixels;   // direction 픽셀 제외 base
        entity._fullPixels   = pixels;          // 원본 전체 (참조용)

        this._map.set(entityId, ea);
        console.log(`[PixelAnimator] "${entityId}" — 애니메이션 ${animations.length}개 등록`);
    }

    /**
     * 전체 업데이트 (SandEngine._update에서 호출)
     * @param {number}        dt            밀리초
     */
    update(dt) {
        for (const ea of this._map.values()) {
            ea.update(dt);
        }
    }

    /** 엔티티 애니메이터 제거 */
    detach(entityId) {
        this._map.delete(entityId);
    }

    /** 전체 초기화 (씬 전환 시) */
    clear() {
        this._map.clear();
    }

    get(entityId) { return this._map.get(entityId) ?? null; }
}
