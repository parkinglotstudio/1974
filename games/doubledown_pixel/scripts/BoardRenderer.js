import { GRID_ROWS, GRID_COLS } from './BoardCore.js';

export class BoardRenderer {
    constructor(engine, core) {
        this.engine = engine;
        this.core = core;
        this.canvas = engine.canvas;

        this.cellW = 28;
        this.cellH = 28;
        this.offsetX = 9;
        this.offsetY = 84;

        this.blockEntities = new Map(); // blockId -> engine entity
        this.activeAnimations = new Set();

        this.inputRow = -1;
        this.inputCol = -1;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.isDragging = false;

        this._setupInput();
        this._setupEvents();
    }

    async initStage(stageId) {
        // stages.csv 및 blocks.csv 로딩
        const stages = await this._loadCSV('./data/stages.csv');
        const blocks = await this._loadCSV('./data/blocks.csv');

        const stageConf = stages.find(s => parseInt(s.stage_id) === stageId);
        if (!stageConf) {
            console.error(`Stage ${stageId} not found`);
            return;
        }

        // blocker_layout 파싱
        stageConf.blockerLayout = stageConf.blocker_layout ? JSON.parse(stageConf.blocker_layout) : [];
        stageConf.stageId = parseInt(stageConf.stage_id);
        stageConf.movesGiven = parseInt(stageConf.moves_given);
        stageConf.targetBlockCount = parseInt(stageConf.target_block_count) || 0;
        stageConf.targetScore = parseInt(stageConf.target_score) || 0;
        stageConf.targetTileCount = parseInt(stageConf.target_tile_count) || 0;
        stageConf.star1 = parseInt(stageConf.star1) || 3000;
        stageConf.star2 = parseInt(stageConf.star2) || 7000;
        stageConf.star3 = parseInt(stageConf.star3) || 12000;
        stageConf.spawnBiasPct = parseInt(stageConf.spawn_bias_pct) || 0;
        stageConf.hammerCount = parseInt(stageConf.hammer_count) || 0;
        stageConf.shuffleCount = parseInt(stageConf.shuffle_count) || 0;

        const blockConfs = blocks.map(b => ({
            blockType: b.block_type,
            emoji: b.emoji,
            bgColor: parseInt(b.bg_color, 16) || 0xffffff,
            particleA: parseInt(b.particle_a, 16) || 0x00ffff,
            particleB: parseInt(b.particle_b, 16) || 0xff00ff,
            idleType: b.idle_type || 'float',
            sprite_url: b.sprite_url || ''
        }));

        this.core.init(stageConf, blockConfs);
    }

    _setupEvents() {
        this.core.on(e => this._handleBoardEvent(e));
    }

    _handleBoardEvent(e) {
        switch (e.type) {
            case 'BOARD_RESET':
                this._clearAllBlockEntities();
                this._buildBoardEntities();
                break;
            case 'SWAP_START':
                this._animateSwap(e.r1, e.c1, e.r2, e.c2, false);
                break;
            case 'SWAP_BACK':
                this._animateSwap(e.r1, e.c1, e.r2, e.c2, true);
                break;
            case 'EXPLODE':
                this._animateExplode(e.blocks, e.combo);
                break;
            case 'BLOCK_DROP':
                this._animateDrop(e.moves);
                break;
            case 'BLOCK_SPAWN':
                this._animateSpawn(e.blocks);
                break;
            case 'SCORE_UPDATE':
                this._updateUiText('ui_score_val', String(e.score));
                break;
            case 'MOVES_UPDATE':
                this._updateUiText('ui_moves_val', String(e.moves));
                break;
            case 'TARGET_UPDATE':
                this._updateUiText('ui_target_val', `Remaining: ${e.required}`);
                break;
            default:
                break;
        }
    }

    _gridToPixel(row, col) {
        return {
            x: this.offsetX + col * this.cellW,
            y: this.offsetY + row * this.cellH
        };
    }

    _clearAllBlockEntities() {
        for (const [id, ent] of this.blockEntities) {
            this.engine.entities.remove(ent.id);
        }
        this.blockEntities.clear();
    }

    _buildBoardEntities() {
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                const b = this.core.grid[r][c];
                if (b) {
                    this._createBlockEntity(b);
                }
            }
        }
    }

    _createBlockEntity(block) {
        const { x, y } = this._gridToPixel(block.row, block.col);
        const name = block.kind; // BLOCK_01 등
        const pw = this.cellW;
        const ph = this.cellH;

        const pixels = this._generateBlockPixels(block.colorType, pw, ph);

        const cfg = {
            id: `block_${block.id}`,
            x: x,
            y: y,
            pw: pw,
            ph: ph,
            layer: 2,
            visible: true,
            type: name,
            pixels: pixels
        };

        const ent = this.engine.entities.add(cfg.id, cfg);
        ent._blockData = block;

        this.blockEntities.set(block.id, ent);
        return ent;
    }

    _generateBlockPixels(colorType, pw, ph) {
        const pixels = [];
        
        // palette_neon.json 매핑:
        // 1: #00ffff (Cyan)
        // 2: #ff00ff (Magenta)
        // 3: #ffff00 (Yellow)
        // 5: #00ff00 (Green)
        // 8: #ff8800 (Orange)
        // 7: #ffffff (White)
        const colorIndices = {
            BLOCK_01: 2, // Magenta
            BLOCK_02: 1, // Cyan
            BLOCK_03: 3, // Yellow
            BLOCK_04: 5, // Green
            BLOCK_05: 8  // Orange
        };
        
        const fillIdx = colorIndices[colorType] || 7;
        const borderIdx = 7; // 흰색 테두리
        
        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                // 외곽 1px은 간격을 위한 투명(그리지 않음) 처리
                const isMargin = (x === 0 || x === pw - 1 || y === 0 || y === ph - 1);
                if (isMargin) continue;
                
                // 블록 테두리 (가장자리 2번째 픽셀)
                const isBorder = (x === 1 || x === pw - 2 || y === 1 || y === ph - 2);
                // 안쪽 데코레이션 링
                const isInnerDeco = (x === 3 || x === pw - 4 || y === 3 || y === ph - 4);
                
                if (isBorder) {
                    pixels.push([x, y, borderIdx]);
                } else if (isInnerDeco) {
                    pixels.push([x, y, borderIdx]);
                } else {
                    pixels.push([x, y, fillIdx]);
                }
            }
        }
        return pixels;
    }

    _animateSwap(r1, c1, r2, c2, isSwapBack) {
        const b1 = this.core.grid[r1][c1];
        const b2 = this.core.grid[r2][c2];
        if (!b1 || !b2) return;

        const ent1 = this.blockEntities.get(b1.id);
        const ent2 = this.blockEntities.get(b2.id);
        if (!ent1 || !ent2) return;

        const p1 = this._gridToPixel(r1, c1);
        const p2 = this._gridToPixel(r2, c2);

        const duration = 160;
        const start = performance.now();

        const animate = (time) => {
            const elapsed = time - start;
            const t = Math.min(1, elapsed / duration);
            
            ent1.x = p2.x + (p1.x - p2.x) * t;
            ent1.y = p2.y + (p1.y - p2.y) * t;
            ent2.x = p1.x + (p2.x - p1.x) * t;
            ent2.y = p1.y + (p2.y - p1.y) * t;

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                ent1.x = p1.x;
                ent1.y = p1.y;
                ent2.x = p2.x;
                ent2.y = p2.y;
            }
        };
        requestAnimationFrame(animate);
    }

    _animateExplode(blocks, combo) {
        const duration = 200;
        
        for (const b of blocks) {
            const ent = this.blockEntities.get(b.id);
            if (!ent) continue;

            const start = performance.now();
            const startW = ent.pw;
            const startH = ent.ph;
            const startX = ent.x;
            const startY = ent.y;

            // 터질 때 모래 엔진의 파티클 뿌리기
            if (this.engine.particles) {
                const px = startX + startW / 2;
                const py = startY + startH / 2;
                
                // 블록 종류에 따라 다른 팔레트 인덱스 획득 (디폴트 7: 흰색)
                const colorType = ent._blockData?.colorType ?? '';
                const colorIndices = {
                    BLOCK_01: 2, // Magenta
                    BLOCK_02: 1, // Cyan
                    BLOCK_03: 3, // Yellow
                    BLOCK_04: 5, // Green
                    BLOCK_05: 8  // Orange
                };
                const palIdx = colorIndices[colorType] || 7;

                this.engine.particles.emit('burst', {
                    cx: px,
                    cy: py,
                    count: 16,
                    minSpeed: 60,
                    maxSpeed: 150,
                    gravity: 300,
                    minLife: 0.2,
                    maxLife: 0.5,
                    palIdx: palIdx,
                    layer: 2
                });
            }

            const animate = (time) => {
                const elapsed = time - start;
                const t = Math.min(1, elapsed / duration);

                // 축소 & 찌그러뜨리기
                const s = 1 - t;
                ent.pw = startW * s;
                ent.ph = startH * s;
                ent.x = startX + (startW - ent.pw) / 2;
                ent.y = startY + (startH - ent.ph) / 2;

                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.engine.entities.remove(ent.id);
                    this.blockEntities.delete(b.id);
                }
            };
            requestAnimationFrame(animate);
        }
    }

    _animateDrop(moves) {
        const duration = 240;
        const start = performance.now();
        const dropData = [];

        for (const m of moves) {
            const ent = this.blockEntities.get(m.block.id);
            if (!ent) continue;

            const fromY = ent.y;
            const to = this._gridToPixel(m.toRow, m.block.col);
            dropData.push({ ent, fromY, toY: to.y });
        }

        const animate = (time) => {
            const elapsed = time - start;
            const t = Math.min(1, elapsed / duration);
            // 가속 퐁- 이징 (easeInQuad)
            const ease = t * t;

            for (const d of dropData) {
                d.ent.y = d.fromY + (d.toY - d.fromY) * ease;
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                for (const d of dropData) {
                    d.ent.y = d.toY;
                }
            }
        };
        requestAnimationFrame(animate);
    }

    _animateSpawn(blocks) {
        const duration = 240;
        const start = performance.now();
        const spawnData = [];

        for (const b of blocks) {
            const ent = this._createBlockEntity(b);
            const to = this._gridToPixel(b.row, b.col);
            
            // 화면 위쪽에서 시작
            ent.y = this.offsetY - this.cellH;
            const fromY = ent.y;

            spawnData.push({ ent, fromY, toY: to.y });
        }

        const animate = (time) => {
            const elapsed = time - start;
            const t = Math.min(1, elapsed / duration);
            const ease = t * t;

            for (const s of spawnData) {
                s.ent.y = s.fromY + (s.toY - s.fromY) * ease;
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                for (const s of spawnData) {
                    s.ent.y = s.toY;
                }
            }
        };
        requestAnimationFrame(animate);
    }

    _updateUiText(entityId, newText) {
        const ent = this.engine.entities.get(entityId);
        if (ent) {
            ent.text = newText;
        }
    }

    _setupInput() {
        const handlePointerDown = (e) => {
            if (this.core.isLocked) return;

            const rect = this.canvas.getBoundingClientRect();
            const downX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const downY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

            const col = Math.floor((downX - this.offsetX) / this.cellW);
            const row = Math.floor((downY - this.offsetY) / this.cellH);

            if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
                this.inputRow = row;
                this.inputCol = col;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.isDragging = true;
            }
        };

        const handlePointerMove = (e) => {
            if (!this.isDragging || this.core.isLocked) return;

            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            const threshold = 18;

            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                this.isDragging = false;
                let r2 = this.inputRow;
                let c2 = this.inputCol;

                if (Math.abs(dx) > Math.abs(dy)) {
                    c2 += dx > 0 ? 1 : -1;
                } else {
                    r2 += dy > 0 ? 1 : -1;
                }

                if (r2 >= 0 && r2 < GRID_ROWS && c2 >= 0 && c2 < GRID_COLS) {
                    this.core.swap(this.inputRow, this.inputCol, r2, c2);
                }
            }
        };

        const handlePointerUp = () => {
            this.isDragging = false;
        };

        this.canvas.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    }

    async _loadCSV(url) {
        const res = await fetch(url);
        const text = await res.text();
        const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
            return row;
        });
    }
}
