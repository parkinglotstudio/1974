import Database from './core/Database.js';
import GameManager from './core/GameManager.js';

window.addEventListener('DOMContentLoaded', async () => {
    console.log("System Initializing...");
    
    // 1. 데이터베이스 로드
    const db = new Database();
    await db.loadAll();
    console.log("Database Loaded:", db);

    // 2. 게임 매니저 초기화 및 시작
    const gameManager = new GameManager(db);
    gameManager.start();
});
