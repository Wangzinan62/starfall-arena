// The renderer: fits the 1280x720 world into the window (letterboxed, devicePixelRatio-aware),
// then paints the starfield, the glowing arena, every entity with its own silhouette, particles
// and floating text, and finally the HUD or menu screen for the current state.
import {
  ARENA_MARGIN, COLORS, KIND_BOSS, KIND_CHASER, KIND_MINI, KIND_ORBITER, KIND_SHOOTER,
  KIND_SPLITTER, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE,
  WORLD_HEIGHT, WORLD_WIDTH,
} from './config.js';
import { createRandom } from './random.js';
import {
  drawBanner, drawGameOverScreen, drawHud, drawPauseScreen, drawTitleScreen, drawUpgradeScreen,
} from './hud.js';

const TAU = Math.PI * 2;
const CENTER_X = WORLD_WIDTH / 2;
const CENTER_Y = WORLD_HEIGHT / 2;

/** Three parallax star layers, fixed at boot so every frame (and screenshot) agrees. */
function makeStars() {
  const rng = createRandom(90210);
  const layers = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const stars = [];
    const count = [110, 70, 40][layer];
    for (let i = 0; i < count; i += 1) {
      stars.push({ x: rng() * WORLD_WIDTH, y: rng() * WORLD_HEIGHT, r: 0.8 + layer * 0.7 + rng() * 0.8, tw: rng() * TAU });
    }
    layers.push(stars);
  }
  return layers;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * view.dpr);
    canvas.height = Math.round(window.innerHeight * view.dpr);
    view.scale = Math.min(window.innerWidth / WORLD_WIDTH, window.innerHeight / WORLD_HEIGHT);
    view.ox = (window.innerWidth - WORLD_WIDTH * view.scale) / 2;
    view.oy = (window.innerHeight - WORLD_HEIGHT * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Convert a client (CSS pixel) point into world coordinates. */
  function toWorld(clientX, clientY) {
    return { x: (clientX - view.ox) / view.scale, y: (clientY - view.oy) / view.scale };
  }

  function drawStarfield(state) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let layer = 0; layer < 3; layer += 1) {
      const drift = state.time * (2 + layer * 3);
      const parX = state.player.x * 0.006 * (layer + 1);
      const parY = state.player.y * 0.006 * (layer + 1);
      ctx.fillStyle = layer === 2 ? '#cfe8ff' : '#7d94c8';
      for (const star of stars[layer]) {
        const x = ((star.x - parX + drift * 0.4) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
        const y = ((star.y - parY + drift) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
        const alpha = 0.35 + 0.3 * Math.sin(state.time * 1.7 + star.tw);
        ctx.globalAlpha = Math.max(0.08, alpha) * (0.4 + layer * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawArena() {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ARENA_MARGIN + 80; x < WORLD_WIDTH - ARENA_MARGIN; x += 80) {
      ctx.moveTo(x, ARENA_MARGIN);
      ctx.lineTo(x, WORLD_HEIGHT - ARENA_MARGIN);
    }
    for (let y = ARENA_MARGIN + 80; y < WORLD_HEIGHT - ARENA_MARGIN; y += 80) {
      ctx.moveTo(ARENA_MARGIN, y);
      ctx.lineTo(WORLD_WIDTH - ARENA_MARGIN, y);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.wall;
    ctx.shadowBlur = 18;
    ctx.strokeRect(ARENA_MARGIN, ARENA_MARGIN, WORLD_WIDTH - ARENA_MARGIN * 2, WORLD_HEIGHT - ARENA_MARGIN * 2);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(ARENA_MARGIN + 7, ARENA_MARGIN + 7, WORLD_WIDTH - (ARENA_MARGIN + 7) * 2, WORLD_HEIGHT - (ARENA_MARGIN + 7) * 2);
    ctx.restore();
  }

  function drawShipShape(x, y, angle, r, color, core) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(r * 1.25, 0);
    ctx.lineTo(-r * 0.85, r * 0.78);
    ctx.lineTo(-r * 0.45, 0);
    ctx.lineTo(-r * 0.85, -r * 0.78);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(r * 0.18, 0, r * 0.34, 0, TAU);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (state.dying) return;
    // Engine flame, flickering with time and thrust.
    const thrust = Math.hypot(p.vx, p.vy) / Math.max(1, p.speed);
    const flame = (7 + Math.sin(state.time * 41) * 2.4) * (0.4 + thrust);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(-p.r * 0.9, 3.4);
    ctx.lineTo(-p.r * 0.9 - flame, 0);
    ctx.lineTo(-p.r * 0.9, -3.4);
    ctx.closePath();
    ctx.fillStyle = '#ffb347';
    ctx.shadowColor = '#ff8c1a';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
    const hurt = p.hurtTimer > 0.3;
    drawShipShape(p.x, p.y, p.angle, p.r, hurt ? '#ff6b81' : COLORS.player, COLORS.playerCore);
    if (p.shield > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 9 + Math.sin(state.time * 3) * 1.2, 0, TAU);
      ctx.strokeStyle = `rgba(94, 168, 255, ${0.35 + 0.3 * (p.shield / Math.max(1, p.shieldMax))})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORS.shield;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEnemy(state, enemy) {
    const { x, y } = enemy;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = enemy.color;
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 12;
    switch (enemy.kind) {
      case KIND_CHASER:
      case KIND_MINI: {
        const angle = Math.atan2(enemy.vy, enemy.vx);
        ctx.rotate(angle);
        const r = enemy.r;
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(-r * 0.9, r * 0.72);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.9, -r * 0.72);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case KIND_ORBITER: {
        ctx.rotate(enemy.t * 2.4);
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r * 0.82, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * enemy.r * 0.82, Math.sin(a) * enemy.r * 0.82, 3.4, 0, TAU);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 4.4, 0, TAU);
        ctx.fillStyle = '#fff3c4';
        ctx.fill();
        break;
      }
      case KIND_SHOOTER: {
        ctx.rotate(enemy.t * 0.9);
        const r = enemy.r;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 5.4, 0, TAU);
        ctx.fillStyle = '#ffd7f4';
        ctx.fill();
        break;
      }
      case KIND_SPLITTER: {
        const pulse = 1 + Math.sin(enemy.t * 3.4) * 0.07;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r * pulse, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(10, 40, 20, 0.55)';
        for (let i = 0; i < 3; i += 1) {
          const a = enemy.t * 0.8 + (i / 3) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * enemy.r * 0.45, Math.sin(a) * enemy.r * 0.45, enemy.r * 0.3, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case KIND_BOSS: {
        if (enemy.mode === 'telegraph') {
          ctx.save();
          ctx.rotate(Math.atan2(state.player.y - y, state.player.x - x));
          ctx.strokeStyle = 'rgba(255, 71, 87, 0.5)';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(430, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.rotate(enemy.t * 0.55);
        const r = enemy.r;
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * TAU;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.rotate(-enemy.t * 1.15);
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * TAU + Math.PI / 6;
          const px = Math.cos(a) * r * 0.68;
          const py = Math.sin(a) * r * 0.68;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 11 + Math.sin(state.time * 5) * 1.6, 0, TAU);
        ctx.fillStyle = '#ffe3fb';
        ctx.fill();
        break;
      }
      default:
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r, 0, TAU);
        ctx.fill();
        break;
    }
    ctx.restore();
    if (enemy.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, enemy.flash / 0.09 * 0.75);
      ctx.beginPath();
      ctx.arc(x, y, enemy.r, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    if (enemy.kind !== KIND_BOSS && enemy.hp < enemy.maxHp) {
      const w = enemy.r * 2;
      ctx.save();
      ctx.fillStyle = 'rgba(20, 10, 30, 0.7)';
      ctx.fillRect(x - enemy.r, y - enemy.r - 11, w, 4.4);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(x - enemy.r, y - enemy.r - 11, w * Math.max(0, enemy.hp / enemy.maxHp), 4.4);
      ctx.restore();
    }
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      const blink = pickup.life < 2.5 ? (Math.sin(state.time * 16) > 0 ? 1 : 0.25) : 1;
      ctx.globalAlpha = blink;
      if (pickup.kind === 'shard') {
        ctx.rotate(pickup.t * 2.6);
        ctx.fillStyle = COLORS.shard;
        ctx.shadowColor = COLORS.shard;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5.4, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-5.4, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        const pulse = 1 + Math.sin(pickup.t * 5) * 0.12;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = COLORS.heart;
        ctx.shadowColor = COLORS.heart;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(-13, -2, -8, -11, 0, -5);
        ctx.bezierCurveTo(8, -11, 13, -2, 0, 8);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawProjectiles(state) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const bullet of state.bullets) {
      ctx.strokeStyle = COLORS.bullet;
      ctx.shadowColor = COLORS.bullet;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    for (const bullet of state.ebullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, TAU);
      ctx.fillStyle = '#ff5470';
      ctx.shadowColor = '#ff5470';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r * 0.45, 0, TAU);
      ctx.fillStyle = '#ffd7de';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticlesAndText(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fillStyle = particle.color;
      ctx.fill();
    }
    ctx.restore();
    for (const text of state.texts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, text.life / text.maxLife);
      ctx.font = `bold ${text.size}px system-ui, 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = text.color;
      ctx.shadowColor = text.color;
      ctx.shadowBlur = 8;
      ctx.fillText(text.str, text.x, text.y);
      ctx.restore();
    }
  }

  function drawDrones(state) {
    for (const drone of state.drones) {
      drawShipShape(drone.x, drone.y, drone.angle + Math.PI / 2, 8, '#5ec8d8', '#e8feff');
    }
  }

  function draw(state) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(
      view.dpr * view.scale, 0, 0, view.dpr * view.scale,
      view.dpr * (view.ox + shakeX * view.scale), view.dpr * (view.oy + shakeY * view.scale),
    );
    drawStarfield(state);
    drawArena();
    drawPickups(state);
    for (const enemy of state.enemies) drawEnemy(state, enemy);
    drawDrones(state);
    drawPlayer(state);
    drawProjectiles(state);
    drawParticlesAndText(state);
    if (state.flash > 0) {
      const gradient = ctx.createRadialGradient(CENTER_X, CENTER_Y, WORLD_HEIGHT * 0.36, CENTER_X, CENTER_Y, WORLD_HEIGHT * 0.78);
      gradient.addColorStop(0, 'rgba(255, 40, 60, 0)');
      gradient.addColorStop(1, `rgba(255, 40, 60, ${0.42 * state.flash})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
    if (state.screen === SCREEN_TITLE) {
      drawTitleScreen(ctx, state);
    } else {
      drawHud(ctx, state);
      if (state.screen === SCREEN_PLAY) drawBanner(ctx, state);
      if (state.screen === SCREEN_UPGRADE) drawUpgradeScreen(ctx, state);
      if (state.screen === SCREEN_PAUSED) drawPauseScreen(ctx, state);
      if (state.screen === SCREEN_OVER) drawGameOverScreen(ctx, state);
    }
  }

  return { draw, resize, toWorld, view };
}
