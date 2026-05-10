export default class Database {
    constructor() {
        this.chapters = [];
        this.avatars = [];
        this.uiMessages = {};
        this.minigameLevels = [];
    }

    async loadAll() {
        this.chapters = await this.parseCSV('data/chapters_config.csv');
        
        try {
            const res = await fetch('data/avatars.json');
            const rawAvatars = await res.json();
            
            // 외부 픽셀 JSON 로드 처리
            for (const av of rawAvatars) {
                if (av.visual && av.visual.pixel_json) {
                    try {
                        const pRes = await fetch(`assets/pixelart/${av.visual.pixel_json}`);
                        av.visual.pixel_data = await pRes.json();
                    } catch (pe) {
                        console.warn(`Failed to load pixel art: ${av.visual.pixel_json}`, pe);
                    }
                }
            }
            this.avatars = rawAvatars;
            console.log("Avatars loaded:", this.avatars.length);
        } catch(e) {
            console.error("Failed to load avatars.json", e);
        }

        this.minigameLevels = await this.parseCSV('data/minigame_levels.csv');
        
        const messages = await this.parseCSV('data/ui_messages.csv');
        messages.forEach(m => {
            this.uiMessages[m.msg_id] = m;
        });
    }

    parseCSV(path) {
        return new Promise((resolve, reject) => {
            Papa.parse(path, {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    console.error("Error loading CSV:", path, error);
                    reject(error);
                }
            });
        });
    }

    getMsg(id) {
        return this.uiMessages[id] ? this.uiMessages[id].content : id;
    }
}
