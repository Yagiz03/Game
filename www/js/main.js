// App shell: screens, level map, modals, shop and progress. A level in play
// is handled by GameSession (game.js).

import { Renderer, loadSprites } from './render.js';
import { Sfx, vibrate } from './audio.js';
import * as store from './storage.js';
import { TOTAL_LEVELS, getLevel, COLOR_NAMES } from './levels.js';
import { GameSession, goalIcon } from './game.js';
import { showRewardedAd } from './ads.js';
import { addMotes } from './fx.js';

const $ = (id) => document.getElementById(id);

const PRICES = {
  moves: 100, // +5 moves when out of moves
  hammer: 250, // pack of 3
  shuffle: 150, // pack of 3
  lives: 200, // refill
};
const AD_REWARD = 50;
const DAILY_REWARD = 100;

const BOOSTER_INFO = {
  hammer: { icon: '🔨', name: 'Çekiç', desc: 'İstediğin tek bir kareyi kırar.' },
  shuffle: { icon: '🔀', name: 'Karıştır', desc: 'Tahtadaki renkleri yeniden dağıtır.' },
};

const today = () => new Date().toISOString().slice(0, 10);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c != null));
  return node;
}

class App {
  constructor() {
    this.state = store.load();
    store.syncLives(this.state);
    this.sfx = new Sfx();
    this.sfx.enabled = this.state.sound;
    this.renderer = new Renderer($('board'));
    this.session = null;

    document.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    document.addEventListener('click', (e) => {
      if (e.target.closest('button')) this.sfx.play('click');
    });
    $('btn-play').addEventListener('click', () => this.startLevel(this.state.level));
    $('btn-daily').addEventListener('click', () => this.claimDaily());
    $('btn-shop').addEventListener('click', () => this.showShop());
    $('btn-settings').addEventListener('click', () => this.showSettings());
    $('btn-pause').addEventListener('click', () => this.showPause());
    $('bst-hammer').addEventListener('click', () => this.session?.toggleHammer());
    $('bst-shuffle').addEventListener('click', () => this.session?.useShuffle());
    $('lives-pill').addEventListener('click', () => this.showLives());

    addMotes($('app'));
    this.showHome();
    setInterval(() => this.tick(), 1000);
  }

  persist() {
    store.save(this.state);
    this.updateTopbar();
  }

  tick() {
    store.syncLives(this.state);
    this.updateTopbar();
  }

  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  }

  updateTopbar() {
    const s = this.state;
    $('lives').textContent = s.lives;
    const ms = store.nextLifeIn(s);
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    $('lives-timer').textContent = s.lives >= store.MAX_LIVES ? 'Dolu' : `${mins}:${String(secs).padStart(2, '0')}`;
    $('coins').textContent = s.coins;
    $('btn-daily').classList.toggle('ready', s.lastDaily !== today());
  }

  // ---------- home & map ----------

  showHome() {
    this.session?.destroy();
    this.session = null;
    this.showScreen('home');
    this.renderMap();
    this.updateTopbar();
    const level = Math.min(this.state.level, TOTAL_LEVELS);
    $('btn-play').textContent = `Seviye ${level}`;
  }

  renderMap() {
    const map = $('map');
    map.replaceChildren();
    const current = this.state.level;
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const stars = this.state.stars[n] || 0;
      const state = n < current || stars ? 'done' : n === current ? 'current' : 'locked';
      const offset = Math.sin(n * 0.9) * 32;
      const node = el('button', {
        class: `node ${state}${n % 10 === 0 ? ' hard' : ''}`,
        style: `transform: translateX(${offset}%)`,
        disabled: state === 'locked',
        onclick: () => this.startLevel(n),
      },
      el('span', { class: 'num' }, state === 'locked' ? '🔒' : String(n)),
      el('span', { class: 'stars' }, state === 'done' ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''));
      map.append(node);
    }
    requestAnimationFrame(() => {
      const target = map.querySelector('.current') || map.lastElementChild;
      target?.scrollIntoView({ block: 'center' });
    });
  }

  // ---------- levels ----------

  startLevel(n) {
    store.syncLives(this.state);
    if (this.state.lives <= 0) {
      this.showLives();
      return;
    }
    const level = getLevel(n);
    this.modal({
      title: `Seviye ${n}${n % 10 === 0 ? ' · Zor' : ''}`,
      body: [
        el('p', { class: 'muted' }, 'Hedefler'),
        el('div', { class: 'goal-list' }, level.goals.map((g) => el('div', { class: 'goal big' },
          goalIcon(g, 44),
          el('span', {}, String(g.count)),
          el('small', {}, g.type === 'box' ? 'Kutu' : COLOR_NAMES[g.color])))),
        el('p', { class: 'moves-info' }, `${level.moves} hamle`),
        (this.state.streak || 0) >= 2 ? el('p', { class: 'tip' }, `🔥 Seri: ${this.state.streak} galibiyet. Bonus güçlendiricilerle başlıyorsun!`) : null,
        n <= 3 ? el('p', { class: 'tip' }, this.tutorialTip(n)) : null,
      ],
      buttons: [{ label: 'Başla', cls: 'primary', onClick: () => this.beginLevel(n) }],
      closable: true,
    });
  }

  tutorialTip(n) {
    return [
      'İki komşu küpü kaydırarak yer değiştir. Aynı renkten 3 tane yan yana gelince patlarlar.',
      '4\'lü sıra roket, L veya T şekli bomba, 5\'li sıra disko topu yapar! Booster\'ları kaydır ya da dokun.',
      'Kutuları kırmak için yanlarında eşleşme yap.',
    ][n - 1];
  }

  beginLevel(n) {
    this.closeModal();
    this.session?.destroy();
    this.showScreen('game');
    // Wait a frame so the board container has its final size.
    requestAnimationFrame(() => { this.session = new GameSession(this, n); });
  }

  levelWon(n, stars, movesLeft) {
    const s = this.state;
    const reward = 20 + stars * 10 + movesLeft * 5;
    s.stars[n] = Math.max(s.stars[n] || 0, stars);
    if (n >= s.level) s.level = Math.min(TOTAL_LEVELS, n + 1);
    s.coins += reward;
    s.streak = (s.streak || 0) + 1;
    this.persist();
    this.sfx.play('coin');
    const isLast = n >= TOTAL_LEVELS;
    this.modal({
      title: 'Seviye Tamamlandı!',
      body: [
        el('div', { class: 'star-row' }, [1, 2, 3].map((i) => el('span', { class: `star${i <= stars ? ' on' : ''}`, style: `animation-delay:${i * 0.2}s` }, '★'))),
        el('p', { class: 'reward' }, `+${reward} 🪙`),
        s.streak >= 2 ? el('p', { class: 'tip' }, `🔥 ${s.streak} galibiyet serisi! Sonraki seviyeye bonus güçlendiriciyle başlarsın.`) : null,
        isLast ? el('p', { class: 'tip' }, 'Tüm seviyeleri bitirdin! Yeni seviyeler yakında.') : null,
      ],
      buttons: [
        { label: 'Harita', onClick: () => { this.closeModal(); this.showHome(); } },
        isLast ? null : { label: 'Sonraki', cls: 'primary', onClick: () => { this.closeModal(); this.showHome(); this.startLevel(n + 1); } },
      ],
    });
  }

  offerMoreMoves(session) {
    const s = this.state;
    const canBuy = s.coins >= PRICES.moves;
    const remaining = session.goals.filter((g) => g.left > 0);
    this.sfx.play('lose');
    this.modal({
      title: 'Hamle Bitti!',
      body: [
        el('p', { class: 'muted' }, 'Bu kadar kaldı:'),
        el('div', { class: 'goal-list' }, remaining.map((g) => el('div', { class: 'goal big' }, goalIcon(g, 40), el('span', {}, String(g.left))))),
      ],
      buttons: [
        { label: `+5 Hamle  ${PRICES.moves} 🪙`, cls: 'primary', disabled: !canBuy, onClick: () => {
          s.coins -= PRICES.moves;
          this.persist();
          this.sfx.play('coin');
          this.closeModal();
          session.addMoves(5);
        } },
        { label: '🎬 Reklam izle: +3 hamle', hidden: session.extraMovesBought > 0, onClick: async () => {
          this.closeModal();
          await showRewardedAd();
          session.addMoves(3);
        } },
        { label: 'Vazgeç', onClick: () => this.levelLost(session.level.number) },
      ],
    });
  }

  levelLost(n) {
    const hadStreak = (this.state.streak || 0) >= 2;
    this.state.streak = 0;
    store.loseLife(this.state);
    this.persist();
    vibrate(80);
    this.modal({
      title: 'Seviye Başarısız',
      body: [
        el('p', { class: 'big-emoji' }, '💔'),
        el('p', { class: 'muted' }, hadStreak ? '1 can kaybettin ve galibiyet serin bitti.' : '1 can kaybettin.'),
      ],
      buttons: [
        { label: 'Harita', onClick: () => { this.closeModal(); this.showHome(); } },
        { label: 'Tekrar Dene', cls: 'primary', onClick: () => { this.closeModal(); this.startLevel(n); } },
      ],
    });
  }

  showPause() {
    if (!this.session) return;
    const session = this.session;
    this.modal({
      title: 'Duraklatıldı',
      body: [el('p', { class: 'muted' }, session.movesUsed > 0 ? 'Şimdi çıkarsan 1 can kaybedersin.' : '')],
      buttons: [
        { label: 'Devam Et', cls: 'primary', onClick: () => this.closeModal() },
        { label: this.state.sound ? '🔊 Ses: Açık' : '🔇 Ses: Kapalı', onClick: () => { this.toggleSound(); this.showPause(); } },
        { label: 'Seviyeden Çık', cls: 'danger', onClick: () => {
          if (session.movesUsed > 0 && session.state !== 'won') {
            this.state.streak = 0;
            store.loseLife(this.state);
            this.persist();
          }
          this.closeModal();
          this.showHome();
        } },
      ],
      closable: true,
    });
  }

  // ---------- economy ----------

  claimDaily() {
    const s = this.state;
    if (s.lastDaily === today()) {
      this.toast('Günlük ödülünü aldın. Yarın tekrar gel!');
      return;
    }
    s.lastDaily = today();
    s.coins += DAILY_REWARD;
    this.persist();
    this.sfx.play('coin');
    this.modal({
      title: 'Günlük Ödül',
      body: [el('p', { class: 'big-emoji' }, '🎁'), el('p', { class: 'reward' }, `+${DAILY_REWARD} 🪙`)],
      buttons: [{ label: 'Harika!', cls: 'primary', onClick: () => this.closeModal() }],
    });
  }

  buy(price, apply) {
    if (this.state.coins < price) {
      this.toast('Yeterli coin yok');
      this.sfx.play('nope');
      return false;
    }
    this.state.coins -= price;
    apply(this.state);
    this.persist();
    this.sfx.play('coin');
    return true;
  }

  showShop() {
    const s = this.state;
    const item = (icon, name, desc, price, apply, disabled = false) => el('div', { class: 'shop-item' },
      el('span', { class: 'shop-icon' }, icon),
      el('div', { class: 'shop-text' }, el('b', {}, name), el('small', {}, desc)),
      el('button', { class: 'btn primary small', disabled, onclick: () => { if (this.buy(price, apply)) this.showShop(); } }, `${price} 🪙`));
    this.modal({
      title: 'Mağaza',
      body: [
        el('p', { class: 'muted' }, `Coin: ${s.coins} 🪙`),
        item(el('img', { src: 'img/hammer.png', class: 'shop-img', alt: '' }), 'Çekiç ×3', `Elinde: ${s.hammer}`, PRICES.hammer, (st) => { st.hammer += 3; }),
        item(el('img', { src: 'img/shuffle.png', class: 'shop-img', alt: '' }), 'Karıştır ×3', `Elinde: ${s.shuffle}`, PRICES.shuffle, (st) => { st.shuffle += 3; }),
        item('❤️', 'Canları Doldur', `${s.lives}/${store.MAX_LIVES}`, PRICES.lives, (st) => { st.lives = store.MAX_LIVES; }, s.lives >= store.MAX_LIVES),
        el('div', { class: 'shop-item' },
          el('span', { class: 'shop-icon' }, '🎬'),
          el('div', { class: 'shop-text' }, el('b', {}, 'Reklam İzle'), el('small', {}, `+${AD_REWARD} coin`)),
          el('button', { class: 'btn small', onclick: async () => {
            this.closeModal();
            await showRewardedAd();
            this.state.coins += AD_REWARD;
            this.persist();
            this.sfx.play('coin');
            this.showShop();
          } }, 'İzle')),
        el('p', { class: 'tip' }, 'Gerçek parayla coin paketleri (Google Play / App Store ödemeleri) yayın sürümünde eklenecek.'),
      ],
      buttons: [{ label: 'Kapat', onClick: () => this.closeModal() }],
      closable: true,
    });
  }

  offerBooster(kind) {
    const info = BOOSTER_INFO[kind];
    const price = PRICES[kind];
    this.modal({
      title: `${info.icon} ${info.name}`,
      body: [el('p', { class: 'muted' }, info.desc), el('p', {}, '3 adet al?')],
      buttons: [
        { label: 'Vazgeç', onClick: () => this.closeModal() },
        { label: `${price} 🪙`, cls: 'primary', onClick: () => {
          if (this.buy(price, (st) => { st[kind] += 3; })) {
            this.closeModal();
            this.session?.updateHud();
          }
        } },
      ],
      closable: true,
    });
  }

  showLives() {
    const s = this.state;
    store.syncLives(s);
    const full = s.lives >= store.MAX_LIVES;
    this.modal({
      title: 'Canlar',
      body: [
        el('p', { class: 'big-emoji' }, '❤️'.repeat(s.lives) + '🤍'.repeat(store.MAX_LIVES - s.lives)),
        el('p', { class: 'muted' }, full ? 'Canların dolu!' : `Her ${store.LIFE_REGEN_MS / 60000} dakikada 1 can dolar.`),
      ],
      buttons: [
        { label: 'Kapat', onClick: () => this.closeModal() },
        full ? null : { label: `Doldur ${PRICES.lives} 🪙`, cls: 'primary', onClick: () => {
          if (this.buy(PRICES.lives, (st) => { st.lives = store.MAX_LIVES; })) this.closeModal();
        } },
      ],
      closable: true,
    });
  }

  showSettings() {
    this.modal({
      title: 'Ayarlar',
      body: [],
      buttons: [
        { label: this.state.sound ? '🔊 Ses: Açık' : '🔇 Ses: Kapalı', onClick: () => { this.toggleSound(); this.showSettings(); } },
        { label: 'İlerlemeyi Sıfırla', cls: 'danger', onClick: () => this.confirmReset() },
        { label: 'Kapat', cls: 'primary', onClick: () => this.closeModal() },
      ],
      closable: true,
    });
  }

  confirmReset() {
    this.modal({
      title: 'Emin misin?',
      body: [el('p', { class: 'muted' }, 'Tüm seviyeler, yıldızlar ve coinler silinecek.')],
      buttons: [
        { label: 'Vazgeç', onClick: () => this.showSettings() },
        { label: 'Sıfırla', cls: 'danger', onClick: () => {
          this.state = { ...store.fresh(), sound: this.state.sound };
          this.persist();
          this.closeModal();
          this.showHome();
        } },
      ],
    });
  }

  toggleSound() {
    this.state.sound = !this.state.sound;
    this.sfx.enabled = this.state.sound;
    this.persist();
  }

  // ---------- modal & toast ----------

  modal({ title, body = [], buttons = [], closable = false }) {
    const card = $('modal-card');
    const actions = buttons.filter((b) => b && !b.hidden).map((b) => el('button', {
      class: `btn ${b.cls || ''}`,
      disabled: !!b.disabled,
      onclick: b.onClick,
    }, b.label));
    card.replaceChildren(...[
      closable ? el('button', { class: 'modal-close', 'aria-label': 'Kapat', onclick: () => this.closeModal() }, '✕') : null,
      el('h2', {}, title),
      el('div', { class: 'modal-body' }, body),
      el('div', { class: 'modal-actions' }, actions),
    ].filter(Boolean));
    $('modal').classList.remove('hidden');
  }

  closeModal() {
    $('modal').classList.add('hidden');
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }
}

loadSprites().then(() => { window.app = new App(); });
