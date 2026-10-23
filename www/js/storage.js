// Player progress, kept in localStorage. Every access is guarded: storage can
// be missing or blocked (private mode, some webviews), and the game must still run.

const KEY = 'kuppatlat.save.v1';

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 20 * 60 * 1000;

const DEFAULTS = {
  level: 1, // highest unlocked level
  stars: {}, // level number -> best stars
  coins: 300,
  lives: MAX_LIVES,
  livesAt: 0, // when the next life regen period started
  sound: true,
  hammer: 3,
  shuffle: 2,
  lastDaily: '',
};

export function fresh() {
  return { ...DEFAULTS, stars: {} };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    // fall through to defaults
  }
  return fresh();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Progress just won't persist this session.
  }
}

// Applies life regeneration for the time that has passed.
export function syncLives(state, now = Date.now()) {
  if (state.lives >= MAX_LIVES) {
    state.lives = MAX_LIVES;
    return;
  }
  const gained = Math.floor((now - state.livesAt) / LIFE_REGEN_MS);
  if (gained > 0) {
    state.lives = Math.min(MAX_LIVES, state.lives + gained);
    state.livesAt += gained * LIFE_REGEN_MS;
  }
}

export function loseLife(state, now = Date.now()) {
  syncLives(state, now);
  if (state.lives === MAX_LIVES) state.livesAt = now;
  state.lives = Math.max(0, state.lives - 1);
}

export function nextLifeIn(state, now = Date.now()) {
  if (state.lives >= MAX_LIVES) return 0;
  return Math.max(0, state.livesAt + LIFE_REGEN_MS - now);
}
