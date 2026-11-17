// The rules of Starfall Arena: the state machine (title, play, upgrade draft, pause, game over),
// spawning, collisions, combo scoring, damage and death. Rendering and sound only read what this
// module leaves in the state; the boot module feeds it control input one fixed step at a time.
import {
  COMBO, KIND_BOSS, KIND_MINI, KIND_SPLITTER, PICKUP, SCREEN_OVER, SCREEN_PAUSED,
  SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, WORLD_HEIGHT, WORLD_WIDTH,
} from './config.js';
import {
  addText, clampToArena, createEnemy, createPlayer, dropPickups, placeAtEdge, separateEnemies,
  spawnExplosion, spawnParticles, updateBullets, updateDrones, updateEnemy, updateParticles,
  updatePickups, updatePlayerShip,
} from './entities.js';
import { applyUpgrade, rollUpgrades } from './upgrades.js';
import { isBossWave, planWave, waveTitle } from './waves.js';

/** A control frame with nothing pressed: the ship drifts, aimed right. */
export const IDLE_CTRL = { moveX: 0, moveY: 0, aimX: WORLD_WIDTH, aimY: WORLD_HEIGHT / 2, firing: false, dash: false };

export function createGame(rng) {
  return {
    rng,
    screen: SCREEN_TITLE,
    time: 0,
    player: createPlayer(),
    enemies: [], bullets: [], ebullets: [], particles: [], texts: [], pickups: [], drones: [],
    pendingSpawns: [], sounds: [],
    score: 0, best: 0, wave: 0, kills: 0,
    comboChain: 0, comboTimer: 0,
    taken: {}, choices: [],
    spawnQueue: [], spawnTimer: 0,
    banner: null, shake: 0, flash: 0,
    dying: false, overTimer: 0, attractTimer: 0,
    stats: { shots: 0, hits: 0, kills: 0 },
  };
}

/** The live combo multiplier: 1 + one tier per COMBO.chainPerTier chain, capped. */
export function comboMult(state) {
  return 1 + Math.min(COMBO.maxTier, Math.floor(state.comboChain / COMBO.chainPerTier));
}

export function startRun(state) {
  state.player = createPlayer();
  state.enemies = [];
  state.bullets = [];
  state.ebullets = [];
  state.particles = [];
  state.texts = [];
  state.pickups = [];
  state.drones = [];
  state.pendingSpawns = [];
  state.score = 0;
  state.kills = 0;
  state.comboChain = 0;
  state.comboTimer = 0;
  state.taken = {};
  state.choices = [];
  state.wave = 0;
  state.dying = false;
  state.overTimer = 0;
  state.shake = 0;
  state.flash = 0;
  state.stats = { shots: 0, hits: 0, kills: 0 };
  nextWave(state);
  state.screen = SCREEN_PLAY;
}

function nextWave(state) {
  state.wave += 1;
  state.spawnQueue = planWave(state.rng, state.wave);
  state.spawnTimer = 0;
  const count = state.spawnQueue.length;
  state.banner = {
    text: waveTitle(state.wave),
    sub: isBossWave(state.wave) ? 'Bring it down' : `${count} hostiles inbound`,
    t: 2.4,
  };
  state.sounds.push(isBossWave(state.wave) ? 'bosswarn' : 'wave');
}

function spawnFromQueue(state, kind) {
  const enemy = createEnemy(state.rng, kind, state.wave);
  if (kind === KIND_BOSS) {
    enemy.x = WORLD_WIDTH / 2;
    enemy.y = 120;
    enemy.mode = 'enter';
    enemy.modeTimer = 1.5;
    state.sounds.push('bossalarm');
    state.shake = Math.max(state.shake, 6);
  } else {
    placeAtEdge(state.rng, enemy, state.player);
  }
  state.enemies.push(enemy);
}

function killEnemy(state, enemy) {
  enemy.dead = true;
  const gained = enemy.score * comboMult(state);
  state.score += gained;
  state.kills += 1;
  state.stats.kills += 1;
  state.comboChain += 1;
  state.comboTimer = COMBO.window;
  spawnExplosion(state, enemy.x, enemy.y, enemy.color);
  addText(state, enemy.x, enemy.y - enemy.r, `+${gained}`, enemy.color, enemy.kind === KIND_BOSS ? 26 : 15);
  dropPickups(state, enemy);
  state.shake = Math.min(16, state.shake + (enemy.kind === KIND_BOSS ? 11 : 1.6));
  state.sounds.push(enemy.kind === KIND_BOSS ? 'bigboom' : 'boom');
  if (enemy.kind === KIND_SPLITTER) {
    for (let i = 0; i < 3; i += 1) {
      const mini = createEnemy(state.rng, KIND_MINI, state.wave);
      mini.x = enemy.x + state.rng.range(-16, 16);
      mini.y = enemy.y + state.rng.range(-16, 16);
      clampToArena(mini);
      state.enemies.push(mini);
    }
  }
  if (enemy.kind === KIND_BOSS) {
    state.banner = { text: 'VOIDHERALD DOWN', sub: `+${gained}`, t: 2.4 };
  }
}

/** Hurt the player: shields absorb first, dashing and fresh i-frames shrug the hit off. */
export function damagePlayer(state, amount) {
  const p = state.player;
  if (state.dying || p.dashTimer > 0 || p.hurtTimer > 0) return;
  p.hurtTimer = 0.55;
  p.shieldDelay = 4;
  let rest = amount;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, rest);
    p.shield -= absorbed;
    rest -= absorbed;
  }
  p.hp -= rest;
  state.flash = 0.6;
  state.shake = Math.min(16, state.shake + 5);
  spawnParticles(state, p.x, p.y, '#ff4757', 10, 220, 0.4, 3);
  state.sounds.push('hurt');
  if (p.hp <= 0) {
    p.hp = 0;
    state.dying = true;
    state.overTimer = 1.05;
    spawnExplosion(state, p.x, p.y, '#37f4ff');
    spawnExplosion(state, p.x, p.y, '#ffffff');
    state.shake = 16;
    state.sounds.push('bigboom');
  }
}

function collide(state) {
  const p = state.player;
  // Player bullets against enemies.
  for (const bullet of state.bullets) {
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      const rr = enemy.r + bullet.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      enemy.hp -= bullet.damage;
      enemy.flash = 0.09;
      state.stats.hits += 1;
      spawnParticles(state, bullet.x, bullet.y, enemy.color, 3, 160, 0.25, 2.4);
      if (bullet.pierceLeft > 0) bullet.pierceLeft -= 1;
      else { bullet.dead = true; }
      if (enemy.hp <= 0) killEnemy(state, enemy);
      if (bullet.dead) break;
    }
  }
  state.bullets = state.bullets.filter((bullet) => !bullet.dead);
  if (state.dying) return;
  // Enemy bullets against the player.
  for (const bullet of state.ebullets) {
    const dx = p.x - bullet.x;
    const dy = p.y - bullet.y;
    const rr = p.r + bullet.r;
    if (dx * dx + dy * dy <= rr * rr) {
      bullet.dead = true;
      damagePlayer(state, bullet.damage);
      if (state.dying) break;
    }
  }
  state.ebullets = state.ebullets.filter((bullet) => !bullet.dead);
  // Bodies against the player: a crash wounds both sides.
  for (const enemy of state.enemies) {
    if (enemy.dead || state.dying) continue;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const rr = p.r + enemy.r * 0.85;
    if (dx * dx + dy * dy <= rr * rr) {
      damagePlayer(state, enemy.damage);
      enemy.hp -= 2;
      enemy.flash = 0.09;
      const dist = Math.hypot(dx, dy) || 1;
      enemy.x -= (dx / dist) * 26;
      enemy.y -= (dy / dist) * 26;
      if (enemy.hp <= 0) killEnemy(state, enemy);
    }
  }
  // Pickups against the player.
  for (const pickup of state.pickups) {
    const dx = p.x - pickup.x;
    const dy = p.y - pickup.y;
    const rr = p.r + pickup.r + 6;
    if (dx * dx + dy * dy > rr * rr) continue;
    pickup.life = 0;
    if (pickup.kind === 'shard') {
      state.score += PICKUP.shardScore;
      state.comboTimer = COMBO.window;
      state.sounds.push('pickup');
    } else {
      p.hp = Math.min(p.maxHp, p.hp + PICKUP.heartHeal);
      addText(state, p.x, p.y - 26, `+${PICKUP.heartHeal} HULL`, '#ff5e7a', 16);
      state.sounds.push('heal');
    }
  }
}

/** Title-screen ambience: a few void-spawn drifting between waypoints behind the logo. */
function stepAttract(state, dt) {
  state.attractTimer -= dt;
  if (state.attractTimer <= 0 && state.enemies.length < 6) {
    state.attractTimer = 1.6;
    const kinds = ['chaser', 'orbiter', 'splitter', 'shooter'];
    const enemy = createEnemy(state.rng, kinds[state.enemies.length % kinds.length], 1);
    enemy.x = state.rng.range(120, WORLD_WIDTH - 120);
    enemy.y = state.rng.range(110, WORLD_HEIGHT - 110);
    enemy.wx = enemy.x;
    enemy.wy = enemy.y;
    state.enemies.push(enemy);
  }
  for (const enemy of state.enemies) {
    const dx = enemy.wx - enemy.x;
    const dy = enemy.wy - enemy.y;
    if (dx * dx + dy * dy < 30 * 30) {
      enemy.wx = state.rng.range(100, WORLD_WIDTH - 100);
      enemy.wy = state.rng.range(100, WORLD_HEIGHT - 100);
    }
    const dist = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / dist) * enemy.speed * 0.45 * dt;
    enemy.y += (dy / dist) * enemy.speed * 0.45 * dt;
    enemy.t += dt;
  }
}

/** Advance the whole game one fixed step under the given control frame. */
export function stepGame(state, ctrl, dt) {
  state.time += dt;
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
  state.shake = Math.max(0, state.shake - 30 * dt);
  state.flash = Math.max(0, state.flash - 1.8 * dt);
  updateParticles(state, dt);

  if (state.screen === SCREEN_TITLE) {
    stepAttract(state, dt);
    return;
  }
  if (state.screen !== SCREEN_PLAY) return;

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.comboChain = 0;
  }

  // Spawning.
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    while (state.spawnQueue.length > 0 && state.spawnTimer <= 0) {
      const next = state.spawnQueue.shift();
      spawnFromQueue(state, next.kind);
      state.spawnTimer += next.delay;
    }
  }
  while (state.pendingSpawns.length > 0) {
    const kind = state.pendingSpawns.shift();
    const boss = state.enemies.find((enemy) => enemy.kind === KIND_BOSS);
    const mini = createEnemy(state.rng, kind, state.wave);
    mini.x = (boss ? boss.x : WORLD_WIDTH / 2) + state.rng.range(-50, 50);
    mini.y = (boss ? boss.y : 120) + state.rng.range(-50, 50);
    clampToArena(mini);
    state.enemies.push(mini);
  }

  if (!state.dying) updatePlayerShip(state, ctrl, dt);
  updateDrones(state, dt);
  for (const enemy of state.enemies) updateEnemy(state, enemy, dt);
  separateEnemies(state, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  collide(state);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);

  if (state.dying) {
    state.overTimer -= dt;
    if (state.overTimer <= 0) {
      state.dying = false;
      state.screen = SCREEN_OVER;
      if (state.score > state.best) state.best = state.score;
      state.sounds.push('over');
    }
    return;
  }

  // Wave cleared: draft an upgrade, or roll straight on if the pool is spent.
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.choices = rollUpgrades(state);
    if (state.choices.length > 0) {
      state.screen = SCREEN_UPGRADE;
      state.sounds.push('upgrade');
    } else {
      nextWave(state);
    }
  }
}

/** Clear the field and launch wave `wave` directly (used by the screenshot scenes). */
export function startWave(state, wave) {
  state.enemies = [];
  state.bullets = [];
  state.ebullets = [];
  state.pickups = [];
  state.pendingSpawns = [];
  state.wave = wave - 1;
  nextWave(state);
  state.screen = SCREEN_PLAY;
}

/** Take the drafted upgrade at `index` and launch the next wave. */
export function chooseUpgrade(state, index) {
  if (state.screen !== SCREEN_UPGRADE) return;
  const choice = state.choices[index];
  if (!choice) return;
  applyUpgrade(state, choice);
  state.choices = [];
  state.sounds.push('power');
  nextWave(state);
  state.screen = SCREEN_PLAY;
}

export function pauseGame(state) {
  if (state.screen === SCREEN_PLAY) {
    state.screen = SCREEN_PAUSED;
    state.sounds.push('click');
  }
}

export function resumeGame(state) {
  if (state.screen === SCREEN_PAUSED) {
    state.screen = SCREEN_PLAY;
    state.sounds.push('click');
  }
}

/** Hull the boss currently on the field has left, as a fraction — for its health bar. */
export function bossFraction(state) {
  const boss = state.enemies.find((enemy) => enemy.kind === KIND_BOSS);
  return boss ? Math.max(0, boss.hp / boss.maxHp) : null;
}
