/* Smooth mode: auto-detects weak phones (or slow frames) and switches off the heavy effects. */
(function () {
  const root = document.documentElement, n = navigator, KEY = 'mm_lite';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  const saved = store.get();
  const weak = (n.deviceMemory && n.deviceMemory <= 3) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.connection && n.connection.saveData);
  let lite = saved === '1' || (saved === null && !!weak);

  function apply(on) {
    lite = on; root.classList.toggle('lite', on);
    try { if (window.lottie) window.lottie.setQuality(on ? 'low' : 'high'); } catch (e) {}
    const b = document.getElementById('liteBtn');
    if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.style.opacity = on ? '1' : '.55'; b.title = on ? 'Smooth mode ON (tap to turn off)' : 'Smooth mode OFF (tap for faster, lighter mode)'; }
  }
  root.classList.toggle('lite', lite);

  document.addEventListener('DOMContentLoaded', () => {
    apply(lite);
    const bar = document.querySelector('.toolbar');
    if (bar) {
      const b = document.createElement('button');
      b.id = 'liteBtn'; b.className = 'icon-btn'; b.textContent = '⚡'; b.setAttribute('aria-label', 'Smooth mode');
      b.addEventListener('click', () => { apply(!lite); store.set(lite ? '1' : '0'); });
      bar.appendChild(b); apply(lite);
    }
    // slow device we did not predict? measure real frames for ~1.5 s and switch automatically
    if (saved === null && !lite) {
      setTimeout(() => {
        let f = 0, t0 = 0, t1 = 0;
        const tick = (t) => { if (!t0 && ++f > 8) t0 = t; f++; if (f < 80) requestAnimationFrame(tick); else { t1 = t; const fps = 70000 / (t1 - t0); if (fps && fps < 40) { apply(true); store.set('1'); } } };
        requestAnimationFrame(tick);
      }, 1200);
    }
  });
})();
