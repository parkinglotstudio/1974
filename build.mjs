// 골목길의 하루 — 배포 빌드: 엔진+게임 스크립트를 한 파일로 번들/압축(엔진 소스 미배포)
// 출력: dist/  (index.html + app.min.js + game.json + scenes/ + pixels/ + palettes/)
//   제외: engine/ 소스, scripts/ 원본, samples/(변환 전 원본), 소스맵
import { build } from 'esbuild';
import { mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const SRC = 'games/golmok';
const OUT = 'dist';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) 번들 + 압축 (소스맵 OFF → 역추적 불가). 파일명에 빌드 해시 → 캐시 무효화 자동.
const hash = Date.now().toString(36);   // 빌드마다 고유 (Vercel 캐시 bust)
const outJs = `app.${hash}.min.js`;
await build({
  entryPoints: [`${SRC}/main.js`],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: 'es2020',
  legalComments: 'none',
  outfile: `${OUT}/${outJs}`,
});

// 2) index.html → 해시 포함 파일명으로 교체
const html = readFileSync(`${SRC}/index.html`, 'utf-8').replace('./main.js', `./${outJs}`);
writeFileSync(`${OUT}/index.html`, html);

// 3) 런타임 데이터(JSON)만 복사 (로직은 app.min.js 안)
cpSync(`${SRC}/game.json`, `${OUT}/game.json`);
for (const d of ['scenes', 'palettes', 'data', 'animator']) {
  if (existsSync(`${SRC}/${d}`)) cpSync(`${SRC}/${d}`, `${OUT}/${d}`, { recursive: true });
}

// 4) pixels/ — characters는 전부, objects는 maps.csv에서 cycle_order>=0(순환에 쓰는 맵)인
//    asset 접두어에 해당하는 파일만 복사. (Vercel Hobby 업로드 100MB 제한 대응 —
//    cycle_order=-1인 미사용 맵 픽셀들은 dist에서 제외)
for (const d of ['characters', 'backgrounds', 'fog']) {
  const p = `${SRC}/pixels/${d}`;
  if (existsSync(p)) cpSync(p, `${OUT}/pixels/${d}`, { recursive: true });
}

const mapsCsv = readFileSync(`${SRC}/data/maps.csv`, 'utf-8');
const activeAssets = mapsCsv.split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#') && !l.startsWith('id,'))
  .map(l => l.split(','))
  .filter(cols => Number(cols[5]) >= 0)
  .map(cols => cols[1]);

const objSrcDir = `${SRC}/pixels/objects`;
if (existsSync(objSrcDir)) {
  mkdirSync(`${OUT}/pixels/objects`, { recursive: true });
  for (const f of readdirSync(objSrcDir)) {
    if (activeAssets.some(a => f === `${a}.json` || f.startsWith(`${a}_`))) {
      cpSync(`${objSrcDir}/${f}`, `${OUT}/pixels/objects/${f}`);
    }
  }
}

console.log('[build] dist/ 생성 완료 (engine/·scripts/·samples/ 미포함, 소스맵 없음)');
console.log('[build] pixels/objects 포함:', activeAssets.join(', '), '(cycle_order>=0)');
