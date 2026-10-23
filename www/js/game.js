// One level being played: owns the Board, the move counter and goals, and
// drives the renderer and HUD. The App (main.js) owns screens and progress.

import { Board, rocket, bomb, disco, isBooster } from './board.js';
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

    this.streakBonus = this.placeStreakBoosters(app.state.streak || 0);
    this.renderer.setBoard(this.board);
    this.renderer.onTap = (r, c) => this.tap(r, c);
    this.renderer.onSwipe = (r, c, dr, dc) => this.swipe(r, c, r + dr, c + dc);
    this.renderer.armed = false;
    this.selectedPos = null;
    this.cascade = 0;
    this.buildHud();
    this.hintTimer = setInterval(() => this.checkHint(), 1000);
    if (this.streakBonus) setTimeout(() => app.toast(`🔥 ${app.state.streak} galibiyet serisi: başlangıç bonusu!`), 900);
  }

  // Win streak rewards: 2 wins in a row start the level with a rocket,
  // 4 with a bomb too, 6 with a disco ball too.
  placeStreakBoosters(streak) {
    const gifts = [];
    if (streak >= 2) gifts.push(rocket(Math.random() < 0.5 ? 'h' : 'v'));
    if (streak >= 4) gifts.push(bomb());
    if (streak >= 6) gifts.push(disco(this.board.randomColor()));
    const spots = [];
    this.board.forEach((cell, r, c) => { if (cell?.kind === 'cube' && r < this.board.rows - 1) spots.push([r, c]); });
    for (const gift of gifts) {
      const [r, c] = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      this.board.grid[r][c] = gift;
    }
    return gifts.length;
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.hintTimer);
    this.renderer.onTap = null;
    this.renderer.onSwipe = null;
    this.renderer.hint = null;
    this.renderer.selected = null;
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

    const cell = this.board.get(r, c);
    if (isBooster(cell)) {
      this.select(null);
      this.moves--;
      this.movesUsed++;
      const res = this.board.tap(r, c);
      this.cascade = 0;
      this.playSounds(res);
      this.resolve(res);
      return;
    }
    if (cell?.kind !== 'cube') return;
    // Tap one cube, then a neighbour, as an alternative to swiping.
    const sel = this.selectedPos;
    if (sel && Math.abs(sel[0] - r) + Math.abs(sel[1] - c) === 1) {
      this.swipe(sel[0], sel[1], r, c);
    } else if (sel && sel[0] === r && sel[1] === c) {
      this.select(null);
    } else {
      this.select([r, c]);
    }
  }

  select(pos) {
    this.selectedPos = pos;
    this.renderer.selected = pos ? this.board.get(...pos) : null;
  }

  swipe(r1, c1, r2, c2) {
    if (this.state !== 'play' || this.armed) return;
    this.clearHint();
    this.select(null);
    const { board, renderer } = this;
    if (!board.canSwap(r1, c1, r2, c2)) return;
    const a = board.grid[r1][c1];
    const b = board.grid[r2][c2];
    if (!board.isValidSwap(r1, c1, r2, c2)) {
      renderer.bounce(a, r2, c2);
      renderer.bounce(b, r1, c1);
      this.app.sfx.play('nope');
      return;
    }
    board.swapCells(r1, c1, r2, c2);
    renderer.slide(a, r1, c1);
    renderer.slide(b, r2, c2);
    this.state = 'busy';
    this.moves--;
    this.movesUsed++;
    this.updateHud();
    renderer.after(0.17, () => {
      if (this.destroyed) return;
      const res = board.resolveSwap(r1, c1, r2, c2);
      this.cascade = 0;
      this.playSounds(res);
      this.resolve(res);
    });
  }

  playSounds(res) {
    const { sfx } = this.app;
    const types = new Set(res.effects.map((e) => e.type));
    if (types.has('nuke') || types.has('bomb')) { sfx.play('bomb'); vibrate(40); }
    if (types.has('disco')) sfx.play('disco');
    if (types.has('rocket') || types.has('cross') || types.has('bigcross')) { sfx.play('rocket'); vibrate(20); }
    if (!types.size) sfx.play('pop', res.groupSize + this.cascade * 2);
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
      this.waitSettle(() => this.afterGravity());
    });
  }

  // Falling cubes can line up on their own: clear those too, for free.
  afterGravity() {
    const res = this.board.clearMatches();
    if (!res) {
      this.afterSettle();
      return;
    }
    this.cascade++;
    if (this.cascade >= 2) {
      const { w, h } = this.renderer;
      this.renderer.floatText(`ZİNCİR x${this.cascade}`, w / 2, h * 0.45, '#9df5b9');
    }
    this.playSounds(res);
    this.resolve(res);
  }

  waitSettle(done = () => this.afterSettle()) {
    const check = () => {
      if (this.destroyed) return;
      if (this.renderer.isSettled()) done();
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
    const movesLeft = this.moves;
    setTimeout(() => {
      if (this.destroyed) return;
      if (movesLeft > 0) this.bonusRound(stars, movesLeft);
      else this.app.levelWon(this.level.number, stars, movesLeft);
    }, 1000);
  }

  // Leftover moves turn into rockets that fire one after another, along with
  // any boosters still on the board. Each leftover move pays bonus coins.
  bonusRound(stars, movesLeft) {
    const { w, h } = this.renderer;
    this.renderer.floatText('BONUS!', w / 2, h / 3, '#ffd166');
    const cubes = [];
    this.board.forEach((cell, r, c) => { if (cell?.kind === 'cube') cubes.push([r, c]); });
    for (let i = cubes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cubes[i], cubes[j]] = [cubes[j], cubes[i]];
    }
    const picks = cubes.slice(0, Math.min(movesLeft, 10));
    let placed = 0;
    let fired = 0;

    const fireNext = () => {
      if (this.destroyed) return;
      let res = this.board.clearMatches();
      if (!res) {
        let target = null;
        this.board.forEach((cell, r, c) => { if (!target && isBooster(cell)) target = [r, c]; });
        if (!target || fired++ > 40) {
          this.app.levelWon(this.level.number, stars, movesLeft);
          return;
        }
        res = this.board.tap(...target);
      }
      this.playSounds(res);
      this.renderer.after(this.renderer.playResult(res), () => {
        if (this.destroyed) return;
        this.renderer.spawn(this.board.applyGravity());
        this.waitSettle(fireNext);
      });
    };

    const placeNext = () => {
      if (this.destroyed) return;
      if (placed >= picks.length) {
        this.moves = 0;
        this.updateHud();
        fireNext();
        return;
      }
      const [r, c] = picks[placed++];
      const cell = rocket(Math.random() < 0.5 ? 'h' : 'v');
      cell.vr = r;
      cell.pop = 1;
      this.board.grid[r][c] = cell;
      this.moves = Math.max(0, this.moves - 1);
      this.updateHud();
      this.app.sfx.play('create');
      setTimeout(placeNext, 120);
    };
    placeNext();
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

  // After a few idle seconds, gently bounce a pair that can be swapped.
  checkHint() {
    if (this.state !== 'play' || this.renderer.hint) return;
    if (++this.idle < 6) return;
    const swaps = this.board.validSwaps();
    if (!swaps.length) return;
    const [r1, c1, r2, c2] = swaps[Math.floor(Math.random() * swaps.length)];
    this.renderer.hint = new Set([this.board.grid[r1][c1], this.board.grid[r2][c2]]);
  }

  clearHint() {
    this.idle = 0;
    this.renderer.hint = null;
  }
}
