/**
 * SandFX — 펌프 전용 절차적 모래 연출 렌더러.
 *
 * 파티클을 누적 저장하지 않고 매 프레임 수학적으로 픽셀을 그린다.
 * → 프레임마다 레이어가 클리어되므로 잔상이 구조적으로 발생하지 않는다.
 * 모든 연출은 2~3px 픽셀 블록 단위로 그려 픽셀아트 질감을 유지한다.
 *
 * 해시 노이즈(_h)로 프레임 간 일관된 "모래 알갱이" 배치를 만들되,
 * time 항을 섞어 알갱이가 흐르는 느낌을 낸다.
 */
export default class SandFX {
    constructor(palette) {
        this.pal = palette;
    }

    /** 결정적 해시 노이즈 0~1 */
    _h(n) {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    _px(c, x, y, size = 2) {
        c.fillRect(Math.round(x), Math.round(y), size, size);
    }

    // ════════════════════════════════════════════════════════════
    // 1. 수호자 — 바위 + 모래 꼬리
    // ════════════════════════════════════════════════════════════
    /**
     * @param b      블레이드 {x, y, a(궤도각)}
     * @param player 궤도 중심
     * @param orbitR 궤도 반지름
     * @param time   초 단위 시간
     */
    guardian(c, b, player, orbitR, time) {
        // 모래 꼬리 — 궤도를 따라 뒤쪽으로 모래가 흩날림
        c.fillStyle = this.pal[6] ?? '#3D8EDB';
        const TAIL = 22;
        for (let i = 1; i <= TAIL; i++) {
            const trail = i / TAIL;                       // 0(머리)→1(끝)
            const a = b.a - trail * 1.4;                  // 궤도 뒤쪽 각도
            // 끝으로 갈수록 궤도에서 흩어짐
            const scatter = (this._h(i * 7.3 + Math.floor(time * 14)) - 0.5) * trail * 24;
            const r = orbitR + scatter;
            const x = player.x + Math.cos(a) * r;
            const y = player.y + Math.sin(a) * r;
            // 끝으로 갈수록 듬성듬성 (확률 탈락)
            if (this._h(i * 13.7 + Math.floor(time * 10)) < trail * 0.55) continue;
            this._px(c, x, y, trail < 0.4 ? 3 : 2);
        }

        // 바위 본체 — 고정 픽셀 블롭 (확대)
        const ROCK = [
            [-4, -6, 8, 3],
            [-7, -3, 14, 6],
            [-5,  3, 10, 3],
        ];
        c.fillStyle = this.pal[13] ?? '#8A8FA3';
        for (const [ox, oy, w, h] of ROCK) {
            c.fillRect(Math.round(b.x + ox), Math.round(b.y + oy), w, h);
        }
        // 바위 하이라이트
        c.fillStyle = this.pal[12] ?? '#C8E8F0';
        c.fillRect(Math.round(b.x - 4), Math.round(b.y - 6), 5, 3);
    }

    // ════════════════════════════════════════════════════════════
    // 2. 쿠나이 — 날아가는 미니 모래 토네이도
    // ════════════════════════════════════════════════════════════
    /** @param p 투사체 {x, y, vx, vy, spin} */
    tornado(c, p) {
        const dir = Math.atan2(p.vy, p.vx);
        c.fillStyle = this.pal[4] ?? '#FFC23E';

        // 토네이도 기둥 — 진행 반대 방향이 꼬리(좁음), 머리가 넓음
        const ROWS = 11;
        for (let i = 0; i < ROWS; i++) {
            const t = i / (ROWS - 1);                     // 0(꼬리)→1(머리)
            const width = 3 + t * 14;                     // 폭 점점 확대
            // 기둥 축 위치 (진행 방향으로 배치)
            const ax = p.x - Math.cos(dir) * (1 - t) * 24;
            const ay = p.y - Math.sin(dir) * (1 - t) * 24;
            // 회전 — 행마다 위상이 어긋난 sin 으로 빙글빙글
            const sway = Math.sin(p.spin + i * 1.9) * width;
            // 축의 수직 방향으로 흔들림
            const nx = -Math.sin(dir), ny = Math.cos(dir);
            this._px(c, ax + nx * sway, ay + ny * sway, 3);
            // 반대편 알갱이 (이중 나선)
            this._px(c, ax - nx * sway * 0.7, ay - ny * sway * 0.7, 2);
        }
        // 머리 코어
        c.fillStyle = this.pal[7] ?? '#F5D454';
        this._px(c, p.x - 2, p.y - 2, 5);
    }

    // ════════════════════════════════════════════════════════════
    // 3. 기본 공격 — 모래 실 연결 → 폭발
    // ════════════════════════════════════════════════════════════
    /** @param th 실 {ex, ey, t, phase, linkSec, explodeSec, explodeRadius} */
    thread(c, th, player, time) {
        if (th.phase === 'link') {
            // 실 — 플레이어→적, 점선 형태의 흔들리는 모래 픽셀 라인
            const prog = Math.min(1, th.t / (th.linkSec * 0.6));  // 실이 뻗어나가는 진행도
            const dx = th.ex - player.x;
            const dy = th.ey - player.y;
            const dist = Math.hypot(dx, dy) || 1;
            const steps = Math.floor(dist / 5);
            const nx = -dy / dist, ny = dx / dist;
            c.fillStyle = this.pal[7] ?? '#F5D454';
            for (let i = 0; i <= steps * prog; i++) {
                const t = i / steps;
                // 실의 출렁임 — 시간에 따라 흐르는 sin + 노이즈
                const wave = Math.sin(t * 9 + time * 25) * 5 * Math.sin(t * Math.PI);
                const x = player.x + dx * t + nx * wave;
                const y = player.y + dy * t + ny * wave;
                if (this._h(i * 3.1 + Math.floor(time * 20)) < 0.25) continue; // 점선 끊김
                this._px(c, x, y, i % 3 === 0 ? 3 : 2);
            }
        } else {
            // 폭발 — 확장하는 모래 고리 (안쪽 비어 있는 픽셀 링)
            const prog = th.t / th.explodeSec;            // 0→1
            const r = th.explodeRadius * (0.3 + prog * 0.9);
            const fade = 1 - prog;
            const grains = Math.floor(40 * fade) + 10;
            c.fillStyle = this.pal[4] ?? '#FFC23E';
            for (let i = 0; i < grains; i++) {
                const a = (i / grains) * Math.PI * 2 + this._h(i * 5.7) * 0.5;
                const rr = r + (this._h(i * 9.1 + Math.floor(time * 18)) - 0.5) * 10;
                this._px(c, th.ex + Math.cos(a) * rr, th.ey + Math.sin(a) * rr, prog < 0.4 ? 3 : 2);
            }
            // 폭심 섬광 (초반에만)
            if (prog < 0.3) {
                c.fillStyle = this.pal[12] ?? '#C8E8F0';
                this._px(c, th.ex - 3, th.ey - 3, 7);
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    // 5. 모래 비 — 영역 안으로 모래가 쏟아져 내림
    // ════════════════════════════════════════════════════════════
    /** @param rn {x, y, radius, t, dur} */
    rain(c, rn, time) {
        const fadeIn  = Math.min(1, rn.t / 0.25);
        const fadeOut = Math.min(1, (rn.dur - rn.t) / 0.3);
        const fade = Math.min(fadeIn, fadeOut);

        // 영역 표시 — 점선 모래 링
        c.fillStyle = this.pal[7] ?? '#F5D454';
        const ringGrains = 26;
        for (let i = 0; i < ringGrains; i++) {
            if (this._h(i * 7.7 + Math.floor(time * 8)) > fade * 0.8) continue;
            const a = (i / ringGrains) * Math.PI * 2 + time * 0.8;
            this._px(c, rn.x + Math.cos(a) * rn.radius, rn.y + Math.sin(a) * rn.radius, 2);
        }

        // 낙하 모래 줄기 — 위에서 영역 안 무작위 지점으로 떨어지는 세로 픽셀 스트릭
        const DROPS = 22;
        c.fillStyle = this.pal[4] ?? '#FFC23E';
        for (let i = 0; i < DROPS; i++) {
            if (this._h(i * 3.3) > fade) continue;
            // 알갱이별 고정 낙하 지점 (원 안)
            const a = this._h(i * 5.9) * Math.PI * 2;
            const r = Math.sqrt(this._h(i * 8.3)) * rn.radius * 0.9;
            const gx = rn.x + Math.cos(a) * r;
            const gy = rn.y + Math.sin(a) * r;
            // 낙하 진행 — 알갱이마다 주기 어긋남
            const cycle = (time * 2.6 + this._h(i * 13.1)) % 1;
            const fallH = 90;
            const py = gy - fallH * (1 - cycle);
            this._px(c, gx, py, 2);
            this._px(c, gx, py - 6, 1);                      // 줄기 꼬리
            // 착지 순간 — 바닥 튐
            if (cycle > 0.85) this._px(c, gx + (this._h(i * 17.7) - 0.5) * 8, gy, 2);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 6. 모래 늪 — 빨려 들어가는 소용돌이 장판
    // ════════════════════════════════════════════════════════════
    /** @param z {x, y, radius, t, dur} */
    quicksand(c, z, time) {
        const fadeIn  = Math.min(1, z.t / 0.3);
        const fadeOut = Math.min(1, (z.dur - z.t) / 0.4);
        const fade = Math.min(fadeIn, fadeOut);

        // 어두운 늪 바닥
        c.fillStyle = 'rgba(20, 16, 10, 0.45)';
        c.beginPath();
        c.arc(z.x, z.y, z.radius * fade, 0, Math.PI * 2);
        c.fill();

        // 나선 소용돌이 — 모래 알갱이가 중심으로 빨려 들어감
        c.fillStyle = this.pal[13] ?? '#8A8FA3';
        const ARMS = 3, PER = 10;
        for (let arm = 0; arm < ARMS; arm++) {
            for (let i = 0; i < PER; i++) {
                const t = i / PER;                            // 0(바깥)→1(중심)
                // 시간이 지나며 안으로 감기는 나선
                const a = (arm / ARMS) * Math.PI * 2 + t * 2.4 - time * 2.2;
                const r = z.radius * (1 - t * 0.85) * fade;
                if (this._h(arm * 31 + i * 7.1 + Math.floor(time * 9)) < 0.3) continue;
                this._px(c, z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, t > 0.5 ? 2 : 3);
            }
        }
        // 중심 함몰점
        c.fillStyle = this.pal[1] ?? '#1A1A18';
        this._px(c, z.x - 2, z.y - 2, 5);
    }

    // ════════════════════════════════════════════════════════════
    // 7. 모래 가시 — 예고 후 발밑에서 솟구침
    // ════════════════════════════════════════════════════════════
    /** @param sp {x, y, t, delay, upSec, radius} */
    spike(c, sp, time) {
        if (sp.t < sp.delay) {
            // 예고 — 바닥에서 떨리는 모래 원
            const warn = sp.t / sp.delay;
            c.fillStyle = this.pal[8] ?? '#E8553C';
            const grains = 10 + Math.floor(warn * 10);
            for (let i = 0; i < grains; i++) {
                const a = this._h(i * 6.1) * Math.PI * 2;
                const r = sp.radius * (0.4 + this._h(i * 9.3 + Math.floor(time * 20)) * 0.6);
                this._px(c, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r, 1);
            }
        } else {
            // 솟구침 — 가운데 큰 가시 + 양옆 작은 가시 (픽셀 삼각형)
            const up = Math.min(1, (sp.t - sp.delay) / (sp.upSec * 0.5));   // 빠르게 솟고
            const fall = Math.max(0, (sp.t - sp.delay - sp.upSec * 0.5) / (sp.upSec * 0.5)); // 부서짐
            const h = 36 * up * (1 - fall * 0.6);
            c.fillStyle = this.pal[4] ?? '#FFC23E';
            const SPIKES = [ { ox: 0, hMul: 1, w: 8 }, { ox: -12, hMul: 0.6, w: 6 }, { ox: 12, hMul: 0.6, w: 6 } ];
            for (const s of SPIKES) {
                const sh = h * s.hMul;
                // 아래(넓음)→위(좁음) 픽셀 row 로 가시 형태
                const rows = Math.max(1, Math.floor(sh / 4));
                for (let r = 0; r < rows; r++) {
                    const t = r / rows;                       // 0(바닥)→1(끝)
                    const w = Math.max(2, s.w * (1 - t));
                    c.fillRect(Math.round(sp.x + s.ox - w / 2), Math.round(sp.y - t * sh - 4), Math.round(w), 4);
                }
            }
            // 부서질 때 파편
            if (fall > 0) {
                c.fillStyle = this.pal[7] ?? '#F5D454';
                for (let i = 0; i < 8; i++) {
                    if (this._h(i * 4.7) < fall * 0.8) continue;
                    const a = this._h(i * 8.9) * Math.PI - Math.PI;          // 위쪽 반원
                    const d = fall * 26;
                    this._px(c, sp.x + Math.cos(a) * d, sp.y - h + Math.sin(a) * d * 0.5, 2);
                }
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    // 8. 모래 폭풍 — 플레이어 주위를 휘도는 상시 오라
    // ════════════════════════════════════════════════════════════
    aura(c, player, radius, time) {
        c.fillStyle = this.pal[7] ?? '#F5D454';
        const GRAINS = 30;
        for (let i = 0; i < GRAINS; i++) {
            // 알갱이별 고정 반경·속도로 휘돎 — 바깥일수록 빠르게
            const baseR = radius * (0.55 + this._h(i * 3.9) * 0.45);
            const speed = 1.2 + this._h(i * 6.7) * 1.8;
            const a = this._h(i * 9.1) * Math.PI * 2 + time * speed;
            // 반경이 출렁임 (폭풍의 숨결)
            const r = baseR + Math.sin(time * 3 + i) * 6;
            if (this._h(i * 12.7 + Math.floor(time * 10)) < 0.25) continue;
            this._px(c, player.x + Math.cos(a) * r, player.y + Math.sin(a) * r * 0.92,
                i % 3 === 0 ? 3 : 2);
        }
        // 외곽 경계 힌트 — 듬성한 링
        c.fillStyle = this.pal[13] ?? '#8A8FA3';
        for (let i = 0; i < 14; i++) {
            if (this._h(i * 5.3 + Math.floor(time * 6)) < 0.5) continue;
            const a = (i / 14) * Math.PI * 2 - time * 0.7;
            this._px(c, player.x + Math.cos(a) * radius, player.y + Math.sin(a) * radius, 1);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 9. 석화 파동 — 돌가루 원형 파동
    // ════════════════════════════════════════════════════════════
    /** @param p {x, y, radius, range} */
    pulse(c, p, time) {
        const fade = 1 - p.radius / p.range;
        const grains = Math.max(12, Math.floor(p.radius * 0.5));
        // 겹겹의 돌가루 링 (앞 진하게, 뒤 흐리게)
        const RINGS = [
            { off: 0,  size: 3, palIdx: 13, density: 1.0 },
            { off: -6, size: 2, palIdx: 12, density: 0.5 },
        ];
        for (const ring of RINGS) {
            const r = p.radius + ring.off;
            if (r < 4) continue;
            c.fillStyle = this.pal[ring.palIdx] ?? '#8A8FA3';
            for (let i = 0; i < grains; i++) {
                if (this._h(i * 7.9 + Math.floor(time * 14) + ring.off) > fade * ring.density + 0.2) continue;
                const a = (i / grains) * Math.PI * 2 + this._h(i * 3.3) * 0.3;
                const jitter = (this._h(i * 11.1 + Math.floor(time * 18)) - 0.5) * 5;
                this._px(c, p.x + Math.cos(a) * (r + jitter), p.y + Math.sin(a) * (r + jitter), ring.size);
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    // 디버프 표현 — 적 몸 위에 상태별 픽셀 연출
    // ════════════════════════════════════════════════════════════
    /** @param e 적 {x, y, radius, stunT?, dotT?, slowT?, vulnT?} */
    debuffs(c, e, time) {
        const r = e.radius;

        // 석화 — 회색 돌 덮개 + 금
        if (e.stunT > 0) {
            c.fillStyle = 'rgba(138, 143, 163, 0.78)';            // pal13 돌빛 반투명
            c.fillRect(Math.round(e.x - r), Math.round(e.y - r), r * 2, r * 2);
            // 균열 — 고정 패턴 지그재그 픽셀
            c.fillStyle = this.pal[1] ?? '#1A1A18';
            const CRACK = [[-6,-8],[-3,-4],[-5,0],[-1,3],[2,-9],[4,-3],[3,2],[6,6],[-8,5]];
            for (const [ox, oy] of CRACK) {
                this._px(c, e.x + ox, e.y + oy, 2);
            }
            // 풀려나기 직전 떨림 표시 (마지막 0.4초 깜빡임)
            if (e.stunT < 0.4 && Math.floor(time * 12) % 2 === 0) {
                c.fillStyle = this.pal[12] ?? '#C8E8F0';
                c.fillRect(Math.round(e.x - r), Math.round(e.y - r), r * 2, 2);
            }
        }

        // 침식 — 몸을 기어다니는 모래 알갱이 + 아래로 부스러기 낙하
        if (e.dotT > 0) {
            c.fillStyle = this.pal[4] ?? '#FFC23E';
            for (let i = 0; i < 6; i++) {
                // 몸 둘레를 기어다니는 알갱이
                const a = this._h(i * 4.1) * Math.PI * 2 + time * (2 + this._h(i * 6.3) * 2);
                this._px(c, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2);
            }
            // 갉아먹힌 부스러기가 발밑으로 떨어짐
            for (let i = 0; i < 4; i++) {
                const cycle = (time * 1.8 + this._h(i * 8.7)) % 1;
                const fx = e.x + (this._h(i * 5.9) - 0.5) * r * 2;
                this._px(c, fx, e.y + r + cycle * 14, 1);
            }
        }

        // 감속(늪) — 발밑에 가라앉는 모래 잔물결
        if (e.slowT > 0) {
            c.fillStyle = this.pal[13] ?? '#8A8FA3';
            for (let i = 0; i < 5; i++) {
                const a = this._h(i * 7.3) * Math.PI;             // 아래 반원
                const rr = r + 2 + Math.sin(time * 5 + i * 2) * 2;
                this._px(c, e.x + Math.cos(a) * rr, e.y + r - 2 + Math.sin(a) * 4, 2);
            }
        }

        // 낙인(취약) — 머리 위 회전 다이아 마커
        if (e.vulnT > 0) {
            c.fillStyle = this.pal[8] ?? '#E8553C';
            const my = e.y - r - 12 + Math.sin(time * 6) * 2;     // 둥실거림
            const spin = Math.abs(Math.cos(time * 4));            // 회전(가로 수축)
            const w = Math.max(2, Math.round(6 * spin));
            // 다이아 (마름모) — 3단 픽셀
            c.fillRect(Math.round(e.x - w / 2), Math.round(my - 5), w, 3);
            c.fillRect(Math.round(e.x - w), Math.round(my - 2), w * 2, 3);
            c.fillRect(Math.round(e.x - w / 2), Math.round(my + 1), w, 3);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 처치 — 픽셀 파열 (적이 모래로 터져 흩어짐)
    // ════════════════════════════════════════════════════════════
    /** @param d {x, y, t} / dur 총 길이(초) */
    shatter(c, d, dur = 0.3) {
        const prog = d.t / dur;                           // 0→1
        if (prog >= 1) return;
        const GRAINS = 28;
        c.fillStyle = this.pal[8] ?? '#E8553C';
        for (let i = 0; i < GRAINS; i++) {
            // 알갱이별 고정 방향/속도 (해시 기반 — 프레임 간 일관)
            const a   = this._h(i * 3.7) * Math.PI * 2;
            const spd = 70 + this._h(i * 7.1) * 200;
            // 감속 곡선 — 처음 빠르게 터지고 끝에서 멈추며 소멸
            const ease = 1 - (1 - prog) * (1 - prog);
            const x = d.x + Math.cos(a) * spd * ease * dur;
            const y = d.y + Math.sin(a) * spd * ease * dur + prog * prog * 40; // 중력
            // 끝으로 갈수록 알갱이 탈락
            if (this._h(i * 11.3) < prog * 0.9) continue;
            this._px(c, x, y, prog < 0.4 ? 3 : 2);
        }
        // 초반 섬광 코어
        if (prog < 0.25) {
            c.fillStyle = this.pal[12] ?? '#C8E8F0';
            this._px(c, d.x - 4, d.y - 4, 8);
        }
    }

    // ════════════════════════════════════════════════════════════
    // XP 픽업 — 모래 알갱이가 플레이어로 빨려 들어감
    // ════════════════════════════════════════════════════════════
    /** @param pk {x, y, t} / dur 총 길이(초) */
    absorb(c, pk, player, dur = 0.25) {
        const prog = pk.t / dur;                          // 0→1
        if (prog >= 1) return;
        c.fillStyle = this.pal[7] ?? '#F5D454';
        const GRAINS = 12;
        for (let i = 0; i < GRAINS; i++) {
            // 시작점은 픽업 위치 주변 링, 끝점은 플레이어
            const a = this._h(i * 5.3) * Math.PI * 2;
            const r = 8 + this._h(i * 9.7) * 28;
            const sx = pk.x + Math.cos(a) * r;
            const sy = pk.y + Math.sin(a) * r;
            // 가속 수렴 (ease-in)
            const t = prog * prog;
            const x = sx + (player.x - sx) * t;
            const y = sy + (player.y - sy) * t;
            this._px(c, x, y, i % 2 === 0 ? 3 : 2);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 4. 샷건 — 흐르는 모래 파도
    // ════════════════════════════════════════════════════════════
    /** @param w 파도 {ox, oy, dir, arcRad, radius, range, phase} */
    wave(c, w, time) {
        const fade = 1 - w.radius / w.range;              // 멀어질수록 흐려짐
        const arcLen = w.arcRad * w.radius;               // 호 길이
        const grains = Math.max(8, Math.floor(arcLen / 4));

        // 파도 크레스트(앞 능선) + 뒤따르는 2겹 — 파도가 "흐르는" 느낌
        const CRESTS = [
            { off: 0,   size: 3, density: 1.0, palIdx: 4 },   // 최전선
            { off: -8,  size: 3, density: 0.6, palIdx: 7 },   // 중간
            { off: -16, size: 2, density: 0.35, palIdx: 7 },  // 꼬리
        ];
        for (const crest of CRESTS) {
            const r = w.radius + crest.off;
            if (r < 4) continue;
            c.fillStyle = this.pal[crest.palIdx] ?? '#FFC23E';
            for (let i = 0; i <= grains; i++) {
                const t = i / grains;                     // 0~1 (호 위 위치)
                const a = w.dir + (t - 0.5) * w.arcRad;
                // 출렁임 — 호를 따라 sin 파형이 시간에 따라 흐름
                const undulate = Math.sin(t * 14 + time * 16 + w.phase) * 7;
                // 가장자리는 파도가 뒤처짐 (호 모양 둥글게)
                const edgeLag = Math.sin(t * Math.PI) * 10 - 10;
                const rr = r + undulate + edgeLag;
                // 흩어짐 탈락 — fade 가 낮을수록 듬성듬성
                if (this._h(i * 11.3 + Math.floor(time * 12) + crest.off) > fade * crest.density + 0.15) continue;
                this._px(c, w.ox + Math.cos(a) * rr, w.oy + Math.sin(a) * rr, crest.size);
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    // 5. 보스 — 페이즈별 색상 + 거친 모래 표면 + HP 바
    // ════════════════════════════════════════════════════════════
    /** @param e 보스 적 {x, y, radius, hp, maxHp, phase} */
    boss(c, e, time) {
        const r = e.radius;
        const PHASE_COLORS = [8, 9, 11]; // 1페이즈: 주황 → 2페이즈: 진홍 → 3페이즈: 보라
        const base = this.pal[PHASE_COLORS[Math.min(e.phase, PHASE_COLORS.length - 1)]] ?? '#E8553C';

        // 본체
        c.fillStyle = base;
        c.fillRect(e.x - r, e.y - r, r * 2, r * 2);

        // 거친 표면 알갱이 (페이즈가 오를수록 더 격렬하게 흔들림)
        c.fillStyle = this.pal[1] ?? '#1A1A18';
        const shake = 1 + e.phase * 1.5;
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + time * (1 + e.phase * 0.6);
            const rr = r * (0.5 + this._h(i + Math.floor(time * 6)) * 0.4);
            this._px(c, e.x + Math.cos(a) * rr + (this._h(i * 3.1) - 0.5) * shake,
                        e.y + Math.sin(a) * rr + (this._h(i * 5.7) - 0.5) * shake, 2);
        }

        // 페이즈 진입 시 분노 오라(테두리 글로우) — phase>=1
        if (e.phase >= 1) {
            c.fillStyle = this.pal[PHASE_COLORS[e.phase]] ?? '#E8553C';
            const pulse = 2 + Math.abs(Math.sin(time * 6)) * 3;
            c.fillRect(e.x - r - pulse, e.y - r - pulse, (r + pulse) * 2, 2);
            c.fillRect(e.x - r - pulse, e.y + r + pulse - 2, (r + pulse) * 2, 2);
        }

        // HP 바 (머리 위)
        const bw = r * 2.4, bh = 5;
        const bx = e.x - bw / 2, by = e.y - r - 14;
        c.fillStyle = this.pal[1] ?? '#1A1A18';
        c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        c.fillStyle = this.pal[15] ?? '#232838';
        c.fillRect(bx, by, bw, bh);
        c.fillStyle = this.pal[PHASE_COLORS[e.phase]] ?? '#E8553C';
        c.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    }

    // ════════════════════════════════════════════════════════════
    // 6. 보스 슬램 — 확장하는 충격파 + 균열 파편
    // ════════════════════════════════════════════════════════════
    /** @param s 슬램 {x, y, radius, targetRadius, hit} */
    bossSlam(c, s, time) {
        const fade = Math.max(0, 1 - s.radius / s.targetRadius);
        c.fillStyle = this.pal[8] ?? '#E8553C';
        const grains = Math.max(12, Math.floor(s.radius / 3));
        for (let i = 0; i < grains; i++) {
            const a = (i / grains) * Math.PI * 2;
            if (this._h(i * 9.1 + Math.floor(time * 20)) > fade + 0.2) continue;
            this._px(c, s.x + Math.cos(a) * s.radius, s.y + Math.sin(a) * s.radius, 3);
        }
        // 충돌 순간 — 중심 섬광
        if (s.hit) {
            c.fillStyle = this.pal[7] ?? '#F5D454';
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + time * 4;
                this._px(c, s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10, 3);
            }
        }
    }
}
