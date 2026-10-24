// Board logic for Küp Patlat. Pure state and rules, no DOM: the renderer reads
// the cell objects directly and keeps its own animation fields on them.
//
// Match-3 rules: swap two neighbouring cells; 3+ cubes of one colour in a
// row or column clear. A line of 4 leaves a rocket, an L/T shape a bomb and
// a line of 5 a disco ball. Swapping a booster fires it, swapping two
// boosters fires a combo.

let nextId = 1;
const make = (props) => ({ id: nextId++, ...props });

export const cube = (color) => make({ kind: 'cube', color });
export const box = (hp = 1) => make({ kind: 'box', hp, maxHp: hp });
export const rocket = (dir) => make({ kind: 'rocket', dir });
export const bomb = () => make({ kind: 'bomb' });
export const disco = (color) => make({ kind: 'disco', color });

export const isBooster = (cell) =>
  !!cell && (cell.kind === 'rocket' || cell.kind === 'bomb' || cell.kind === 'disco');

const isCube = (cell) => !!cell && cell.kind === 'cube';
const sameColor = (a, b) => isCube(a) && isCube(b) && a.color === b.color;

export const MAX_COLORS = 5;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Board {
  constructor(rows, cols, numColors, rng = Math.random) {
    this.rows = rows;
    this.cols = cols;
    this.numColors = numColors;
    this.rng = rng;
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  }

  // Layout chars: '.' random cube, '0'-'4' fixed cube, 'b'/'B' box with 1/2 hp,
  // 'H'/'V' rocket, 'X' bomb, 'D' disco.
  static fromLayout(layout, numColors, rng = Math.random) {
    const board = new Board(layout.length, layout[0].length, numColors, rng);
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        board.grid[r][c] = board.cellFromChar(layout[r][c]);
      }
    }
    board.fill();
    if (board.findMatches().length || !board.hasMoves()) board.shuffle();
    return board;
  }

  // Copy for look-ahead (used by the balance bot). Cells are shallow copies.
  clone() {
    const b = new Board(this.rows, this.cols, this.numColors, this.rng);
    b.grid = this.grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    return b;
  }

  cellFromChar(ch) {
    switch (ch) {
      case 'b': return box(1);
      case 'B': return box(2);
      case 'H': return rocket('h');
      case 'V': return rocket('v');
      case 'X': return bomb();
      case 'D': return disco(this.randomColor());
      default:
        if (ch >= '0' && ch <= '4') return cube(Number(ch));
        return null;
    }
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  get(r, c) {
    return this.inBounds(r, c) ? this.grid[r][c] : null;
  }

  randomColor() {
    return Math.floor(this.rng() * this.numColors);
  }

  // A colour that does not complete a line of 3 with the cells to the left
  // and above (used to build starting boards without free matches).
  safeColor(r, c) {
    const banned = new Set();
    const l1 = this.get(r, c - 1);
    const l2 = this.get(r, c - 2);
    if (sameColor(l1, l2)) banned.add(l1.color);
    const u1 = this.get(r - 1, c);
    const u2 = this.get(r - 2, c);
    if (sameColor(u1, u2)) banned.add(u1.color);
    const options = [];
    for (let k = 0; k < this.numColors; k++) if (!banned.has(k)) options.push(k);
    return options[Math.floor(this.rng() * options.length)];
  }

  fill() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c]) this.grid[r][c] = cube(this.safeColor(r, c));
      }
    }
  }

  forEach(fn) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) fn(this.grid[r][c], r, c);
    }
  }

  // Length of the same-colour line through (r, c) in each direction.
  lineAt(r, c) {
    const cell = this.get(r, c);
    if (!isCube(cell)) return { h: 0, v: 0 };
    let h = 1;
    for (let x = c - 1; sameColor(this.get(r, x), cell); x--) h++;
    for (let x = c + 1; sameColor(this.get(r, x), cell); x++) h++;
    let v = 1;
    for (let y = r - 1; sameColor(this.get(y, c), cell); y--) v++;
    for (let y = r + 1; sameColor(this.get(y, c), cell); y++) v++;
    return { h, v };
  }

  makesMatch(r, c) {
    const { h, v } = this.lineAt(r, c);
    return h >= 3 || v >= 3;
  }

  canSwap(r1, c1, r2, c2) {
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
    const a = this.get(r1, c1);
    const b = this.get(r2, c2);
    return !!a && !!b && a.kind !== 'box' && b.kind !== 'box';
  }

  swapCells(r1, c1, r2, c2) {
    const tmp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = tmp;
  }

  // A swap is legal if it involves a booster or creates a match.
  isValidSwap(r1, c1, r2, c2) {
    if (!this.canSwap(r1, c1, r2, c2)) return false;
    if (isBooster(this.grid[r1][c1]) || isBooster(this.grid[r2][c2])) return true;
    if (sameColor(this.grid[r1][c1], this.grid[r2][c2])) return false;
    this.swapCells(r1, c1, r2, c2);
    const ok = this.makesMatch(r1, c1) || this.makesMatch(r2, c2);
    this.swapCells(r1, c1, r2, c2);
    return ok;
  }

  validSwaps() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isValidSwap(r, c, r, c + 1)) out.push([r, c, r, c + 1]);
        if (this.isValidSwap(r, c, r + 1, c)) out.push([r, c, r + 1, c]);
      }
    }
    return out;
  }

  hasMoves() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isValidSwap(r, c, r, c + 1) || this.isValidSwap(r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  // Reassigns colours among the existing cubes until the board has no free
  // matches and at least one move. Cells keep their identity so the renderer
  // can animate them in place.
  shuffle() {
    const cubes = [];
    this.forEach((cell) => { if (isCube(cell)) cubes.push(cell); });
    const colors = cubes.map((cell) => cell.color);
    for (let attempt = 0; attempt < 100; attempt++) {
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      cubes.forEach((cell, i) => { cell.color = colors[i]; });
      if (!this.findMatches().length && this.hasMoves()) return true;
    }
    // Rare fallback: recolour every cube safely, then plant one sure move.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (isCube(this.grid[r][c])) {
          this.grid[r][c].color = -1;
          this.grid[r][c].color = this.safeColor(r, c);
        }
      }
    }
    if (this.hasMoves()) return true;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c + 3 < this.cols; c++) {
        const row = [0, 1, 2, 3].map((k) => this.grid[r][c + k]);
        if (row.every(isCube)) {
          // pattern X X . X: swapping the last two completes a line of 3
          row[0].color = row[1].color = row[3].color = 0;
          row[2].color = 1;
          return true;
        }
      }
    }
    return false;
  }

  // ---------- matches ----------

  // Returns match groups: connected sets of horizontal/vertical runs of 3+.
  findMatches() {
    const runs = [];
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        let e = c + 1;
        while (e < this.cols && sameColor(this.grid[r][e], this.grid[r][c])) e++;
        if (isCube(this.grid[r][c]) && e - c >= 3) {
          runs.push({ dir: 'h', cells: Array.from({ length: e - c }, (_, k) => [r, c + k]) });
        }
        c = e;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        let e = r + 1;
        while (e < this.rows && sameColor(this.grid[e][c], this.grid[r][c])) e++;
        if (isCube(this.grid[r][c]) && e - r >= 3) {
          runs.push({ dir: 'v', cells: Array.from({ length: e - r }, (_, k) => [r + k, c]) });
        }
        r = e;
      }
    }
    // Merge runs that share a cell (L and T shapes).
    const owner = new Map();
    const groups = [];
    for (const run of runs) {
      const touching = new Set();
      for (const [r, c] of run.cells) {
        const g = owner.get(r * this.cols + c);
        if (g) touching.add(g);
      }
      let group;
      if (touching.size === 0) {
        group = { runs: [], keys: new Set() };
        groups.push(group);
      } else {
        const [first, ...rest] = touching;
        group = first;
        for (const other of rest) {
          group.runs.push(...other.runs);
          for (const k of other.keys) { group.keys.add(k); owner.set(k, group); }
          groups.splice(groups.indexOf(other), 1);
        }
      }
      group.runs.push(run);
      for (const [r, c] of run.cells) {
        const k = r * this.cols + c;
        group.keys.add(k);
        owner.set(k, group);
      }
    }
    return groups;
  }

  // Clears every current match. `swapped` lists the cells the player just
  // moved, so a booster is created where the player made the match.
  clearMatches(swapped = []) {
    const groups = this.findMatches();
    if (!groups.length) return null;
    const res = this.newResult();
    const made = [];
    for (const group of groups) {
      const longest = group.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const hasH = group.runs.some((run) => run.dir === 'h');
      const hasV = group.runs.some((run) => run.dir === 'v');
      const [fr, fc] = longest.cells[0];
      const color = this.grid[fr][fc].color;
      let kind = null;
      if (longest.cells.length >= 5) kind = 'disco';
      else if (hasH && hasV) kind = 'bomb';
      else if (longest.cells.length === 4) kind = 'rocket';

      let spot = longest.cells[Math.floor(longest.cells.length / 2)];
      for (const [r, c] of swapped) {
        if (group.keys.has(r * this.cols + c)) spot = [r, c];
      }
      if (hasH && hasV && !swapped.some(([r, c]) => group.keys.has(r * this.cols + c))) {
        // the corner of an L/T is where its runs cross
        const crossing = [...group.keys].find((k) => group.runs.filter((run) => run.cells.some(([r, c]) => r * this.cols + c === k)).length > 1);
        if (crossing !== undefined) spot = [Math.floor(crossing / this.cols), crossing % this.cols];
      }

      const boxes = new Map();
      for (const k of group.keys) {
        const r = Math.floor(k / this.cols);
        const c = k % this.cols;
        if (!this.grid[r][c]) continue;
        this.remove(r, c, res, 0);
        for (const [dy, dx] of DIRS) {
          const n = this.get(r + dy, c + dx);
          if (n && n.kind === 'box') boxes.set((r + dy) * this.cols + c + dx, [r + dy, c + dx]);
        }
      }
      // Each neighbouring box takes one hit per match, however many cubes touch it.
      for (const [y, x] of boxes.values()) {
        if (this.grid[y][x]) this.damageBox(y, x, res, 0);
      }
      res.groupSize = Math.max(res.groupSize, group.keys.size);
      if (kind) {
        made.push({ kind, color, dir: longest.dir, spot });
        // The matched cubes fly into the new booster (renderer animation).
        res.merges.push({ r: spot[0], c: spot[1], from: [...group.keys].map((k) => [Math.floor(k / this.cols), k % this.cols]) });
      }
    }
    for (const { kind, color, dir, spot: [r, c] } of made) {
      if (this.grid[r][c]) continue;
      const cell = kind === 'disco' ? disco(color) : kind === 'bomb' ? bomb() : rocket(dir);
      this.grid[r][c] = cell;
      res.created = { cell, r, c };
      res.createdAll.push({ cell, r, c });
    }
    return res;
  }

  // Resolves a swap the player already made with swapCells. (r1, c1) is where
  // the dragged cell started; (r2, c2) is where it went.
  resolveSwap(r1, c1, r2, c2) {
    const a = this.grid[r1][c1];
    const b = this.grid[r2][c2];
    if (isBooster(a) && isBooster(b)) {
      return this.combo(r2, c2, [a, b], [[r1, c1], [r2, c2]]);
    }
    if (isBooster(a) || isBooster(b)) {
      const [br, bc, other] = isBooster(b) ? [r2, c2, a] : [r1, c1, b];
      const cell = this.grid[br][bc];
      // A disco ball clears the colour it was swapped with.
      if (cell.kind === 'disco' && isCube(other)) cell.color = other.color;
      const res = this.newResult();
      this.hit(br, bc, res, 0);
      this.runQueue(res);
      return res;
    }
    return this.clearMatches([[r1, c1], [r2, c2]]);
  }

  // Tapping a booster fires it on its own.
  tap(r, c) {
    const cell = this.get(r, c);
    if (!isBooster(cell)) return null;
    const res = this.newResult();
    this.hit(r, c, res, 0);
    this.runQueue(res);
    return res;
  }

  // Hammer power-up: destroys (or damages) exactly one cell.
  hammer(r, c) {
    if (!this.get(r, c)) return null;
    const res = this.newResult();
    this.hit(r, c, res, 0);
    this.runQueue(res);
    return res;
  }

  // ---------- boosters ----------

  newResult() {
    return {
      removed: [],
      damaged: [],
      effects: [],
      created: null,
      createdAll: [],
      merges: [],
      groupSize: 0,
      combo: false,
      collected: { colors: Array(MAX_COLORS).fill(0), boxes: 0 },
      queue: [],
    };
  }

  remove(r, c, res, wave) {
    const cell = this.grid[r][c];
    this.grid[r][c] = null;
    res.removed.push({ cell, r, c, wave });
    if (cell.kind === 'cube') res.collected.colors[cell.color]++;
    else if (cell.kind === 'box') res.collected.boxes++;
  }

  damageBox(r, c, res, wave) {
    const cell = this.grid[r][c];
    cell.hp--;
    if (cell.hp <= 0) this.remove(r, c, res, wave);
    else res.damaged.push({ cell, r, c, wave });
  }

  hit(r, c, res, wave) {
    const cell = this.get(r, c);
    if (!cell) return;
    if (cell.kind === 'box') {
      this.damageBox(r, c, res, wave);
    } else if (isBooster(cell)) {
      // Boosters caught in a blast go off themselves, one wave later.
      this.grid[r][c] = null;
      res.removed.push({ cell, r, c, wave });
      res.queue.push({ cell, r, c, wave: wave + 1 });
    } else {
      this.remove(r, c, res, wave);
    }
  }

  hitMany(cells, res, wave) {
    const seen = new Set();
    for (const [r, c] of cells) {
      const key = r * this.cols + c;
      if (seen.has(key)) continue;
      seen.add(key);
      this.hit(r, c, res, wave);
    }
  }

  // Two boosters swapped into each other fire a combo centred on (r, c).
  combo(r, c, cells, positions) {
    const res = this.newResult();
    res.combo = true;
    for (const [y, x] of positions) {
      res.removed.push({ cell: this.grid[y][x], r: y, c: x, wave: 0 });
      this.grid[y][x] = null;
    }
    const discos = cells.filter((k) => k.kind === 'disco');
    const bombs = cells.filter((k) => k.kind === 'bomb');

    if (discos.length >= 2) {
      res.effects.push({ type: 'nuke', r, c, wave: 0 });
      const all = [];
      this.forEach((_, y, x) => all.push([y, x]));
      this.hitMany(all, res, 1);
    } else if (discos.length === 1) {
      const color = this.mostCommonColor();
      const targets = [];
      this.forEach((cell, y, x) => {
        if (isCube(cell) && cell.color === color) targets.push([y, x]);
      });
      res.effects.push({ type: 'disco', r, c, color, targets, wave: 0 });
      // The cubes turn into boosters, but they still count toward color goals.
      res.collected.colors[color] += targets.length;
      for (const [y, x] of targets) {
        this.grid[y][x] = bombs.length ? bomb() : rocket(this.rng() < 0.5 ? 'h' : 'v');
      }
      this.hitMany(targets, res, 1);
    } else if (bombs.length >= 2) {
      res.effects.push({ type: 'bomb', r, c, radius: 3, wave: 0 });
      this.hitMany(this.area(r, c, 3), res, 0);
    } else if (bombs.length === 1) {
      res.effects.push({ type: 'bigcross', r, c, wave: 0 });
      const targets = [];
      for (let d = -1; d <= 1; d++) {
        targets.push(...this.line(r + d, c, 'h'), ...this.line(r, c + d, 'v'));
      }
      this.hitMany(targets, res, 0);
    } else {
      res.effects.push({ type: 'cross', r, c, wave: 0 });
      this.hitMany([...this.line(r, c, 'h'), ...this.line(r, c, 'v')], res, 0);
    }
    this.runQueue(res);
    return res;
  }

  line(r, c, dir) {
    const out = [];
    if (dir === 'h') {
      if (r < 0 || r >= this.rows) return out;
      for (let x = 0; x < this.cols; x++) out.push([r, x]);
    } else {
      if (c < 0 || c >= this.cols) return out;
      for (let y = 0; y < this.rows; y++) out.push([y, c]);
    }
    return out;
  }

  area(r, c, radius) {
    const out = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dy) + Math.abs(dx) <= radius + 1 && this.inBounds(r + dy, c + dx)) {
          out.push([r + dy, c + dx]);
        }
      }
    }
    return out;
  }

  mostCommonColor() {
    const counts = Array(MAX_COLORS).fill(0);
    this.forEach((cell) => { if (isCube(cell)) counts[cell.color]++; });
    return counts.indexOf(Math.max(...counts));
  }

  activate(cell, r, c, res, wave) {
    if (cell.kind === 'rocket') {
      res.effects.push({ type: 'rocket', dir: cell.dir, r, c, wave });
      this.hitMany(this.line(r, c, cell.dir), res, wave);
    } else if (cell.kind === 'bomb') {
      res.effects.push({ type: 'bomb', r, c, radius: 2, wave });
      this.hitMany(this.area(r, c, 2), res, wave);
    } else if (cell.kind === 'disco') {
      const color = cell.color ?? this.mostCommonColor();
      const targets = [];
      this.forEach((n, y, x) => {
        if (isCube(n) && n.color === color) targets.push([y, x]);
      });
      res.effects.push({ type: 'disco', r, c, color, targets, wave });
      this.hitMany(targets, res, wave);
    }
  }

  runQueue(res) {
    while (res.queue.length) {
      const { cell, r, c, wave } = res.queue.shift();
      this.activate(cell, r, c, res, wave);
    }
  }

  // Drops everything down and fills the gaps with new cubes from the top.
  // Boxes stay where they are; other cells slide down past them. Returns the
  // spawned cells; `drop` is how many cells the column refilled.
  applyGravity() {
    const spawned = [];
    for (let c = 0; c < this.cols; c++) {
      const slots = [];
      const movers = [];
      for (let r = 0; r < this.rows; r++) {
        const cell = this.grid[r][c];
        if (cell && cell.kind === 'box') continue;
        slots.push(r);
        if (cell) movers.push(cell);
      }
      const drop = slots.length - movers.length;
      slots.forEach((r, i) => {
        if (i >= drop) {
          this.grid[r][c] = movers[i - drop];
        } else {
          const cell = cube(this.randomColor());
          this.grid[r][c] = cell;
          spawned.push({ cell, r, c, drop });
        }
      });
    }
    return spawned;
  }
}
