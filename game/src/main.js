// Boot and the one loop: input is read every frame, the simulation advances in fixed 1/60 s
// steps, and the renderer paints what is there. Clicks and keys are routed by screen — the
// start and restart buttons and the upgrade cards are hit-tested against the very rectangles
// hud.js draws.
//
// ?seed=N fixes the run's randomness. ?shot=title|action|upgrade|gameover (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady.
import {
  BEST_KEY, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, STEP,
} from './config.js';
import { createRandom } from './random.js';
import {
  IDLE_CTRL, chooseUpgrade, createGame, pauseGame, resumeGame, startRun, stepGame,
} from './game.js';
import {
  EVENT_CLICK, EVENT_CONFIRM, EVENT_DASH, EVENT_MUTE, EVENT_PAUSE, EVENT_PICK, createInput,
} from './input.js';
import { createRenderer } from './render.js';
import { pointInRect, restartButtonRect, startButtonRect, upgradeCardRect } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}
game.best = readBest();

function drainSounds() {
  for (const name of game.sounds) audio.play(name);
  game.sounds.length = 0;
}

function runShot(name) {
  stageShot(name, game);
  game.sounds.length = 0;
  let painted = 0;
  function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  input.setTransform((x, y) => renderer.toWorld(x, y));
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;
  let announcedScreen = '';

  function announce(message) {
    status.textContent = message;
  }

  function beginRun() {
    startRun(game);
    announce(`Wave 1. Score 0. Good hunting.`);
  }

  function routeEvents() {
    for (const event of input.drainEvents()) {
      if (event.type === EVENT_CLICK) {
        audio.unlock();
        if (game.screen === SCREEN_TITLE && pointInRect(event.x, event.y, startButtonRect())) beginRun();
        else if (game.screen === SCREEN_OVER && pointInRect(event.x, event.y, restartButtonRect())) beginRun();
        else if (game.screen === SCREEN_UPGRADE) {
          for (let i = 0; i < game.choices.length; i += 1) {
            if (pointInRect(event.x, event.y, upgradeCardRect(i))) {
              chooseUpgrade(game, i);
              break;
            }
          }
        }
      } else if (event.type === EVENT_CONFIRM) {
        audio.unlock();
        if (game.screen === SCREEN_TITLE || game.screen === SCREEN_OVER) beginRun();
        else if (game.screen === SCREEN_PAUSED) resumeGame(game);
      } else if (event.type === EVENT_PAUSE) {
        if (game.screen === SCREEN_PLAY) pauseGame(game);
        else if (game.screen === SCREEN_PAUSED) resumeGame(game);
      } else if (event.type === EVENT_MUTE) {
        announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
      } else if (event.type === EVENT_PICK) {
        if (game.screen === SCREEN_UPGRADE) chooseUpgrade(game, event.index);
      } else if (event.type === EVENT_DASH) {
        if (game.screen === SCREEN_PLAY) dashQueued = true;
      }
    }
  }

  function stepOnce() {
    if (game.screen === SCREEN_PLAY) {
      const axis = input.axis();
      const ctrl = {
        moveX: axis.x, moveY: axis.y,
        aimX: input.aim.x, aimY: input.aim.y,
        firing: input.firing, dash: dashQueued,
      };
      dashQueued = false;
      stepGame(game, ctrl, STEP);
    } else if (game.screen !== SCREEN_PAUSED) {
      stepGame(game, IDLE_CTRL, STEP);
    }
    drainSounds();
    if (game.screen !== announcedScreen) {
      if (game.screen === SCREEN_OVER) {
        saveBest(game.best);
        announce(`Game over. Score ${game.score}. Best ${game.best}. Press Enter to restart.`);
      } else if (game.screen === SCREEN_UPGRADE) {
        announce(`Wave ${game.wave} cleared. Choose an upgrade: keys 1, 2 or 3, or click a card.`);
      } else if (game.screen === SCREEN_PAUSED) {
        announce('Paused.');
      }
      announcedScreen = game.screen;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    routeEvents();
    while (accumulator >= STEP) {
      stepOnce();
      accumulator -= STEP;
    }
    renderer.draw(game);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) pauseGame(game);
  });

  announce('Starfall Arena. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
