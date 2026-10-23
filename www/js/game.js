// One level being played: owns the Board, the move counter and goals, and
// drives the renderer and HUD. The App (main.js) owns screens and progress.

import { Board } from './board.js';
import { getLevel, starsFor } from './levels.js';
import { iconCanvas } from './render.js';
import { vibrate } from './audio.js';

const $ = (id) => document.getElementById(id);

export function goalIcon(goal, size) {
  const cell = goal.type === 'box' ? { kind: 'box', hp: 1, maxHp: 1 } : { kind: 'cube', color: goal.color };
  return iconCanvas(cell, size);
}

export class GameSession {
  constructor(app, levelNum) {
    this.app = app;
    this.renderer = app.renderer;
    this.level = getLevel(levelNum);
    this.board = Board.fromLayout(this.level.layout, this.level.colors);
    this.moves = this.level.moves;
    this.movesUsed = 0;
    this.extraMovesBought = 0;
    this.goals = this.level.goals.map((g) => ({ ...g, left: g.count }));
    this.state = 'play'; // play | busy | won | lost
    this.armed = null; // 'hammer' while the hammer power-up is selected
    this.idle = 0;
    this.destroyed = false;

    this.renderer.setBoard(this.board);
    this.renderer.onTap = (r, c) => this.tap(r, c);
    this.renderer.armed = false;
    this.buildHud();
    this.hintTimer = setInterval(() => this.checkHint(), 1000);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.hintTimer);
    this.renderer.onTap = null;
    this.renderer.hint = null;
    this.renderer.armed = false;
  }

  buildHud() {
    $('hud-level').textContent = this.level.number;
    const wrap = $('hud-goals');
    wrap.replaceChildren();
    for (const goal of this.goals) {
      const el = document.createElement('div');
      el.className = 'goal';
      el.append(goalIcon(goal, 34));
      const count = document.createElement('span');
      el.append(count);
      wrap.append(el);
      goal.el = el;
      goal.countEl = count;
    }
    this.updateHud();
  }

  updateHud() {
    const movesEl = $('hud-moves');
    movesEl.textContent = this.moves;
    movesEl.classList.toggle('low', this.moves <= 5);
    for (const goal of this.goals) {
      goal.countEl.textContent = goal.left > 0 ? goal.left : '✔';
      goal.el.classList.toggle('done', goal.left === 0);
    }
    const { hammer, shuffle } = this.app.state;
    $('cnt-hammer').textContent = hammer > 0 ? hammer : '+';
    $('cnt-shuffle').textContent = shuffle > 0 ? shuffle : '+';
    $('bst-hammer').classList.toggle('armed', this.armed === 'hammer');
  }

  tap(r, c) {
    if (this.state !== 'play') return;
    this.clearHint();
    const { sfx } = this.app;

    if (this.armed === 'hammer') {
      const res = this.board.hammer(r, c);
      if (!res) return;
      this.app.state.hammer--;
      this.app.persist();
      this.setArmed(null);
      sfx.play('bomb');
      vibrate(30);
      this.resolve(res);
      return;
    }

    const res = this.board.tap(r, c);
    if (!res) {
      this.renderer.shake(r, c);
      sfx.play('nope');
      return;
    }
    this.moves--;
    this.movesUsed++;
    this.playSounds(res);
    this.resolve(res);
  }

  playSounds(res) {
    const { sfx } = this.app;
    const types = new Set(res.effects.map((e) => e.type));
    if (types.has('nuke') || types.has('bomb')) { sfx.play('bomb'); vibrate(40); }
    if (types.has('disco')) sfx.play('disco');
    if (types.has('rocket') || types.has('cross') || types.has('bigcross')) { sfx.play('rocket'); vibrate(20); }
    if (!types.size) sfx.play('pop', res.groupSize);
    if (res.created) sfx.play('create');
    if (res.collected.boxes || res.damaged.length) sfx.play('box');
  }

  resolve(res) {
    this.state = 'busy';
    for (const goal of this.goals) {
      const got = goal.type === 'box' ? res.collected.boxes : res.collected.colors[goal.color];
      if (got > 0 && goal.left > 0) {
        goal.left = Math.max(0, goal.left - got);
        goal.el.classList.remove('bump');
        void goal.el.offsetWidth; // restart the CSS animation
        goal.el.classList.add('bump');
      }
    }
    this.updateHud();
    const wait = this.renderer.playResult(res);
    this.renderer.after(wait, () => {
      if (this.destroyed) return;
      this.renderer.spawn(this.board.applyGravity());
      this.waitSettle();
    });
  }

  waitSettle() {
    const check = () => {
      if (this.destroyed) return;
      if (this.renderer.isSettled()) this.afterSettle();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  afterSettle() {
    if (this.goals.every((g) => g.left === 0)) {
      this.win();
    } else if (this.moves <= 0) {
      this.state = 'lost';
      this.app.offerMoreMoves(this);
    } else {
      if (!this.board.hasMoves()) {
        this.board.shuffle();
        this.renderer.pulseAll();
        this.app.sfx.play('shuffle');
        this.app.toast('Hamle kalmadı, karıştırıldı!');
      }
      this.state = 'play';
      this.idle = 0;
    }
  }

  win() {
    this.state = 'won';
    const stars = starsFor(this.level, this.moves);
    this.app.sfx.play('win');
    vibrate([30, 60, 30]);
    const { w, h } = this.renderer;
    this.renderer.floatText('TEBRİKLER!', w / 2, h / 2, '#ffd166');
    this.board.forEach((cell, r, c) => { if (cell && Math.random() < 0.35) this.renderer.burst(r, c, cell); });
    setTimeout(() => {
      if (!this.destroyed) this.app.levelWon(this.level.number, stars, this.moves);
    }, 1100);
  }

  addMoves(n) {
    this.moves += n;
    this.extraMovesBought++;
    this.state = 'play';
    this.updateHud();
  }

  setArmed(mode) {
    this.armed = mode;
    this.renderer.armed = !!mode;
    this.updateHud();
  }

  toggleHammer() {
    if (this.state !== 'play') return;
    if (this.armed === 'hammer') {
      this.setArmed(null);
      return;
    }
    if (this.app.state.hammer <= 0) {
      this.app.offerBooster('hammer');
      return;
    }
    this.setArmed('hammer');
    this.app.toast('Kırmak istediğin kareye dokun');
  }

  useShuffle() {
    if (this.state !== 'play') return;
    if (this.app.state.shuffle <= 0) {
      this.app.offerBooster('shuffle');
      return;
    }
    this.app.state.shuffle--;
    this.app.persist();
    this.board.shuffle();
    this.renderer.pulseAll();
    this.app.sfx.play('shuffle');
    this.updateHud();
  }

  // After a few idle seconds, gently bounce the biggest group as a hint.
  checkHint() {
    if (this.state !== 'play' || this.renderer.hint) return;
    if (++this.idle < 6) return;
    let best = [];
    this.board.forEach((cell, r, c) => {
      if (cell?.kind !== 'cube') return;
      const group = this.board.findGroup(r, c);
      if (group.length > best.length) best = group;
    });
    if (best.length >= 2) this.renderer.hint = new Set(best.map(([r, c]) => this.board.grid[r][c]));
  }

  clearHint() {
    this.idle = 0;
    this.renderer.hint = null;
  }
}
