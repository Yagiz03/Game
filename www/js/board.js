// Board logic for Küp Patlat. Pure state and rules, no DOM: the renderer reads
// the cell objects directly and keeps its own animation fields on them.

let nextId = 1;
const make = (props) => ({ id: nextId++, ...props });

export const cube = (color) => make({ kind: 'cube', color });
export const box = (hp = 1) => make({ kind: 'box', hp, maxHp: hp });
export const rocket = (dir) => make({ kind: 'rocket', dir });
export const bomb = () => make({ kind: 'bomb' });
export const disco = (color) => make({ kind: 'disco', color });

export const isBooster = (cell) =>
  !!cell && (cell.kind === 'rocket' || cell.kind === 'bomb' || cell.kind === 'disco');

// Group sizes that leave a booster behind (same thresholds as the genre standard).
export const ROCKET_MIN = 5;
export const BOMB_MIN = 7;
export const DISCO_MIN = 9;

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
    if (!board.hasMoves()) board.shuffle();
    return board;
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

  fill() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c]) this.grid[r][c] = cube(this.randomColor());
      }
    }
  }

  forEach(fn) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) fn(this.grid[r][c], r, c);
    }
  }

  flood(r, c, match) {
    if (!match(this.get(r, c))) return [];
    const seen = new Set([r * this.cols + c]);
    const out = [];
    const stack = [[r, c]];
    while (stack.length) {
      const [y, x] = stack.pop();
      out.push([y, x]);
      for (const [dy, dx] of DIRS) {
        const ny = y + dy;
        const nx = x + dx;
        const key = ny * this.cols + nx;
        if (!seen.has(key) && match(this.get(ny, nx))) {
          seen.add(key);
          stack.push([ny, nx]);
        }
      }
    }
    return out;
  }

  findGroup(r, c) {
    const start = this.get(r, c);
    if (!start || start.kind !== 'cube') return [];
    return this.flood(r, c, (n) => !!n && n.kind === 'cube' && n.color === start.color);
  }

  boosterGroup(r, c) {
    return this.flood(r, c, isBooster);
  }

  hasMoves() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (isBooster(cell)) return true;
        if (cell && cell.kind === 'cube') {
          const right = this.get(r, c + 1);
          const down = this.get(r + 1, c);
          if (right && right.kind === 'cube' && right.color === cell.color) return true;
          if (down && down.kind === 'cube' && down.color === cell.color) return true;
        }
      }
    }
    return false;
  }

  // Reassigns colors among the existing cubes until a move exists. Cells keep
  // their identity so the renderer can animate them in place.
  shuffle() {
    const cubes = [];
    this.forEach((cell) => { if (cell && cell.kind === 'cube') cubes.push(cell); });
    const colors = cubes.map((cell) => cell.color);
    for (let attempt = 0; attempt < 50; attempt++) {
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      cubes.forEach((cell, i) => { cell.color = colors[i]; });
      if (this.hasMoves()) return true;
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell || cell.kind !== 'cube') continue;
        for (const n of [this.get(r, c + 1), this.get(r + 1, c)]) {
          if (n && n.kind === 'cube') {
            n.color = cell.color;
            return true;
          }
        }
      }
    }
    return false;
  }

  // Player taps a cell. Returns a result describing everything that happened,
  // or null when the tap is not a legal move.
  tap(r, c) {
    const cell = this.get(r, c);
    if (!cell) return null;
    if (cell.kind === 'cube') return this.blastGroup(r, c);
    if (isBooster(cell)) return this.fireBooster(r, c);
    return null;
  }

  // Hammer power-up: destroys (or damages) exactly one cell.
  hammer(r, c) {
    if (!this.get(r, c)) return null;
    const res = this.newResult();
    this.hit(r, c, res, 0);
    this.runQueue(res);
    return res;
  }

  newResult() {
    return {
      removed: [],
      damaged: [],
      effects: [],
      created: null,
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

  blastGroup(r, c) {
    const group = this.findGroup(r, c);
    if (group.length < 2) return null;
    const res = this.newResult();
    const color = this.grid[r][c].color;
    const boxes = new Map();
    for (const [y, x] of group) {
      this.remove(y, x, res, 0);
      for (const [dy, dx] of DIRS) {
        const n = this.get(y + dy, x + dx);
        if (n && n.kind === 'box') boxes.set((y + dy) * this.cols + x + dx, [y + dy, x + dx]);
      }
    }
    // Each neighbouring box takes one hit per blast, however many cubes touch it.
    for (const [y, x] of boxes.values()) {
      if (this.grid[y][x]) this.damageBox(y, x, res, 0);
    }
    const size = group.length;
    let made = null;
    if (size >= DISCO_MIN) made = disco(color);
    else if (size >= BOMB_MIN) made = bomb();
    else if (size >= ROCKET_MIN) made = rocket(this.rng() < 0.5 ? 'h' : 'v');
    if (made) {
      this.grid[r][c] = made;
      res.created = { cell: made, r, c };
    }
    res.groupSize = size;
    return res;
  }

  fireBooster(r, c) {
    const res = this.newResult();
    const group = this.boosterGroup(r, c);
    if (group.length === 1) {
      this.hit(r, c, res, 0);
      this.runQueue(res);
      return res;
    }

    // Touching boosters merge into a combo centred on the tapped cell.
    res.combo = true;
    const cells = group.map(([y, x]) => this.grid[y][x]);
    for (const [y, x] of group) {
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
      const color = discos[0].color;
      const targets = [];
      this.forEach((cell, y, x) => {
        if (cell && cell.kind === 'cube' && cell.color === color) targets.push([y, x]);
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
    this.forEach((cell) => { if (cell && cell.kind === 'cube') counts[cell.color]++; });
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
        if (n && n.kind === 'cube' && n.color === color) targets.push([y, x]);
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
