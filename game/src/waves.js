// The wave director: what each wave sends in, in what order, and how fast. Waves mix the kinds
// unlocked so far in growing numbers; every fifth wave is the Voidherald with a small escort.
import {
  KIND_BOSS, KIND_CHASER, KIND_MINI, KIND_ORBITER, KIND_SHOOTER, KIND_SPLITTER,
} from './config.js';

export function isBossWave(wave) {
  return wave % 5 === 0;
}

/** Enemy kinds a wave may draw from: new kinds arrive on waves 2, 3 and 4 and stay. */
export function unlockedKinds(wave) {
  const kinds = [KIND_CHASER];
  if (wave >= 2) kinds.push(KIND_ORBITER);
  if (wave >= 3) kinds.push(KIND_SHOOTER);
  if (wave >= 4) kinds.push(KIND_SPLITTER);
  if (wave >= 6) kinds.push(KIND_MINI);
  return kinds;
}

/**
 * Build the spawn queue for a wave: a shuffled list of kinds plus the gap, in seconds, to leave
 * before each one. Boss waves are the boss first, then a trickle of escorts while it fights.
 */
export function planWave(rng, wave) {
  if (isBossWave(wave)) {
    const plan = [{ kind: KIND_BOSS, delay: 0.8 }];
    const escorts = 4 + wave / 5 * 2;
    for (let i = 0; i < escorts; i += 1) {
      plan.push({ kind: rng.chance(0.6) ? KIND_CHASER : KIND_ORBITER, delay: rng.range(3.5, 6.5) });
    }
    return plan;
  }
  const kinds = unlockedKinds(wave);
  const weights = {
    [KIND_CHASER]: 5, [KIND_ORBITER]: 2.6, [KIND_SHOOTER]: 2.4, [KIND_SPLITTER]: 1.7, [KIND_MINI]: 2.2,
  };
  const count = Math.min(46, 6 + wave * 3);
  const plan = [];
  for (let i = 0; i < count; i += 1) {
    let total = 0;
    for (const kind of kinds) total += weights[kind];
    let roll = rng.range(0, total);
    let kind = kinds[0];
    for (const candidate of kinds) {
      roll -= weights[candidate];
      if (roll <= 0) { kind = candidate; break; }
    }
    const baseGap = Math.max(0.34, 1.05 - wave * 0.055);
    plan.push({ kind, delay: i === 0 ? 0.4 : baseGap * rng.range(0.55, 1.5) });
  }
  return plan;
}

/** The banner line shown as a wave begins. */
export function waveTitle(wave) {
  if (isBossWave(wave)) return 'THE VOIDHERALD';
  return `WAVE ${wave}`;
}
