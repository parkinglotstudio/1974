/**
 * 스퀘어 — 전투 로비 씬
 * 레이아웃 = data/ui_lobby.json (데이터), 이 파일은 동작만 담당 (엔진=로직/게임=데이터).
 *
 * 흐름: 로비 → [배수 선택(순환)] → 게임 시작 → square_play (모래 수렴 전환)
 * 상단바(재화/레벨) + 하단탭(상점/장비/도전/진화) — meta_config.json + SaveSystem 기반.
 * 이벤트 슬롯은 제외(zone만 예약, 액션 no-op).
 */
import { Scene } from '../engine/scene/SceneManager.js';
import SaveSystem from './core/SaveSystem.js';

const MULTS  = [1, 3, 5, 10];
const BASE_COST = 5;

export default class LobbyScene extends Scene {
    constructor() {
        super('square_lobby');
        this._def     = null;
        this._stageIdx = 0;
        this._multIdx  = 0;
        this._tab = 'battle'; // 'battle' | 'shop' | 'equip' | 'challenge' | 'evolution'
    }

    async onEnter(engine) {
        this.engine = engine;
        if (!this._def) {
            this._def = await engine.assets.load('data/ui_lobby.json');
        }
        if (!this._meta) {
            this._meta = await engine.assets.load('data/meta_config.json');
        }
        if (!this._evo) {
            this._evo = await engine.assets.load('data/evolution_config.json');
        }
        this._save = SaveSystem.load();

        engine.ui.load(this._def, { transition: 'sand', duration: 700 });
        engine.ui._raster(); // _byId 즉시 구축 — onEnter 내 ui.set() 이 적용되도록
        engine.ui.onAction = (action, w) => this._onAction(action, w);
        this._showTab('battle');
    }

    onExit() {
        this.engine?.ui.clear();
    }

    _onAction(action) {
        const ui = this.engine.ui;
        switch (action) {
            case 'cycle_mult': {
                this._multIdx = (this._multIdx + 1) % MULTS.length;
                this._refresh();
                break;
            }
            case 'stage_prev': {
                this._stageIdx = (this._stageIdx + this._meta.stages.length - 1) % this._meta.stages.length;
                this._refresh();
                break;
            }
            case 'stage_next': {
                this._stageIdx = (this._stageIdx + 1) % this._meta.stages.length;
                this._refresh();
                break;
            }
            case 'start_game': {
                const stage = this._meta.stages[this._stageIdx];
                if (!this._save.stageUnlocked.includes(stage.id)) break; // 미해금 — 시작 불가
                const play = this.engine.scenes._scenes.get('square_play');
                if (play) {
                    play.stageName = stage.name;
                    play.stageId   = stage.id;
                    play.mult      = MULTS[this._multIdx];
                }
                this.engine.scenes.transitionTo('square_play', { effect: 'convergence', duration: 900 });
                break;
            }

            // ── 하단 탭바 — 풀스크린 페이지 전환 ──
            case 'tab_battle':    this._showTab('battle');    break;
            case 'tab_shop':      this._showTab('shop');      break;
            case 'tab_equip':     this._showTab('equip');     break;
            case 'tab_challenge': this._showTab('challenge'); break;
            case 'tab_evolution': this._showTab('evolution'); break;

            // ── 상점: 보급 상자 뽑기 ──
            case 'shop_buy_0': case 'shop_buy_1': case 'shop_buy_2': {
                const i = Number(action.slice(-1));
                this._buyShopBox(i);
                break;
            }

            // ── 장비: 장착/해제 ──
            case 'equip_toggle_0': case 'equip_toggle_1': case 'equip_toggle_2': {
                const i = Number(action.slice(-1));
                this._toggleEquip(i);
                break;
            }

            // ── 도전: 미션 보상 수령 ──
            case 'mission_claim_0': case 'mission_claim_1': case 'mission_claim_2': {
                const i = Number(action.slice(-1));
                this._claimMission(i);
                break;
            }

            // ── 진화: 노드 획득 ──
            case 'evo_buy_0': case 'evo_buy_1': case 'evo_buy_2': {
                const i = Number(action.slice(-1));
                this._acquireEvoNode(i);
                break;
            }

            // 미구현 슬롯 — no-op (이벤트 제외)
            case 'menu':
            case 'avatar':
            case 'chapter_reward':
                break;
        }
    }

    // ── 위젯 트리(this._def)에서 id로 def 검색 — visible:false 라도 찾을 수 있음 ──
    _findDef(id, node = this._def) {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of node.children ?? []) {
            const found = this._findDef(id, child);
            if (found) return found;
        }
        return null;
    }

    /** visible:false 인 위젯도 직접 def를 수정 후 raster 재구축 */
    _setProp(id, props) {
        const def = this._findDef(id);
        if (!def) return;
        Object.assign(def, props);
    }

    // ── 탭 = 풀스크린 페이지 전환 (PDF 레이아웃 패턴: 상단바/탭바 고정) ──
    _showTab(name) {
        const ui = this.engine.ui;
        const PAGES = {
            battle:    'page_battle',
            shop:      'page_shop',
            equip:     'page_equip',
            challenge: 'page_challenge',
            evolution: 'page_evolution',
        };
        for (const [key, id] of Object.entries(PAGES)) {
            this._setProp(id, { visible: key === name });
            // 활성 탭 하이라이트 — gold / 비활성 slate
            this._setProp(`tab_${key}`, { skin: key === name ? 'gold' : 'slate' });
        }
        this._tab = name;
        ui.markDirty();
        ui._raster();
        this._refreshPage(name);
    }

    _refreshPage(name) {
        if (name === 'battle')    this._refresh();
        if (name === 'shop')      this._refreshShop();
        if (name === 'equip')     this._refreshEquip();
        if (name === 'challenge') this._refreshChallenge();
        if (name === 'evolution') this._refreshEvolution();
    }

    // ── 상점 ───────────────────────────────────────────────────────
    // shop_box.csv 기반 보급 상자 — 골드로 구매, 무작위 장비 슬롯을 강화
    _refreshShop() {
        const ui = this.engine.ui;
        this._meta.shopBoxes.forEach((box, i) => {
            const allMaxed = this._meta.equipment.every(eq => (this._save.equipLevels[eq.id] ?? 0) >= eq.maxLevel);
            ui.set(`shop_name${i}`, { text: `${box.icon} ${box.name}` });
            ui.set(`shop_desc${i}`, { text: box.desc });
            ui.set(`shop_cost${i}`, { text: allMaxed ? 'MAX' : `${box.cost}G · 뽑기` });
            this._setProp(`shop_price${i}`, { skin: allMaxed ? 'slate' : 'gold' });
        });
        ui.markDirty();
    }

    /** 무작위 장비 슬롯 1개의 레벨을 +1 (최대 레벨 제외) — 모두 최대면 false */
    _gachaPullEquip() {
        const candidates = this._meta.equipment.filter(eq => (this._save.equipLevels[eq.id] ?? 0) < eq.maxLevel);
        if (!candidates.length) return false;
        const eq = candidates[Math.floor(Math.random() * candidates.length)];
        this._save.equipLevels[eq.id] = (this._save.equipLevels[eq.id] ?? 0) + 1;
        return true;
    }

    _buyShopBox(i) {
        const box = this._meta.shopBoxes[i];
        if (!box || this._save.gold < box.cost) return;
        this._save.gold -= box.cost;
        for (let p = 0; p < box.pulls; p++) this._gachaPullEquip();
        SaveSystem.save(this._save);
        this._refresh();
        this._refreshShop();
        if (this._tab === 'equip') this._refreshEquip();
    }

    _buyEquipment(i) {
        const eq = this._meta.equipment[i];
        if (!eq) return;
        const lv = this._save.equipLevels[eq.id] ?? 0;
        if (lv >= eq.maxLevel) return;
        const cost = Math.round(eq.baseCost * Math.pow(eq.costScale ?? 1.5, lv));
        if (this._save.gold < cost) return;
        this._save.gold -= cost;
        this._save.equipLevels[eq.id] = lv + 1;
        SaveSystem.save(this._save);
        this._refresh();
        this._refreshShop();
        if (this._tab === 'equip') this._refreshEquip();
    }

    // ── 장비 ───────────────────────────────────────────────────────
    // 8슬롯 장비는 모두 상시 장착 — 강화 레벨/등급만 표시 (탭하여 강화)
    _refreshEquip() {
        const ui = this.engine.ui;
        this._meta.equipment.slice(0, 3).forEach((eq, i) => {
            const lv = this._save.equipLevels[eq.id] ?? 0;
            ui.set(`equip_name${i}`, { text: `${eq.icon} ${eq.name}` });
            ui.set(`equip_desc${i}`, { text: `${eq.grade} · Lv.${lv}/${eq.maxLevel}` });
            ui.set(`equip_state${i}`, {
                text: lv >= eq.maxLevel ? '최대 강화 완료' : '탭하여 강화',
            });
            this._setProp(`equip_btn${i}`, { skin: lv > 0 ? 'green' : 'slate' });
        });
        ui.markDirty();
    }

    _toggleEquip(i) {
        this._buyEquipment(i);
        this._refreshEquip();
    }

    // ── 도전(미션) ─────────────────────────────────────────────────
    _refreshChallenge() {
        const ui = this.engine.ui;
        this._meta.missions.forEach((m, i) => {
            const cleared = this._save.missionCleared[m.id];
            const claimed = this._save.missionClaimed[m.id];
            const locked  = m.prereq && !this._save.missionCleared[m.prereq];
            ui.set(`mis_name${i}`, { text: m.desc });
            ui.set(`mis_gauge${i}`, { ratio: cleared ? 1 : 0 });
            let text;
            if (locked)        text = '🔒 이전 도전 클리어 필요';
            else if (claimed)  text = '수령 완료';
            else if (cleared)  text = `보스 처치 완료 · 보상 ${m.reward}G (탭하여 수령)`;
            else               text = `보스를 처치하면 클리어 · 보상 ${m.reward}G`;
            ui.set(`mis_state${i}`, { text });
            this._setProp(`mis_btn${i}`, { skin: (cleared && !claimed) ? 'green' : 'slate' });
        });
        ui.markDirty();
    }

    _claimMission(i) {
        const m = this._meta.missions[i];
        if (!m) return;
        if (!this._save.missionCleared[m.id] || this._save.missionClaimed[m.id]) return;
        this._save.gold += m.reward;
        this._save.missionClaimed[m.id] = true;
        SaveSystem.save(this._save);
        this._refresh();
        this._refreshChallenge();
    }

    // ── 진화(evolution_config) ──────────────────────────────────────
    // 노드는 1회 획득형. 분기(branch)별로 prereq가 충족된 가장 낮은 order 노드를 "프론티어"로 노출.
    _evoFrontier() {
        const branches = [...new Set(this._evo.nodes.map(n => n.branch))];
        const frontier = [];
        for (const b of branches) {
            const candidates = this._evo.nodes
                .filter(n => n.branch === b && !this._save.evoNodes[n.id])
                .filter(n => !n.prereq || this._save.evoNodes[n.prereq])
                .sort((a, b2) => a.order - b2.order);
            if (candidates.length) frontier.push(candidates[0]);
        }
        return frontier.sort((a, b) => a.order - b.order);
    }

    _evoCost(node) {
        return this._evo.baseCost + node.order * this._evo.costPerOrder;
    }

    _refreshEvolution() {
        const ui = this.engine.ui;
        const frontier = this._evoFrontier();
        for (let i = 0; i < 3; i++) {
            const node = frontier[i];
            if (!node) {
                ui.set(`evo_name${i}`, { text: '-' });
                ui.set(`evo_desc${i}`, { text: '획득 가능한 노드 없음' });
                ui.set(`evo_gauge${i}`, { ratio: 1 });
                ui.set(`evo_state${i}`, { text: '완료' });
                this._setProp(`evo_btn${i}`, { skin: 'slate' });
                continue;
            }
            const cost = this._evoCost(node);
            const afford = this._save.gold >= cost;
            ui.set(`evo_name${i}`, { text: `${node.icon} ${node.name}` });
            ui.set(`evo_desc${i}`, { text: node.desc });
            ui.set(`evo_gauge${i}`, { ratio: 0 });
            ui.set(`evo_state${i}`, { text: `${node.title} +${node.effectValue} · ${cost}G` });
            this._setProp(`evo_btn${i}`, { skin: afford ? 'green' : 'slate' });
        }
        ui.markDirty();
    }

    _acquireEvoNode(i) {
        const node = this._evoFrontier()[i];
        if (!node) return;
        const cost = this._evoCost(node);
        if (this._save.gold < cost) return;
        this._save.gold -= cost;
        this._save.evoNodes[node.id] = true;
        SaveSystem.save(this._save);
        this._refresh();
        this._refreshEvolution();
    }

    // ── 상단/스테이지/배수 표시 갱신 ──────────────────────────────
    _refresh() {
        const ui   = this.engine.ui;
        const mult = MULTS[this._multIdx];
        const cost = BASE_COST * mult;
        const stage = this._meta.stages[this._stageIdx];
        const unlocked = this._save.stageUnlocked.includes(stage.id);

        ui.set('lbl_mult',       { text: `x${mult}` });
        ui.set('lbl_mult_cost',  { text: `번개 ${cost} 소모` });
        ui.set('lbl_start_cost', { text: unlocked ? `번개 ${cost} 소모` : `해금 필요 (${stage.unlockCost}G)` });
        ui.set('lbl_stage',      { text: stage.name });

        // 상단바 — 재화/레벨/경험치
        ui.set('lbl_lv',     { text: `LV.${this._save.playerLevel}` });
        ui.set('lbl_gold',   { text: this._formatNum(this._save.gold) });
        ui.set('lbl_gem',    { text: this._formatNum(this._save.gem) });
        ui.set('lbl_energy', { text: this._formatNum(this._save.energy) });
        const need = this._save.playerLevel * 100;
        ui.set('g_player_exp', { ratio: Math.min(1, this._save.playerXp / need) });
    }

    _formatNum(n) {
        return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
    }
}
