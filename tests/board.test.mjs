import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, rocket, disco } from '../www/js/board.js';
import { getLevel, TOTAL_LEVELS, starsFor } from '../www/js/levels.js';

// Builds a board from rows of chars without random filling.
function board(rows, numColors = 5) {
  const b = new Board(rows.length, rows[0].length, numColors, () => 0);
  rows.forEach((line, r) => [...line].forEach((ch, c) => { b.grid[r][c] = b.cellFromChar(ch); }));
  return b;
}

const kinds = (b) => b.grid.map((row) => row.map((cell) => {
  if (!cell) return '_';
  if (cell.kind === 'cube') return String(cell.color);
  return { box: 'b', rocket: 'R', bomb: 'X', disco: 'D' }[cell.kind];
}).join(''));

function play(b, r1, c1, r2, c2) {
  assert.ok(b.isValidSwap(r1, c1, r2, c2), 'swap should be valid');
  b.swapCells(r1, c1, r2, c2);
  return b.resolveSwap(r1, c1, r2, c2);
}

test('a swap is only valid when it makes a match', () => {
  const b = board(['0010', '1201', '2312']);
  assert.equal(b.isValidSwap(0, 2, 0, 3), true);
  assert.equal(b.isValidSwap(2, 0, 2, 1), false);
  assert.equal(b.isValidSwap(0, 0, 1, 1), false, 'diagonal');
});

test('swapping clears the line of 3 and collects it', () => {
  const b = board(['0010', '1201', '2312']);
  const res = play(b, 0, 2, 0, 3);
  assert.equal(res.collected.colors[0], 3);
  assert.equal(kinds(b)[0], '___1');
});

test('line of 4 makes a rocket where the player moved', () => {
  const b = board(['00010', '12301', '23412']);
  const res = play(b, 0, 3, 0, 4);
  assert.equal(res.created.cell.kind, 'rocket');
  assert.deepEqual([res.created.r, res.created.c], [0, 3]);
});

test('L shape makes a bomb', () => {
  const b = board(['00203', '14031', '23042']);
  const res = play(b, 0, 2, 0, 3);
  assert.equal(res.created.cell.kind, 'bomb');
});

test('line of 5 makes a disco ball of that color', () => {
  const b = board(['001001', '120312', '231423']);
  const res = play(b, 1, 2, 0, 2);
  assert.equal(res.created.cell.kind, 'disco');
  assert.equal(res.created.cell.color, 0);
});

test('matches damage each neighbouring box once', () => {
  const b = board(['0010', 'bBb2', '1231']);
  const res = play(b, 0, 2, 0, 3);
  assert.equal(res.collected.boxes, 2, 'both soft boxes break');
  assert.equal(b.grid[1][1].hp, 1, 'hard box loses one hp');
});

test('boxes cannot be swapped', () => {
  const b = board(['0b0', '101']);
  assert.equal(b.isValidSwap(0, 0, 0, 1), false);
});

test('swapping a rocket fires it along its line', () => {
  const b = board(['12121', '2H212', '12121']);
  const res = play(b, 1, 1, 1, 2);
  assert.ok(res.effects.some((e) => e.type === 'rocket'));
  assert.equal(kinds(b)[1], '_____');
});

test('disco swapped with a cube clears that color', () => {
  const b = board(['0101', '1D10', '0101']);
  b.grid[1][1] = disco(3);
  const res = play(b, 1, 1, 1, 2);
  assert.equal(res.collected.colors[1], 6);
  b.forEach((cell) => assert.ok(!(cell?.kind === 'cube' && cell.color === 1)));
});

test('two boosters swapped together fire a combo', () => {
  const b = board(['12121', '2HX12', '12121']);
  const res = play(b, 1, 1, 1, 2);
  assert.equal(res.combo, true);
  assert.ok(res.effects.some((e) => e.type === 'bigcross'));
});

test('tapping a booster fires it; tapping a cube does nothing', () => {
  const b = board(['121', '2V2', '121']);
  b.grid[1][1] = rocket('v');
  assert.equal(b.tap(0, 0), null);
  b.tap(1, 1);
  assert.deepEqual(kinds(b).map((row) => row[1]), ['_', '_', '_']);
});

test('cascades: matches formed by falling cubes are found and cleared', () => {
  const b = board(['1', '0', '2', '0', '0']);
  b.grid[2][0] = null;
  b.applyGravity(); // refills with color 0 -> column 0 1 0 0 0
  assert.equal(b.findMatches().length, 1);
  assert.equal(b.clearMatches().collected.colors[0], 3);
});

test('gravity keeps boxes fixed and drops cells past them', () => {
  const b = board(['0', 'b', '1']);
  const top = b.grid[0][0];
  const boxCell = b.grid[1][0];
  b.grid[2][0] = null;
  b.applyGravity();
  assert.equal(b.grid[1][0], boxCell);
  assert.equal(b.grid[2][0], top);
});

test('shuffle leaves no free matches and at least one move', () => {
  const b = board(['0123', '1230', '2301', '3012']);
  b.rng = Math.random;
  assert.equal(b.shuffle(), true);
  assert.equal(b.hasMoves(), true);
  assert.equal(b.findMatches().length, 0);
});

test('hammer destroys one cell', () => {
  const b = board(['01', '10']);
  const res = b.hammer(0, 0);
  assert.equal(res.removed.length, 1);
  assert.equal(b.grid[0][0], null);
});

test('every level starts with no free matches and a valid move', () => {
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const level = getLevel(n);
    assert.equal(level.layout.length, level.rows);
    assert.ok(level.goals.length >= 1, `level ${n} has goals`);
    assert.ok(level.moves >= 10, `level ${n} has moves`);
    const b = Board.fromLayout(level.layout, level.colors);
    assert.ok(b.hasMoves(), `level ${n} starts playable`);
    assert.equal(b.findMatches().length, 0, `level ${n} has no free matches`);
    assert.deepEqual(getLevel(n), level, 'levels are deterministic');
  }
});

test('stars reward moves left', () => {
  const level = { moves: 20 };
  assert.equal(starsFor(level, 0), 1);
  assert.equal(starsFor(level, 3), 2);
  assert.equal(starsFor(level, 6), 3);
});
