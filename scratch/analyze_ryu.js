const fs = require('fs');
let content = fs.readFileSync('assets/pixelart/ryu.json', 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const data = JSON.parse(content);
console.log('Frame Count:', data.frames.length);
console.log('Width:', data.width, 'Height:', data.height);

// Compare frame 0 and 1
const f0 = data.frames[0];
const f1 = data.frames[1];

function getPixels(frame, w, h) {
    if (frame.pixels) return frame.pixels;
    const pixels = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const val = frame.pixel_map[y][x];
            if (val !== 0) pixels.push([x, y, val]);
        }
    }
    return pixels;
}

const p0 = getPixels(f0, data.width, data.height);
const p1 = getPixels(f1, data.width, data.height);

console.log('Frame 0 Pixel Count:', p0.length);
console.log('Frame 1 Pixel Count:', p1.length);

// Calculate average movement of pixels
let totalDist = 0;
let matches = 0;
for (let i = 0; i < Math.min(p0.length, 100); i++) {
    const pix0 = p0[i];
    let minDist = Infinity;
    for (let j = 0; j < Math.min(p1.length, 500); j++) {
        const pix1 = p1[j];
        if (pix0[2] === pix1[2]) {
            const d = Math.sqrt(Math.pow(pix0[0]-pix1[0], 2) + Math.pow(pix0[1]-pix1[1], 2));
            if (d < minDist) minDist = d;
        }
    }
    if (minDist < 50) {
        totalDist += minDist;
        matches++;
    }
}
console.log('Average Pixel Shift:', matches > 0 ? (totalDist / matches).toFixed(2) : 'N/A');
