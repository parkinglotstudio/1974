export default class PopupManager {
    constructor(db) {
        this.db = db;
        this.layer = document.getElementById('popup-layer');
        this.currentCallback = null;
    }

    show(msgIdTitle, msgIdDesc, btnId, callback = null) {
        this.currentCallback = callback;
        const title = this.db.getMsg(msgIdTitle);
        let desc = this.db.getMsg(msgIdDesc);
        const btnText = this.db.getMsg(btnId);

        // Parse any variables in desc (e.g., [score])
        // Wait, for now we can just inject raw. If we need replace, we can do it later.

        this.layer.innerHTML = `
            <div class="popup-box">
                <div class="popup-title blink">> ${title} <</div>
                <div class="popup-desc">${desc.replace(/\\n/g, '<br>')}</div>
                <button class="btn" id="popup-btn">[ ${btnText} ]</button>
            </div>
        `;
        
        this.layer.classList.remove('hidden');

        document.getElementById('popup-btn').addEventListener('click', () => {
            const cb = this.currentCallback;
            this.hide();
            if (cb) {
                cb();
            }
        });
    }

    showCustom(html, callback = null) {
        this.currentCallback = callback;
        this.layer.innerHTML = `
            <div class="popup-box">
                ${html}
            </div>
        `;
        this.layer.classList.remove('hidden');
    }

    hide() {
        this.layer.classList.add('hidden');
        this.layer.innerHTML = '';
        this.currentCallback = null;
    }
}
