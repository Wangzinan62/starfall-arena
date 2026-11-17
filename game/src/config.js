// Starfall Arena's tuning table: the arena, the pilot, the void-spawn and the palette.
// Everything the other modules need to agree on lives here, so balance changes land in one place.

/** The fixed step the simulation advances in, seconds: 1/60. */
export const STEP = 1 / 60;

/** Logical playfield size; the renderer scales it to the window with letterboxing. */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

/** Distance from the world edge to the glowing arena wall; ships stay inside it. */
export const ARENA_MARGIN = 34;

/** localStorage key for the best score. */
export const BEST_KEY = 'starfall-arena-best';

/** Screen identifiers the state machine moves between. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export const PLAYER = {
  radius: 13,
  speed: 268,
  maxHp: 100,
  fireInterval: 0.19,
  bulletSpeed: 640,
  bulletDamage: 1,
  dashSpeed: 760,
  dashTime: 0.16,
  dashCooldown: 1.7,
  hurtCooldown: 0.55,
};

/** Enemy kinds, in the order waves unlock them. */
export const KIND_CHASER = 'chaser';
export const KIND_MINI = 'mini';
export const KIND_ORBITER = 'orbiter';
export const KIND_SHOOTER = 'shooter';
export const KIND_SPLITTER = 'splitter';
export const KIND_BOSS = 'boss';

/** Per-kind hull, speed, contact damage and score. Speeds and hull grow with the wave number. */
export const ENEMY_STATS = {
  [KIND_CHASER]: { hp: 2, speed: 118, radius: 13, damage: 12, score: 50, color: '#ff3d71' },
  [KIND_MINI]: { hp: 1, speed: 168, radius: 8, damage: 8, score: 20, color: '#ff8fb3' },
  [KIND_ORBITER]: { hp: 5, speed: 132, radius: 14, damage: 10, score: 70, color: '#ffd23d' },
  [KIND_SHOOTER]: { hp: 4, speed: 96, radius: 15, damage: 8, score: 80, color: '#8a5cff' },
  [KIND_SPLITTER]: { hp: 11, speed: 62, radius: 22, damage: 16, score: 120, color: '#52ff8a' },
  [KIND_BOSS]: { hp: 240, speed: 54, radius: 46, damage: 24, score: 1500, color: '#c44dff' },
};

/** Enemy bullets: slower than the player's, clearly red-violet. */
export const ENEMY_BULLET = { speed: 252, radius: 5, damage: 9, color: '#ff5470' };

/** Combo: each kill feeds the chain; the multiplier steps up every CHAIN_PER_TIER kills. */
export const COMBO = { window: 3.0, chainPerTier: 8, maxTier: 7 };

/** Pickup tuning: shards are score and combo fuel; hearts repair the hull. */
export const PICKUP = { shardScore: 5, heartHeal: 26, heartChance: 0.07, magnetSpeed: 340 };

export const COLORS = {
  background: '#05060f',
  grid: 'rgba(80, 120, 255, 0.07)',
  wall: '#37f4ff',
  player: '#37f4ff',
  playerCore: '#e8feff',
  bullet: '#aefcff',
  shard: '#ffe95e',
  heart: '#ff5e7a',
  text: '#eaf6ff',
  dimText: '#8fa8c8',
  danger: '#ff4757',
  shield: '#5ea8ff',
  panel: 'rgba(8, 14, 34, 0.88)',
  panelEdge: '#2a4a8f',
};
