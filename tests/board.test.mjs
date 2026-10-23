import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, cube, box, rocket, bomb, disco } from '../www/js/board.js';
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

test('findGroup collects connected same-color cubes only', () => {
  const b = board(['001', '012', '222']);
  assert.equal(b.findGroup(0, 0).length, 3);
  assert.equal(b.findGroup(2, 0).length, 4);
  assert.equal(b.findGroup(0, 2).length, 1);
});

test('single cube tap is not a move', () => {
  const b = board(['01', '10']);
  assert.equal(b.tap(0, 0), null);
  assert.equal(b.hasMoves(), false);
});

test('blast removes the group and damages each adjacent box once', () => {
  const b = board(['00B', '00b', '111']);
  const res = b.tap(0, 0);
  assert.equal(res.groupSize, 4);
  assert.equal(res.collected.colors[0], 4);
  assert.equal(res.collected.boxes, 1);
  assert.equal(b.grid[0][2].hp, 1, 'hard box loses one hp');
  assert.equal(b.grid[1][2], null, 'soft box destroyed');
});

test('group sizes create rocket, bomb and disco', () => {
  let b = board(['00000', '12121']);
  assert.equal(b.tap(0, 2).created.cell.kind, 'rocket');
  b = board(['0000000', '1212121']);
  assert.equal(b.tap(0, 0).created.cell.kind, 'bomb');
  b = board(['000000000', '121212121']);
  const res = b.tap(0, 4);
  assert.equal(res.created.cell.kind, 'disco');
  assert.equal(res.created.cell.color, 0);
});

test('rocket clears its row and chains into other boosters', () => {
  const b = board(['12121', '1H121', '2X212', '12121']);
  const res = b.tap(1, 1);
  assert.ok(res);
  assert.equal(res.combo, true, 'touching rocket+bomb forms a combo');
  // Rocket alone:
  const b2 = board(['12121', 'H2121', '21212']);
  b2.tap(1, 0);
  assert.equal(kinds(b2)[1], '_____');
  assert.equal(kinds(b2)[0], '12121');
});

test('booster caught in a blast activates', () => {
  const b = board(['1212', 'H12V', '2121']);
  b.grid[1][3] = rocket('v');
  b.tap(1, 0);
  // horizontal rocket hits the vertical rocket at column 3, which clears that column
  assert.deepEqual(kinds(b).map((row) => row[3]), ['_', '_', '_']);
});

test('disco removes every cube of its color', () => {
  const b = board(['0101', '1D10', '0101']);
  b.grid[1][1] = disco(0);
  const res = b.tap(1, 1);
  assert.equal(res.collected.colors[0], 5);
  b.forEach((cell) => assert.ok(!cell || cell.color !== 0));
});

test('disco + rocket combo counts converted cubes toward goals', () => {
  const b = board(['0101', 'DH10', '0101']);
  b.grid[1][0] = disco(0);
  const res = b.tap(1, 0);
  assert.ok(res.combo);
  assert.ok(res.collected.colors[0] >= 5);
});

test('gravity compacts columns and refills from the top', () => {
  const b = board(['0', '1', '2']);
  const top = b.grid[0][0];
  b.grid[2][0] = null;
  const spawned = b.applyGravity();
  assert.equal(b.grid[1][0], top);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].drop, 1);
  b.forEach((cell) => assert.ok(cell));
});

test('boxes stay put while cubes fall past them', () => {
  const b = board(['0', 'b', '1']);
  const top = b.grid[0][0];
  const boxCell = b.grid[1][0];
  b.grid[2][0] = null;
  b.applyGravity();
  assert.equal(b.grid[1][0], boxCell);
  assert.equal(b.grid[2][0], top);
  assert.equal(b.grid[0][0].kind, 'cube');
});

test('shuffle always leaves a valid move', () => {
  const b = board(['0123', '1230', '2301', '3012']);
  assert.equal(b.hasMoves(), false);
  b.rng = Math.random;
  assert.equal(b.shuffle(), true);
  assert.equal(b.hasMoves(), true);
});

test('hammer destroys one cell without needing a group', () => {
  const b = board(['01', '10']);
  const res = b.hammer(0, 0);
  assert.equal(res.removed.length, 1);
  assert.equal(b.grid[0][0], null);
});

test('every level is well formed', () => {
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const level = getLevel(n);
    assert.equal(level.layout.length, level.rows);
    level.layout.forEach((line) => assert.equal(line.length, level.cols));
    assert.ok(level.goals.length >= 1, `level ${n} has goals`);
    assert.ok(level.moves >= 10, `level ${n} has moves`);
    const b = Board.fromLayout(level.layout, level.colors);
    assert.ok(b.hasMoves(), `level ${n} starts playable`);
    assert.deepEqual(getLevel(n), level, 'levels are deterministic');
  }
});

test('stars reward moves left', () => {
  const level = { moves: 20 };
  assert.equal(starsFor(level, 0), 1);
  assert.equal(starsFor(level, 3), 2);
  assert.equal(starsFor(level, 6), 3);
});

void cube; void box; void bomb;
