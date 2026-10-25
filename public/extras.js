/* TGS requirement gate, Lottie -> SVG frame export (+zip), and the SVG colour editor */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
  .mmx-back{position:fixed;inset:0;z-index:100003;background:rgba(3,6,18,.6);display:flex;align-items:center;justify-content:center;padding:18px}
  .mmx-box{width:min(100%,400px);background:var(--bg,#0c1330);color:var(--text,#fff);border:1px solid var(--border,#334);border-radius:24px;padding:20px;box-shadow:0 30px 80px -20px #000;font-family:var(--font-body,system-ui);animation:modalIn .35s cubic-bezier(.34,1.4,.64,1) both}
  .mmx-box h3{margin:0 0 10px;font:700 18px var(--font-display,inherit)}.mmx-box ul{margin:0 0 16px;padding-left:20px;line-height:1.55;font-size:14px}.mmx-box label{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px}
  .mmx-box input[type=number]{width:70px;padding:7px;border-radius:10px;border:1px solid var(--border,#334);background:var(--surface2,#fff1);color:inherit}
  .mmx-btn{width:100%;height:48px;border:0;border-radius:15px;font:700 15px var(--font-body,inherit);color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--blue,#2f86ff),var(--violet,#7c5cff))}
  .mmx-btn.alt{background:var(--surface2,#fff2);color:inherit;margin-top:8px}
  #mmsv{position:fixed;inset:0;z-index:9000;display:none;flex-direction:column;background:var(--bg,#070b1c);color:var(--text,#fff);font-family:var(--font-body,system-ui)}
  #mmsv.on{display:flex}#mmsv .bar{display:flex;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px 10px}
  #mmsv .bar b{flex:1;font:700 16px var(--font-display,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #mmsv .bar button{height:40px;padding:0 14px;border:0;border-radius:13px;background:var(--surface2,#fff2);color:inherit;font:600 14px var(--font-body,inherit);cursor:pointer}
  #mmsv .bar .go{background:linear-gradient(135deg,var(--blue,#2f86ff),var(--violet,#7c5cff));color:#fff}
  #mmsv .body{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:0 12px max(12px,env(safe-area-inset-bottom))}
  #mmsv .prev{flex:none;height:clamp(150px,34dvh,360px);border-radius:20px;overflow:hidden;border:1px solid var(--border,#334);background:repeating-conic-gradient(#8883 0 25%,#0000 0 50%) 0 0/20px 20px}
  #mmsv .prev>svg{width:100%;height:100%}#mmsv .list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-bottom:8px}
  .mmsv-card{display:grid;grid-template-columns:84px 1fr auto;gap:4px 12px;align-items:center;padding:12px;border-radius:20px;border:1px solid var(--border2,#fff2);background:var(--surface2,#fff1)}
  .mmsv-th{width:84px;height:84px;border-radius:12px;background:repeating-conic-gradient(#8883 0 25%,#0000 0 50%) 0 0/14px 14px;box-shadow:inset 0 0 0 1px var(--border2,#fff2)}.mmsv-th svg{width:100%;height:100%}
  .mmsv-card .nm{font:700 15px var(--font-display,inherit);overflow:hidden;text-overflow:ellipsis}.mmsv-card .sub{font-size:12px;color:var(--text2,#aab)}
  .mmsv-eye{width:42px;height:42px;border:0;border-radius:50%;background:var(--surface2,#fff2);font-size:18px;cursor:pointer;color:inherit}
  .mmsv-chips{grid-column:1/-1;display:flex;gap:9px;flex-wrap:wrap;padding-top:6px}
  .mmsv-chip{position:relative;width:42px;height:42px;border-radius:13px;box-shadow:inset 0 0 0 1px #fff4,0 5px 12px -6px #000}.mmsv-chip input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
  @media(min-width:900px){#mmsv .body{flex-direction:row}#mmsv .prev{flex:1;height:auto}#mmsv .list{flex:1}}`;
  css.textContent += `.mmx-box{max-height:92dvh;overflow-y:auto}.mmx-big{flex:1;height:150px;border-radius:14px;overflow:hidden;background:repeating-conic-gradient(#8883 0 25%,#0000 0 50%) 0 0/16px 16px}.mmx-big img{width:100%;height:100%;object-fit:contain}
  .mmx-step{width:40px;height:40px;border:0;border-radius:50%;background:var(--surface2,#fff2);color:inherit;font-size:22px;cursor:pointer}
  .mmx-strip{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding:4px 2px 10px;margin-bottom:6px}
  .mmx-th{flex:none;scroll-snap-align:center;width:68px;border:2px solid transparent;border-radius:12px;padding:3px;background:var(--surface2,#fff1);cursor:pointer;text-align:center;font-size:11px;color:inherit}.mmx-th.on{border-color:var(--blue,#2f86ff)}
  .mmx-th img{width:100%;height:56px;object-fit:contain;border-radius:8px;display:block;background:repeating-conic-gradient(#8883 0 25%,#0000 0 50%) 0 0/10px 10px}
  .mmsv-chev{width:28px;height:28px;border:0;border-radius:8px;background:none;color:inherit;font-size:15px;cursor:pointer;margin-right:4px}`;
  document.head.appendChild(css);

  function dlg(html) {
    const b = document.createElement('div'); b.className = 'mmx-back';
    b.innerHTML = '<div class="mmx-box">' + html + '</div>'; document.body.appendChild(b);
    b.addEventListener('click', (e) => { if (e.target === b) b.remove(); });
    return b;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 1. TGS requirements: block export and explain ---------- */
  function tgsProblems() {
    const d = animData, p = [], dur = (d.op - d.ip) / d.fr;
    if (d.w !== 512 || d.h !== 512) p.push(`Size is ${d.w}×${d.h}. Telegram needs exactly 512×512.`);
    if (d.fr !== 30 && d.fr !== 60) p.push(`Frame rate is ${d.fr} fps. Use 30 or 60 fps.`);
    if (dur > 3.01) p.push(`Length is ${dur.toFixed(2)} seconds. The maximum is 3 seconds.`);
    const layers = [...(d.layers || []), ...(d.assets || []).flatMap((a) => a.layers || [])], s = JSON.stringify(d);
    if (layers.some((l) => l.ty === 2) || (d.assets || []).some((a) => a.p || a.u)) p.push('It contains images. Telegram stickers can only use vector shapes.');
    if (layers.some((l) => l.ty === 5)) p.push('It contains text layers. Convert text to shapes first.');
    if (layers.some((l) => l.ef && l.ef.length)) p.push('It uses layer effects, which Telegram does not support.');
    if (/"x":"/.test(s)) p.push('It uses expressions, which Telegram does not support.');
    if (/"ty":"mm"/.test(s)) p.push('It uses Merge Paths, which Telegram does not support.');
    try { const kb = buildTgsBytes().length / 1024; if (kb > 64) p.push(`File is ${kb.toFixed(1)} KB. The maximum is 64 KB.`); } catch (e) {}
    return p;
  }
  const origTgs = window.exportTgs;
  window.exportTgs = function () {
    if (!animData) return;
    const p = tgsProblems();
    if (!p.length) return origTgs();
    const b = dlg(`<h3>⚠️ Can't export as TGS</h3><p style="margin:0 0 8px;font-size:14px;opacity:.8">This design doesn't meet Telegram's sticker rules:</p><ul>${p.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul><button class="mmx-btn">OK, I'll fix it</button>`);
    b.querySelector('button').onclick = () => b.remove();
  };

  /* ---------- 2. Lottie -> SVG (one frame or all frames as .zip) ---------- */
  const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    for (const f of files) {
      const n = enc.encode(f.name), d = window.pako.deflateRaw(f.data), c = crc(f.data);
      const l = new DataView(new ArrayBuffer(30)); l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 8, true);
      l.setUint32(14, c, true); l.setUint32(18, d.length, true); l.setUint32(22, f.data.length, true); l.setUint16(26, n.length, true);
      const h = new DataView(new ArrayBuffer(46)); h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true); h.setUint16(10, 8, true);
      h.setUint32(16, c, true); h.setUint32(20, d.length, true); h.setUint32(24, f.data.length, true); h.setUint16(28, n.length, true); h.setUint32(42, off, true);
      parts.push(new Uint8Array(l.buffer), n, d); cd.push(new Uint8Array(h.buffer), n); off += 30 + n.length + d.length;
    }
    const sz = cd.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, sz, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  function frameSvg(f) {
    animInstance.goToAndStop(f, true);
    const s = animEl.querySelector('svg').cloneNode(true);
    s.removeAttribute('style'); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); s.setAttribute('width', animData.w); s.setAttribute('height', animData.h);
    return new XMLSerializer().serializeToString(s);
  }
  function svgDialog() {
    const a = Math.round(animData.ip), z = Math.round(animData.op) - 1, saved = Math.round(animInstance.currentFrame || 0), enc = new TextEncoder(), urls = [];
    let sel = Math.min(z, Math.max(a, saved)), big = '';
    const url = (svg) => { const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); urls.push(u); return u; };
    const b = dlg(`<h3>Export as SVG</h3>
      <div style="display:flex;align-items:center;gap:10px"><button class="mmx-step" id="mxP">‹</button><div class="mmx-big"><img id="mxBig" alt=""></div><button class="mmx-step" id="mxN">›</button></div>
      <div style="text-align:center;font-weight:700;margin:8px 0">Frame <span id="mxL"></span> of ${z}</div>
      <div class="mmx-strip" id="mxStrip"></div>
      <label><input type="radio" name="m" value="one" checked> Only the selected frame</label>
      <label><input type="radio" name="m" value="all"> All frames as .zip, every <input type="number" id="mxS" min="1" max="30" value="1"> frame(s)</label>
      <p style="font-size:12px;opacity:.65;margin:4px 0 14px">${z - a + 1} frames in total. Tap a picture or use ‹ › to pick the exact frame.</p>
      <button class="mmx-btn" id="mxGo">Export</button><button class="mmx-btn alt" id="mxNo">Cancel</button>`);
    const q = (x) => b.querySelector(x), clampF = (v) => Math.min(z, Math.max(a, Math.round(+v || 0)));
    const restore = () => { urls.forEach(URL.revokeObjectURL); try { animInstance.goToAndStop(saved, true); if (!playerPaused) animInstance.play(); } catch (e) {} };
    const close = () => { restore(); b.remove(); };
    b.addEventListener('click', (e) => { if (e.target === b) close(); });
    const show = (f) => { sel = clampF(f); q('#mxL').textContent = sel; if (big) URL.revokeObjectURL(big); big = url(frameSvg(sel)); q('#mxBig').src = big;
      q('input[value=one]').checked = true; b.querySelectorAll('.mmx-th').forEach((t) => t.classList.toggle('on', +t.dataset.f === sel)); };
    q('#mxP').onclick = () => show(sel - 1); q('#mxN').onclick = () => show(sel + 1); q('#mxNo').onclick = close;
    show(sel);
    (async () => {   // horizontal strip of sample frames (max 20) rendered one by one
      const n = Math.min(20, z - a + 1), fr = [...new Set(Array.from({ length: n }, (_, i) => Math.round(a + i * (z - a) / (n - 1 || 1))))];
      for (const f of fr) { if (!b.isConnected) return; const t = document.createElement('button'); t.className = 'mmx-th'; t.dataset.f = f; t.innerHTML = `<img alt=""><span>${f}</span>`;
        t.firstChild.src = url(frameSvg(f)); t.onclick = () => show(f); q('#mxStrip').appendChild(t); await new Promise((r) => setTimeout(r)); }
      if (b.isConnected) show(sel);
    })();
    q('#mxGo').onclick = async (e) => {
      const btn = e.target; btn.disabled = true;
      try {
        if (q('input[name=m]:checked').value === 'all') {
          const step = Math.max(1, +q('#mxS').value || 1), files = [], tot = Math.ceil((z - a + 1) / step);
          for (let f = a; f <= z; f += step) {
            files.push({ name: `${baseName()}-${String(f).padStart(4, '0')}.svg`, data: enc.encode(frameSvg(f)) });
            if (files.length % 3 === 0) { const pc = files.length / tot * 100; btn.textContent = `Rendering… ${Math.round(pc)}%`; if (window.mmLive) window.mmLive.update('rendering frames…', `frame ${f} / ${z}`, pc * 0.5); await new Promise((r) => setTimeout(r)); }
          }
          btn.textContent = 'Zipping…'; if (window.mmLive) window.mmLive.update('zipping…', files.length + ' files', 50); await new Promise((r) => setTimeout(r));
          const zb = zip(files); restore(); b.remove(); window.doDownload(zb, `${baseName()}-svg-frames.zip`);
        } else { const sv = frameSvg(sel); restore(); b.remove(); window.doDownload(new Blob([sv], { type: 'image/svg+xml' }), `${baseName()}-frame-${sel}.svg`); }
      } catch (err) { alert(err.message); close(); }
    };
  }
  $('exportMenuBtn').addEventListener('click', () => {
    const list = $('expMp4Btn') && $('expMp4Btn').parentElement; if (!list || $('expSvgBtn')) return;
    const s = document.createElement('button'); s.id = 'expSvgBtn'; s.className = 'btn';
    s.style.cssText = 'border:1.5px solid #f59e0b;color:#f59e0b;width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;';
    s.innerHTML = '🖼 SVG <span style="font-size:11px;opacity:.6;margin-left:4px;">(one frame or all frames .zip)</span>';
    s.onclick = () => { closeModal('export-modal'); svgDialog(); }; list.appendChild(s);
  });

  /* ---------- 3. SVG colour editor (send an .svg to the bot) ---------- */
  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,text';
  const hexOf = (c) => { if (!/^rgb/.test(c)) return null; const m = c.match(/[\d.]+/g); if (!m || m.length < 3 || (m[3] !== undefined && +m[3] === 0)) return null; return '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join(''); };
  const BAD = /url\(\s*['"]?(?!#|data:image)/i;
  function clean(txt) {
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'), r = doc.documentElement;
    if (r.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new Error('This is not a valid SVG file.');
    r.querySelectorAll('script,foreignObject,iframe,object,embed,audio,video').forEach((e) => e.remove());
    [r, ...r.querySelectorAll('*')].forEach((e) => {
      [...e.attributes].forEach((x) => { const n = x.name.toLowerCase(), v = x.value.trim(); if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !/^(#|data:image\/)/i.test(v)) || BAD.test(v)) e.removeAttribute(x.name); });
      if (e.localName === 'style') e.textContent = e.textContent.replace(/@import[^;]*;?/g, '').replace(new RegExp(BAD.source, 'gi'), 'url(#x');
    });
    return document.importNode(r, true);
  }
  let ed, state;
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function vbox(root) { const v = root.viewBox && root.viewBox.baseVal; return v && v.width ? [v.x, v.y, v.width, v.height] : [0, 0, parseFloat(root.getAttribute('width')) || 512, parseFloat(root.getAttribute('height')) || 512]; }

  window.mmSvgOpen = async function (file) {
    let root; try { root = clean(await file.text()); } catch (e) { return alert(e.message); }
    if (!ed) {
      ed = el('div'); ed.id = 'mmsv';
      ed.innerHTML = '<div class="bar"><button class="x" aria-label="Close">✕</button><b></b><button class="png">PNG</button><button class="go">Export SVG</button></div><div class="body"><div class="prev"></div><div class="list"></div></div>';
      document.body.appendChild(ed);
      ed.querySelector('.x').onclick = () => ed.classList.remove('on');
      ed.querySelector('.go').onclick = () => window.doDownload(new Blob([serialize()], { type: 'image/svg+xml' }), state.name + '-edited.svg');
      ed.querySelector('.png').onclick = toPng;
    }
    const name = file.name.replace(/\.svg$/i, ''), prev = ed.querySelector('.prev'); prev.innerHTML = ''; prev.appendChild(root);
    ed.querySelector('b').textContent = file.name; ed.classList.add('on');
    const vb = vbox(root); if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', vb.join(' '));
    const kidsOf = (h) => [...h.children].filter((c) => /^(g|path|rect|circle|ellipse|polygon|polyline|line|text)$/.test(c.localName));
    let host = root; const hostChain = [root]; while (kidsOf(host).length === 1 && kidsOf(host)[0].localName === 'g' && !kidsOf(host)[0].getAttribute('transform')) { host = kidsOf(host)[0]; hostChain.push(host); }
    const items = []; let uid = 0;
    const cap = (t) => t[0].toUpperCase() + t.slice(1);
    // every group / path becomes a node: group > layers > paths (expandable)
    const mk = (anc) => (n, i) => {
      const oid = n.getAttribute('id'); n.id = 'mmg-' + uid++;
      const node = { el: n, anc, its: [], kids: [], open: false, name: oid || (n.localName === 'g' ? 'Group ' : cap(n.localName) + ' ') + (i + 1) };
      if (n.matches(SHAPES)) { const cs = getComputedStyle(n); ['fill', 'stroke'].forEach((p) => { const h = hexOf(cs[p]); if (h) { n.style[p] = h; const it = { el: n, prop: p, hex: h }; node.its.push(it); items.push(it); } }); }
      if (n.localName === 'g') { node.kids = kidsOf(n).map(mk([...anc, n])); node.kids.forEach((k) => node.its.push(...k.its)); }
      return node;
    };
    const tree = kidsOf(host).map(mk(hostChain));
    const stops = [...root.querySelectorAll('stop')].map((n) => ({ el: n, prop: 'stopColor', hex: hexOf(getComputedStyle(n).stopColor) })).filter((x) => x.hex);
    state = { name, root, vb, items, tree, stops }; render();
  };

  // Thumbnail = the layer drawn inside copies of its parents (transform, clip, inherited fill), so inner paths show in the right place
  const NS = 'http://www.w3.org/2000/svg';
  function thumb(node) {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', state.vb.join(' ')); let cur = svg;
    node.anc.forEach((a) => {
      const g = document.createElementNS(NS, 'g');
      [...a.attributes].forEach((x) => { if (!/^(id|width|height|viewBox|version|xmlns.*|x|y|preserveAspectRatio)$/i.test(x.name)) g.setAttribute(x.name, x.value); });
      cur.appendChild(g); cur = g;
    });
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + node.el.id); cur.appendChild(u);
    return svg;
  }

  function render() {
    const list = ed.querySelector('.list'), top = list.scrollTop; list.innerHTML = '';
    const add = (title, sub, its, node, depth) => {
      const c = el('div', 'mmsv-card'), th = el('div', 'mmsv-th'), mid = el('div'), eye = el('button', 'mmsv-eye', '👁'), chips = el('div', 'mmsv-chips'), nm = el('div', 'nm');
      c.style.marginLeft = depth * 16 + 'px';
      if (node) th.appendChild(thumb(node)); else th.style.background = 'linear-gradient(135deg,#f55,#fc3,#5d5,#3cf,#85f)';
      if (node && node.kids.length) { const ch = el('button', 'mmsv-chev', node.open ? '▾' : '▸'); ch.setAttribute('aria-label', node.open ? 'Collapse' : 'Expand'); ch.onclick = () => { node.open = !node.open; render(); }; nm.append(ch); }
      nm.append(document.createTextNode(title)); mid.append(nm, el('div', 'sub', sub));
      if (node) eye.onclick = () => { const h = node.el.style.display === 'none'; node.el.style.display = h ? '' : 'none'; eye.style.opacity = h ? 1 : .35; }; else eye.style.visibility = 'hidden';
      c.append(th, mid, eye, chips);
      [...new Set(its.map((i) => i.hex))].forEach((hx) => {
        let cur = hx; const ch = el('label', 'mmsv-chip'), inp = el('input'); inp.type = 'color'; inp.value = hx; ch.style.background = hx; ch.appendChild(inp);
        inp.addEventListener('input', () => { const to = inp.value; its.forEach((i) => { if (i.hex === cur) { i.el.style[i.prop] = to; i.hex = to; } }); cur = to; ch.style.background = to; });
        inp.addEventListener('change', () => render());
        chips.appendChild(ch);
      });
      list.appendChild(c);
      if (node && node.open) node.kids.forEach((k) => add(k.name, `${new Set(k.its.map((i) => i.hex)).size} colours` + (k.kids.length ? ` · ${k.kids.length} layers` : ''), k.its, k, depth + 1));
    };
    add('All colours', `${new Set(state.items.map((i) => i.hex)).size} colours, change them everywhere`, state.items, null, 0);
    state.tree.forEach((n) => add(n.name, `${new Set(n.its.map((i) => i.hex)).size} colours` + (n.kids.length ? ` · ${n.kids.length} layers` : ''), n.its, n, 0));
    if (state.stops.length) add('Gradients', `${new Set(state.stops.map((i) => i.hex)).size} colours in gradients`, state.stops, null, 0);
    list.scrollTop = top;
  }
  function serialize() {
    const c = state.root.cloneNode(true); c.querySelectorAll('[id^=mmg-]').forEach((e) => e.removeAttribute('id'));
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', state.vb[2]); c.setAttribute('height', state.vb[3]);
    return new XMLSerializer().serializeToString(c);
  }
  function toPng() {
    const url = URL.createObjectURL(new Blob([serialize()], { type: 'image/svg+xml' })), img = new Image();
    img.onload = () => { const W = 1024, H = Math.round(W * state.vb[3] / state.vb[2]), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(img, 0, 0, W, H); URL.revokeObjectURL(url); cv.toBlob((b) => window.doDownload(b, state.name + '.png')); };
    img.onerror = () => alert('Could not make a PNG from this SVG.'); img.src = url;
  }

  // .svg files picked with "Open" or sent from the bot go to the SVG editor
  const lf = window.loadFiles;
  window.loadFiles = function (arr) {
    const a = [...arr], s = a.filter((f) => /\.svg$/i.test(f.name)), rest = a.filter((f) => !/\.svg$/i.test(f.name));
    if (s.length) window.mmSvgOpen(s[0]);
    return rest.length ? lf(rest) : undefined;
  };
  const fi = $('fileInput'); if (fi) fi.accept = (fi.accept || '') + ',.svg,image/svg+xml';
})();
