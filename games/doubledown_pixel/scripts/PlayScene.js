export class PlayScene {
    constructor(game) {
        this.game = game;
    }

    onInit(engine) {
        console.log('[PlayScene] onInit');
    }

    async onEnter() {
        console.log('[PlayScene] onEnter');
        const E = this.game._engine;
        
        // 씬 JSON 로드 & 수동 엔티티 배치
        const sceneJSON = await fetch('./scenes/main.scene.json', { cache: 'no-store' }).then(r => r.json());
        await this.applyCustomScene(E, sceneJSON);
        
        console.log('[PlayScene] After applyCustomScene, entities count:', E.entities.getAll());
        for (const ent of E.entities.getAll()) {
            console.log(`[PlayScene] Entity ID: ${ent.id}, Layer: ${ent.layer}, Visible: ${ent.visible}, Static: ${ent._static}, Pixels length: ${ent.getPixels() ? ent.getPixels().length : 0}`);
        }

        // 보드 초기화
        await this.game._renderer.initStage(1);

        console.log('[PlayScene] After initStage, entities count:', E.entities.getAll());
        for (const ent of E.entities.getAll()) {
            console.log(`[PlayScene] Entity ID: ${ent.id}, Layer: ${ent.layer}, Visible: ${ent.visible}, Pixels length: ${ent.getPixels() ? ent.getPixels().length : 0}`);
        }

        console.log('[PlayScene] Palette Manager original colors:', E.palette_mgr.original);
        console.log('[PlayScene] Palette Manager rgba cache size:', E.palette_mgr.rgbaCache.size);
    }

    _lastLog = 0;
    onUpdate(now, dt, input) {
        // 인풋이나 특수 업데이트가 필요하면 여기서 처리
        if (now - this._lastLog > 1000) {
            this._lastLog = now;
            console.log('[PlayScene] onUpdate tick, FPS approx:', (1000 / dt).toFixed(1));
        }
    }

    onRender(cameraX) {
        const E = this.game._engine;
        const core = this.game._core;
        
        // 매 프레임 텍스트 즉시 그리기 (TextRenderer API 활용!)
        if (core && core.stageConfig) {
            E.text.draw('SCORE', { x: 20, y: 15, palIdx: 7, fontSize: 8 });
            E.text.draw(String(core.score), { x: 20, y: 30, palIdx: 1, fontSize: 12 });
            
            E.text.draw('MOVES', { x: 150, y: 15, palIdx: 7, fontSize: 8 });
            E.text.draw(String(core.moves), { x: 150, y: 30, palIdx: 1, fontSize: 12 });

            const required = Math.max(0, core.stageConfig.targetBlockCount - core.targetCollected);
            E.text.draw(`TARGET: Collect ${core.stageConfig.targetBlockCount} Diamonds`, { x: 20, y: 360, palIdx: 7, fontSize: 8 });
            E.text.draw(`Remaining: ${required}`, { x: 20, y: 380, palIdx: 2, fontSize: 10 });
        }
    }

    onExit() {
        console.log('[PlayScene] onExit');
    }

    onPostRender(canvas) {
        // 포스트 렌더 연출이 필요하면 여기서 처리
    }

    // ── 씬 엔티티들을 직접 해석하여 엔진에 로드하는 커스텀 씬 로더 ──
    async applyCustomScene(engine, sceneJSON) {
        // 1. 레이어 설정
        if (sceneJSON.layers) {
            if (Array.isArray(sceneJSON.layers)) {
                engine.layers.applySceneTree(sceneJSON.layers);
            } else {
                engine.layers.applyConfig(sceneJSON.layers);
            }
        }

        // 2. 씬 경계 설정
        if (sceneJSON.bounds) {
            engine.bounds.fromJSON(sceneJSON.bounds);
        } else {
            engine.bounds.setSceneBounds(engine.gameWidth, engine.gameHeight);
        }

        // 3. 엔티티 배치
        const entities = sceneJSON.entities ?? [];
        for (const def of entities) {
            const cfg = {
                id: def.id,
                x: def.x ?? 0,
                y: def.y ?? 0,
                pw: def.pw ?? 16,
                ph: def.ph ?? 16,
                layer: def.layer ?? 2,
                visible: def.visible !== false,
                type: def.type ?? def.id
            };

            const entity = engine.entities.add(cfg.id, cfg);

            // board_bg 픽셀 데이터 생성 및 주입
            if (def.id === 'board_bg') {
                const bgPixels = [];
                const W = def.pw ?? 252;
                const H = def.ph ?? 252;
                const cellW = W / 9;
                const cellH = H / 9;
                
                // palette_neon.json:
                // 1: #00ffff (Cyan)
                // 9: #8800ff (Purple)
                // 2: #ff00ff (Magenta)
                
                for (let y = 0; y < H; y++) {
                    const cellY = Math.floor(y / cellH);
                    const isGridLineY = (y % cellH === 0);
                    
                    for (let x = 0; x < W; x++) {
                        const cellX = Math.floor(x / cellW);
                        const isGridLineX = (x % cellW === 0);
                        
                        const isBorder = (x === 0 || x === W - 1 || y === 0 || y === H - 1);
                        const isGridLine = isGridLineX || isGridLineY;
                        
                        if (isBorder) {
                            bgPixels.push([x, y, 1]); // 테두리 Cyan
                        } else if (isGridLine) {
                            bgPixels.push([x, y, 9]); // Purple 격자선
                        } else {
                            // 격자 내부 타일: 네온 2색의 레트로 픽셀 체커보드 연출
                            const isEvenCell = (cellX + cellY) % 2 === 0;
                            if (isEvenCell) {
                                // 짝수 칸: 미세한 2x2 보라 점무늬 디더링
                                if ((x + y) % 4 === 0) {
                                    bgPixels.push([x, y, 9]); // 보라
                                }
                            } else {
                                // 홀수 칸: 자홍(Magenta) 촘촘한 도트 디더링
                                if ((x - y) % 4 === 0) {
                                    bgPixels.push([x, y, 2]); // 자홍
                                }
                            }
                        }
                    }
                }
                
                entity._pixels = bgPixels;
            }
        }
    }
}
