// The between-wave draft: nine upgrades, each stackable to a cap, three offered at a time.
// An upgrade is data plus its apply function, so the choice screen and the rules share one list.

export const UPGRADES = [
  {
    id: 'rapid', name: 'Rapid Cycler', color: '#37f4ff', max: 4,
    blurb: 'Fire 18% faster. Stacks.',
    apply(p) { p.fireInterval *= 0.82; },
  },
  {
    id: 'heavy', name: 'Heavy Rounds', color: '#ffd23d', max: 4,
    blurb: '+1 damage per shot. Stacks.',
    apply(p) { p.damage += 1; },
  },
  {
    id: 'split', name: 'Split Cannon', color: '#ff3df0', max: 3,
    blurb: '+1 projectile per volley. Stacks.',
    apply(p) { p.projectiles += 1; },
  },
  {
    id: 'pierce', name: 'Lance Rounds', color: '#8a5cff', max: 2,
    blurb: 'Shots pierce +1 enemy. Stacks.',
    apply(p) { p.pierce += 1; },
  },
  {
    id: 'thrusters', name: 'Ion Thrusters', color: '#52ff8a', max: 3,
    blurb: 'Move 12% faster. Stacks.',
    apply(p) { p.speed *= 1.12; },
  },
  {
    id: 'hull', name: 'Reinforced Hull', color: '#ff8fb3', max: 3,
    blurb: '+25 max hull and repair 25. Stacks.',
    apply(p) { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'shield', name: 'Aegis Shield', color: '#5ea8ff', max: 3,
    blurb: '+25 regenerating shield. Stacks.',
    apply(p) { p.shieldMax += 25; p.shield += 25; },
  },
  {
    id: 'magnet', name: 'Tractor Magnet', color: '#ffe95e', max: 2,
    blurb: 'Shards fly to you from twice as far.',
    apply(p) { p.magnet *= 1.9; },
  },
  {
    id: 'drone', name: 'Escort Drone', color: '#aefcff', max: 2,
    blurb: 'A drone orbits you and fires on its own.',
    apply(p, state) {
      state.drones.push({ angle: state.rng.range(0, Math.PI * 2), x: p.x, y: p.y, fireTimer: 0.3 });
    },
  },
  {
    id: 'dash', name: 'Blink Jets', color: '#ff9f43', max: 2,
    blurb: 'Dash recharges 35% sooner. Stacks.',
    apply(p) { p.dashCooldown *= 0.65; },
  },
];

/** How many stacks of an upgrade the player already holds. */
export function stacksOf(state, id) {
  return state.taken[id] ?? 0;
}

/** Roll three distinct upgrades the player has not maxed out; fewer if the pool runs dry. */
export function rollUpgrades(state) {
  const open = UPGRADES.filter((upgrade) => stacksOf(state, upgrade.id) < upgrade.max);
  const picks = [];
  while (picks.length < 3 && open.length > 0) {
    const index = Math.floor(state.rng() * open.length);
    picks.push(open.splice(index, 1)[0]);
  }
  return picks;
}

/** Take a drafted upgrade: record the stack and apply it. */
export function applyUpgrade(state, upgrade) {
  state.taken[upgrade.id] = stacksOf(state, upgrade.id) + 1;
  upgrade.apply(state.player, state);
}
