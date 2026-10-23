// Sound effects synthesised with WebAudio, so the game ships with no audio files.
// The context is created on the first user gesture (browsers require it).

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.noise = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0 } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  whoosh(dur, { vol = 0.25, from = 800, to = 3000, delay = 0, type = 'bandpass' } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  play(name, arg = 0) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'pop': {
        const base = 420 + Math.min(arg, 12) * 45;
        this.tone(base, 0.12, { type: 'triangle', vol: 0.22, to: base * 1.6 });
        this.tone(base * 2, 0.08, { type: 'sine', vol: 0.08, delay: 0.02 });
        break;
      }
      case 'nope':
        this.tone(180, 0.12, { type: 'square', vol: 0.06, to: 140 });
        break;
      case 'rocket':
        this.whoosh(0.35, { vol: 0.3, from: 600, to: 4000 });
        break;
      case 'bomb':
        this.whoosh(0.5, { vol: 0.55, from: 900, to: 60, type: 'lowpass' });
        this.tone(90, 0.4, { type: 'sine', vol: 0.4, to: 40 });
        break;
      case 'disco':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * 2 ** (n / 12), 0.15, { type: 'triangle', vol: 0.15, delay: i * 0.05 }));
        break;
      case 'create':
        this.tone(660, 0.18, { type: 'sine', vol: 0.18, to: 1320 });
        break;
      case 'box':
        this.tone(220, 0.08, { type: 'square', vol: 0.07, to: 160 });
        this.whoosh(0.1, { vol: 0.15, from: 2000, to: 500 });
        break;
      case 'coin':
        this.tone(988, 0.08, { type: 'square', vol: 0.08 });
        this.tone(1319, 0.2, { type: 'square', vol: 0.08, delay: 0.08 });
        break;
      case 'win':
        [0, 4, 7, 12].forEach((n, i) => this.tone(523 * 2 ** (n / 12), 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.12 }));
        this.tone(1046, 0.6, { type: 'sine', vol: 0.15, delay: 0.5 });
        break;
      case 'lose':
        [7, 4, 0, -5].forEach((n, i) => this.tone(392 * 2 ** (n / 12), 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.15 }));
        break;
      case 'click':
        this.tone(880, 0.05, { type: 'sine', vol: 0.1 });
        break;
      case 'shuffle':
        this.whoosh(0.4, { vol: 0.2, from: 300, to: 2500 });
        break;
    }
  }
}

export function vibrate(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Vibration is optional.
  }
}
