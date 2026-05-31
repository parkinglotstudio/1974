// 골목길의 하루 — 배포 빌드: 엔진+게임 스크립트를 한 파일로 번들/압축(엔진 소스 미배포)
// 출력: dist/  (index.html + app.min.js + game.json + scenes/ + pixels/ + palettes/)
//   제외: engine/ 소스, scripts/ 원본, samples/(변환 전 원본), 소스맵
import { build } from 'esbuild';
import { mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = 'games/golmok';
const OUT = 'dist';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) 번들 + 압축 (소스맵 OFF → 역추적 불가)
await build({
  entryPoints: [`${SRC}/main.js`],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: 'es2020',
  legalComments: 'none',
  outfile: `${OUT}/app.min.js`,
});

// 2) index.html → app.min.js 참조로 교체
const html = readFileSync(`${SRC}/index.html`, 'utf-8').replace('./main.js', './app.min.js');
writeFileSync(`${OUT}/index.html`, html);

// 3) 런타임 데이터(JSON)만 복사 (로직은 app.min.js 안)
cpSync(`${SRC}/game.json`, `${OUT}/game.json`);
for (const d of ['scenes', 'pixels', 'palettes']) {
  if (existsSync(`${SRC}/${d}`)) cpSync(`${SRC}/${d}`, `${OUT}/${d}`, { recursive: true });
}

console.log('[build] dist/ 생성 완료 (engine/·scripts/·samples/ 미포함, 소스맵 없음)');
