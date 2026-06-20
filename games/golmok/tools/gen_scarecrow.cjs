// 허수아비(피격 타겟) 픽셀아트 생성 — pixels/objects/scarecrow.json
// 팔레트 인덱스 0 = transparent. 출력 포맷은 ch01_gun.json과 동일(frames[].pixels=[x,y,palIdx], stateDef).
const fs = require('fs');
const path = require('path');

const W = 84, H = 164;
const PALETTE = [
    'transparent',   // 0
    '#4a3322',        // 1 pole dark
    '#6b4a2e',        // 2 pole light
    '#c9a876',        // 3 burlap
    '#a8855a',        // 4 burlap shade
    '#3a2817',        // 5 stitch
    '#e0c84a',        // 6 straw
    '#b89c2e',        // 7 straw dark
    '#a8453a',        // 8 patch red
    '#4a6a8a',        // 9 patch blue
    '#5a7a4a',        // 10 patch green
    '#8a7050',        // 11 rope
    '#f0e0b8',        // 12 highlight
];

const grid = Array.from({ length: H }, () => new Array(W).fill(0));
const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = c; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, c);
    }
};

// 십자 나무 기둥 — 머리 위로 살짝 + 가로대(팔)
rect(40, 8, 43, 38, 2);          // 세로 기둥(머리 위로 노출)
rect(8, 58, 75, 64, 1);          // 가로대(팔)

// 소매 끝 짚단
for (const sx of [4, 6, 8, 10, 76, 78, 80]) {
    for (let i = 0; i < 6; i++) set(sx, 56 + i, i % 2 === 0 ? 6 : 7);
}

// 머리 (자루)
ellipse(42, 60, 16, 21, 3);
ellipse(48, 68, 14, 16, 4);       // 음영(우하)
ellipse(42, 60, 16, 21, 3);       // 베이스 위에 음영 일부 덮어 다시 그림은 생략(자연스러운 경계 위해 음영 먼저)

// 얼굴: X자 눈 두 개 + 스티치 입
const drawX = (cx, cy) => {
    for (let i = -3; i <= 3; i++) { set(cx + i, cy + i, 5); set(cx + i, cy - i, 5); }
};
drawX(34, 56);
drawX(50, 56);
for (let i = -6; i <= 6; i++) set(42 + i, 70 + Math.round(Math.abs(i) * 0.3), 5);

// 몸통 (옷 — 자루+패치)
rect(22, 78, 62, 150, 3);
rect(22, 110, 62, 150, 4);        // 아래쪽 음영
// 패치들
rect(26, 86, 36, 96, 8);          // 빨강 패치
rect(46, 100, 58, 112, 9);        // 파랑 패치
rect(28, 122, 40, 134, 10);       // 초록 패치
// 허리 로프
rect(20, 112, 64, 114, 11);

// 바닥 짚단(다리)
for (const lx of [26, 28, 30, 32, 48, 50, 52, 54]) {
    for (let i = 0; i < 13; i++) set(lx, 151 + i, i % 2 === 0 ? 6 : 7);
}

// 하이라이트 (머리 좌상단)
for (let i = 0; i < 6; i++) set(32 + i, 46 + Math.floor(i / 2), 12);

const pixels = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c !== 0) pixels.push([x, y, c]);
}

const out = {
    name: 'scarecrow',
    width: W,
    height: H,
    palette: PALETTE,
    frames: [{ pixels }],
    stateDef: {
        sprite: 'scarecrow',
        states: {
            idle: { frames: [0], loop: true, fps: 1 },
        },
    },
};

const outPath = path.join(__dirname, '..', 'pixels', 'objects', 'scarecrow.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', outPath, 'pixels:', pixels.length);
