// The screenshot scenes behind ?shot=title|action|upgrade|gameover. Each one drives the real
// simulation forward from a seeded run — an autopilot flies the ship — and freezes on a frame
// that shows that part of the game at its best. Same seed, same frame, every time.
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, STEP } from './config.js';
import { spawnExplosion } from './entities.js';
import { IDLE_CTRL, chooseUpgrade, startRun, startWave, stepGame } from './game.js';
import { UPGRADES, applyUpgrade } from './upgrades.js';

function giveUpgrade(state, id) {
  const upgrade = UPGRADES.find((entry) => entry.id === id);
  if (upgrade) applyUpgrade(state, upgrade);
}

function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD2 = Infinity;
  for (const enemy of state.enemies) {
    const d2 = (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = enemy; }
  }
  return { enemy: best, dist: Math.sqrt(bestD2) };
}

/** A competent pilot: hold a firing band around the nearest hostile, strafe, dash out of trouble. */
function autopilotCtrl(state) {
  const p = state.player;
  const { enemy, dist } = nearestEnemy(state);
  let moveX = 0;
  let moveY = 0;
  let aimX = p.x + 120;
  let aimY = p.y;
  let firing = false;
  let dash = false;
  if (enemy) {
    const ux = (enemy.x - p.x) / (dist || 1);
    const uy = (enemy.y - p.y) / (dist || 1);
    const radial = dist < 175 ? -1 : dist > 285 ? 1 : 0;
    moveX = ux * radial - uy * 0.85;
    moveY = uy * radial + ux * 0.85;
    const lead = Math.min(0.5, dist / 640) * 0.75;
    aimX = enemy.x + enemy.vx * lead;
    aimY = enemy.y + enemy.vy * lead;
    firing = dist < 760;
    dash = dist < 95;
  }
  // Drift back toward the middle when a wall is close, so the pilot never hugs an edge.
  if (p.x < 150) moveX += 0.7;
  if (p.x > 1130) moveX -= 0.7;
  if (p.y < 140) moveY += 0.7;
  if (p.y > 580) moveY -= 0.7;
  const len = Math.hypot(moveX, moveY);
  if (len > 1) { moveX /= len; moveY /= len; }
  return { moveX, moveY, aimX, aimY, firing, dash };
}

/** A doomed pilot: flies straight at the nearest hostile, guns blazing, and is overwhelmed. */
function doomedCtrl(state) {
  const p = state.player;
  const { enemy } = nearestEnemy(state);
  if (!enemy) return { ...IDLE_CTRL, firing: true };
  const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
  return {
    moveX: Math.cos(angle), moveY: Math.sin(angle),
    aimX: enemy.x, aimY: enemy.y, firing: true, dash: false,
  };
}

function runSteps(state, seconds, ctrlFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepGame(state, ctrlFn(state), STEP);
}

function stageTitle(state) {
  runSteps(state, 6, () => IDLE_CTRL);
  return SCREEN_TITLE;
}

function stageAction(state) {
  startRun(state);
  giveUpgrade(state, 'rapid');
  giveUpgrade(state, 'split');
  startWave(state, 7);
  // Freeze at the first rich moment — a crowd of hostiles with fire in the air — rather than at
  // a fixed time: left longer, the pilot thins the wave out and the frame empties.
  const chunk = Math.round(0.25 / STEP);
  const cap = Math.round(20 / STEP);
  for (let i = 0; i < cap; i += chunk) {
    for (let j = 0; j < chunk; j += 1) {
      stepGame(state, autopilotCtrl(state), STEP);
      if (state.screen === SCREEN_UPGRADE) chooseUpgrade(state, 0);
    }
    if (state.screen === SCREEN_OVER) break;
    if (state.player.hp < 45) state.player.hp = 72;
    const inFlight = state.bullets.length + state.ebullets.length;
    if (state.enemies.length >= 9 && inFlight >= 4) break;
  }
  if (state.score > state.best) state.best = state.score;
  return SCREEN_PLAY;
}

function stageUpgrade(state) {
  startRun(state);
  giveUpgrade(state, 'heavy');
  giveUpgrade(state, 'heavy');
  giveUpgrade(state, 'split');
  startWave(state, 3);
  const cap = Math.round(45 / STEP);
  for (let i = 0; i < cap && state.screen !== SCREEN_UPGRADE; i += 1) {
    stepGame(state, autopilotCtrl(state), STEP);
  }
  if (state.screen !== SCREEN_UPGRADE) {
    // The pilot could not finish the wave in the cap: put every survivor one hit from death
    // with a shot already on top of it, and let the real collision rules finish the wave
    // (splitter minis spawned along the way get the same treatment on the next pass).
    for (let i = 0; i < 360 && state.screen !== SCREEN_UPGRADE && state.screen === SCREEN_PLAY; i += 1) {
      if (i % 45 === 0) {
        for (const enemy of state.enemies) {
          enemy.hp = 1;
          state.bullets.push({
            x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 6,
            damage: 1, pierceLeft: 0, life: 0.1,
          });
        }
      }
      stepGame(state, autopilotCtrl(state), STEP);
    }
  }
  return SCREEN_UPGRADE;
}

function stageGameOver(state) {
  startRun(state);
  giveUpgrade(state, 'rapid');
  startWave(state, 8);
  const cap = Math.round(50 / STEP);
  for (let i = 0; i < cap && state.screen !== SCREEN_OVER; i += 1) {
    stepGame(state, doomedCtrl(state), STEP);
    if (i === Math.round(30 / STEP) && state.screen !== SCREEN_OVER) {
      state.player.hp = Math.min(state.player.hp, 3);
      state.player.shield = 0;
    }
  }
  // Fresh wreck glow behind the panel, then let the embers settle for a few frames.
  spawnExplosion(state, state.player.x, state.player.y, '#37f4ff');
  runSteps(state, 0.12, () => IDLE_CTRL);
  return SCREEN_OVER;
}

/** Set the game to the named scene and return the screen it froze on. */
export function stageShot(name, state) {
  switch (name) {
    case 'action': return stageAction(state);
    case 'upgrade': return stageUpgrade(state);
    case 'gameover': return stageGameOver(state);
    case 'title':
    default: return stageTitle(state);
  }
}
