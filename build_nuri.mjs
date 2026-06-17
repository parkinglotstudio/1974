// 누리(Nuri) 배포 빌드: 엔진+게임 스크립트를 한 파일로 번들/압축(엔진 소스 미배포)
// 출력: dist_nuri/  (index.html + app.min.js + game.json + scenes/ + pixels/ + data/)
//   제외: engine/ 소스, scripts/ 원본, samples/, 소스맵
import { build } from 'esbuild';
import { mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = 'games/nuri';
const OUT = 'dist_nuri';

// .vercel/ 링크 + vercel.json 보존 후 재생성
const VERCEL_JSON    = `${OUT}/.vercel/project.json`;
const VERCEL_CFG     = `${OUT}/vercel.json`;
const vercelLink     = existsSync(VERCEL_JSON) ? readFileSync(VERCEL_JSON, 'utf-8') : null;
const vercelCfg      = existsSync(VERCEL_CFG)  ? readFileSync(VERCEL_CFG,  'utf-8') : null;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// .vercel/project.json + vercel.json 복원
if (vercelLink) {
  mkdirSync(`${OUT}/.vercel`, { recursive: true });
  writeFileSync(VERCEL_JSON, vercelLink);
}
if (vercelCfg) {
  writeFileSync(VERCEL_CFG, vercelCfg);
} else {
  writeFileSync(VERCEL_CFG, JSON.stringify({ buildCommand: null, outputDirectory: '.', installCommand: null, framework: null }, null, 2) + '\n');
}

// 1) 번들 + 압축 (소스맵 OFF)
const hash  = Date.now().toString(36);
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

// 2) index.html → 번들 파일명으로 교체
const html = readFileSync(`${SRC}/index.html`, 'utf-8').replace('./main.js', `./${outJs}`);
writeFileSync(`${OUT}/index.html`, html);

// 3) 런타임 데이터 복사
cpSync(`${SRC}/game.json`, `${OUT}/game.json`);
for (const d of ['scenes', 'data']) {
  if (existsSync(`${SRC}/${d}`)) cpSync(`${SRC}/${d}`, `${OUT}/${d}`, { recursive: true });
}

// 4) pixels/ 전체 복사 (characters만)
for (const d of ['characters']) {
  const p = `${SRC}/pixels/${d}`;
  if (existsSync(p)) cpSync(p, `${OUT}/pixels/${d}`, { recursive: true });
}

console.log(`[build_nuri] ${OUT}/ 생성 완료 (engine/·scripts/ 미포함)`);
