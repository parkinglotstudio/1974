import AvatarRenderer from '../renderers/AvatarRenderer.js';

export default class ChapterScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.db = gameManager.db;
        this.heroAnimTimer = null;
    }

    enter(chapterId) {
        this.chapterId = chapterId;
        const chapterData = this.db.chapters.find(c => c.id == chapterId);
        
        const uiLayer = document.getElementById('ui-layer');
        const container = document.getElementById('game-container');
        container.className = '';
        if (chapterId === 2) container.classList.add('scene-ch2');
        if (chapterId >= 3) container.classList.add('scene-ch3');

        // Choose avatars from new JSON DB
        let chapterAvatars = this.db.avatars.filter(a => a.chapter_id == chapterId);

        // Generate Timeline HTML
        let timelineHtml = `<div class="timeline-container" id="timeline-scroll" style="position: absolute; top: 0; left: 0; right: 0; z-index: 100;">`;
        this.db.chapters.forEach((ch, index) => {
            const startYear = ch.year_range.split('~')[0];
            const isCurrent = ch.id == chapterId;
            const stateClass = isCurrent ? 'active' : 'unlocked';
            
            timelineHtml += `
                <div class="timeline-item ${stateClass}" data-id="${ch.id}">
                    <span class="timeline-year">[${startYear}]</span>
                </div>
            `;
            if (index < this.db.chapters.length - 1) {
                timelineHtml += `<div class="timeline-connector"></div>`;
            }
        });
        timelineHtml += `</div>`;

        if (chapterId === 1) {
            // Chapter 1
            let titleText = this.db.getMsg('CH_INFO').replace('[chapter_name]', chapterData.name);
            uiLayer.innerHTML = `
                ${timelineHtml}
                <div class="hud" style="padding-top: 60px; pointer-events: none;">
                    <div style="pointer-events: none;">${titleText}</div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                        <div style="pointer-events: none;">SCORE: ${this.gm.state.score}</div>
                        <div style="display: flex; gap: 10px; pointer-events: auto;">
                            <div id="pixel-tool-btn" style="background: rgba(0,255,255,0.1); border: 1px solid #0ff; color: #0ff; padding: 5px 15px; cursor: pointer; font-size: 14px; text-shadow: 0 0 5px #0ff;">[ PIXEL TOOL ]</div>
                            <div id="reset-btn">RESET SAVE DATA</div>
                        </div>
                    </div>
                </div>
                <div class="ui-content" style="height: calc(100% - 40px); display: flex; flex-direction: column; justify-content: flex-start; align-items: center; gap: 10px; padding-top: 20px; overflow-y: auto;">
                    <div class="title-text" style="color: ${chapterData.theme_color}; text-shadow: 0 0 10px ${chapterData.theme_color}; font-size: 3rem;">
                        CHAPTER ${chapterId}
                    </div>
                    <div class="sub-text">${chapterData.description}</div>
                    <div class="gallery-grid" id="avatar-gallery" style="margin-top: 20px;"></div>
                </div>
            `;
            
            const gallery = document.getElementById('avatar-gallery');
            chapterAvatars.forEach(avatar => {
                const card = document.createElement('div');
                card.className = 'avatar-card';
                const canvas = AvatarRenderer.renderToCanvas(avatar, false, false, 4);
                card.appendChild(canvas);
                const nameLabel = document.createElement('div');
                nameLabel.className = 'avatar-name';
                nameLabel.innerText = avatar.name;
                card.appendChild(nameLabel);
                gallery.appendChild(card);
            });

            const resetBtn = document.getElementById('reset-btn');
            if(resetBtn) {
                resetBtn.onclick = () => {
                    if(confirm("정말 모든 데이터를 초기화하고 10,000G로 다시 시작할까요?")) {
                        this.gm.resetGameData();
                    }
                };
            }

            const ptBtn = document.getElementById('pixel-tool-btn');
            if(ptBtn) {
                ptBtn.onclick = () => {
                    this.exit();
                    this.gm.changeScene('PixelToolScene');
                };
            }
        } else {
            // Chapter 2 & 3
            let starsHtml = chapterId === 2 ? 
                `<div class="stars" style="background-image:radial-gradient(1px 1px at 8% 12%,#00ff4133 0%,transparent 100%),radial-gradient(1px 1px at 25% 8%,#00ff4122 0%,transparent 100%),radial-gradient(1px 1px at 55% 15%,#00ff4122 0%,transparent 100%);"></div>` 
                : `<div class="stars"></div>`;
            
            const hlClass = chapterId === 2 ? 'hv' : 'hvc';
            const c3_colors = ['#ff0044', '#00ccff', '#ffcc00', '#00ff44', '#cc00ff'];

            let styleCh3 = '';
            if (chapterId === 3) {
                styleCh3 = `
                    <style>
                        .scene-ch3 .hl { color: ${c3_colors[0]}; }
                        .scene-ch3 .hvc { color: ${c3_colors[1]}; text-shadow: 0 0 6px ${c3_colors[1]}88; }
                        .scene-ch3 .char-name { color: ${c3_colors[2]}; text-shadow: 0 0 10px ${c3_colors[2]}66; }
                        .scene-ch3 .char-sub-name { color: ${c3_colors[1]}; }
                        .scene-ch3 .tab-title { color: ${c3_colors[3]}; }
                        .scene-ch3 .tab-count span { color: ${c3_colors[4]}; }
                        .scene-ch3 .select-hint { color: ${c3_colors[4]}; text-shadow: 0 0 8px ${c3_colors[4]}66; }
                        .scene-ch3 .slot-card.active { border-color: ${c3_colors[1]}; background: #00080f; box-shadow: 0 0 10px ${c3_colors[1]}33; }
                        .scene-ch3 .slot-card.active .slot-label { color: ${c3_colors[2]}; }
                    </style>
                `;
            } else if (chapterId === 2) {
                styleCh3 = `
                    <style>
                        .scene-ch2 .hl { color: #00ff41; }
                        .scene-ch2 .hv { color: #00ff41; text-shadow: 0 0 8px #00ff4188; }
                        .scene-ch2 .char-name { color: #00ff41; text-shadow: 0 0 10px #00ff4166; }
                        .scene-ch2 .char-sub-name { color: #008f11; }
                        .scene-ch2 .tab-title { color: #008f11; }
                        .scene-ch2 .tab-count span { color: #00ff41; }
                        .scene-ch2 .select-hint { color: #00ff41; text-shadow: 0 0 8px #00ff4166; }
                    </style>
                `;
            }

            uiLayer.innerHTML = `
                ${styleCh3}
                ${timelineHtml}
                <div class="scene visible" style="top: 40px; display: block;">
                    ${starsHtml}
                    <div class="hero-zone">
                        <div class="hud">
                            <div class="hud-col">
                                <span class="hl">CHAPTER</span>
                                <span class="${hlClass}">0${chapterId}</span>
                            </div>
                            <div class="hud-col center">
                                <span class="hl">${chapterData.name}</span>
                                <span class="${hlClass}" style="font-size:6px;">${chapterData.year_range}</span>
                            </div>
                            <div class="hud-col right">
                                <span class="hl">GOLD</span>
                                <span class="${hlClass}" id="hud-gold">${this.gm.state.gold.toLocaleString()} G</span>
                            </div>
                        </div>
                        <div class="char-name" id="hero-name">???</div>
                        <div class="char-sub-name" id="hero-sub">???</div>
                        <div class="hero-wrap">
                            <div class="pixel-hero" id="hero-canvas-container"></div>
                            <div class="hero-shadow" id="hero-shadow"></div>
                        </div>
                        <div class="hero-stats" id="hero-stats" style="font-size: 14px; color: var(--bright); margin-top: 5px;">
                            LV.1 | EXP 0/100
                        </div>
                        <div id="hero-rarity" class="rarity">★★★☆☆</div>
                        <div class="select-hint" id="hero-action-btn" style="cursor: pointer; display: inline-block; padding: 5px 15px; border-radius: 5px; background: rgba(255,255,255,0.1); border: 1px solid currentColor;">▶ SELECT AVATAR ◀</div>
                    </div>
                    
                    <div class="lower-panel">
                        <div class="panel-tab">
                            <div class="tab-title">MY AVATARS</div>
                            <div class="tab-count"><span>${chapterAvatars.length.toString().padStart(2, '0')}</span> / ${chapterAvatars.length.toString().padStart(2, '0')}</div>
                        </div>
                        <div class="slot-row" id="slots-container" style="display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(3, 1fr); gap: 5px; padding: 10px; overflow-y: auto; height: 100%;"></div>
                        <div class="action-section">
                            <div class="nav-bar">
                                <div class="nav-item"><div class="nav-ico">🗺️</div><div class="nav-lbl">MAP</div></div>
                                <div class="nav-item"><div class="nav-ico on">🕹️</div><div class="nav-lbl on">AVATAR</div></div>
                                <div class="nav-item"><div class="nav-ico">🏪</div><div class="nav-lbl">SHOP</div></div>
                                <div class="nav-item"><div class="nav-ico">⚙️</div><div class="nav-lbl">CONFIG</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const slotsContainer = document.getElementById('slots-container');
            let firstAvatar = null;
            
            chapterAvatars.forEach((avatar, index) => {
                if(!firstAvatar) firstAvatar = avatar;
                
                const card = document.createElement('div');
                card.className = 'slot-card';
                card.style.position = 'relative';
                card.style.height = '70px';
                if(index === 0) card.classList.add('active');
                
                const isOwned = !!this.gm.state.owned_avatars[avatar.id];
                
                // Extract visual properties from the new JSON structure
                const renderData = {
                    ...avatar.visual,
                    glow: avatar.glow
                };
                
                let mapWidth = 16;
                if (renderData.pixel_data) {
                    mapWidth = renderData.pixel_data.width;
                } else if (renderData.pixel_map && renderData.pixel_map[0]) {
                    mapWidth = renderData.pixel_map[0].length;
                }
                
                // For the slot, we want it to fit within ~50px
                const miniScale = Math.max(1, Math.floor(50 / mapWidth));
                
                const miniCanvas = AvatarRenderer.renderToCanvas(renderData, false, false, miniScale);
                miniCanvas.style.width = '40px';
                miniCanvas.style.height = '40px';
                miniCanvas.style.objectFit = 'contain';
                miniCanvas.className = 'mini-art';
                if (avatar.glow) miniCanvas.style.filter = `drop-shadow(0 0 3px ${avatar.glow}66)`;
                if (!isOwned) {
                    miniCanvas.style.filter = 'grayscale(100%) brightness(0.5)';
                    card.style.opacity = '0.5';
                }
                card.appendChild(miniCanvas);
                
                const label = document.createElement('div');
                label.className = 'slot-label';
                label.style.fontSize = '6px';
                label.innerText = avatar.name;
                card.appendChild(label);
                
                const num = document.createElement('div');
                num.className = 'slot-num';
                num.innerText = (index + 1).toString().padStart(2, '0');
                if (!isOwned) {
                    num.innerText = '🔒';
                    num.style.fontSize = '12px';
                    num.style.color = '#ff4444';
                }
                card.appendChild(num);
                
                card.addEventListener('click', () => {
                    document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    this.updateHeroZone(avatar);
                });
                
                slotsContainer.appendChild(card);
            });
            
            if (firstAvatar) {
                this.updateHeroZone(firstAvatar);
            }
        }

        // Timeline click
        document.querySelectorAll('.timeline-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetId = Number(item.getAttribute('data-id'));
                if (targetId !== this.chapterId) {
                    this.exit();
                    if (targetId === 4) {
                        this.gm.changeScene('PCCommunicationScene');
                    } else {
                        this.gm.changeScene('ChapterScene', targetId);
                    }
                }
            });
        });

        setTimeout(() => {
            const tl = document.getElementById('timeline-scroll');
            const activeItem = tl?.querySelector('.timeline-item.active');
            if(tl && activeItem) {
                tl.scrollTo({
                    left: activeItem.offsetLeft - tl.clientWidth / 2 + activeItem.clientWidth / 2,
                    behavior: 'smooth'
                });
            }
        }, 100);
    }

    updateHeroZone(avatar) {
        document.getElementById('hero-name').innerText = avatar.name;
        document.getElementById('hero-sub').innerText = avatar.sub_name;
        document.getElementById('hero-rarity').innerText = '★'.repeat(avatar.rarity) + '☆'.repeat(5 - avatar.rarity);
        
        // Show Level / EXP if owned
        const statsEl = document.getElementById('hero-stats');
        const ownedData = this.gm.state.owned_avatars[avatar.id];
        if (ownedData) {
            statsEl.innerText = `LV.${ownedData.level} | EXP ${ownedData.exp}/${ownedData.level * 100}`;
            statsEl.style.display = 'block';
        } else {
            statsEl.style.display = 'none';
        }
        
        const heroShadow = document.getElementById('hero-shadow');
        if (heroShadow && avatar.glow) {
            heroShadow.style.background = `radial-gradient(ellipse, ${avatar.glow}55 0%, transparent 70%)`;
        }

        const heroContainer = document.getElementById('hero-canvas-container');
        heroContainer.innerHTML = '';
        
        if (this.heroAnimTimer) {
            clearInterval(this.heroAnimTimer);
            this.heroAnimTimer = null;
        }
        
        const renderData = {
            ...avatar.visual,
            glow: avatar.glow
        };

        let mapWidth = 16;
        if (renderData.pixel_data) {
            mapWidth = renderData.pixel_data.width;
        } else if (renderData.pixel_map && renderData.pixel_map[0]) {
            mapWidth = renderData.pixel_map[0].length;
        }

        // Auto calculate scale to fit ~280px (increased from 200)
        // If image is very large (like 136), scale might be 1 or 2.
        const bigScale = Math.max(1, Math.floor(280 / mapWidth));
        
        const bigCanvas = AvatarRenderer.renderToCanvas(renderData, false, false, bigScale);
        bigCanvas.style.width = '260px';
        bigCanvas.style.height = '260px';
        bigCanvas.style.objectFit = 'contain';
        if (avatar.glow) {
            bigCanvas.style.filter = `drop-shadow(0 0 16px ${avatar.glow}99)`;
        }
        
        const isOwned = !!this.gm.state.owned_avatars[avatar.id];
        if (!isOwned) {
            bigCanvas.style.filter = 'grayscale(100%) brightness(0.5)';
        }
        
        heroContainer.appendChild(bigCanvas);

        // Start Animation if multiple frames exist
        const pd = renderData.pixel_data;
        if (pd && pd.frames && pd.frames.length > 1) {
            let currentFrame = 0;
            const fps = pd.fps || 4;
            this.heroAnimTimer = setInterval(() => {
                currentFrame = (currentFrame + 1) % pd.frames.length;
                const frameCanvas = AvatarRenderer.renderToCanvas(renderData, !isOwned, false, bigScale, currentFrame);
                frameCanvas.style.width = '260px';
                frameCanvas.style.height = '260px';
                frameCanvas.style.objectFit = 'contain';
                if (avatar.glow) frameCanvas.style.filter = `drop-shadow(0 0 16px ${avatar.glow}99)`;
                if (!isOwned) frameCanvas.style.filter += ' grayscale(100%) brightness(0.5)';
                
                heroContainer.innerHTML = '';
                heroContainer.appendChild(frameCanvas);
            }, 1000 / fps);
        }

        // Update Action Button
        const actionBtn = document.getElementById('hero-action-btn');
        if (actionBtn) {
            if (isOwned) {
                actionBtn.innerText = '▶ SELECT AVATAR ◀';
                actionBtn.style.color = '';
                actionBtn.onclick = () => {
                    console.log("Avatar Selected:", avatar.id);
                };
            } else {
                actionBtn.innerText = `💰 BUY: ${avatar.shop.price} G`;
                actionBtn.style.color = '#ffff44';
                actionBtn.onclick = () => {
                    if (this.gm.buyAvatar(avatar.id)) {
                        this.updateHeroZone(avatar);
                        document.getElementById('hud-gold').innerText = `${this.gm.state.gold.toLocaleString()} G`;
                        // Trigger full re-render of slots to update locks
                        this.enter(this.chapterId); 
                    } else {
                        // Not enough gold (could show a toast)
                        actionBtn.innerText = `❌ NOT ENOUGH GOLD`;
                        setTimeout(() => this.updateHeroZone(avatar), 1000);
                    }
                };
            }
        }
    }

    exit() {
        if (this.heroAnimTimer) {
            clearInterval(this.heroAnimTimer);
            this.heroAnimTimer = null;
        }
        document.getElementById('ui-layer').innerHTML = '';
        const container = document.getElementById('game-container');
        container.className = '';
    }
}
