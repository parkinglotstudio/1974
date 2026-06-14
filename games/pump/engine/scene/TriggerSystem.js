/**
 * Sand Engine — TriggerSystem
 * 이벤트 버스. SceneManager + PaletteManager 연결 고리.
 *
 * Antigravity 1974 핵심 흐름:
 *   arcade_enter 트리거 → PaletteManager.trigger('neon') + SceneManager 씬 전환
 *
 * 사용 예:
 *   const trig = new TriggerSystem();
 *   trig.on('arcade_enter', () => {
 *     engine.palette_mgr.trigger('neon');
 *     engine.scenes.change('scene_10', 'palette_flash');
 *   });
 *   // 게임 중 발화:
 *   trig.trigger('arcade_enter');
 */
export default class TriggerSystem {
    constructor() {
        this._listeners = new Map(); // event → Set<cb>
    }

    // 이벤트 리스너 등록. 반환값 = 해제 함수
    on(event, cb) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(cb);
        return () => this.off(event, cb);
    }

    off(event, cb) {
        this._listeners.get(event)?.delete(cb);
    }

    // 1회만 실행 후 자동 해제
    once(event, cb) {
        const wrapper = (data) => { cb(data); this.off(event, wrapper); };
        return this.on(event, wrapper);
    }

    // 이벤트 발화 — 등록된 모든 리스너 호출
    trigger(event, data) {
        for (const cb of (this._listeners.get(event) ?? [])) {
            try { cb(data); } catch (e) { console.error(`[TriggerSystem] "${event}"`, e); }
        }
    }

    // 등록된 리스너 수
    listenerCount(event) {
        return this._listeners.get(event)?.size ?? 0;
    }

    // 특정 이벤트 or 전체 리스너 제거
    clear(event) {
        if (event) this._listeners.delete(event);
        else       this._listeners.clear();
    }
}
