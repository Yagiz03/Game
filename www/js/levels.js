// Level definitions. Every level is generated deterministically from its
// number, so level 17 is the same for every player. The first few levels are
// tuned by hand as a gentle tutorial. Move counts come from moves.js, which
// tests/simulate.mjs --calibrate generates by bot play-testing every level.

import { CALIBRATED_MOVES } from './moves.js';

export const TOTAL_LEVELS = 60;

export const COLOR_NAMES = ['Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Mor'];

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each pattern returns true where a box should go. Boxes never fall, and they
// sit above the bottom row so the cubes around them keep moving.
const PATTERNS = {
  band: (r, c, rows, cols, depth) => r >= 5 && r < 5 + depth,
  pyramid: (r, c, rows, cols, depth) => {
    const fromBase = 7 - r;
    const mid = (cols - 1) / 2;
    return fromBase >= 0 && fromBase <= depth && Math.abs(c - mid) <= depth + 1.5 - fromBase;
  },
  pillars: (r, c, rows, cols, depth) => r >= 6 - depth && r <= 7 && c % 3 === 1,
  checker: (r, c, rows, cols, depth) => r >= 6 - depth && r <= 7 && (r + c) % 2 === 0,
  sides: (r, c, rows, cols, depth) => r >= 5 - depth && r <= 7 && (c === 1 || c === cols - 2),
  ring: (r, c, rows, cols, depth) => {
    const top = 4 - Math.min(depth, 2);
    const inside = r >= top && r <= 7 && c >= 1 && c <= cols - 2;
    const edge = r === top || r === 7 || c === 1 || c === cols - 2;
    return inside && edge;
  },
};
const PATTERN_ORDER = ['band', 'pyramid', 'pillars', 'checker', 'sides', 'ring'];

const COLOR_SCALE = 2.5;

const TUTORIAL = {
  1: { colors: 4, cols: 7, goals: [{ type: 'color', color: 0, count: 12 }] },
  2: { colors: 4, cols: 7, goals: [{ type: 'color', color: 1, count: 15 }, { type: 'color', color: 3, count: 15 }] },
  3: { colors: 4, cols: 7, boxPattern: 'band', boxDepth: 1 },
  4: { colors: 4, cols: 8, boxPattern: 'pyramid', boxDepth: 1, goals: [{ type: 'color', color: 2, count: 15 }] },
  5: { colors: 5, cols: 8, goals: [{ type: 'color', color: 0, count: 20 }, { type: 'color', color: 4, count: 20 }] },
};

export function getLevel(n) {
  const rng = mulberry32(n * 7919 + 13);
  const rows = 9;
  const t = Math.min(1, (n - 1) / 45); // difficulty ramp 0..1
  const hand = TUTORIAL[n];

  const cols = hand?.cols ?? 8;
  const colors = hand?.colors ?? 5;
  const hasBoxes = hand ? !!hand.boxPattern : n % 4 !== 2;
  const pattern = hand?.boxPattern ?? PATTERN_ORDER[(n * 5) % PATTERN_ORDER.length];
  const depth = hand?.boxDepth ?? 1 + Math.floor(t * 2.5 + rng() * 0.8);
  const hardBoxChance = n < 10 ? 0 : 0.15 + t * 0.45;

  const layout = [];
  let boxCount = 0;
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      if (hasBoxes && PATTERNS[pattern](r, c, rows, cols, depth)) {
        line += rng() < hardBoxChance ? 'B' : 'b';
        boxCount++;
      } else {
        line += '.';
      }
    }
    layout.push(line);
  }

  // Match-3 swaps with cascades collect many cubes per move, so colour
  // goals are scaled up from the base numbers below.
  let goals = hand?.goals ? hand.goals.map((g) => ({ ...g, count: Math.round((g.count * COLOR_SCALE) / 5) * 5 })) : null;
  if (!goals) {
    goals = [];
    const colorGoals = hasBoxes ? (rng() < 0.5 ? 1 : 0) : 2 + (rng() < t ? 1 : 0);
    const picked = new Set();
    while (picked.size < colorGoals) picked.add(Math.floor(rng() * colors));
    for (const color of picked) {
      goals.push({ type: 'color', color, count: Math.round(((15 + t * 12 + rng() * 5) * COLOR_SCALE) / 5) * 5 });
    }
  }
  if (hasBoxes) goals.push({ type: 'box', count: boxCount });

  const colorTotal = goals.reduce((sum, g) => sum + (g.type === 'color' ? g.count : 0), 0);
  const moves = CALIBRATED_MOVES[n - 1] ?? Math.round(12 + boxCount * 0.95 + colorTotal * 0.3 - t * 4);

  return { number: n, rows, cols, colors, moves, layout, goals };
}

// Stars are earned for finishing with moves to spare.
export function starsFor(level, movesLeft) {
  const ratio = movesLeft / level.moves;
  return 1 + (ratio >= 0.15 ? 1 : 0) + (ratio >= 0.3 ? 1 : 0);
}
