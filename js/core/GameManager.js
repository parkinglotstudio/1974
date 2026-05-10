import PopupManager from '../ui/PopupManager.js';
import IntroScene from '../scenes/IntroScene.js';
import ChapterScene from '../scenes/ChapterScene.js';
import PCCommunicationScene from '../scenes/PCCommunicationScene.js';
import PacmanScene from '../scenes/PacmanScene.js';
import PixelToolScene from '../scenes/PixelToolScene.js';


export default class GameManager {
    constructor(db) {
        this.db = db;
        this.popupManager = new PopupManager(db);
        this.scenes = {
            'IntroScene': new IntroScene(this),
            'ChapterScene': new ChapterScene(this),
            'PCCommunicationScene': new PCCommunicationScene(this),
            'PacmanScene': new PacmanScene(this),
            'PixelToolScene': new PixelToolScene(this)
        };

        this.currentScene = null;
        
        // Initial Game State
        this.state = {
            currentChapter: 1,
            score: 0,
            gold: 10000,
            unlockedAvatars: [],
            owned_avatars: {} // e.g., { 201: { level: 1, exp: 0 } }
        };
        this.loadState();
        
        // Ensure default avatars are owned
        this.initDefaultAvatars();
    }

    initDefaultAvatars() {
        if(this.db.avatars) {
            this.db.avatars.forEach(avatar => {
                if(avatar.shop && avatar.shop.is_default && !this.state.owned_avatars[avatar.id]) {
                    this.state.owned_avatars[avatar.id] = { level: 1, exp: 0 };
                }
            });
            this.saveState();
        }
    }

    buyAvatar(avatarId) {
        const avatar = this.db.avatars.find(a => a.id === avatarId);
        if(!avatar) return false;
        
        if(this.state.gold >= avatar.shop.price && !this.state.owned_avatars[avatarId]) {
            this.state.gold -= avatar.shop.price;
            this.state.owned_avatars[avatarId] = { level: 1, exp: 0 };
            this.saveState();
            return true;
        }
        return false;
    }

    start() {
        console.log("Game Manager Started.");
        // If save says chapter > 1, maybe skip intro? For now, always intro to test flow.
        this.changeScene('IntroScene');
    }

    changeScene(sceneName, args = null) {
        if(this.currentScene) {
            // Already handled exit inside the scene, but just in case
        }
        
        const scene = this.scenes[sceneName];
        if(scene) {
            this.currentScene = scene;
            scene.enter(args);
        } else {
            console.error("Scene not found:", sceneName);
        }
    }

    saveState() {
        localStorage.setItem('1974_save_data', JSON.stringify(this.state));
    }

    loadState() {
        const saved = localStorage.getItem('1974_save_data');
        if(saved) {
            this.state = JSON.parse(saved);
            if (!this.state.owned_avatars) this.state.owned_avatars = {};
            if (this.state.gold === undefined) this.state.gold = 10000;
        }
    }

    resetGameData() {
        this.state = {
            currentChapter: 1,
            score: 0,
            gold: 10000,
            unlockedAvatars: [],
            owned_avatars: {}
        };
        this.saveState();
        this.initDefaultAvatars();
        location.reload();
    }
}
