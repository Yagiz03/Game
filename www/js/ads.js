// Rewarded-ad stub. In the store build this is where AdMob (or another ad
// network) plugs in, e.g. via @capacitor-community/admob. Until then it shows
// a short placeholder so the reward flow can be tested end to end.

export function showRewardedAd() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ad-overlay';
    overlay.innerHTML = '<div class="ad-box"><small>REKLAM (ÖRNEK)</small><b>3</b><p>Gerçek reklam burada gösterilecek</p></div>';
    document.body.append(overlay);
    const count = overlay.querySelector('b');
    let left = 3;
    const timer = setInterval(() => {
      left--;
      count.textContent = left;
      if (left <= 0) {
        clearInterval(timer);
        overlay.remove();
        resolve(true);
      }
    }, 1000);
  });
}
