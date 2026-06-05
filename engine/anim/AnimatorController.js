/**
 * Sand Engine — AnimatorController
 * 기존 AnimationStateMachine(클립 재생기) 위에 얹는 "플로우(상태 그래프)" 레이어.
 * 유니티 Animator 사상: 게임 로직은 파라미터만 세팅하고, 어떤 클립이 재생될지는
 * 이 컨트롤러가 전환(transition) 규칙으로 결정한다. (엔진=로직 / 게임=데이터)
 *
 * - 상태(states)와 프레임/fps/loop 는 스프라이트의 stateDef(=asm)에 이미 있다.
 *   이 컨트롤러는 그 위에 parameters + transitions 만 더한다.
 * - asm.tick(프레임 진행)은 엔티티가 매 프레임 따로 호출한다. 컨트롤러는 "어느 상태인가"만 정함.
 *
 * 정의(JSON) 포맷:
 * {
 *   "default": "idle",
 *   "parameters": [ {name,type:'float'|'int'|'bool'|'trigger',default} ],
 *   "transitions": [
 *     { from:'idle', to:'walk', conditions:[ {p:'speed', op:'>', v:0.1} ] },
 *     { from:'*',    to:'attack', conditions:[ {p:'fire', op:'trigger'} ] },  // '*' = Any State
 *     { from:'attack', to:'idle', hasExitTime:true }                          // 클립 끝나면 자동
 *   ]
 * }
 * op: '>' '>=' '<' '<=' '==' '!=' 'trigger'(해당 트리거가 set됐는가)
 */
export default class AnimatorController {
    /** @param {AnimationStateMachine} asm  엔티티의 상태머신(this.asm) */
    constructor(asm) {
        this.asm        = asm;
        this.params     = new Map();   // name → value (트리거도 bool로 저장)
        this._isTrigger = new Set();   // 트리거 파라미터 이름들 (소비 후 false 리셋)
        this.transitions = [];
        this.loaded     = false;
    }

    load(def) {
        if (!def) return false;
        this.params.clear(); this._isTrigger.clear();
        for (const p of (def.parameters ?? [])) {
            this.params.set(p.name, p.type === 'trigger' ? false : (p.default ?? 0));
            if (p.type === 'trigger') this._isTrigger.add(p.name);
        }
        this.transitions = def.transitions ?? [];
        // 시작 상태: default 우선, 없으면 asm 첫 상태 유지
        if (def.default && this.asm?.states?.[def.default]) this.asm.setState(def.default);
        this.loaded = true;
        return true;
    }

    // ── 파라미터 주입 (게임 로직이 호출) ──────────────────────────────
    setParam(name, value) { if (this.params.has(name)) this.params.set(name, value); }
    setBool(name, on)     { this.setParam(name, !!on); }
    trigger(name)         { if (this._isTrigger.has(name)) this.params.set(name, true); }

    // ── 매 프레임: 전환 평가 → asm.setState ───────────────────────────
    // (asm.tick 은 엔티티가 따로 호출 — 여기선 "어느 상태로 갈지"만 결정)
    update() {
        if (!this.loaded || !this.asm) return;
        const cur = this.asm.current;
        for (const tr of this.transitions) {
            if (tr.from !== '*' && tr.from !== cur) continue;   // '*' = Any State
            if (tr.to === cur) continue;                         // 자기 자신으로는 무시
            if (tr.hasExitTime && !this.asm.isDone()) continue;  // 클립 끝나야 전환(non-loop)
            if (!this._condsMet(tr.conditions)) continue;
            this.asm.setState(tr.to);
            this._consumeTriggers(tr.conditions);
            break;   // 한 프레임에 한 번만 전환
        }
        // 트리거는 1프레임만 유효 (Unity 식: 소비되지 않으면 다음 프레임에 리셋)
        for (const t of this._isTrigger) this.params.set(t, false);
    }

    _condsMet(conds) {
        if (!conds || !conds.length) return true;   // 조건 없으면 (hasExitTime 전용 등) 통과
        for (const c of conds) {
            const a = this.params.get(c.p);
            let ok;
            switch (c.op) {
                case '>':  ok = a >  c.v; break;
                case '>=': ok = a >= c.v; break;
                case '<':  ok = a <  c.v; break;
                case '<=': ok = a <= c.v; break;
                case '==': ok = a === c.v; break;
                case '!=': ok = a !== c.v; break;
                case 'trigger': ok = a === true; break;
                default: ok = false;
            }
            if (!ok) return false;   // 모든 조건 AND
        }
        return true;
    }

    _consumeTriggers(conds) {
        for (const c of (conds ?? [])) if (c.op === 'trigger' && this._isTrigger.has(c.p)) this.params.set(c.p, false);
    }
}
