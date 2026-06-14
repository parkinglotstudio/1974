export default class PlayerEntity {
    constructor(cfg, x, y) {
        this.cfg    = cfg;
        this.x      = x;
        this.y      = y;
        this.hp     = cfg.maxHp;
        this.maxHp  = cfg.maxHp;
        this.radius = cfg.radius;
    }

    move(vx, vy, dt, bounds, speedMult = 1) {
        this.x += vx * this.cfg.speed * speedMult * dt;
        this.y += vy * this.cfg.speed * speedMult * dt;
        const r = this.radius;
        this.x = Math.max(r, Math.min(bounds.w - r, this.x));
        this.y = Math.max(r, Math.min(bounds.h - r, this.y));
    }

    takeDamage(dmg) {
        this.hp = Math.max(0, this.hp - dmg);
        return this.hp <= 0;
    }
}
