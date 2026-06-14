export default class XpDrops {
    constructor(cfg, levelCfg) {
        this.cfg      = cfg;
        this.levelCfg = levelCfg;
        this.drops    = [];
        this.xp       = 0;
        this.level    = 1;
        this.xpToNext = this._xpForLevel(1);
    }

    _xpForLevel(level) {
        const table = this.levelCfg.xpTable;
        return table[Math.min(level, table.length) - 1];
    }

    spawnFrom(enemy) {
        const value = this.cfg.xpTiers[enemy.expDropType ?? 'small'] ?? this.cfg.xpTiers.small;
        this.drops.push({ x: enemy.x, y: enemy.y, value });
    }

    /** @returns {{leveledUp:boolean, collected:Array<{x:number,y:number}>}} */
    tick(dt, player, expMult = 1, magnetMult = 1) {
        let leveledUp = false;
        for (const d of this.drops) {
            const dist = Math.hypot(player.x - d.x, player.y - d.y);
            if (dist < this.cfg.pickupRadius * magnetMult) {
                const step = this.cfg.moveSpeed * dt;
                if (dist <= step) {
                    d.x = player.x; d.y = player.y; d.collected = true;
                } else {
                    d.x += (player.x - d.x) / dist * step;
                    d.y += (player.y - d.y) / dist * step;
                }
            }
            if (dist < 4) d.collected = true;
        }

        const collected = this.drops.filter(d => d.collected);
        if (collected.length) {
            this.xp += collected.reduce((sum, d) => sum + d.value, 0) * expMult;
            this.drops = this.drops.filter(d => !d.collected);
        }

        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level += 1;
            this.xpToNext = this._xpForLevel(this.level);
            leveledUp = true;
        }
        return { leveledUp, collected: collected.map(d => ({ x: d.x, y: d.y })) };
    }

    get ratio() {
        return this.xpToNext > 0 ? this.xp / this.xpToNext : 0;
    }
}
