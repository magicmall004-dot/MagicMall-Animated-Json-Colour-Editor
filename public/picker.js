/* Magic Mall colour picker: replaces the browser's basic "Select colour" dialog.
   Hooks every <input type="color">: live preview while you drag, Apply keeps, Cancel restores.
   If anything fails, the native picker still opens (safe fallback). */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  const css = `
  .mmp-back{position:fixed;inset:0;z-index:100001;background:rgba(3,6,18,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .25s}
  .mmp-sheet{position:fixed;z-index:100002;left:50%;bottom:0;width:min(100%,460px);max-height:94dvh;overflow-y:auto;transform:translate(-50%,105%);transition:transform .42s cubic-bezier(.34,1.3,.64,1);
    background:color-mix(in srgb,var(--bg,#0c1330) 94%,transparent);color:var(--text,#fff);border:1px solid var(--border,#334);border-bottom:0;border-radius:28px 28px 0 0;
    padding:14px 16px max(16px,env(safe-area-inset-bottom));box-shadow:0 -20px 60px -20px rgba(0,0,0,.6);backdrop-filter:blur(26px) saturate(1.5);-webkit-backdrop-filter:blur(26px) saturate(1.5);font-family:var(--font-body,system-ui)}
  body.mmp-open .mmp-back{opacity:1;pointer-events:auto}
  body.mmp-open .mmp-sheet{transform:translate(-50%,0)}
  .mmp-sheet *{box-sizing:border-box}
  .mmp-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .mmp-top b{font:700 18px var(--font-display,inherit);letter-spacing:-.01em}
  .mmp-x{width:36px;height:36px;border-radius:50%;border:0;background:var(--surface2,#fff2);color:inherit;font-size:16px;cursor:pointer}
  .mmp-cmp{display:flex;gap:10px;margin-bottom:12px}
  .mmp-old,.mmp-new{flex:1;display:flex;align-items:center;gap:10px;height:52px;padding:6px 12px 6px 6px;border-radius:16px;border:1px solid var(--border2,#fff2);background:var(--surface2,#fff1);color:inherit;font:600 13px var(--font-body,inherit);cursor:pointer;text-align:left}
  .mmp-new{cursor:text;border-color:var(--blue,#2f86ff)}
  .mmp-old i,.mmp-new i{width:40px;height:40px;border-radius:11px;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25),0 6px 14px -6px rgba(0,0,0,.5)}
  .mmp-hex{width:100%;min-width:0;border:0;background:transparent;color:inherit;font:700 17px var(--font-mono,monospace);letter-spacing:.04em;outline:0;text-transform:uppercase}
  .mmp-sv{position:relative;height:clamp(150px,27dvh,240px);border-radius:18px;touch-action:none;cursor:crosshair;
    background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,var(--mmp-h,#f00));box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
  .mmp-svt,.mmp-hut{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.25);pointer-events:none;transition:transform .15s}
  .mmp-hue{position:relative;height:26px;margin:14px 0;border-radius:14px;touch-action:none;cursor:pointer;
    background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
  .mmp-hut{top:50%}
  .mmp-sec{margin-top:12px}
  .mmp-sec>span{display:block;font:600 12px var(--font-body,inherit);color:var(--text2,#aab);margin-bottom:7px}
  .mmp-row{display:flex;gap:9px;overflow-x:auto;padding:3px 2px 6px;scrollbar-width:none}
  .mmp-row::-webkit-scrollbar{display:none}
  .mmp-chip{width:38px;height:38px;flex:none;border-radius:12px;border:0;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 4px 10px -5px rgba(0,0,0,.5);transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
  .mmp-chip:active{transform:scale(.88)}
  .mmp-act{display:flex;gap:10px;margin-top:16px}
  .mmp-act button{height:48px;border-radius:16px;border:0;font:700 15px var(--font-body,inherit);cursor:pointer;color:inherit;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
  .mmp-act button:active{transform:scale(.95)}
  .mmp-eye{width:48px;background:var(--surface2,#fff2);display:none}
  .mmp-cancel{flex:1;background:var(--surface2,#fff2)}
  .mmp-ok{flex:2;background:linear-gradient(135deg,var(--blue,#2f86ff),var(--violet,#7c5cff));color:#fff!important;box-shadow:0 12px 26px -12px var(--blue-glow,#2f86ff)}
  @media (min-width:701px){
    .mmp-sheet{bottom:auto;top:50%;border-bottom:1px solid var(--border,#334);border-radius:26px;transform:translate(-50%,-46%) scale(.94);opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(.34,1.4,.64,1),opacity .2s}
    body.mmp-open .mmp-sheet{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}
  }
  @media (prefers-reduced-motion:reduce){.mmp-sheet,.mmp-back{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---- colour maths ---- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const hexToRgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const hsvHex = (h, s, v) => rgbToHex(...hsvToRgb(h, s, v));
  const normHex = (v) => { v = String(v).trim().replace('#', ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, '$&$&'); return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null; };

  /* ---- UI (built once) ---- */
  let back, sheet, sv, svt, hue, hut, hexIn, oldI, newI, secs = {}, eye;
  let target = null, orig = '#000000', H = 0, S = 0, V = 0, raf = 0, pending = null, last = 0;

  function build() {
    back = document.createElement('div'); back.className = 'mmp-back';
    sheet = document.createElement('div'); sheet.className = 'mmp-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Edit colour');
    sheet.innerHTML = `
      <div class="mmp-top"><b>Edit colour</b><button class="mmp-x" aria-label="Close">✕</button></div>
      <div class="mmp-cmp"><button class="mmp-old"><i></i><span>Original</span></button><label class="mmp-new"><i></i><input class="mmp-hex" maxlength="7" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Hex colour"></label></div>
      <div class="mmp-sv"><div class="mmp-svt"></div></div>
      <div class="mmp-hue"><div class="mmp-hut"></div></div>
      <div class="mmp-sec" data-k="shades"><span>Shades of this colour</span><div class="mmp-row"></div></div>
      <div class="mmp-sec" data-k="anim"><span>Colours in this animation</span><div class="mmp-row"></div></div>
      <div class="mmp-sec" data-k="recent"><span>Recently used</span><div class="mmp-row"></div></div>
      <div class="mmp-act"><button class="mmp-eye" aria-label="Pick from screen">💧</button><button class="mmp-cancel">Cancel</button><button class="mmp-ok">Apply</button></div>`;
    document.body.append(back, sheet);
    const q = (s) => sheet.querySelector(s);
    sv = q('.mmp-sv'); svt = q('.mmp-svt'); hue = q('.mmp-hue'); hut = q('.mmp-hut'); hexIn = q('.mmp-hex');
    oldI = q('.mmp-old i'); newI = q('.mmp-new i'); eye = q('.mmp-eye');
    sheet.querySelectorAll('.mmp-sec').forEach(s => secs[s.dataset.k] = s);

    drag(sv, (e) => { const r = sv.getBoundingClientRect(); S = clamp((e.clientX - r.left) / r.width, 0, 1); V = 1 - clamp((e.clientY - r.top) / r.height, 0, 1); commit(false, true); }, renderShades);
    drag(hue, (e) => { const r = hue.getBoundingClientRect(); H = clamp((e.clientX - r.left) / r.width, 0, 1) * 359.99; commit(false, true); }, renderShades);
    hexIn.addEventListener('input', () => { const h = normHex(hexIn.value); if (h) setHex(h, true); });
    q('.mmp-old').onclick = () => setHex(orig);
    q('.mmp-ok').onclick = () => close(true);
    q('.mmp-cancel').onclick = q('.mmp-x').onclick = back.onclick = () => close(false);
    document.addEventListener('keydown', (e) => { if (!target) return; if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); });
    if (window.EyeDropper) { eye.style.display = 'block'; eye.onclick = () => new EyeDropper().open().then(r => setHex(r.sRGBHex)).catch(() => {}); }
  }

  function drag(el, fn, onEnd) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId); fn(e);
      const mv = (ev) => fn(ev);
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (onEnd) onEnd(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }

  function setHex(hex, keepInput) {
    const [r, g, b] = hexToRgb(hex), [h, s, v] = rgbToHsv(r, g, b);
    if (s > 0.02 && v > 0.02) H = h; // keep hue steady for greys / black
    S = s; V = v; commit(keepInput);
  }

  function commit(keepInput, dragging) {
    const hex = hsvHex(H, S, V);
    sv.style.setProperty('--mmp-h', hsvHex(H, 1, 1));
    svt.style.left = S * 100 + '%'; svt.style.top = (1 - V) * 100 + '%'; svt.style.background = hex;
    hut.style.left = (H / 359.99) * 100 + '%'; hut.style.background = hsvHex(H, 1, 1);
    newI.style.background = hex;
    if (!keepInput) hexIn.value = hex.toUpperCase();
    if (!dragging) renderShades();
    pending = hex;
    // send to the editor at most every 70 ms (160 ms in smooth mode) so the heavy re-render doesn't pile up
    const gap = document.documentElement.classList.contains('lite') ? 160 : 70;
    if (!raf) raf = setTimeout(() => { raf = 0; last = performance.now(); if (target && pending) { target.value = pending; target.dispatchEvent(new Event('input', { bubbles: true })); } }, Math.max(0, gap - (performance.now() - last)));
  }

  function chips(key, list) {
    const sec = secs[key], row = sec.querySelector('.mmp-row');
    row.innerHTML = ''; sec.style.display = list.length ? '' : 'none';
    list.forEach((hex) => {
      const b = document.createElement('button'); b.className = 'mmp-chip'; b.style.background = hex; b.title = hex.toUpperCase();
      b.onclick = () => { try { tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged(); } catch (e) {} setHex(hex); };
      row.appendChild(b);
    });
  }
  function renderShades() {
    chips('shades', [[.12, 1], [.3, 1], [.55, 1], [S || .8, 1], [S || .8, .8], [S || .8, .6], [S || .8, .4], [S || .8, .22]]
      .map(([s, v]) => hsvHex(H, s, v)));
  }
  const recent = () => { try { return JSON.parse(localStorage.getItem('mm_recent') || '[]'); } catch (e) { return []; } };
  function animColours() {
    const set = new Set();
    document.querySelectorAll('#colors .color-swatch, #mmsv .mmsv-chip').forEach((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) set.add(rgbToHex(+m[0], +m[1], +m[2]));
    });
    return [...set].slice(0, 24);
  }

  function open(input) {
    if (!sheet) build();
    target = input; orig = normHex(input.value) || '#000000';
    oldI.style.background = orig;
    chips('anim', animColours()); chips('recent', recent());
    setHex(orig);
    document.body.classList.add('mmp-open');
    try { tg && tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
  }

  function close(apply) {
    if (!target) return;
    const t = target; target = null; pending = null;
    if (apply) {
      const hex = hsvHex(H, S, V);
      t.value = hex; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
      try { const r = [hex, ...recent().filter(x => x !== hex)].slice(0, 12); localStorage.setItem('mm_recent', JSON.stringify(r)); } catch (e) {}
      try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
    } else {
      t.value = orig; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.body.classList.remove('mmp-open');
    try { tg && tg.enableVerticalSwipes && tg.enableVerticalSwipes(); } catch (e) {}
  }

  // intercept the native colour dialog; if anything throws, the native one still opens
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'color') return;
    try { open(t); e.preventDefault(); e.stopPropagation(); } catch (err) { console.error('picker', err); document.body.classList.remove('mmp-open'); }
  }, true);
})();
