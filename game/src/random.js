// A small seeded random source (mulberry32): the whole simulation draws from one of these, so a
// seed fully determines a run — which is what makes the screenshot scenes reproducible.

/** Create a random generator from a 32-bit seed. The returned function yields floats in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.chance = (probability) => next() < probability;
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}
