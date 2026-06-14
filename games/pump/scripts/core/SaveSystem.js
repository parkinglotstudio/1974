const KEY = 'pump_save_v1';

const DEFAULT = {
    gold: 300,
    gem: 50,
    energy: 50,
    playerLevel: 1,
    playerXp: 0,
    equipLevels: {},       // { slotId: level } — 8슬롯 장비, 모두 항상 장착 상태
    evoNodes: {},          // { evoNodeId: true } — evolution_config.csv 노드, 1회 획득형
    missionProgress: {},   // { missionId: 진행도 }
    missionClaimed: {},    // { missionId: true }
    missionCleared: {},    // { missionId: true } — 도전(BOSS_CLEAR) 달성 여부
    stageUnlocked: ['s1'],
};

/** localStorage 기반 메타 진행도 저장소 */
export default class SaveSystem {
    static load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
            return {
                ...DEFAULT,
                ...raw,
                equipLevels: raw.equipLevels ?? { ...DEFAULT.equipLevels },
                evoNodes: raw.evoNodes ?? { ...DEFAULT.evoNodes },
                missionProgress: raw.missionProgress ?? {},
                missionClaimed: raw.missionClaimed ?? {},
                missionCleared: raw.missionCleared ?? {},
                stageUnlocked: raw.stageUnlocked ?? [...DEFAULT.stageUnlocked],
            };
        } catch {
            return JSON.parse(JSON.stringify(DEFAULT));
        }
    }

    static save(data) {
        localStorage.setItem(KEY, JSON.stringify(data));
    }

    /** 장비(8슬롯) + 진화 노드(evolution_config)로부터 합산 보너스 계산 */
    static computeBonuses(save, meta, evo) {
        let dmgMult = 1, speedMult = 1, hpAdd = 0;
        let dmgReduce = 0, cooldownMult = 1, magnetMult = 1, lifesteal = 0;
        for (const eq of meta.equipment) {
            const lv = save.equipLevels[eq.id] ?? 0;
            if (lv <= 0) continue;
            const val = (eq.effectPerLevel ?? 0) * lv;
            if (eq.statType === 'power') dmgMult   += val;
            if (eq.statType === 'speed') speedMult += val;
            if (eq.statType === 'hp')    hpAdd      += val;
        }
        for (const node of evo?.nodes ?? []) {
            if (!save.evoNodes[node.id]) continue;
            const v = node.effectValue ?? 0;
            switch (node.abilityType) {
                case 'power':    dmgMult      += v; break;
                case 'hp':       hpAdd         += v; break;
                case 'speed':    speedMult    += v; break;
                case 'armor':    dmgReduce     += v; break;
                case 'cooldown': cooldownMult -= v; break;
                case 'magnet':   magnetMult    += v; break;
                case 'predator': lifesteal     += v; break;
            }
        }
        return { dmgMult, speedMult, hpAdd, dmgReduce, cooldownMult, magnetMult, lifesteal };
    }

    /** 도전(BOSS_CLEAR) 진행 갱신 — 보스 처치 시 현재 도전만 클리어 처리 */
    static updateMissionProgress(save, meta, results) {
        if (!results.bossKilled || !results.challengeId) return;
        const m = meta.missions.find(x => x.id === results.challengeId);
        if (!m || save.missionCleared[m.id]) return;
        if (m.prereq && !save.missionCleared[m.prereq]) return;
        save.missionCleared[m.id] = true;
    }

    /** 플레이어 레벨업 — 100 * level 의 XP 마다 1레벨 상승 */
    static applyPlayerXp(save, gainedXp) {
        save.playerXp += gainedXp;
        let need = save.playerLevel * 100;
        while (save.playerXp >= need) {
            save.playerXp -= need;
            save.playerLevel += 1;
            need = save.playerLevel * 100;
        }
    }
}
