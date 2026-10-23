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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = null;
    this.particles = [];
    this.effects = [];
    this.texts = [];
    this.ghosts = [];
    this.timers = [];
    this.hint = null;
    this.armed = false;
    this.time = 0;
    this.shakeAmt = 0;
    this.flash = 0;
    this.onTap = null;
    this.frame = this.frame.bind(this);
    canvas.addEventListener('pointerdown', (e) => this.handlePointer(e));
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
    this.ghosts = [];
    this.timers = [];
    this.hint = null;
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
    const pad = 12;
    const { rows, cols } = this.board;
    this.size = Math.floor(Math.min((this.w - pad * 2) / cols, (this.h - pad * 2) / rows));
    this.ox = Math.round((this.w - this.size * cols) / 2);
    this.oy = Math.round((this.h - this.size * rows) / 2);
  }

  center(r, c) {
    return { x: this.ox + (c + 0.5) * this.size, y: this.oy + (r + 0.5) * this.size };
  }

  handlePointer(e) {
    if (!this.board || !this.onTap) return;
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - this.ox) / this.size);
    const r = Math.floor((e.clientY - rect.top - this.oy) / this.size);
    if (this.board.inBounds(r, c)) this.onTap(r, c);
  }

  after(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  isSettled() {
    if (this.effects.length || this.ghosts.length || this.timers.length) return false;
    let settled = true;
    this.board.forEach((cell, r) => {
      if (cell && (cell.delay > 0 || cell.vr < r)) settled = false;
    });
    return settled;
  }

  // Animates a Board result. Returns the seconds to wait before gravity runs.
  playResult(res) {
    let maxWave = 0;
    for (const { cell, r, c, wave } of res.removed) {
      maxWave = Math.max(maxWave, wave);
      if (wave === 0) {
        this.burst(r, c, cell);
      } else {
        const ghost = { cell, r, c };
        this.ghosts.push(ghost);
        this.after(wave * WAVE_GAP, () => {
          this.ghosts.splice(this.ghosts.indexOf(ghost), 1);
          this.burst(r, c, cell);
        });
      }
    }
    for (const { cell, wave } of res.damaged) {
      this.after(wave * WAVE_GAP, () => { cell.shake = 0.3; });
    }
    for (const e of res.effects) {
      maxWave = Math.max(maxWave, e.wave);
      const dur = e.type === 'disco' ? 0.5 : e.type === 'nuke' ? 0.7 : 0.38;
      this.effects.push({ ...e, t: -e.wave * WAVE_GAP, dur });
      if (e.type === 'bomb' || e.type === 'nuke') {
        this.after(e.wave * WAVE_GAP, () => {
          this.shakeAmt = Math.max(this.shakeAmt, e.type === 'nuke' ? 14 : 8);
          if (e.type === 'nuke') this.flash = 1;
        });
      }
    }
    if (res.created) {
      const { cell, r } = res.created;
      cell.vr = r;
      cell.pop = 1;
    }
    if (res.groupSize >= 5 || res.combo) {
      const { x, y } = this.center(res.created?.r ?? 0, res.created?.c ?? 0);
      const label = res.combo ? 'KOMBO!' : res.groupSize >= 9 ? 'MUHTEŞEM!' : res.groupSize >= 7 ? 'SÜPER!' : 'HARİKA!';
      this.floatText(label, res.created ? x : this.w / 2, res.created ? y : this.h / 2);
    }
    return 0.12 + maxWave * WAVE_GAP + (res.effects.length ? 0.22 : 0);
  }

  burst(r, c, cell) {
    const { x, y } = this.center(r, c);
    const color = particleColor(cell);
    const n = cell.kind === 'cube' ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = this.size * (2 + Math.random() * 4);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - this.size * 3,
        life: 0.5 + Math.random() * 0.35,
        size: this.size * (0.08 + Math.random() * 0.1),
        color,
        square: cell.kind === 'box',
        rot: Math.random() * 6,
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

  floatText(text, x, y, color = '#fff') {
    this.texts.push({ text, x, y, t: 0, color });
  }

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) {
        const { fn } = this.timers[i];
        this.timers.splice(i, 1);
        fn();
      }
    }
    if (this.board) {
      this.board.forEach((cell, r) => {
        if (!cell) return;
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
        if (cell.popIn > 0) cell.popIn = Math.max(0, cell.popIn - dt * 4);
        if (cell.squash > 0) cell.squash = Math.max(0, cell.squash - dt * 6);
        if (cell.shake > 0) cell.shake = Math.max(0, cell.shake - dt);
      });
    }
    for (const p of this.particles) {
      p.vy += this.size * 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 8;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
    for (const tx of this.texts) tx.t += dt;
    this.texts = this.texts.filter((tx) => tx.t < 1.1);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.5);
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

  drawBoardCell(ctx, cell, r, c) {
    const s = this.size;
    const x = this.ox + (c + 0.5) * s;
    const y = this.oy + ((cell.vr ?? r) + 0.5) * s;
    let sx = 1;
    let sy = 1;
    if (cell.pop > 0) { const k = 1 + Math.sin(cell.pop * Math.PI) * 0.22; sx *= k; sy *= k; }
    if (cell.popIn > 0) { const k = 1 - cell.popIn; sx *= k; sy *= k; }
    if (cell.squash > 0) { sx *= 1 + cell.squash * 0.08; sy *= 1 - cell.squash * 0.1; }
    let dx = 0;
    if (cell.shake > 0) dx = Math.sin(cell.shake * 60) * s * 0.08 * (cell.shake / 0.35);
    let dy = 0;
    if (this.hint && this.hint.has(cell)) dy = -Math.abs(Math.sin(this.time * 6)) * s * 0.1;
    ctx.save();
    ctx.translate(x + dx, y + dy + (cell.squash > 0 ? cell.squash * s * 0.05 : 0));
    ctx.scale(sx, sy);
    drawCell(ctx, cell, s, this.time);
    ctx.restore();
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.board) return;
    const { rows, cols } = this.board;
    const s = this.size;
    const bw = cols * s;
    const bh = rows * s;

    ctx.save();
    if (this.shakeAmt > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    }

    // board panel
    roundRect(ctx, this.ox - 8, this.oy - 8, bw + 16, bh + 16, 18);
    ctx.fillStyle = 'rgba(16, 24, 72, 0.55)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.armed ? `rgba(255,209,102,${0.6 + 0.4 * Math.sin(this.time * 8)})` : 'rgba(255,255,255,0.25)';
    ctx.stroke();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(this.ox + c * s, this.oy + r * s, s, s);
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox - 4, this.oy - 4, bw + 8, bh + 8);
    ctx.clip();
    // Moving cells first, then the static boxes on top so cubes pass behind them.
    this.board.forEach((cell, r, c) => { if (cell && cell.kind !== 'box') this.drawBoardCell(ctx, cell, r, c); });
    for (const g of this.ghosts) this.drawBoardCell(ctx, g.cell, g.r, g.c);
    this.board.forEach((cell, r, c) => { if (cell && cell.kind === 'box') this.drawBoardCell(ctx, cell, r, c); });
    for (const e of this.effects) this.drawEffect(ctx, e);
    ctx.restore();

    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.square) ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();

    for (const tx of this.texts) {
      const k = tx.t / 1.1;
      const scale = Math.min(1, tx.t * 6) * (1 + 0.1 * Math.sin(tx.t * 10));
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      ctx.font = `${Math.round(s * 0.62)}px "Lilita One", system-ui, sans-serif`;
      const half = ctx.measureText(tx.text).width / 2 + 12;
      ctx.translate(Math.min(Math.max(tx.x, half), this.w - half), tx.y - k * s * 1.5);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.14;
      ctx.strokeStyle = '#3b1d8f';
      ctx.strokeText(tx.text, 0, 0);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  drawBeam(ctx, x, y, dir, p, thickness) {
    const s = this.size;
    const len = Math.max(this.w, this.h) * p * 1.2;
    ctx.save();
    ctx.translate(x, y);
    if (dir === 'v') ctx.rotate(Math.PI / 2);
    const alpha = 1 - p * 0.6;
    const g = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
    g.addColorStop(0, 'rgba(255,209,102,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-len, -thickness / 2, len * 2, thickness);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * len, 0);
      if (side < 0) ctx.rotate(Math.PI);
      drawCell(ctx, { kind: 'rocket', dir: 'h' }, s * 0.9, this.time);
      ctx.restore();
    }
    ctx.restore();
  }

  drawEffect(ctx, e) {
    if (e.t < 0) return;
    const p = e.t / e.dur;
    const s = this.size;
    const { x, y } = this.center(e.r, e.c);
    switch (e.type) {
      case 'rocket':
        this.drawBeam(ctx, x, y, e.dir, p, s * 0.6);
        break;
      case 'cross':
        this.drawBeam(ctx, x, y, 'h', p, s * 0.7);
        this.drawBeam(ctx, x, y, 'v', p, s * 0.7);
        break;
      case 'bigcross':
        this.drawBeam(ctx, x, y, 'h', p, s * 2.6);
        this.drawBeam(ctx, x, y, 'v', p, s * 2.6);
        break;
      case 'bomb':
      case 'nuke': {
        const radius = e.type === 'nuke' ? Math.max(this.w, this.h) : s * (e.radius + 1.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * p + 1);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - p)})`);
        g.addColorStop(0.6, `rgba(255,170,60,${0.6 * (1 - p)})`);
        g.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius * p + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = s * 0.15 * (1 - p);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        break;
      }
      case 'disco': {
        ctx.save();
        ctx.lineWidth = s * 0.08;
        ctx.strokeStyle = PALETTE[e.color].light;
        ctx.globalAlpha = 1 - p;
        for (const [ty, tx] of e.targets) {
          const t = this.center(ty, tx);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (t.x - x) * Math.min(1, p * 2.5), y + (t.y - y) * Math.min(1, p * 2.5));
          ctx.stroke();
        }
        ctx.translate(x, y);
        ctx.scale(1 + p * 0.5, 1 + p * 0.5);
        drawCell(ctx, { kind: 'disco', color: e.color }, s, this.time * 4);
        ctx.restore();
        break;
      }
    }
  }
}
