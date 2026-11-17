// Everything that moves: the player's ship, the six void-spawn kinds with their own behaviours,
// bullets from both sides, drones, pickups, particles and floating score text. Factories and
// per-frame updates live here; the rules that connect them (collisions, score, waves) live in
// game.js.
import {
  ARENA_MARGIN, ENEMY_BULLET, ENEMY_STATS, KIND_BOSS, KIND_CHASER, KIND_MINI, KIND_ORBITER,
  KIND_SHOOTER, KIND_SPLITTER, PICKUP, PLAYER, WORLD_HEIGHT, WORLD_WIDTH,
} from './config.js';

const TAU = Math.PI * 2;

/** Clamp a ship inside the arena walls. */
export function clampToArena(body) {
  body.x = Math.min(WORLD_WIDTH - ARENA_MARGIN - body.r, Math.max(ARENA_MARGIN + body.r, body.x));
  body.y = Math.min(WORLD_HEIGHT - ARENA_MARGIN - body.r, Math.max(ARENA_MARGIN + body.r, body.y));
}

export function createPlayer() {
  return {
    x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, vx: 0, vy: 0, r: PLAYER.radius,
    angle: -Math.PI / 2, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    shield: 0, shieldMax: 0, shieldDelay: 0,
    fireTimer: 0, hurtTimer: 0, dashTimer: 0, dashCooldownTimer: 0, dashX: 1, dashY: 0,
    // Upgradeable stats; upgrades.js rewrites these as the run goes on.
    damage: PLAYER.bulletDamage, fireInterval: PLAYER.fireInterval, speed: PLAYER.speed,
    projectiles: 1, pierce: 0, magnet: 70, dashCooldown: PLAYER.dashCooldown,
  };
}

/** A fresh enemy of `kind`, scaled a little by the wave it belongs to. */
export function createEnemy(rng, kind, wave) {
  const base = ENEMY_STATS[kind];
  const growth = 1 + (wave - 1) * 0.07;
  return {
    kind, x: 0, y: 0, vx: 0, vy: 0, r: base.radius,
    hp: Math.round(base.hp * growth), maxHp: Math.round(base.hp * growth),
    speed: base.speed * (1 + (wave - 1) * 0.012), damage: base.damage, score: base.score,
    color: base.color, t: rng.range(0, 10), flash: 0,
    fireTimer: rng.range(1.2, 2.6), orbitDir: rng.sign(), phase: rng.range(0, TAU),
    mode: 'enter', modeTimer: 0, chargeX: 0, chargeY: 0,
  };
}

/** Place an enemy just inside a random stretch of wall, away from the player. */
export function placeAtEdge(rng, enemy, player) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const side = rng.int(0, 3);
    const along = rng.range(0.08, 0.92);
    if (side === 0) { enemy.x = WORLD_WIDTH * along; enemy.y = ARENA_MARGIN + enemy.r + 4; }
    if (side === 1) { enemy.x = WORLD_WIDTH * along; enemy.y = WORLD_HEIGHT - ARENA_MARGIN - enemy.r - 4; }
    if (side === 2) { enemy.x = ARENA_MARGIN + enemy.r + 4; enemy.y = WORLD_HEIGHT * along; }
    if (side === 3) { enemy.x = WORLD_WIDTH - ARENA_MARGIN - enemy.r - 4; enemy.y = WORLD_HEIGHT * along; }
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    if (dx * dx + dy * dy > 260 * 260) return;
  }
}

function steer(enemy, tx, ty, speed, dt, turn) {
  const dx = tx - enemy.x;
  const dy = ty - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wantX = (dx / dist) * speed;
  const wantY = (dy / dist) * speed;
  const blend = Math.min(1, turn * dt);
  enemy.vx += (wantX - enemy.vx) * blend;
  enemy.vy += (wantY - enemy.vy) * blend;
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
}

/** Fire one enemy bullet from `enemy` at `angle`. */
export function fireEnemyBullet(state, enemy, angle, speed = ENEMY_BULLET.speed) {
  state.ebullets.push({
    x: enemy.x + Math.cos(angle) * (enemy.r + 4), y: enemy.y + Math.sin(angle) * (enemy.r + 4),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: ENEMY_BULLET.radius, damage: ENEMY_BULLET.damage, life: 5,
  });
}

function updateBoss(state, enemy, dt) {
  const player = state.player;
  const frac = enemy.hp / enemy.maxHp;
  enemy.fireTimer -= dt;
  enemy.modeTimer -= dt;
  if (enemy.mode === 'enter') {
    steer(enemy, WORLD_WIDTH / 2, 150, enemy.speed * 1.6, dt, 3);
    if (enemy.modeTimer <= 0) enemy.mode = 'fight';
    return;
  }
  if (enemy.mode === 'charge') {
    enemy.x += enemy.chargeX * 430 * dt;
    enemy.y += enemy.chargeY * 430 * dt;
    clampToArena(enemy);
    if (enemy.modeTimer <= 0) { enemy.mode = 'fight'; enemy.modeTimer = state.rng.range(1.6, 2.6); }
    return;
  }
  if (enemy.mode === 'telegraph') {
    enemy.flash = 0.05;
    if (enemy.modeTimer <= 0) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      enemy.chargeX = Math.cos(angle);
      enemy.chargeY = Math.sin(angle);
      enemy.mode = 'charge';
      enemy.modeTimer = 0.55;
      state.sounds.push('bosscharge');
    }
    return;
  }
  // Fight: drift toward a mid-range orbit of the player and use the phase's attacks.
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const orbitX = player.x - (dx / dist) * 300 + Math.cos(enemy.t * 0.7) * 60;
  const orbitY = player.y - (dy / dist) * 300 + Math.sin(enemy.t * 0.9) * 60;
  steer(enemy, orbitX, orbitY, enemy.speed, dt, 2.2);
  const aim = Math.atan2(dy, dx);
  if (frac > 0.66) {
    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = 2.3;
      for (const off of [-0.22, 0, 0.22]) fireEnemyBullet(state, enemy, aim + off, 268);
      state.sounds.push('eshoot');
    }
  } else if (frac > 0.33) {
    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = 3.1;
      const base = state.rng.range(0, TAU);
      for (let i = 0; i < 14; i += 1) fireEnemyBullet(state, enemy, base + (i / 14) * TAU, 218);
      state.sounds.push('eshoot');
    }
    if (enemy.modeTimer <= 0) {
      enemy.modeTimer = 5.5;
      state.pendingSpawns.push(KIND_MINI, KIND_MINI);
    }
  } else {
    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = 2.4;
      const base = state.rng.range(0, TAU);
      for (let i = 0; i < 18; i += 1) fireEnemyBullet(state, enemy, base + (i / 18) * TAU, 238);
      state.sounds.push('eshoot');
    }
    if (enemy.modeTimer <= 0) {
      enemy.mode = 'telegraph';
      enemy.modeTimer = 0.6;
      state.sounds.push('bosswarn');
    }
  }
}

/** Advance one enemy by its kind's behaviour. The boss is the Voidherald: phases as it weakens. */
export function updateEnemy(state, enemy, dt) {
  const player = state.player;
  enemy.t += dt;
  if (enemy.flash > 0) enemy.flash -= dt;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  switch (enemy.kind) {
    case KIND_CHASER: {
      const wobble = Math.sin(enemy.t * 3.1 + enemy.phase) * 26;
      steer(enemy, player.x - (dy / dist) * wobble, player.y + (dx / dist) * wobble, enemy.speed, dt, 4.5);
      break;
    }
    case KIND_MINI:
      steer(enemy, player.x, player.y, enemy.speed, dt, 6);
      break;
    case KIND_ORBITER: {
      enemy.modeTimer -= dt;
      if (enemy.mode === 'dive') {
        enemy.x += enemy.chargeX * 330 * dt;
        enemy.y += enemy.chargeY * 330 * dt;
        if (enemy.modeTimer <= 0) enemy.mode = 'orbit';
      } else {
        const radial = (dist - 155) * 1.6;
        const tx = (dx / dist) * radial + (-dy / dist) * enemy.orbitDir * enemy.speed;
        const ty = (dy / dist) * radial + (dx / dist) * enemy.orbitDir * enemy.speed;
        enemy.vx += (tx - enemy.vx) * Math.min(1, 5 * dt);
        enemy.vy += (ty - enemy.vy) * Math.min(1, 5 * dt);
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.modeTimer <= 0) {
          enemy.mode = 'dive';
          enemy.modeTimer = 0.65;
          enemy.chargeX = dx / dist;
          enemy.chargeY = dy / dist;
        }
      }
      break;
    }
    case KIND_SHOOTER: {
      const want = dist < 235 ? -1 : dist > 330 ? 1 : 0;
      const tx = (dx / dist) * want * enemy.speed + (-dy / dist) * enemy.orbitDir * enemy.speed * 0.7;
      const ty = (dy / dist) * want * enemy.speed + (dx / dist) * enemy.orbitDir * enemy.speed * 0.7;
      enemy.vx += (tx - enemy.vx) * Math.min(1, 3.5 * dt);
      enemy.vy += (ty - enemy.vy) * Math.min(1, 3.5 * dt);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0 && dist < 560) {
        enemy.fireTimer = state.rng.range(1.9, 2.7);
        fireEnemyBullet(state, enemy, Math.atan2(dy, dx) + state.rng.range(-0.07, 0.07));
        state.sounds.push('eshoot');
      }
      break;
    }
    case KIND_SPLITTER:
      steer(enemy, player.x, player.y, enemy.speed, dt, 3);
      break;
    case KIND_BOSS:
      updateBoss(state, enemy, dt);
      break;
    default:
      break;
  }
  clampToArena(enemy);
}

/** Keep enemies from stacking: a gentle pairwise push, cheap at arena counts. */
export function separateEnemies(state, dt) {
  const list = state.enemies;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r + 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 30 * dt;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
}

/** Move the player's ship from the control input: dash, thrust, aim, fire, shield upkeep. */
export function updatePlayerShip(state, ctrl, dt) {
  const p = state.player;
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  p.fireTimer -= dt;
  p.dashCooldownTimer = Math.max(0, p.dashCooldownTimer - dt);
  if (p.shieldDelay > 0) p.shieldDelay -= dt;
  else if (p.shieldMax > 0) p.shield = Math.min(p.shieldMax, p.shield + 7 * dt);

  if (ctrl.dash && p.dashTimer <= 0 && p.dashCooldownTimer <= 0) {
    const mx = ctrl.moveX !== 0 || ctrl.moveY !== 0 ? Math.atan2(ctrl.moveY, ctrl.moveX) : p.angle;
    p.dashX = Math.cos(mx);
    p.dashY = Math.sin(mx);
    p.dashTimer = PLAYER.dashTime;
    p.dashCooldownTimer = p.dashCooldown;
    state.sounds.push('dash');
  }
  if (p.dashTimer > 0) {
    p.dashTimer -= dt;
    p.vx = p.dashX * PLAYER.dashSpeed;
    p.vy = p.dashY * PLAYER.dashSpeed;
    spawnParticles(state, p.x - p.dashX * p.r, p.y - p.dashY * p.r, '#37f4ff', 1, 40, 0.22, 3);
  } else {
    const blend = 1 - Math.exp(-11 * dt);
    p.vx += (ctrl.moveX * p.speed - p.vx) * blend;
    p.vy += (ctrl.moveY * p.speed - p.vy) * blend;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampToArena(p);
  p.angle = Math.atan2(ctrl.aimY - p.y, ctrl.aimX - p.x);

  if (ctrl.firing && p.fireTimer <= 0) {
    p.fireTimer = p.fireInterval;
    const count = p.projectiles;
    const spreadStep = 0.085;
    for (let i = 0; i < count; i += 1) {
      const angle = p.angle + (i - (count - 1) / 2) * spreadStep;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * (p.r + 4), y: p.y + Math.sin(p.angle) * (p.r + 4),
        vx: Math.cos(angle) * 640, vy: Math.sin(angle) * 640,
        r: 4, damage: p.damage, pierceLeft: p.pierce, life: 1.4,
      });
    }
    state.stats.shots += count;
    spawnParticles(state, p.x + Math.cos(p.angle) * (p.r + 6), p.y + Math.sin(p.angle) * (p.r + 6), '#aefcff', 2, 60, 0.12, 2);
    state.sounds.push('shoot');
  }
}

/** The player's orbiting drones: they hover at fixed offsets and fire on their own timers. */
export function updateDrones(state, dt) {
  const p = state.player;
  for (const drone of state.drones) {
    drone.angle += dt * 2.1;
    drone.x = p.x + Math.cos(drone.angle) * 46;
    drone.y = p.y + Math.sin(drone.angle) * 46;
    drone.fireTimer -= dt;
    if (drone.fireTimer > 0) continue;
    let target = null;
    let best = 540 * 540;
    for (const enemy of state.enemies) {
      const d2 = (enemy.x - drone.x) ** 2 + (enemy.y - drone.y) ** 2;
      if (d2 < best) { best = d2; target = enemy; }
    }
    if (target) {
      drone.fireTimer = 0.42;
      const angle = Math.atan2(target.y - drone.y, target.x - drone.x);
      state.bullets.push({
        x: drone.x, y: drone.y, vx: Math.cos(angle) * 640, vy: Math.sin(angle) * 640,
        r: 3.5, damage: p.damage, pierceLeft: 0, life: 1.2,
      });
      state.sounds.push('shoot');
    } else {
      drone.fireTimer = 0.12;
    }
  }
}

export function updateBullets(state, dt) {
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
  }
  state.bullets = state.bullets.filter((b) => b.life > 0
    && b.x > ARENA_MARGIN - 30 && b.x < WORLD_WIDTH - ARENA_MARGIN + 30
    && b.y > ARENA_MARGIN - 30 && b.y < WORLD_HEIGHT - ARENA_MARGIN + 30);
  for (const bullet of state.ebullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
  }
  state.ebullets = state.ebullets.filter((b) => b.life > 0
    && b.x > ARENA_MARGIN - 20 && b.x < WORLD_WIDTH - ARENA_MARGIN + 20
    && b.y > ARENA_MARGIN - 20 && b.y < WORLD_HEIGHT - ARENA_MARGIN + 20);
}

/** Add `count` particles of one colour bursting from a point. */
export function spawnParticles(state, x, y, color, count, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng.range(0, TAU);
    const v = state.rng.range(speed * 0.25, speed);
    state.particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life: state.rng.range(life * 0.5, life), maxLife: life,
      size: state.rng.range(size * 0.6, size * 1.3), color, drag: 2.6,
    });
  }
}

/** A kill burst: a fast flash of sparks plus a few slow embers. */
export function spawnExplosion(state, x, y, color) {
  spawnParticles(state, x, y, color, 16, 300, 0.5, 3.4);
  spawnParticles(state, x, y, '#ffffff', 6, 190, 0.3, 2.4);
  spawnParticles(state, x, y, color, 8, 70, 0.9, 4.2);
}

/** A floating score or message text that rises and fades. */
export function addText(state, x, y, str, color, size = 15) {
  state.texts.push({ x, y, str, color, size, life: 0.9, maxLife: 0.9 });
}

export function updateParticles(state, dt) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    const damp = Math.max(0, 1 - particle.drag * dt);
    particle.vx *= damp;
    particle.vy *= damp;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const text of state.texts) {
    text.y -= 36 * dt;
    text.life -= dt;
  }
  state.texts = state.texts.filter((text) => text.life > 0);
}

/** Pickups drift, pulse and — inside the magnet radius — stream toward the ship. */
export function updatePickups(state, dt) {
  const p = state.player;
  for (const pickup of state.pickups) {
    pickup.t += dt;
    pickup.life -= dt;
    const dx = p.x - pickup.x;
    const dy = p.y - pickup.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (pickup.kind === 'shard' && dist < p.magnet) {
      const pull = PICKUP.magnetSpeed * (1.3 - dist / Math.max(1, p.magnet));
      pickup.vx = (dx / dist) * pull;
      pickup.vy = (dy / dist) * pull;
    } else {
      pickup.vx *= Math.max(0, 1 - 2.4 * dt);
      pickup.vy *= Math.max(0, 1 - 2.4 * dt);
    }
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
  }
  state.pickups = state.pickups.filter((pickup) => pickup.life > 0);
}

/** Drop what a dead enemy leaves behind: shards always, a heart now and then. */
export function dropPickups(state, enemy) {
  const shards = enemy.kind === KIND_BOSS ? 14 : state.rng.int(1, 3);
  for (let i = 0; i < shards; i += 1) {
    const angle = state.rng.range(0, TAU);
    const v = state.rng.range(20, 90);
    state.pickups.push({
      kind: 'shard', x: enemy.x, y: enemy.y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      r: 6, t: state.rng.range(0, 5), life: 13,
    });
  }
  if (enemy.kind !== KIND_MINI && state.rng.chance(PICKUP.heartChance)) {
    state.pickups.push({
      kind: 'heart', x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 10, t: 0, life: 11,
    });
  }
}
