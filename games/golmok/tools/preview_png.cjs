// 픽셀 JSON(palette+frames[].pixels) → PNG 미리보기 (filter0 RGBA, zlib)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const file = process.argv[2];
const outPng = process.argv[3] || file.replace(/\.json$/, '.png');
const scale = Number(process.argv[4] || 3);

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const { width: W, height: H, palette, frames } = data;
const frameIdx = 0;
const px = frames[frameIdx].pixels;

const hexToRgba = (hex) => {
    if (!hex || hex === 'transparent') return [0, 0, 0, 0];
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), h.length===8?parseInt(h.slice(6,8),16):255];
};
const pal = palette.map(hexToRgba);

const SW = W * scale, SH = H * scale;
const buf = Buffer.alloc(SW * SH * 4, 0);
for (const [x, y, ci] of px) {
    const [r,g,b,a] = pal[ci] || [255,0,255,255];
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const sx = x*scale+dx, sy = y*scale+dy;
        const o = (sy*SW+sx)*4;
        buf[o]=r; buf[o+1]=g; buf[o+2]=b; buf[o+3]=a;
    }
}

// raw scanlines with filter byte 0
const raw = Buffer.alloc(SH*(SW*4+1));
for (let y=0; y<SH; y++) {
    raw[y*(SW*4+1)] = 0;
    buf.copy(raw, y*(SW*4+1)+1, y*SW*4, (y+1)*SW*4);
}
const idat = zlib.deflateSync(raw);

function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([typeBuf, body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, typeBuf, body, crc]);
}
function crc32(buf) {
    let c, crc = 0xFFFFFFFF;
    for (let i=0;i<buf.length;i++) {
        c = (crc ^ buf[i]) & 0xFF;
        for (let k=0;k<8;k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SW,0); ihdr.writeUInt32BE(SH,4);
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8bit RGBA, no interlace

const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(outPng, png);
console.log('wrote', outPng, SW, 'x', SH);
