// Everything drawn over the arena: the HUD (hull, shield, score, combo, wave, boss bar), the
// wave banner, and the four menu screens — title, upgrade draft, pause and game over. The
// button and card rectangles are exported so the boot module can hit-test clicks against
// exactly what is drawn here.
import {
  COLORS, COMBO, KIND_BOSS, WORLD_HEIGHT, WORLD_WIDTH,
} from './config.js';
import { comboMult } from './game.js';

const CENTER_X = WORLD_WIDTH / 2;

export function startButtonRect() {
  return { x: CENTER_X - 130, y: 408, w: 260, h: 62 };
}

export function restartButtonRect() {
  return { x: CENTER_X - 120, y: 470, w: 240, h: 58 };
}

export function upgradeCardRect(index) {
  return { x: 150 + index * 340, y: 246, w: 300, h: 300 };
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function neonText(ctx, text, x, y, size, color, align = 'center') {
  ctx.save();
  ctx.font = `bold ${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function plainText(ctx, text, x, y, size, color, align = 'center', weight = 'normal') {
  ctx.save();
  ctx.font = `${weight} ${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color, backColor) {
  ctx.save();
  ctx.fillStyle = backColor;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
  ctx.restore();
}

function dimScreen(ctx, alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(3, 5, 16, ${alpha})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.restore();
}

function drawButton(ctx, rect, label, accent) {
  ctx.save();
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  neonText(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 24, accent);
}

/** The in-play HUD: hull and shield top-left, score top-right, wave and boss top-centre. */
export function drawHud(ctx, state) {
  const p = state.player;
  plainText(ctx, 'HULL', 52, 40, 13, COLORS.dimText, 'left', 'bold');
  const hullFrac = Math.max(0, p.hp / p.maxHp);
  const hullColor = hullFrac < 0.3 && Math.sin(state.time * 10) > -0.2 ? COLORS.danger : '#52ff8a';
  bar(ctx, 52, 52, 250, 15, hullFrac, hullColor, 'rgba(120, 30, 40, 0.55)');
  plainText(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, 312, 60, 14, COLORS.text, 'left', 'bold');
  if (p.shieldMax > 0) {
    plainText(ctx, 'AEGIS', 52, 84, 13, COLORS.dimText, 'left', 'bold');
    bar(ctx, 52, 94, 250, 10, Math.max(0, p.shield / p.shieldMax), COLORS.shield, 'rgba(40, 70, 140, 0.5)');
  }

  plainText(ctx, 'SCORE', WORLD_WIDTH - 52, 40, 13, COLORS.dimText, 'right', 'bold');
  neonText(ctx, String(state.score), WORLD_WIDTH - 52, 66, 30, COLORS.text, 'right');
  plainText(ctx, `BEST ${Math.max(state.best, state.score)}`, WORLD_WIDTH - 52, 94, 14, COLORS.dimText, 'right');
  const mult = comboMult(state);
  if (mult > 1) {
    const comboFrac = Math.max(0, state.comboTimer / COMBO.window);
    neonText(ctx, `COMBO ×${mult}`, WORLD_WIDTH - 52, 126, 20, '#ffe95e', 'right');
    bar(ctx, WORLD_WIDTH - 202, 142, 150, 6, comboFrac, '#ffe95e', 'rgba(120, 100, 20, 0.4)');
  }

  neonText(ctx, `WAVE ${state.wave}`, CENTER_X, 52, 24, COLORS.text);
  const boss = state.enemies.find((enemy) => enemy.kind === KIND_BOSS);
  if (boss) {
    plainText(ctx, 'V O I D H E R A L D', CENTER_X, 84, 13, '#ff8fb3', 'center', 'bold');
    bar(ctx, CENTER_X - 210, 96, 420, 12, Math.max(0, boss.hp / boss.maxHp), '#c44dff', 'rgba(90, 30, 120, 0.5)');
  } else if (state.screen === 'play') {
    const left = state.enemies.length + state.spawnQueue.length;
    plainText(ctx, `${left} HOSTILES LEFT`, CENTER_X, 84, 14, COLORS.dimText);
  }

  const dashReady = p.dashCooldownTimer <= 0;
  plainText(ctx, dashReady ? 'DASH READY — SPACE' : 'DASH CHARGING…', 52, WORLD_HEIGHT - 36, 14, dashReady ? '#37f4ff' : COLORS.dimText, 'left', 'bold');
  plainText(ctx, 'WASD MOVE · MOUSE AIM · CLICK FIRE · P PAUSE · M MUTE', WORLD_WIDTH - 52, WORLD_HEIGHT - 36, 13, COLORS.dimText, 'right');
}

/** The big centre announcement as a wave begins (or a boss falls). */
export function drawBanner(ctx, state) {
  if (!state.banner) return;
  const t = state.banner.t;
  const alpha = Math.min(1, t / 0.5, (2.4 - t) / 0.4 + 0.6);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  neonText(ctx, state.banner.text, CENTER_X, 208, 52, '#ffffff');
  plainText(ctx, state.banner.sub, CENTER_X, 252, 20, '#aefcff', 'center', 'bold');
  ctx.restore();
}

export function drawTitleScreen(ctx, state) {
  dimScreen(ctx, 0.42);
  neonText(ctx, 'STARFALL', CENTER_X, 218, 92, '#37f4ff');
  neonText(ctx, 'ARENA', CENTER_X, 302, 92, '#ff3df0');
  plainText(ctx, 'The void is coming in waves. Hold the arena.', CENTER_X, 366, 21, COLORS.text, 'center');
  drawButton(ctx, startButtonRect(), '▶  START', '#52ff8a');
  plainText(ctx, 'WASD / ARROWS — MOVE        MOUSE — AIM        CLICK / HOLD — FIRE        SPACE — DASH', CENTER_X, 528, 17, COLORS.text, 'center', 'bold');
  plainText(ctx, 'Survive the wave, draft an upgrade, bring down the Voidherald every fifth wave.', CENTER_X, 562, 16, COLORS.dimText);
  plainText(ctx, 'ENTER also starts · M mutes', CENTER_X, 592, 14, COLORS.dimText);
  if (state.best > 0) neonText(ctx, `BEST SCORE  ${state.best}`, CENTER_X, 648, 20, '#ffe95e');
}

/** One upgrade card: coloured sigil, name, what it does, stacks held, and its key hint. */
function drawUpgradeCard(ctx, state, upgrade, index) {
  const rect = upgradeCardRect(index);
  ctx.save();
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = upgrade.color;
  ctx.lineWidth = 2;
  ctx.shadowColor = upgrade.color;
  ctx.shadowBlur = 12;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const cx = rect.x + rect.w / 2;
  ctx.save();
  ctx.translate(cx, rect.y + 74);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = upgrade.color;
  ctx.shadowColor = upgrade.color;
  ctx.shadowBlur = 16;
  ctx.fillRect(-21, -21, 42, 42);
  ctx.restore();
  neonText(ctx, upgrade.name, cx, rect.y + 148, 25, upgrade.color);
  wrapText(ctx, upgrade.blurb, cx, rect.y + 190, 240, 20, COLORS.text);
  const held = state.taken[upgrade.id] ?? 0;
  for (let i = 0; i < upgrade.max; i += 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(rect.x + 34 + i * 22, rect.y + rect.h - 34, 6, 0, Math.PI * 2);
    ctx.fillStyle = i < held ? upgrade.color : 'rgba(160, 190, 255, 0.25)';
    ctx.fill();
    ctx.restore();
  }
  plainText(ctx, `PRESS ${index + 1} OR CLICK`, cx, rect.y + rect.h - 34, 14, COLORS.dimText, 'center', 'bold');
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, color) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  ctx.save();
  ctx.font = `16px system-ui, 'Segoe UI', sans-serif`;
  for (const word of words) {
    const trial = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line !== '') lines.push(line);
  ctx.restore();
  lines.forEach((entry, i) => plainText(ctx, entry, x, y + i * lineHeight, 16, color));
}

export function drawUpgradeScreen(ctx, state) {
  dimScreen(ctx, 0.62);
  neonText(ctx, `WAVE ${state.wave} CLEARED`, CENTER_X, 128, 44, '#52ff8a');
  plainText(ctx, `Score ${state.score} — choose one upgrade to fly on`, CENTER_X, 176, 20, COLORS.text, 'center');
  state.choices.forEach((upgrade, index) => drawUpgradeCard(ctx, state, upgrade, index));
}

export function drawPauseScreen(ctx, state) {
  dimScreen(ctx, 0.6);
  neonText(ctx, 'PAUSED', CENTER_X, 300, 58, COLORS.text);
  plainText(ctx, `Wave ${state.wave} · Score ${state.score}`, CENTER_X, 356, 20, COLORS.dimText);
  plainText(ctx, 'Press P or ESC to fly on', CENTER_X, 404, 18, COLORS.text, 'center', 'bold');
}

export function drawGameOverScreen(ctx, state) {
  dimScreen(ctx, 0.66);
  neonText(ctx, 'SHIP DOWN', CENTER_X, 196, 64, COLORS.danger);
  plainText(ctx, `You held the arena for ${state.wave} wave${state.wave === 1 ? '' : 's'}`, CENTER_X, 258, 20, COLORS.text);
  neonText(ctx, `SCORE  ${state.score}`, CENTER_X, 316, 40, '#ffffff');
  const isBest = state.score >= state.best && state.score > 0;
  neonText(ctx, isBest ? '★ NEW BEST ★' : `BEST  ${state.best}`, CENTER_X, 362, 22, '#ffe95e');
  plainText(ctx, `${state.kills} kills · ${state.stats.shots} shots fired`, CENTER_X, 404, 17, COLORS.dimText);
  drawButton(ctx, restartButtonRect(), '↻  RESTART', '#52ff8a');
  plainText(ctx, 'or press ENTER', CENTER_X, 556, 15, COLORS.dimText);
}
