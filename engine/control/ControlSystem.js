/**
 * Sand Engine — ControlSystem
 * 선택된 엔티티의 타입을 읽어 컨트롤 패널 버튼을 자동 생성.
 * 커스텀 버튼 추가 + prefab.json controls 블록 연동.
 *
 * 액션 타입:
 *   state:{값}    → entity.setState(값)
 *   anim:{값}     → 애니메이션 실행
 *   reset         → 엔티티 초기 상태 복원
 *   play          → 애니메이션 재생
 *   stop          → 애니메이션 정지
 *   trigger:{값}  → palette_mgr.trigger(값)
 *   scroll:{값}   → cameraX 스크롤
 *   speed:{값}    → 속도 ±
 *   custom:{fn}   → 게임별 커스텀 함수
 */

// 타입별 기본 컨트롤 정의
const TYPE_CONTROLS = {
    CHARACTER_PLAYER: [
        { label: '재생',   action: 'play',             icon: '▶' },
        { label: '정지',   action: 'stop',             icon: '■' },
        { label: '왼쪽',  action: 'state:walk_left',  icon: '←' },
        { label: '오른쪽', action: 'state:walk_right', icon: '→' },
        { label: '점프',   action: 'state:jump',       icon: '↑' },
        { label: '공격',   action: 'state:attack',     icon: '⚔' },
    ],
    CHARACTER_NPC: [
        { label: '재생',     action: 'play',                icon: '▶' },
        { label: '정지',     action: 'stop',                icon: '■' },
        { label: '질문',     action: 'state:question',      icon: '?' },
        { label: '정답반응', action: 'state:react_correct', icon: '○' },
        { label: '오답반응', action: 'state:react_wrong',   icon: '✕' },
    ],
    CHARACTER_ENEMY: [
        { label: '재생', action: 'play',          icon: '▶' },
        { label: '정지', action: 'stop',          icon: '■' },
        { label: '순찰', action: 'state:patrol',  icon: '↔' },
        { label: '추격', action: 'state:chase',   icon: '!' },
        { label: '공격', action: 'state:attack',  icon: '⚔' },
        { label: '사망', action: 'state:die',     icon: '✝' },
    ],
    ABACUS_BEAD: [
        { label: '위로',   action: 'state:up',   icon: '↑' },
        { label: '아래로', action: 'state:down', icon: '↓' },
        { label: '리셋',   action: 'reset',      icon: '↺' },
    ],
    ABACUS_FRAME: [
        { label: '리셋', action: 'reset', icon: '↺' },
    ],
    ABACUS_ROD: [
        { label: '리셋', action: 'reset', icon: '↺' },
    ],
    UI_TIMER: [
        { label: '시작', action: 'play',  icon: '▶' },
        { label: '정지', action: 'stop',  icon: '■' },
        { label: '리셋', action: 'reset', icon: '↺' },
    ],
    UI_SCORE: [
        { label: '+점수', action: 'custom:score_up',   icon: '+' },
        { label: '-점수', action: 'custom:score_down', icon: '-' },
        { label: '리셋',  action: 'reset',             icon: '↺' },
    ],
    UI_PROBLEM: [
        { label: '정답', action: 'state:correct', icon: '○' },
        { label: '오답', action: 'state:wrong',   icon: '✕' },
        { label: '리셋', action: 'reset',         icon: '↺' },
    ],
    PARTICLE_STAR: [
        { label: '발동', action: 'play', icon: '▶' },
        { label: '정지', action: 'stop', icon: '■' },
    ],
    PARTICLE_VORTEX: [
        { label: '발동',  action: 'play',       icon: '▶' },
        { label: '정지',  action: 'stop',       icon: '■' },
        { label: '빠르게', action: 'speed:+0.1', icon: '⚡' },
        { label: '느리게', action: 'speed:-0.1', icon: '~' },
    ],
    BACKGROUND_FAR: [
        { label: '스크롤',  action: 'scroll:left', icon: '▶' },
        { label: '정지',   action: 'stop',        icon: '■' },
        { label: '빠르게', action: 'speed:+0.1',  icon: '+' },
        { label: '느리게', action: 'speed:-0.1',  icon: '-' },
    ],
    BACKGROUND_NEAR: [
        { label: '스크롤',  action: 'scroll:left', icon: '▶' },
        { label: '정지',   action: 'stop',        icon: '■' },
        { label: '빠르게', action: 'speed:+0.1',  icon: '+' },
        { label: '느리게', action: 'speed:-0.1',  icon: '-' },
    ],
};

export default class ControlSystem {
    constructor(engine, panelEl) {
        this._engine   = engine;
        this._panel    = panelEl;    // #control-panel DOM 요소
        this._selected = null;       // 현재 선택된 Entity
        this._customHandlers = {};   // custom: 액션 핸들러 등록
    }

    // ── 엔티티 선택 ──────────────────────────────────────────────────

    select(entity) {
        this._selected = entity;
        this._render();
    }

    deselect() {
        this._selected = null;
        this._render();
    }

    get selected() { return this._selected; }

    // ── 커스텀 액션 핸들러 등록 ──────────────────────────────────────
    // custom:score_up 등 게임별 함수 연결
    registerCustom(name, fn) {
        this._customHandlers[name] = fn;
    }

    // ── 패널 렌더링 ──────────────────────────────────────────────────

    _render() {
        if (!this._panel) return;

        if (!this._selected) {
            this._panel.innerHTML = `
                <div class="ctrl-empty">캔버스에서 에셋을 클릭하세요</div>`;
            return;
        }

        const entity  = this._selected;
        const type    = entity.type ?? 'UNKNOWN';
        const defaults = this._getDefaults(entity);
        const customs  = entity._prefabControls?.custom ?? [];

        this._panel.innerHTML = `
            <div class="ctrl-header">
                <span class="ctrl-type">${type}</span>
                <span class="ctrl-id">#${entity.id}</span>
            </div>
            <div class="ctrl-buttons">
                ${defaults.map(btn => this._btnHtml(btn, 'default')).join('')}
                ${customs.map(btn => this._btnHtml(btn, 'custom')).join('')}
                <button class="ctrl-btn ctrl-add" id="ctrl-add-btn">+ 추가</button>
            </div>
            <div class="ctrl-add-form hidden" id="ctrl-add-form">
                <input class="ctrl-input" id="ctrl-label"  placeholder="라벨" maxlength="6">
                <input class="ctrl-input" id="ctrl-action" placeholder="액션 (state:up)">
                <input class="ctrl-input ctrl-icon" id="ctrl-icon" placeholder="아이콘" maxlength="2">
                <button class="ctrl-btn ctrl-save" id="ctrl-save-btn">저장</button>
            </div>`;

        // 버튼 이벤트
        this._panel.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._dispatch(btn.dataset.action, entity);
            });
        });

        // 추가 폼 토글
        this._panel.querySelector('#ctrl-add-btn').addEventListener('click', () => {
            this._panel.querySelector('#ctrl-add-form').classList.toggle('hidden');
        });

        // 커스텀 버튼 저장
        this._panel.querySelector('#ctrl-save-btn').addEventListener('click', () => {
            this._saveCustom(entity);
        });
    }

    _btnHtml(btn, cls) {
        return `<button class="ctrl-btn ctrl-${cls}" data-action="${btn.action}" title="${btn.label}">
            <span class="ctrl-icon-glyph">${btn.icon}</span>
            <span class="ctrl-label">${btn.label}</span>
        </button>`;
    }

    // 타입 기본 컨트롤 (prefab.json controls.default 우선, 없으면 TYPE_CONTROLS)
    _getDefaults(entity) {
        const fromPrefab = entity._prefabControls?.default;
        if (fromPrefab?.length) return fromPrefab;
        return TYPE_CONTROLS[entity.type] ?? [];
    }

    // ── 액션 실행 ─────────────────────────────────────────────────────

    _dispatch(action, entity) {
        if (!entity) return;

        if (action.startsWith('state:')) {
            entity.setState(action.slice(6));

        } else if (action.startsWith('anim:')) {
            entity.setState(action.slice(5));

        } else if (action === 'play') {
            entity.asm?.restart();

        } else if (action === 'stop') {
            if (entity.asm) entity.asm._done = true;

        } else if (action === 'reset') {
            entity.setState(Object.keys(entity.asm?.states ?? {})[0] ?? 'idle');

        } else if (action.startsWith('trigger:')) {
            this._engine.palette_mgr.trigger(action.slice(8));

        } else if (action.startsWith('scroll:')) {
            const dir = action.slice(7);
            this._engine.setCamera(
                this._engine.cameraX + (dir === 'left' ? 20 : -20)
            );

        } else if (action.startsWith('speed:')) {
            const delta = parseFloat(action.slice(6));
            if (!isNaN(delta)) entity._speed = (entity._speed ?? 1) + delta;

        } else if (action.startsWith('custom:')) {
            const name = action.slice(7);
            const fn   = this._customHandlers[name];
            if (fn) fn(entity, this._engine);
            else console.warn(`[ControlSystem] custom 핸들러 없음: "${name}"`);
        }
    }

    // ── 커스텀 버튼 저장 ─────────────────────────────────────────────

    _saveCustom(entity) {
        const label  = this._panel.querySelector('#ctrl-label').value.trim();
        const action = this._panel.querySelector('#ctrl-action').value.trim();
        const icon   = this._panel.querySelector('#ctrl-icon').value.trim() || '●';

        if (!label || !action) return;

        if (!entity._prefabControls) entity._prefabControls = { default: [], custom: [] };
        if (!entity._prefabControls.custom) entity._prefabControls.custom = [];

        entity._prefabControls.custom.push({ label, action, icon });

        // 서버 API로 prefab.json 자동 저장 (server_v3.ps1 API 필요 시 확장)
        console.log(`[ControlSystem] 커스텀 버튼 추가: ${label} → ${action}`);

        this._render(); // 패널 갱신
    }
}
