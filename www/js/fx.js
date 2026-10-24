// Screen-wide effects that live outside the board canvas.

const COLORS = ['#ff4d6d', '#3a86ff', '#2fd16b', '#ffc53d', '#a855f7', '#ffffff'];

// Confetti rain over the whole screen, removed when it is done.
export function confetti(duration = 2800) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.6,
    vx: (Math.random() - 0.5) * 120,
    vy: 120 + Math.random() * 180,
    rot: Math.random() * 6,
    spin: (Math.random() - 0.5) * 12,
    flip: Math.random() * 6,
    size: 6 + Math.random() * 7,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const age = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = age > duration - 600 ? Math.max(0, (duration - age) / 600) : 1;
    for (const p of pieces) {
      p.vy += 60 * dt;
      p.x += (p.vx + Math.sin(p.flip) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.flip += dt * 5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip)); // paper flipping in the air
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (age < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// Slow floating light motes behind the UI.
export function addMotes(container, count = 16) {
  const layer = document.createElement('div');
  layer.className = 'motes';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const m = document.createElement('span');
    const size = 4 + Math.random() * 8;
    m.style.left = `${Math.random() * 100}%`;
    m.style.width = m.style.height = `${size}px`;
    m.style.animationDuration = `${10 + Math.random() * 14}s`;
    m.style.animationDelay = `${-Math.random() * 20}s`;
    layer.append(m);
  }
  container.prepend(layer);
}
