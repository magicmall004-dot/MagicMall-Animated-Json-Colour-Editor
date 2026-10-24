/* Small UX helpers: haptics, colour pop, ambient tint, Telegram header colour */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const root = document.documentElement;
  const hap = (t) => { try { tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged(); } catch (e) {} };

  // tactile feedback on every button press
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn,.icon-btn,.pill,.tab-btn,.mode-btn,.seg-btn,.btn-play,.theme-card')) hap();
  }, { passive: true });

  // swatch "pop" when a colour changes
  document.addEventListener('input', (e) => {
    if (e.target.type !== 'color') return;
    const sw = e.target.closest('.color-card')?.querySelector('.color-swatch,.gradient-swatch');
    if (!sw) return;
    sw.classList.remove('pop'); void sw.offsetWidth; sw.classList.add('pop');
  });

  // ambient glow follows the first colour of the animation
  let raf = 0;
  function sync() {
    raf = 0;
    const sw = document.querySelector('#colors .color-swatch');
    const c = sw && getComputedStyle(sw).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)') root.style.setProperty('--tint', c);
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };
  const colors = document.getElementById('colors');
  if (colors) new MutationObserver(queue).observe(colors, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'value'] });
  document.addEventListener('input', queue);
  queue();

  // Telegram header / background match the theme
  function paint() {
    if (!tg) return;
    const dark = document.body.classList.contains('dark');
    try { tg.setHeaderColor(dark ? '#070b1c' : '#eef1ff'); tg.setBackgroundColor(dark ? '#070b1c' : '#eef1ff'); } catch (e) {}
  }
  paint();
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
