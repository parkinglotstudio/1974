/**
 * Sand Engine — SoundManager
 * Web Audio API 기반 BGM + SFX 채널 분리.
 *
 * BGM: 루프 재생 / 페이드 인·아웃 / 크로스페이드
 * SFX: 동시 다중 재생 / 카테고리별 볼륨
 *
 * 사용 예:
 *   const sound = new SoundManager();
 *   await sound.loadBgm('bgm_market', '/assets/audio/market_1974.mp3');
 *   await sound.loadSfx('coin',       '/assets/audio/coin.mp3');
 *
 *   sound.playBgm('bgm_market', { fadeIn: 1000 });
 *   sound.playSfx('coin');
 *   sound.stopBgm({ fadeOut: 500 });
 *
 * 볼륨 (0.0~1.0):
 *   sound.setBgmVolume(0.7);
 *   sound.setSfxVolume(0.5);
 *   sound.setMasterVolume(0.8);
 */

export default class SoundManager {
    constructor() {
        this._ctx       = null;   // AudioContext (첫 사용 시 생성)
        this._master    = null;   // GainNode — 마스터 볼륨
        this._bgmGain   = null;   // GainNode — BGM 채널
        this._sfxGain   = null;   // GainNode — SFX 채널

        this._buffers   = new Map();   // key → AudioBuffer
        this._bgmNode   = null;        // 현재 재생 중인 BGM 소스
        this._bgmKey    = null;        // 현재 BGM 키
        this._fadeTimer = null;        // 페이드 타이머 ID

        // 볼륨 기본값
        this._masterVol = 1.0;
        this._bgmVol    = 0.7;
        this._sfxVol    = 1.0;

        // 뮤트 상태
        this._muted     = false;
        this._prevVol   = 1.0;

        // 로딩 상태
        this._pending   = new Map();   // key → Promise (중복 로드 방지)
    }

    // ── 초기화 ─────────────────────────────────────────────────────

    // Web Audio API는 사용자 제스처 이후에 생성해야 함
    _ensureContext() {
        if (this._ctx) return;
        this._ctx     = new (window.AudioContext || window.webkitAudioContext)();
        this._master  = this._ctx.createGain();
        this._bgmGain = this._ctx.createGain();
        this._sfxGain = this._ctx.createGain();

        this._bgmGain.connect(this._master);
        this._sfxGain.connect(this._master);
        this._master.connect(this._ctx.destination);

        this._master.gain.value  = this._masterVol;
        this._bgmGain.gain.value = this._bgmVol;
        this._sfxGain.gain.value = this._sfxVol;
    }

    // iOS/Chrome 정책 — 사용자 클릭 이후 resume 필요
    async resume() {
        this._ensureContext();
        if (this._ctx.state === 'suspended') {
            await this._ctx.resume();
        }
    }

    // ── 에셋 로드 ─────────────────────────────────────────────────

    async load(key, url) {
        if (this._buffers.has(key)) return this._buffers.get(key);
        if (this._pending.has(key)) return this._pending.get(key);

        const promise = fetch(url)
            .then(r => r.arrayBuffer())
            .then(ab => {
                this._ensureContext();
                return this._ctx.decodeAudioData(ab);
            })
            .then(buffer => {
                this._buffers.set(key, buffer);
                this._pending.delete(key);
                return buffer;
            });

        this._pending.set(key, promise);
        return promise;
    }

    // 편의 별칭
    loadBgm(key, url) { return this.load(key, url); }
    loadSfx(key, url) { return this.load(key, url); }

    // 여러 파일 동시 로드
    loadMany(entries) {
        return Promise.all(entries.map(([key, url]) => this.load(key, url)));
    }

    // ── BGM ───────────────────────────────────────────────────────

    // options: { fadeIn: ms, loop: bool, offset: sec, volume: 0~1 }
    playBgm(key, options = {}) {
        if (!this._buffers.has(key)) {
            console.warn(`[SoundManager] BGM 없음: "${key}"`);
            return;
        }
        if (this._bgmKey === key && this._bgmNode) return; // 이미 재생 중

        this._ensureContext();

        // 기존 BGM 정지 (페이드 없이)
        this._stopBgmNode();

        const buffer = this._buffers.get(key);
        const src    = this._ctx.createBufferSource();
        src.buffer   = buffer;
        src.loop     = options.loop ?? true;
        src.connect(this._bgmGain);
        src.start(0, options.offset ?? 0);

        this._bgmNode = src;
        this._bgmKey  = key;

        if (options.fadeIn > 0) {
            this._bgmGain.gain.setValueAtTime(0, this._ctx.currentTime);
            this._bgmGain.gain.linearRampToValueAtTime(
                this._bgmVol,
                this._ctx.currentTime + options.fadeIn / 1000
            );
        }
    }

    // options: { fadeOut: ms }
    stopBgm(options = {}) {
        if (!this._bgmNode) return;
        const fadeMs = options.fadeOut ?? 0;

        if (fadeMs > 0) {
            const gain = this._bgmGain.gain;
            gain.setValueAtTime(gain.value, this._ctx.currentTime);
            gain.linearRampToValueAtTime(0, this._ctx.currentTime + fadeMs / 1000);
            this._fadeTimer = setTimeout(() => {
                this._stopBgmNode();
                // gain 복원
                this._bgmGain.gain.setValueAtTime(this._bgmVol, this._ctx.currentTime);
            }, fadeMs + 50);
        } else {
            this._stopBgmNode();
        }
    }

    // 크로스페이드: 현재 BGM → 새 BGM
    crossfade(key, ms = 1000) {
        this.stopBgm({ fadeOut: ms });
        setTimeout(() => this.playBgm(key, { fadeIn: ms }), ms * 0.5);
    }

    pauseBgm() {
        if (this._ctx?.state === 'running') this._ctx.suspend();
    }

    resumeBgm() {
        if (this._ctx?.state === 'suspended') this._ctx.resume();
    }

    get bgmPlaying() { return !!this._bgmNode; }
    get currentBgm() { return this._bgmKey; }

    // ── SFX ───────────────────────────────────────────────────────

    // options: { volume: 0~1, pitch: 0.5~2.0, pan: -1~1 }
    playSfx(key, options = {}) {
        if (!this._buffers.has(key)) {
            console.warn(`[SoundManager] SFX 없음: "${key}"`);
            return null;
        }
        this._ensureContext();

        const buffer = this._buffers.get(key);
        const src    = this._ctx.createBufferSource();
        src.buffer         = buffer;
        src.playbackRate.value = options.pitch ?? 1.0;

        // 개별 볼륨
        if (options.volume != null || options.pan != null) {
            const gain = this._ctx.createGain();
            gain.gain.value = options.volume ?? 1.0;

            if (options.pan != null) {
                const panner = this._ctx.createStereoPanner();
                panner.pan.value = Math.max(-1, Math.min(1, options.pan));
                src.connect(panner);
                panner.connect(gain);
            } else {
                src.connect(gain);
            }
            gain.connect(this._sfxGain);
        } else {
            src.connect(this._sfxGain);
        }

        src.start(0);
        return src;
    }

    // 같은 SFX를 랜덤 피치로 재생 (반복 재생 자연스러움)
    playSfxVaried(key, pitchRange = 0.1) {
        const pitch = 1.0 + (Math.random() - 0.5) * pitchRange * 2;
        return this.playSfx(key, { pitch });
    }

    // ── 볼륨 제어 ─────────────────────────────────────────────────

    setMasterVolume(v) {
        this._masterVol = Math.max(0, Math.min(1, v));
        if (this._master) this._master.gain.value = this._masterVol;
    }

    setBgmVolume(v) {
        this._bgmVol = Math.max(0, Math.min(1, v));
        if (this._bgmGain) this._bgmGain.gain.value = this._bgmVol;
    }

    setSfxVolume(v) {
        this._sfxVol = Math.max(0, Math.min(1, v));
        if (this._sfxGain) this._sfxGain.gain.value = this._sfxVol;
    }

    mute() {
        if (this._muted) return;
        this._muted   = true;
        this._prevVol = this._masterVol;
        this.setMasterVolume(0);
    }

    unmute() {
        if (!this._muted) return;
        this._muted = false;
        this.setMasterVolume(this._prevVol);
    }

    toggleMute() {
        this._muted ? this.unmute() : this.mute();
    }

    get muted()        { return this._muted; }
    get masterVolume() { return this._masterVol; }
    get bgmVolume()    { return this._bgmVol; }
    get sfxVolume()    { return this._sfxVol; }

    // ── 캐시 관리 ─────────────────────────────────────────────────

    evict(key) {
        this._buffers.delete(key);
    }

    evictAll() {
        this._buffers.clear();
    }

    // ── 정리 ──────────────────────────────────────────────────────

    destroy() {
        this.stopBgm();
        clearTimeout(this._fadeTimer);
        this._ctx?.close();
        this._ctx     = null;
        this._buffers.clear();
    }

    // ── 내부 ──────────────────────────────────────────────────────

    _stopBgmNode() {
        clearTimeout(this._fadeTimer);
        try { this._bgmNode?.stop(); } catch (_) {}
        this._bgmNode = null;
        this._bgmKey  = null;
    }
}
