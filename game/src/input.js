// Keyboard and mouse, translated into the game's vocabulary: a movement axis, an aim point in
// world coordinates, a firing flag, and a queue of discrete events (confirm, pause, dash, card
// picks, clicks) that the boot module routes according to the current screen.

export const EVENT_CONFIRM = 'confirm';
export const EVENT_PAUSE = 'pause';
export const EVENT_MUTE = 'mute';
export const EVENT_DASH = 'dash';
export const EVENT_PICK = 'pick';
export const EVENT_CLICK = 'click';

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const held = new Set();
  const events = [];
  let toWorld = (x, y) => ({ x, y });
  let mouseClientX = 0;
  let mouseClientY = 0;

  const input = {
    firing: false,
    aim: { x: 0, y: 0 },

    /** The renderer owns the screen-to-world mapping; the boot module wires it in here. */
    setTransform(fn) {
      toWorld = fn;
      this.aim = toWorld(mouseClientX, mouseClientY);
    },

    /** Current movement axis from the held keys, normalised so diagonals are not faster. */
    axis() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const move = MOVE_KEYS[code];
        if (move) {
          x += move[0];
          y += move[1];
        }
      }
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },

    /** Hand the queued discrete events to the caller and clear the queue. */
    drainEvents() {
      return events.splice(0, events.length);
    },
  };

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code] || event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') events.push({ type: EVENT_CONFIRM });
    if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') events.push({ type: EVENT_DASH });
    if (event.code === 'KeyP' || event.code === 'Escape') events.push({ type: EVENT_PAUSE });
    if (event.code === 'KeyM') events.push({ type: EVENT_MUTE });
    if (event.code === 'Digit1') events.push({ type: EVENT_PICK, index: 0 });
    if (event.code === 'Digit2') events.push({ type: EVENT_PICK, index: 1 });
    if (event.code === 'Digit3') events.push({ type: EVENT_PICK, index: 2 });
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    input.firing = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    mouseClientX = event.clientX;
    mouseClientY = event.clientY;
    input.aim = toWorld(mouseClientX, mouseClientY);
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    input.firing = true;
    const point = toWorld(event.clientX, event.clientY);
    events.push({ type: EVENT_CLICK, x: point.x, y: point.y });
  });
  window.addEventListener('mouseup', () => {
    input.firing = false;
  });

  return input;
}
