// Canvas renderer: draws the board procedurally (no image assets) and runs
// all animation: falling cells, booster effects, particles and floating text.
// Animation state lives on the cell objects themselves (vr, vel, pop, ...).

export const PALETTE = [
  { base: '#ff4d6d', light: '#ffa3b5', dark: '#c9184a' },
  { base: '#3a86ff', light: '#9cc9ff', dark: '#1d4ed8' },
  { base: '#2fd16b', light: '#9df5b9', dark: '#13803d' },
  { base: '#ffc53d', light: '#ffe9a3', dark: '#d48806' },
  { base: '#a855f7', light: '#dcc0ff', dark: '#7e22ce' },
];

const GRAVITY = 95; // rows per second squared

// Rendered sprites in www/img (see tools/cut_sprites.py). Any sprite that
// fails to load falls back to the procedural drawing below.
const SPRITE_NAMES = ['cube0', 'cube1', 'cube2', 'cube3', 'cube4', 'box', 'box2', 'rocket', 'bomb', 'disco'];
const sprites = {};

export function loadSprites(base = 'img/') {
  return Promise.all(SPRITE_NAMES.map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sprites[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `${base}${name}.png`;
  })));
}

function drawSprite(ctx, name, size) {
  const img = sprites[name];
  if (!img) return false;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  return true;
}
const WAVE_GAP = 0.13; // seconds between chained booster waves

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSymbol(ctx, color, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  const k = s * 0.17;
  switch (color) {
    case 0: // heart
      ctx.moveTo(0, k * 1.1);
      ctx.bezierCurveTo(-k * 1.9, -k * 0.2, -k * 0.9, -k * 1.6, 0, -k * 0.5);
      ctx.bezierCurveTo(k * 0.9, -k * 1.6, k * 1.9, -k * 0.2, 0, k * 1.1);
      break;
    case 1: // diamond
      ctx.moveTo(0, -k * 1.2); ctx.lineTo(k, 0); ctx.lineTo(0, k * 1.2); ctx.lineTo(-k, 0);
      break;
    case 2: // leaf / triangle
      ctx.moveTo(0, -k * 1.1); ctx.lineTo(k * 1.1, k * 0.9); ctx.lineTo(-k * 1.1, k * 0.9);
      break;
    case 3: // star
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? k * 0.5 : k * 1.2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      break;
    default: // circle
      ctx.arc(0, 0, k, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCube(ctx, color, s) {
  const p = PALETTE[color];
  const w = s * 0.9;
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, p.light);
  g.addColorStop(0.45, p.base);
  g.addColorStop(1, p.dark);
  roundRect(ctx, -w / 2, -w / 2, w, w, w * 0.22);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();
  // glossy highlight
  roundRect(ctx, -w * 0.38, -w * 0.42, w * 0.76, w * 0.3, w * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  drawSymbol(ctx, color, s);
}

function drawBox(ctx, cell, s) {
  const w = s * 0.94;
  const hard = cell.maxHp > 1;
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, hard ? '#c48a4a' : '#e9b86b');
  g.addColorStop(1, hard ? '#7a4a1e' : '#b07636');
  roundRect(ctx, -w / 2, -w / 2, w, w, w * 0.12);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = '#5c3711';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(92,55,17,0.6)';
  ctx.lineWidth = s * 0.035;
  for (const y of [-w / 6, w / 6]) {
    ctx.beginPath(); ctx.moveTo(-w * 0.42, y); ctx.lineTo(w * 0.42, y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-w * 0.38, -w * 0.38); ctx.lineTo(w * 0.38, w * 0.38); ctx.stroke();
  if (hard) {
    ctx.fillStyle = '#9aa5b1';
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      roundRect(ctx, x * w * 0.5 - (x > 0 ? w * 0.26 : 0), y * w * 0.5 - (y > 0 ? w * 0.26 : 0), w * 0.26, w * 0.26, w * 0.06);
      ctx.fill();
    }
    ctx.fillStyle = '#5d6b78';
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.arc(x * w * 0.37, y * w * 0.37, s * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    if (cell.hp < cell.maxHp) drawCrack(ctx, s);
  }
}

function drawCrack(ctx, s) {
  const w = s * 0.94;
  ctx.strokeStyle = 'rgba(40,20,5,0.9)';
  ctx.lineWidth = s * 0.045;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, -w * 0.45); ctx.lineTo(w * 0.05, -w * 0.1); ctx.lineTo(-w * 0.12, w * 0.12); ctx.lineTo(w * 0.08, w * 0.45);
  ctx.stroke();
}

function drawRocket(ctx, cell, s, t) {
  if (cell.dir === 'v') ctx.rotate(Math.PI / 2);
  const L = s * 0.86;
  const H = s * 0.36;
  // flames at both ends
  const f = 0.8 + Math.sin(t * 30) * 0.2;
  ctx.fillStyle = '#ffd166';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * L * 0.32, -H * 0.3);
    ctx.lineTo(dir * L * (0.5 + 0.08 * f), 0);
    ctx.lineTo(dir * L * 0.32, H * 0.3);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
  g.addColorStop(0, '#ff8a8a');
  g.addColorStop(0.5, '#ef233c');
  g.addColorStop(1, '#a4161a');
  roundRect(ctx, -L * 0.36, -H / 2, L * 0.72, H, H / 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-L * 0.12, -H / 2, L * 0.08, H);
  ctx.fillRect(L * 0.04, -H / 2, L * 0.08, H);
  ctx.beginPath();
  ctx.arc(0, 0, H * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = '#48cae4';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
}

function drawBomb(ctx, s, t) {
  const R = s * 0.34;
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(R * 0.5, -R * 0.75);
  ctx.quadraticCurveTo(R * 0.9, -R * 1.35, R * 1.25, -R * 1.05);
  ctx.stroke();
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#6b7280');
  g.addColorStop(1, '#111827');
  ctx.beginPath();
  ctx.arc(0, R * 0.08, R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#374151';
  roundRect(ctx, R * 0.15, -R * 0.95, R * 0.55, R * 0.4, R * 0.1);
  ctx.fill();
  // spark
  const k = s * (0.09 + 0.04 * Math.sin(t * 25));
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + t * 4;
    const rad = i % 2 ? k * 0.4 : k;
    ctx.lineTo(R * 1.25 + Math.cos(a) * rad, -R * 1.05 + Math.sin(a) * rad);
  }
  ctx.fill();
}

function drawDisco(ctx, cell, s, t) {
  const R = s * 0.4;
  ctx.save();
  ctx.rotate(t * 1.5);
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, (i * Math.PI) / 5, ((i + 1) * Math.PI) / 5);
    ctx.fillStyle = PALETTE[i % 5].base;
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = s * 0.06;
  ctx.strokeStyle = PALETTE[cell.color ?? 0].base;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE[cell.color ?? 0].base;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
}

// Draws one cell centred on the current origin.
export function drawCell(ctx, cell, s, t = 0) {
  switch (cell.kind) {
    case 'cube':
      if (!drawSprite(ctx, `cube${cell.color}`, s * 0.98)) drawCube(ctx, cell.color, s);
      break;
    case 'box':
      if (drawSprite(ctx, cell.maxHp > 1 ? 'box2' : 'box', s * 0.98)) {
        if (cell.hp < cell.maxHp) drawCrack(ctx, s);
      } else {
        drawBox(ctx, cell, s);
      }
      break;
    case 'rocket':
      if (sprites.rocket) {
        if (cell.dir === 'v') ctx.rotate(-Math.PI / 2);
        drawSprite(ctx, 'rocket', s * 1.05);
      } else {
        drawRocket(ctx, cell, s, t);
      }
      break;
    case 'bomb':
      if (sprites.bomb) {
        const k = 1 + Math.sin(t * 9) * 0.035;
        ctx.scale(k, k);
        drawSprite(ctx, 'bomb', s * 0.9);
      } else {
        drawBomb(ctx, s, t);
      }
      break;
    case 'disco':
      if (sprites.disco) {
        ctx.rotate(Math.sin(t * 2) * 0.2);
        drawSprite(ctx, 'disco', s * 0.9);
        drawColorRing(ctx, cell.color ?? 0, s);
      } else {
        drawDisco(ctx, cell, s, t);
      }
      break;
  }
}

// Small badge showing which color a disco ball will clear.
function drawColorRing(ctx, color, s) {
  ctx.beginPath();
  ctx.arc(s * 0.28, s * 0.28, s * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE[color].base;
  ctx.fill();
  ctx.lineWidth = s * 0.04;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

// Renders a cell into a small standalone canvas (used for HUD goal icons).
export function iconCanvas(cell, size = 40) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  drawCell(ctx, cell, size);
  return canvas;
}

const particleColor = (cell) => {
  if (cell.kind === 'cube') return PALETTE[cell.color].base;
  if (cell.kind === 'box') return '#c0874a';
  return '#ffd166';
};

const POP_TIME = 0.2; // a cleared cell swells, flashes white and bursts
const MERGE_TIME = 0.2; // matched cubes sliding into a new booster
const SWEEP = 0.035; // seconds per cell for rocket and blast fronts

const easeOutBack = (p) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = null;
    this.particles = [];
    this.effects = [];
    this.texts = [];
    this.dying = [];
    this.timers = [];
    this.hint = null;
    this.armed = false;
    this.time = 0;
    this.shakeAmt = 0;
    this.flash = 0;
    this.nextShine = 1;
    this.onTap = null;
    this.onSwipe = null;
    this.selected = null;
    this.drag = null;
    this.frame = this.frame.bind(this);
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    canvas.addEventListener('pointerup', () => this.pointerUp());
    canvas.addEventListener('pointercancel', () => { this.drag = null; });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  setBoard(board) {
    this.board = board;
    this.particles = [];
    this.effects = [];
    this.texts = [];
    this.dying = [];
    this.timers = [];
    this.hint = null;
    this.selected = null;
    this.drag = null;
    // Intro: every column drops in from above, left to right.
    board.forEach((cell, r, c) => {
      if (!cell) return;
      if (cell.kind === 'box') {
        cell.vr = r;
        cell.pop = 0;
        cell.delay = 0.25 + c * 0.03;
        cell.popIn = 1;
      } else {
        cell.vr = r - board.rows - 0.5;
        cell.vel = 0;
        cell.delay = c * 0.04 + (board.rows - r) * 0.015;
      }
    });
    this.layout();
  }

  resize() {
    const parent = this.canvas.parentElement;
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.layout();
  }

  layout() {
    // The game screen is display:none while the map is shown; keep the last
    // good layout instead of computing a negative cell size.
    if (!this.board || this.w <= 0 || this.h <= 0) return;
    const pad = 14;
    const { rows, cols } = this.board;
    this.size = Math.floor(Math.min((this.w - pad * 2) / cols, (this.h - pad * 2) / rows));
    this.ox = Math.round((this.w - this.size * cols) / 2);
    this.oy = Math.round((this.h - this.size * rows) / 2);
  }

  center(r, c) {
    return { x: this.ox + (c + 0.5) * this.size, y: this.oy + (r + 0.5) * this.size };
  }

  // Page coordinates of a cell centre (for DOM animations over the canvas).
  screenPos(r, c) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.center(r, c);
    return { x: rect.left + x, y: rect.top + y };
  }

  // Pointer input: a drag of a third of a cell is a swipe toward that
  // neighbour; a press released without dragging is a tap.
  pointerDown(e) {
    if (!this.board) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor((x - this.ox) / this.size);
    const r = Math.floor((y - this.oy) / this.size);
    if (!this.board.inBounds(r, c)) return;
    this.drag = { r, c, x, y, moved: false };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d || d.moved) return;
    const rect = this.canvas.getBoundingClientRect();
    const dx = e.clientX - rect.left - d.x;
    const dy = e.clientY - rect.top - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.size * 0.3) return;
    d.moved = true;
    const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    this.onSwipe?.(d.r, d.c, dr, dc);
  }

  pointerUp() {
    const d = this.drag;
    this.drag = null;
    if (d && !d.moved) this.onTap?.(d.r, d.c);
  }

  // Swap animation: the cell glides from its old spot to where it now is.
  slide(cell, fromR, fromC, dur = 0.16) {
    cell.tw = { fromR, fromC, t: 0, dur, back: false };
    cell.vr = undefined;
  }

  // Rejected swap: the cell nudges toward (toR, toC) and comes back.
  bounce(cell, toR, toC, dur = 0.3) {
    cell.tw = { toR, toC, t: 0, dur, back: true };
  }

  after(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  isSettled() {
    if (this.effects.length || this.dying.length || this.timers.length) return false;
    let settled = true;
    this.board.forEach((cell, r) => {
      if (cell && (cell.delay > 0 || cell.vr < r || cell.tw || cell.popDelay > 0)) settled = false;
    });
    return settled;
  }

  // How long after its wave a cell at (r, c) is reached by the blast fronts
  // of this wave's effects: rockets sweep outward, bombs ripple, disco
  // lightning strikes its targets one by one.
  sweepDelay(effects, r, c) {
    let best = Infinity;
    for (const e of effects) {
      let d = Infinity;
      switch (e.type) {
        case 'rocket':
          if (e.dir === 'h' && e.r === r) d = Math.abs(c - e.c) * SWEEP;
          if (e.dir === 'v' && e.c === c) d = Math.abs(r - e.r) * SWEEP;
          break;
        case 'cross':
          if (e.r === r) d = Math.abs(c - e.c) * SWEEP;
          else if (e.c === c) d = Math.abs(r - e.r) * SWEEP;
          break;
        case 'bigcross':
          if (Math.abs(e.r - r) <= 1) d = Math.abs(c - e.c) * SWEEP;
          if (Math.abs(e.c - c) <= 1) d = Math.min(d, Math.abs(r - e.r) * SWEEP);
          break;
        case 'bomb':
        case 'nuke':
          d = Math.hypot(r - e.r, c - e.c) * SWEEP;
          break;
        case 'disco': {
          const i = e.targets.findIndex(([y, x]) => y === r && x === c);
          if (i >= 0) d = 0.12 + i * 0.018;
          break;
        }
      }
      best = Math.min(best, d);
    }
    return best === Infinity ? 0 : best;
  }

  // Animates a Board result. Returns the seconds to wait before gravity runs.
  playResult(res) {
    const waves = new Map();
    for (const e of res.effects) {
      if (!waves.has(e.wave)) waves.set(e.wave, []);
      waves.get(e.wave).push(e);
    }
    const mergeTo = new Map();
    for (const m of res.merges || []) {
      for (const [r, c] of m.from) {
        if (r !== m.r || c !== m.c) mergeTo.set(`${r},${c}`, m);
      }
    }
    let end = 0.1;
    for (const { cell, r, c, wave } of res.removed) {
      const delay = wave * WAVE_GAP + this.sweepDelay(waves.get(wave) || [], r, c);
      const m = mergeTo.get(`${r},${c}`);
      this.dying.push({
        cell, r, c,
        start: this.time + delay,
        mode: m ? 'merge' : 'pop',
        toR: m?.r, toC: m?.c,
      });
      end = Math.max(end, delay + (m ? MERGE_TIME : POP_TIME));
    }
    for (const { cell, r, c, wave } of res.damaged) {
      const delay = wave * WAVE_GAP + this.sweepDelay(waves.get(wave) || [], r, c);
      this.after(delay, () => { cell.shake = 0.3; this.chips(r, c, 5); });
    }
    for (const e of res.effects) {
      const dur = { disco: 0.25 + e.targets?.length * 0.018 + 0.2, nuke: 0.8, bomb: 0.55, bigcross: 0.5 }[e.type] ?? 0.45;
      this.effects.push({ ...e, t: -e.wave * WAVE_GAP, dur, started: false });
    }
    for (const { cell, r } of res.createdAll || (res.created ? [res.created] : [])) {
      cell.vr = r;
      cell.popIn = 1;
      cell.popDelay = res.merges?.length ? MERGE_TIME : 0;
    }
    if (res.groupSize >= 5 || res.combo) {
      const at = res.created ? this.center(res.created.r, res.created.c) : { x: this.w / 2, y: this.h / 2 };
      const label = res.combo ? 'KOMBO!' : res.groupSize >= 7 ? 'MUHTEŞEM!' : res.groupSize >= 6 ? 'SÜPER!' : 'HARİKA!';
      this.floatText(label, at.x, at.y);
    }
    return end + 0.04;
  }

  // ---------- particles ----------

  burst(r, c, cell) {
    const { x, y } = this.center(r, c);
    const s = this.size;
    const color = particleColor(cell);
    if (cell.kind === 'box') {
      this.chips(r, c, 12);
      this.smoke(x, y, 3, 0.5);
      return;
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = s * (2.5 + Math.random() * 4);
      this.particles.push({
        kind: 'shard', x, y, color,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - s * 3,
        life: 0.55 + Math.random() * 0.3, max: 0.85,
        size: s * (0.09 + Math.random() * 0.09),
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * 16,
      });
    }
    this.sparks(x, y, 5, color);
  }

  sparks(x, y, n, color = '#fff6c2', speed = 5) {
    const s = this.size;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = s * (1 + Math.random() * speed);
      this.particles.push({
        kind: 'spark', x, y, color,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.35, max: 0.65,
        size: s * (0.1 + Math.random() * 0.12),
        rot: Math.random() * 6, spin: 6,
      });
    }
  }

  smoke(x, y, n, spread = 0.3) {
    const s = this.size;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'smoke',
        x: x + (Math.random() - 0.5) * s * spread,
        y: y + (Math.random() - 0.5) * s * spread,
        vx: (Math.random() - 0.5) * s * 0.8, vy: -s * (0.3 + Math.random() * 0.6),
        life: 0.5 + Math.random() * 0.4, max: 0.9,
        size: s * (0.18 + Math.random() * 0.15),
      });
    }
  }

  chips(r, c, n) {
    const { x, y } = this.center(r, c);
    const s = this.size;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = s * (2 + Math.random() * 4);
      this.particles.push({
        kind: 'chip', x, y, color: Math.random() < 0.5 ? '#c0874a' : '#8a5a2b',
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - s * 3,
        life: 0.6 + Math.random() * 0.3, max: 0.9,
        size: s * (0.08 + Math.random() * 0.08),
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20,
      });
    }
  }

  spawn(spawned) {
    for (const { cell, r, drop } of spawned) {
      cell.vr = r - drop - 0.3;
      cell.vel = 6;
    }
  }

  shake(r, c) {
    const cell = this.board.get(r, c);
    if (cell) cell.shake = 0.35;
  }

  pulseAll() {
    this.board.forEach((cell) => { if (cell) cell.pop = 0.8; });
  }

  floatText(text, x, y, color = null) {
    this.texts.push({ text, x, y, t: 0, color });
  }

  // Positions of the rocket heads an effect is flying at this moment.
  rocketHeads(e) {
    const s = this.size;
    const dist = (e.t / SWEEP) * s;
    const { x, y } = this.center(e.r, e.c);
    const heads = [];
    const add = (cx, cy, dir) => {
      if (dir === 'h') {
        heads.push({ x: cx - dist, y: cy, angle: Math.PI }, { x: cx + dist, y: cy, angle: 0 });
      } else {
        heads.push({ x: cx, y: cy - dist, angle: -Math.PI / 2 }, { x: cx, y: cy + dist, angle: Math.PI / 2 });
      }
    };
    if (e.type === 'rocket') add(x, y, e.dir);
    else { add(x, y, 'h'); add(x, y, 'v'); }
    return heads;
  }

  // ---------- update ----------

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i] && this.timers[i].at <= this.time) {
        const { fn } = this.timers[i];
        this.timers.splice(i, 1);
        fn();
      }
    }
    const s = this.size;
    if (this.board) {
      this.board.forEach((cell, r) => {
        if (!cell) return;
        if (cell.tw) {
          cell.tw.t += dt;
          if (cell.tw.t >= cell.tw.dur) cell.tw = null;
        }
        if (cell.vr === undefined) cell.vr = r;
        if (cell.delay > 0) { cell.delay -= dt; return; }
        if (cell.vr < r) {
          cell.vel = (cell.vel || 2) + GRAVITY * dt;
          cell.vr += cell.vel * dt;
          if (cell.vr >= r) { cell.vr = r; cell.vel = 0; cell.squash = 1; }
        } else if (cell.vr > r) {
          cell.vr = r;
        }
        if (cell.pop > 0) cell.pop = Math.max(0, cell.pop - dt * 3.5);
        if (cell.popDelay > 0) cell.popDelay -= dt;
        else if (cell.popIn > 0) cell.popIn = Math.max(0, cell.popIn - dt * 4);
        if (cell.squash > 0) cell.squash = Math.max(0, cell.squash - dt * 5);
        if (cell.shake > 0) cell.shake = Math.max(0, cell.shake - dt);
        if (cell.shine !== undefined) {
          cell.shine += dt * 1.8;
          if (cell.shine >= 1) cell.shine = undefined;
        }
      });
      // Every so often a highlight glides across a random cube.
      if (this.time > this.nextShine) {
        this.nextShine = this.time + 0.35 + Math.random() * 0.6;
        const r = Math.floor(Math.random() * this.board.rows);
        const c = Math.floor(Math.random() * this.board.cols);
        const cell = this.board.grid[r][c];
        if (cell?.kind === 'cube' && cell.shine === undefined) cell.shine = 0;
      }
    }

    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      const dur = d.mode === 'merge' ? MERGE_TIME : POP_TIME;
      if (this.time >= d.start + dur) {
        this.dying.splice(i, 1);
        if (d.mode === 'pop') this.burst(d.r, d.c, d.cell);
        else {
          const { x, y } = this.center(d.toR, d.toC);
          this.sparks(x, y, 2, PALETTE[d.cell.color]?.light);
        }
      }
    }

    for (const e of this.effects) {
      e.t += dt;
      if (!e.started && e.t >= 0) {
        e.started = true;
        this.startEffect(e);
      }
      if (e.t > 0 && (e.type === 'rocket' || e.type === 'cross' || e.type === 'bigcross')) {
        for (const h of this.rocketHeads(e)) {
          if (Math.random() < 0.7) this.smoke(h.x - Math.cos(h.angle) * s * 0.4, h.y - Math.sin(h.angle) * s * 0.4, 1, 0.2);
        }
      }
    }
    this.effects = this.effects.filter((e) => e.t < e.dur);

    for (const p of this.particles) {
      if (p.kind === 'smoke') {
        p.vx *= 1 - dt * 2;
        p.size += s * dt * 0.6;
      } else if (p.kind === 'spark') {
        p.vx *= 1 - dt * 4;
        p.vy *= 1 - dt * 4;
      } else {
        p.vy += s * 22 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    for (const tx of this.texts) tx.t += dt;
    this.texts = this.texts.filter((tx) => tx.t < 1.2);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  startEffect(e) {
    const { x, y } = this.center(e.r, e.c);
    switch (e.type) {
      case 'bomb':
        this.shakeAmt = Math.max(this.shakeAmt, e.radius > 2 ? 12 : 8);
        this.sparks(x, y, 18, '#ffd166', 9);
        this.smoke(x, y, 10, 1.6);
        break;
      case 'nuke':
        this.shakeAmt = 16;
        this.flash = 1;
        this.sparks(x, y, 30, '#ffffff', 14);
        break;
      case 'disco':
        this.sparks(x, y, 12, PALETTE[e.color].light, 6);
        break;
      default:
        this.sparks(x, y, 8, '#ffd166', 5);
        this.shakeAmt = Math.max(this.shakeAmt, 3);
    }
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.update(dt);
      if (this.size > 0) this.draw();
    } finally {
      // One bad frame must never stop the game loop.
      requestAnimationFrame(this.frame);
    }
  }

  // ---------- drawing ----------

  cellPos(cell, r, c) {
    let row = cell.vr ?? r;
    let col = c;
    if (cell.tw) {
      const p = Math.min(1, cell.tw.t / cell.tw.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // ease in-out
      if (cell.tw.back) {
        const k = (p < 0.5 ? p * 2 : (1 - p) * 2) * 0.45;
        row = r + (cell.tw.toR - r) * k;
        col = c + (cell.tw.toC - c) * k;
      } else {
        row = cell.tw.fromR + (r - cell.tw.fromR) * e;
        col = cell.tw.fromC + (c - cell.tw.fromC) * e;
      }
    }
    return { row, col };
  }

  drawBoardCell(ctx, cell, r, c) {
    const s = this.size;
    const { row, col } = this.cellPos(cell, r, c);
    const x = this.ox + (col + 0.5) * s;
    const y = this.oy + (row + 0.5) * s;
    let sx = 1;
    let sy = 1;
    if (this.selected === cell) { sx = sy = 1.1 + Math.sin(this.time * 8) * 0.04; }
    if (cell.pop > 0) { const k = 1 + Math.sin(cell.pop * Math.PI) * 0.22; sx *= k; sy *= k; }
    if (cell.popIn > 0) {
      const k = cell.popDelay > 0 ? 0 : easeOutBack(1 - cell.popIn);
      sx *= k;
      sy *= k;
    }
    if (cell.squash > 0) {
      // landing wobble: squash, then a little stretch
      const w = Math.sin((1 - cell.squash) * Math.PI * 2) * cell.squash;
      sx *= 1 + w * 0.1;
      sy *= 1 - w * 0.12;
    }
    let dx = 0;
    if (cell.shake > 0) dx = Math.sin(cell.shake * 60) * s * 0.08 * (cell.shake / 0.35);
    let dy = 0;
    if (this.hint && this.hint.has(cell)) dy = -Math.abs(Math.sin(this.time * 6)) * s * 0.1;
    ctx.save();
    ctx.translate(x + dx, y + dy + (cell.squash > 0 ? cell.squash * s * 0.04 : 0));
    ctx.scale(sx, sy);
    if (this.selected === cell || (this.hint && this.hint.has(cell))) {
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = s * 0.35;
      roundRect(ctx, -s * 0.46, -s * 0.46, s * 0.92, s * 0.92, s * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
    }
    drawCell(ctx, cell, s, this.time);
    if (cell.shine !== undefined && cell.kind === 'cube') this.drawShine(ctx, cell.shine);
    ctx.restore();
  }

  drawShine(ctx, p) {
    const s = this.size;
    ctx.save();
    roundRect(ctx, -s * 0.47, -s * 0.47, s * 0.94, s * 0.94, s * 0.2);
    ctx.clip();
    ctx.rotate(-0.6);
    const x = -s + p * s * 2;
    const g = ctx.createLinearGradient(x - s * 0.2, 0, x + s * 0.2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - s * 0.2, -s, s * 0.4, s * 2);
    ctx.restore();
  }

  drawDying(ctx, d) {
    const s = this.size;
    const t = this.time - d.start;
    if (t < 0) {
      // Not reached by the blast yet: sit still, glowing if a disco targets it.
      this.drawBoardCell(ctx, d.cell, d.r, d.c);
      return;
    }
    const { x, y } = this.center(d.r, d.c);
    ctx.save();
    if (d.mode === 'merge') {
      const p = Math.min(1, t / MERGE_TIME);
      const e = p * p;
      const to = this.center(d.toR, d.toC);
      ctx.translate(x + (to.x - x) * e, y + (to.y - y) * e);
      const k = 1 - p * 0.5;
      ctx.scale(k, k);
      ctx.globalAlpha = 1 - p * 0.3;
      drawCell(ctx, d.cell, s, this.time);
    } else {
      const p = Math.min(1, t / POP_TIME);
      const k = p < 0.4 ? 1 + 0.25 * (p / 0.4) : 1.25 * (1 - (p - 0.4) / 0.6) ** 0.6;
      ctx.translate(x, y);
      ctx.scale(k, k);
      drawCell(ctx, d.cell, s, this.time);
      // white flash as it bursts
      ctx.globalAlpha = p < 0.4 ? p / 0.4 * 0.8 : 0.8 * (1 - (p - 0.4) / 0.6);
      ctx.globalCompositeOperation = 'lighter';
      roundRect(ctx, -s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    }
    ctx.restore();
  }

  drawPanel(ctx) {
    const { rows, cols } = this.board;
    const s = this.size;
    const bw = cols * s;
    const bh = rows * s;
    ctx.save();
    ctx.shadowColor = 'rgba(10, 5, 40, 0.5)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, this.ox - 10, this.oy - 10, bw + 20, bh + 20, 22);
    const g = ctx.createLinearGradient(0, this.oy, 0, this.oy + bh);
    g.addColorStop(0, 'rgba(70, 50, 160, 0.82)');
    g.addColorStop(1, 'rgba(32, 22, 90, 0.88)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.armed ? `rgba(255,209,102,${0.6 + 0.4 * Math.sin(this.time * 8)})` : 'rgba(255,255,255,0.35)';
    roundRect(ctx, this.ox - 10, this.oy - 10, bw + 20, bh + 20, 22);
    ctx.stroke();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        roundRect(ctx, this.ox + c * s + s * 0.04, this.oy + r * s + s * 0.04, s * 0.92, s * 0.92, s * 0.18);
        ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)';
        ctx.fill();
      }
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = Math.min(1, (p.life / p.max) * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.35 * (p.life / p.max);
        ctx.fillStyle = '#e8e4ff';
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const k = p.size;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const rad = i % 2 ? k * 0.25 : k;
          ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === 'chip') {
          ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        } else {
          roundRect(ctx, -p.size, -p.size, p.size * 2, p.size * 2, p.size * 0.5);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(-p.size * 0.6, -p.size * 0.7, p.size * 0.8, p.size * 0.4);
        }
      }
      ctx.restore();
    }
  }

  drawTexts(ctx) {
    const s = this.size;
    for (const tx of this.texts) {
      const t = tx.t;
      const scale = t < 0.3 ? easeOutBack(t / 0.3) : 1;
      const rise = t > 0.6 ? (t - 0.6) * s * 2 : 0;
      ctx.save();
      ctx.globalAlpha = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.4) : 1;
      ctx.font = `${Math.round(s * 0.72)}px "Lilita One", system-ui, sans-serif`;
      const half = ctx.measureText(tx.text).width / 2 + 14;
      ctx.translate(Math.min(Math.max(tx.x, half), this.w - half), tx.y - rise);
      ctx.rotate(Math.sin(t * 6) * 0.04);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.18;
      ctx.strokeStyle = '#2a1170';
      ctx.strokeText(tx.text, 0, s * 0.04);
      if (tx.color) {
        ctx.fillStyle = tx.color;
      } else {
        const g = ctx.createLinearGradient(0, -s * 0.35, 0, s * 0.35);
        g.addColorStop(0, '#fff7ae');
        g.addColorStop(0.5, '#ffd166');
        g.addColorStop(1, '#ff8a3d');
        ctx.fillStyle = g;
      }
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.board) return;
    const { rows, cols } = this.board;
    const s = this.size;

    ctx.save();
    if (this.shakeAmt > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    }
    this.drawPanel(ctx);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox - 6, this.oy - 6, cols * s + 12, rows * s + 12);
    ctx.clip();
    // Moving cells first, then the static boxes on top so cubes pass behind them.
    this.board.forEach((cell, r, c) => { if (cell && cell.kind !== 'box' && !cell.tw) this.drawBoardCell(ctx, cell, r, c); });
    this.board.forEach((cell, r, c) => { if (cell?.tw) this.drawBoardCell(ctx, cell, r, c); });
    this.board.forEach((cell, r, c) => { if (cell && cell.kind === 'box') this.drawBoardCell(ctx, cell, r, c); });
    for (const d of this.dying) this.drawDying(ctx, d);
    for (const e of this.effects) this.drawEffect(ctx, e);
    ctx.restore();

    this.drawParticles(ctx);
    ctx.restore();
    this.drawTexts(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  drawRocketTrails(ctx, e, thickness) {
    const s = this.size;
    const { x, y } = this.center(e.r, e.c);
    const fade = Math.max(0, 1 - e.t / e.dur);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const h of this.rocketHeads(e)) {
      const g = ctx.createLinearGradient(x, y, h.x, h.y);
      g.addColorStop(0, `rgba(255,190,90,${0.1 * fade})`);
      g.addColorStop(1, `rgba(255,240,200,${0.9 * fade})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
    }
    ctx.restore();
    for (const h of this.rocketHeads(e)) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.angle);
      drawCell(ctx, { kind: 'rocket', dir: 'h' }, s * 0.95, this.time);
      ctx.restore();
    }
  }

  drawEffect(ctx, e) {
    if (e.t < 0) return;
    const p = e.t / e.dur;
    const s = this.size;
    const { x, y } = this.center(e.r, e.c);
    switch (e.type) {
      case 'rocket':
      case 'cross':
        this.drawRocketTrails(ctx, e, s * 0.32);
        break;
      case 'bigcross': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * (1 - p);
        ctx.fillStyle = '#ffcf7a';
        ctx.fillRect(0, y - s * 1.5, this.w, s * 3);
        ctx.fillRect(x - s * 1.5, 0, s * 3, this.h);
        ctx.restore();
        this.drawRocketTrails(ctx, e, s * 0.6);
        break;
      }
      case 'bomb':
      case 'nuke': {
        const radius = (e.type === 'nuke' ? Math.max(this.w, this.h) / s : e.radius + 1) * s;
        const ring = radius * Math.min(1, e.t / (e.dur * 0.6));
        // core flash
        if (e.t < 0.15) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.6);
          g.addColorStop(0, `rgba(255,255,255,${1 - e.t / 0.15})`);
          g.addColorStop(1, 'rgba(255,200,80,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, s * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, ring * 0.6, x, y, ring + 1);
        g.addColorStop(0, 'rgba(255,170,60,0)');
        g.addColorStop(1, `rgba(255,170,60,${0.45 * (1 - p)})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, ring + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = s * 0.18 * (1 - p);
        ctx.strokeStyle = `rgba(255,255,255,${1 - p})`;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'disco': {
        const light = PALETTE[e.color].light;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        e.targets.forEach(([ty, tx], i) => {
          const hitAt = 0.12 + i * 0.018;
          if (e.t < hitAt - 0.08 || e.t > hitAt + 0.15) return;
          const t = this.center(ty, tx);
          const reach = Math.min(1, (e.t - (hitAt - 0.08)) / 0.08);
          const ex = x + (t.x - x) * reach;
          const ey = y + (t.y - y) * reach;
          // jagged bolt, re-randomised every frame so it flickers
          ctx.beginPath();
          ctx.moveTo(x, y);
          const steps = 6;
          for (let k = 1; k < steps; k++) {
            const f = k / steps;
            ctx.lineTo(x + (ex - x) * f + (Math.random() - 0.5) * s * 0.35, y + (ey - y) * f + (Math.random() - 0.5) * s * 0.35);
          }
          ctx.lineTo(ex, ey);
          ctx.lineWidth = s * 0.12;
          ctx.strokeStyle = light;
          ctx.globalAlpha = 0.7;
          ctx.stroke();
          ctx.lineWidth = s * 0.04;
          ctx.strokeStyle = '#fff';
          ctx.globalAlpha = 1;
          ctx.stroke();
        });
        ctx.restore();
        ctx.save();
        ctx.translate(x, y);
        const k = 1.1 + Math.sin(e.t * 30) * 0.06;
        ctx.scale(k, k);
        ctx.rotate(e.t * 8);
        drawCell(ctx, { kind: 'disco', color: e.color }, s, this.time);
        ctx.restore();
        break;
      }
    }
  }
}
