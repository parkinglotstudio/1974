const fs = require('fs');

const files = [
    'C:/1974/assets/pixelart/1974.json',
    'C:/1974/assets/pixelart/1974-2.json'
];

files.forEach(inputFile => {
    const outputFile = inputFile.replace('.json', '_optimized.json');
    console.log(`Processing ${inputFile}...`);

    try {
        const rawData = fs.readFileSync(inputFile, 'utf8').replace(/^\uFEFF/, '');
        const data = JSON.parse(rawData);

        const width = data.width || 512;
        const height = data.height || 512;
        const paletteMap = new Map();
        const palette = ['transparent']; // CRITICAL: index 0 is transparent

        const getIdx = (col) => {
            if (!paletteMap.has(col)) {
                paletteMap.set(col, palette.length);
                palette.push(col);
            }
            return paletteMap.get(col);
        };

        const optimizeFrame = (frame) => {
            let pixels = [];
            const paletteInFile = data.palette || [];

            if (frame.pixel_map) {
                for (let y = 0; y < frame.pixel_map.length; y++) {
                    for (let x = 0; x < frame.pixel_map[y].length; x++) {
                        const val = frame.pixel_map[y][x];
                        if (val === 0 || val === null) continue;
                        const col = (typeof val === 'number') ? paletteInFile[val] : val;
                        pixels.push([x, y, col]);
                    }
                }
            } else {
                pixels = (frame.pixels || []).map(p => {
                    const col = (typeof p[2] === 'number') ? paletteInFile[p[2]] : p[2];
                    return [p[0], p[1], col];
                });
            }

            // Filter white (#ffffff) as background
            const filtered = pixels.filter(p => p[2].toLowerCase() !== '#ffffff' && p[2].toLowerCase() !== '#fff');
            
            const density = filtered.length / (width * height);
            console.log(`  Frame density: ${(density * 100).toFixed(2)}% (${filtered.length} pixels)`);

            if (density > 0.4) {
                const map = Array(height).fill(0).map(() => Array(width).fill(0));
                for (const [px, py, col] of filtered) {
                    map[py][px] = getIdx(col);
                }
                return { pixel_map: map };
            } else {
                return { pixels: filtered.map(p => [p[0], p[1], getIdx(p[2])]) };
            }
        };

        const optimizedFrames = (data.frames || []).map(optimizeFrame);
        const outputData = { width, height, fps: data.fps || 4, palette, frames: optimizedFrames };

        fs.writeFileSync(outputFile, JSON.stringify(outputData));
        const originalSize = fs.statSync(inputFile).size;
        const optimizedSize = fs.statSync(outputFile).size;
        console.log(`  Reduction: ${((1 - optimizedSize / originalSize) * 100).toFixed(2)}% (${(optimizedSize / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
        console.error(`  Error processing ${inputFile}:`, e.message);
    }
});
