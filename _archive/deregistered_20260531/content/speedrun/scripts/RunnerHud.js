import { CFG } from './runner_config.js';

const W = CFG.GAME_W;
const H = CFG.GAME_H;

function padScore(n) {
  return String(Math.floor(n)).padStart(5, '0');
}

export default class RunnerHud {
  constructor(overlayCanvas) {
    this.ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width  = W;
    overlayCanvas.height = H;
  }

  draw(state) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    if (state.phase === 'idle') {
      this._drawLobby(ctx, state);
    } else if (state.phase === 'playing') {
      this._drawPlaying(ctx, state);
    } else {
      this._drawGameover(ctx, state);
    }
  }

  // ── 로비 ──────────────────────────────────────────────────────────
  _drawLobby(ctx, { bestScore }) {
    ctx.save();

    // 반투명 오버레이
    ctx.fillStyle = 'rgba(250,248,245,0.88)';
    ctx.fillRect(20, 50, W - 40, H - 100);

    // 타이틀
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#1a1a18';
    ctx.textAlign = 'center';
    ctx.fillText('UNSANITY', W / 2, 80);
    ctx.font = 'bold 11px monospace';
    ctx.fillText('RUNNER', W / 2, 96);

    // 설명
    ctx.font = '8px monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('SPACE / TAP — jump (2x)', W / 2, 118);
    ctx.fillText('avoid obstacles · collect coins', W / 2, 130);

    // 난이도
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('DIFFICULTY', W / 2, 148);
    const tiers = [{ label:'EASY', val:'low' }, { label:'MID', val:'mid' }, { label:'HARD', val:'high' }];
    tiers.forEach((t, i) => {
      const bx = Math.round(W / 2 - 99) + i * 66;
      ctx.fillStyle = '#1a1a18';
      ctx.fillRect(bx, 153, 54, 14);
      ctx.fillStyle = '#faf8f5';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(t.label, bx + 27, 163);
    });

    // 최고 점수
    ctx.font = '8px monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText(`HI  ${padScore(bestScore)}`, W / 2, 182);

    // 시작 버튼
    ctx.fillStyle = '#1a1a18';
    ctx.fillRect(W / 2 - 36, 192, 72, 18);
    ctx.fillStyle = '#faf8f5';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('▶  START', W / 2, 204);

    ctx.restore();
  }

  // ── 인게임 HUD ────────────────────────────────────────────────────
  _drawPlaying(ctx, { score, coinCount, bestScore, playElapsed, invincUntil }) {
    const now = performance.now();
    ctx.save();

    // 타이머 바 (상단 중앙)
    const cycle = CFG.TIMER_CYCLE_SEC;
    const ratio = (playElapsed % cycle) / cycle;
    const barW = Math.round((W - 40) * ratio);
    ctx.fillStyle = 'rgba(240,237,232,0.8)';
    ctx.fillRect(20, 4, W - 40, 5);
    ctx.fillStyle = ratio > 0.5 ? '#2a8a40' : ratio > 0.25 ? '#e8a020' : '#e03030';
    ctx.fillRect(20, 4, barW, 5);

    // 점수 (우상단)
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#1a1a18';
    ctx.textAlign = 'right';
    ctx.fillText(`HI ${padScore(bestScore)}`, W - 6, 20);
    ctx.font = 'bold 11px monospace';
    ctx.fillText(padScore(score), W - 6, 32);

    // 코인 (좌상단)
    ctx.textAlign = 'left';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#e8a020';
    ctx.fillText(`x${coinCount}`, 8, 24);

    // 무적 리본
    const isInvinc = now < invincUntil;
    if (isInvinc) {
      const sec = Math.ceil((invincUntil - now) / 1000);
      ctx.fillStyle = 'rgba(255,235,60,0.9)';
      ctx.fillRect(W / 2 - 30, 10, 60, 12);
      ctx.fillStyle = '#1a1a18';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`★ ${sec}s`, W / 2, 19);
    }

    ctx.restore();
  }

  // ── 게임오버 ──────────────────────────────────────────────────────
  _drawGameover(ctx, { score, coinCount, bestScore }) {
    ctx.save();

    ctx.fillStyle = 'rgba(250,248,245,0.92)';
    ctx.fillRect(30, 60, W - 60, H - 120);

    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#e03030';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, 92);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('SCORE', W / 2, 116);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#1a1a18';
    ctx.fillText(padScore(score), W / 2, 134);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(`COINS  ${coinCount}    HI  ${padScore(bestScore)}`, W / 2, 152);

    ctx.fillStyle = '#1a1a18';
    ctx.fillRect(W / 2 - 36, 164, 72, 18);
    ctx.fillStyle = '#faf8f5';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('↩  RETRY', W / 2, 176);

    ctx.restore();
  }
}
