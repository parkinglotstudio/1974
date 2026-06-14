/**
 * Sand Engine — InputManager
 * 키보드 / 마우스 / 터치 통합 입력 관리. Mobile-First.
 *
 * 액션 기반 추상화:
 *   'left'    — 이동 좌 (ArrowLeft / A)
 *   'right'   — 이동 우 (ArrowRight / D)
 *   'up'      — 이동 상 / 점프 (ArrowUp / W)
 *   'down'    — 이동 하 / 내려앉기 (ArrowDown / S)
 *   'action'  — 주 행동 / 점프 (Space / Z / Enter)
 *   'back'    — 취소 / 뒤로 (Escape / X)
 *   'confirm' — 확인 (Enter / Z)
 *
 * 사용 예:
 *   const input = new InputManager(mainCanvas, scaleManager);
 *   // 게임 루프 시작 전:
 *   input.attach();
 *   // 게임 루프에서:
 *   input.update();   // 매 프레임 첫 번째로 호출
 *   if (input.isPressed('action')) { ... }
 *   if (input.pointer.justDown)    { ... }
 *   // Chapter 4 터미널 텍스트 입력:
 *   input.enableTextInput();
 *   const cmd = input.getTextInput(); // 엔터 입력 시 반환
 */
export default class InputManager {

    // 기본 키 → 액션 매핑
    static DEFAULT_BINDINGS = {
        ArrowLeft:  'left',  a: 'left',
        ArrowRight: 'right', d: 'right',
        ArrowUp:    'up',    w: 'up',
        ArrowDown:  'down',  s: 'down',
        ' ':        'action', z: 'action',
        Enter:      'confirm',
        Escape:     'back',  x: 'back',
    };

    constructor(canvas, scaleMgr) {
        this._canvas   = canvas;
        this._scale    = scaleMgr;

        // 키 상태
        this._held     = new Set();  // 현재 눌린 물리 키
        this._pressed  = new Set();  // 이번 프레임에 눌린 액션
        this._released = new Set();  // 이번 프레임에 떼어진 액션

        // pending 버퍼 — DOM 이벤트는 프레임 사이에 도착하므로 일단 여기 쌓고,
        // update()에서 현재 프레임 상태로 승격한다. (직접 _pressed에 넣으면
        // 다음 update()의 clear에 읽히기 전에 유실됨)
        this._pendingPressed  = new Set();
        this._pendingReleased = new Set();
        this._pendingDown     = false;
        this._pendingUp       = false;

        // 액션 → 키 목록 (역방향)
        this._bindings = { ...InputManager.DEFAULT_BINDINGS };

        // 포인터 (마우스/터치 통합)
        this.pointer = {
            x: 0, y: 0,       // 게임 논리 좌표
            down: false,
            justDown: false,
            justUp: false,
        };

        // 드래그
        this._dragStart = null;

        // Chapter 4 터미널 텍스트 입력 모드
        this._textMode    = false;
        this._textBuf     = '';
        this._textReady   = null; // 엔터 입력 시 완성된 라인 (현재 프레임)
        this._pendingText = null; // 프레임 사이에 도착한 라인 (update에서 승격)

        // 이벤트 핸들러 (detach 를 위해 참조 보관)
        this._handlers = {};
        this._attached = false;
    }

    // ── 라이프사이클 ─────────────────────────────────────────────

    attach() {
        if (this._attached) return;
        this._attached = true;

        const on = (el, ev, fn, opts) => {
            el.addEventListener(ev, fn, opts);
            this._handlers[`${ev}`] = { el, fn };
        };

        // 키보드
        on(window, 'keydown', e => this._onKeyDown(e));
        on(window, 'keyup',   e => this._onKeyUp(e));

        // 마우스
        on(this._canvas, 'mousedown',  e => this._onPointerDown(e.clientX, e.clientY));
        on(this._canvas, 'mousemove',  e => this._onPointerMove(e.clientX, e.clientY));
        on(window,       'mouseup',    e => this._onPointerUp());

        // 터치 (Mobile-First)
        on(this._canvas, 'touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            this._onPointerDown(t.clientX, t.clientY);
        }, { passive: false });
        on(this._canvas, 'touchmove', e => {
            e.preventDefault();
            const t = e.touches[0];
            this._onPointerMove(t.clientX, t.clientY);
        }, { passive: false });
        on(this._canvas, 'touchend', e => {
            e.preventDefault();
            this._onPointerUp();
        }, { passive: false });
    }

    detach() {
        for (const [ev, { el, fn }] of Object.entries(this._handlers)) {
            el.removeEventListener(ev, fn);
        }
        this._handlers  = {};
        this._attached  = false;
    }

    // ── 매 프레임 호출 (게임 루프 최상단) ────────────────────────

    update() {
        // pending → 현재 프레임 승격 (이벤트 유실 방지)
        this._pressed         = this._pendingPressed;
        this._released        = this._pendingReleased;
        this._pendingPressed  = new Set();
        this._pendingReleased = new Set();
        this.pointer.justDown = this._pendingDown;
        this.pointer.justUp   = this._pendingUp;
        this._pendingDown     = false;
        this._pendingUp       = false;
        this._textReady       = this._pendingText;
        this._pendingText     = null;
    }

    // ── 액션 조회 ─────────────────────────────────────────────────

    // 현재 눌려있는 상태
    isDown(action) {
        for (const [key, act] of Object.entries(this._bindings)) {
            if (act === action && this._held.has(key)) return true;
        }
        return false;
    }

    // 이번 프레임에 방금 눌린 경우
    isPressed(action)  { return this._pressed.has(action);  }

    // 이번 프레임에 방금 떼어진 경우
    isReleased(action) { return this._released.has(action); }

    // ── 커스텀 키 바인딩 ──────────────────────────────────────────

    bindAction(action, keys) {
        for (const key of keys) this._bindings[key] = action;
    }

    // ── 텍스트 입력 모드 (Chapter 4 터미널) ──────────────────────

    enableTextInput()  { this._textMode = true;  this._textBuf = ''; }
    disableTextInput() { this._textMode = false; this._textBuf = ''; }

    get textBuffer() { return this._textBuf; }

    // 엔터 입력으로 완성된 라인 반환. 없으면 null.
    getTextInput() { return this._textReady; }

    // ── 내부 이벤트 처리 ──────────────────────────────────────────

    _onKeyDown(e) {
        const key = e.key;

        // 텍스트 모드: 문자 입력 캡처
        if (this._textMode) {
            if (key === 'Enter') {
                this._pendingText = this._textBuf;
                this._textBuf     = '';
            } else if (key === 'Backspace') {
                this._textBuf = this._textBuf.slice(0, -1);
            } else if (key.length === 1) {
                this._textBuf += key;
            }
            // 텍스트 모드에서는 액션 처리 스킵 (방향키 등은 예외)
            if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(key)) return;
        }

        if (this._held.has(key)) return; // 키 반복 무시
        this._held.add(key);

        const action = this._bindings[key];
        if (action) this._pendingPressed.add(action);
    }

    _onKeyUp(e) {
        const key = e.key;
        this._held.delete(key);

        const action = this._bindings[key];
        if (action) this._pendingReleased.add(action);
    }

    _onPointerDown(cx, cy) {
        const pos = this._toGame(cx, cy);
        this.pointer.x    = pos.x;
        this.pointer.y    = pos.y;
        this.pointer.down = true;
        this._pendingDown = true;
        this._dragStart   = { x: pos.x, y: pos.y };
    }

    _onPointerMove(cx, cy) {
        const pos = this._toGame(cx, cy);
        this.pointer.x = pos.x;
        this.pointer.y = pos.y;
    }

    _onPointerUp() {
        this.pointer.down = false;
        this._pendingUp   = true;
        this._dragStart   = null;
    }

    // 화면 좌표 → 게임 논리 좌표
    _toGame(clientX, clientY) {
        const rect = this._canvas.getBoundingClientRect();
        return this._scale.screenToGame(clientX, clientY, rect);
    }
}
