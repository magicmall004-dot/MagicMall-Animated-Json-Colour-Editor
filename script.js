/* =============================================
   MAGIC MALL LOTTIE COLOUR EDITOR — script.js
   Fully rewritten: bug-free colour extraction,
   improved gradient editor, clean architecture.
   ============================================= */

'use strict';

/* ---- Guard: pako must be present ---- */
if (!window.pako) {
  document.body.innerHTML = '<div style="color:red;padding:24px;font-family:sans-serif;">❌ pako.js failed to load. Please refresh the page.</div>';
  throw new Error('pako missing');
}

/* =============================================
   STATE
   ============================================= */
let animData         = null;   // current (modified) lottie JSON
let originalAnimData = null;   // snapshot at load time (for reset)
let animInstance     = null;   // lottie-web instance
let allColors        = [];     // flat list of extracted colour entries
let groupedColors    = {};     // keyed by hex, value = { hex, instances[] }
let currentFilter    = 'All';
let historyStack     = [];
let redoStack        = [];
const MAX_HISTORY    = 60;
let savedThemes      = JSON.parse(localStorage.getItem('mm_themes') || '[]');
let playerPaused     = true;

/* ---- Gradient editor state ---- */
let gradEdit = null; // { groupObj, gradRef, rawArr, stops[], selectedIdx }

/* =============================================
   DOM REFS
   ============================================= */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const animEl          = $('anim');
const frameSlider     = $('frameSlider');
const frameLabel      = $('frameLabel');
const totalLabel      = $('totalLabel');
const colorsEl        = $('colors');
const colorStatEl     = $('colorStats');
const layerListEl     = $('layerList');
const loadingOverlay  = $('loadingOverlay');
const previewPlaceholder = $('preview-placeholder');
const animInfoEl      = $('animInfo');
const themesList      = $('themesList');
const groupCheckbox   = $('groupDuplicates');
const gradientToggle  = $('gradientToggle');
const browserWarning  = $('browserWarning');

/* =============================================
   UTILITIES
   ============================================= */

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function rgbaArrToHex(arr) {
  if (!arr || arr.length < 3) return '#000000';
  return rgbToHex(Math.round(arr[0]*255), Math.round(arr[1]*255), Math.round(arr[2]*255));
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}

function hexToNorm(hex) {
  if (!hex || hex.length < 4) return { r:0, g:0, b:0 };
  if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n>>16)&255)/255, g: ((n>>8)&255)/255, b: (n&255)/255 };
}

function isValidHex(v) { return /^#([0-9A-Fa-f]{6})$/.test(v.trim()); }

/* =============================================
   ENVIRONMENT DETECTION
   ============================================= */

function isTelegramWebView() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('telegram')) return true;
  if (typeof window.TelegramWebviewProxy !== 'undefined') return true;
  if (typeof window.Telegram !== 'undefined') return true;
  return false;
}

function isRestrictedWebView() {
  const ua = navigator.userAgent.toLowerCase();
  if (isTelegramWebView()) return true;
  if (ua.includes('wv') || ua.includes('instagram') || ua.includes('fban')) return true;
  try { return window.self !== window.top; } catch(_) { return true; }
}

/* FIX: isEmbedded was called in DOMContentLoaded but was never defined */
function isEmbedded() {
  return isRestrictedWebView();
}

/* =============================================
   CLOUDFLARE WORKER URL
   ============================================= */

const WORKER_URL = 'https://lottie-dl.hlaaunghtun68.workers.dev';

/* =============================================
   HISTORY (Undo / Redo)
   ============================================= */

function pushHistory() {
  if (!animData) return;
  const snap = deepCopy(animData);
  const last = historyStack[historyStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
  historyStack.push(snap);
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function undoChange() {
  if (historyStack.length <= 1) return;
  redoStack.push(historyStack.pop());
  animData = deepCopy(historyStack[historyStack.length - 1]);
  afterDataChange();
  updateHistoryButtons();
}

function redoChange() {
  if (!redoStack.length) return;
  historyStack.push(deepCopy(animData));
  animData = redoStack.pop();
  afterDataChange();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('undoBtn').disabled = historyStack.length <= 1;
  $('redoBtn').disabled = redoStack.length === 0;
}

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

$('undoBtn').addEventListener('click', undoChange);
$('redoBtn').addEventListener('click', redoChange);
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  e.shiftKey ? redoChange() : undoChange();
});

/* =============================================
   FILE LOADING
   ============================================= */

async function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  try {
    let txt;
    if (name.endsWith('.tgs')) {
      const buf = await file.arrayBuffer();
      txt = pako.ungzip(new Uint8Array(buf), { to: 'string' });
    } else {
      txt = await file.text();
    }

    const parsed = JSON.parse(txt);
    originalAnimData = deepCopy(parsed);
    animData         = deepCopy(parsed);
    historyStack     = [deepCopy(animData)];
    redoStack        = [];
    updateHistoryButtons();

    previewPlaceholder.style.display = 'none';
    frameSlider.disabled = false;

    afterDataChange();
    updateAnimInfo();
  } catch (err) {
    console.error(err);
    alert('❌ Failed to parse file:\n' + err.message);
  }
}

$('fileInput').addEventListener('change', async e => {
  await loadFile(e.target.files[0]);
  e.target.value = null;
});

/* Drag & Drop */
['dragenter','dragover','dragleave','drop'].forEach(ev =>
  document.body.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
);
['dragenter','dragover'].forEach(ev =>
  document.body.addEventListener(ev, () => document.body.classList.add('dragging'))
);
['dragleave','drop'].forEach(ev =>
  document.body.addEventListener(ev, () => document.body.classList.remove('dragging'))
);
document.body.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

function updateAnimInfo() {
  if (!animData) { animInfoEl.textContent = ''; return; }
  animInfoEl.textContent = `${animData.w}×${animData.h} · ${animData.fr}fps`;
}

/* =============================================
   LOTTIE PLAYER
   ============================================= */

function reloadAnim() {
  showLoading(true);

  setTimeout(() => {
    let savedFrame = 0;
    if (animInstance) {
      try { savedFrame = animInstance.currentFrame; } catch(_) {}
      animInstance.destroy();
      animEl.innerHTML = '';
    }

    if (!animData) { showLoading(false); return; }

    animInstance = lottie.loadAnimation({
      container: animEl,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      animationData: deepCopy(animData),
    });

    let loaded = false;
    const onLoad = () => {
      if (loaded) return; loaded = true;
      const total = Math.round(animInstance.totalFrames || 0);
      frameSlider.max = Math.max(0, total - 1);
      totalLabel.textContent = total;
      const goTo = Math.min(savedFrame, total - 1);
      if (playerPaused) animInstance.goToAndStop(goTo, true);
      else animInstance.goToAndPlay(goTo, true);
      updatePlayBtn();
      showLoading(false);
    };

    animInstance.addEventListener('DOMLoaded', onLoad);
    animInstance.addEventListener('data_ready', onLoad);
    setTimeout(onLoad, 1500); // failsafe

    animInstance.addEventListener('enterFrame', () => {
      if (!frameSlider.matches(':active')) {
        const f = Math.round(animInstance.currentFrame);
        frameSlider.value = f;
        frameLabel.textContent = f;
      }
    });
  }, 30);
}

function showLoading(on) {
  loadingOverlay.style.display = on ? 'flex' : 'none';
}

function updatePlayBtn() {
  $('playPauseBtn').innerHTML = playerPaused ? '<i class="ri-play-fill"></i>' : '<i class="ri-pause-fill"></i>';
}

$('playPauseBtn').addEventListener('click', () => {
  if (!animInstance) return;
  if (playerPaused) { animInstance.play(); playerPaused = false; }
  else              { animInstance.pause(); playerPaused = true; }
  updatePlayBtn();
});

frameSlider.addEventListener('input', () => {
  if (!animInstance) return;
  const f = parseFloat(frameSlider.value);
  if (!playerPaused) { animInstance.pause(); playerPaused = true; updatePlayBtn(); }
  animInstance.goToAndStop(f, true);
  frameLabel.textContent = Math.round(f);
});

/* =============================================
   COLOUR EXTRACTION
   ============================================= */

function extractColors(data) {
  const results = [];
  groupedColors = {};

  function addColor(ref, type, shapeType, hex, gradIndex) {
    const entry = { ref, type, shapeType, hex, gradIndex };
    results.push(entry);
    if (!groupedColors[hex]) groupedColors[hex] = { hex, instances: [] };
    groupedColors[hex].instances.push(entry);
  }

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;

    /* ── Solid fills / strokes ── */
    if (obj.ty === 'fl' || obj.ty === 'st') {
      const sType = obj.ty === 'fl' ? 'Fill' : 'Stroke';
      const c = obj.c;
      if (c) {
        if (c.a === 1 && Array.isArray(c.k)) {
          c.k.forEach(kf => {
            if (kf.s && Array.isArray(kf.s)) {
              addColor(kf, 'solid', sType, rgbaArrToHex(kf.s));
            }
          });
        } else if (Array.isArray(c.k)) {
          addColor(c, 'solid', sType, rgbaArrToHex(c.k));
        } else if (c.k && Array.isArray(c.k.k)) {
          addColor(c.k, 'solid', sType, rgbaArrToHex(c.k.k));
        }
      }
    }

    /* ── Gradients ── */
    if ((obj.ty === 'gf' || obj.ty === 'gs') && obj.g) {
      const sType = obj.ty === 'gf' ? 'Gradient Fill' : 'Gradient Stroke';
      const g = obj.g;
      const numStops = g.p || 0;

      const processArr = (arr, ref) => {
        const count = numStops > 0 ? numStops : Math.floor(arr.length / 4);
        for (let i = 0; i < count * 4; i += 4) {
          if (i + 3 >= arr.length) break;
          const hex = rgbToHex(
            Math.round(arr[i+1]*255),
            Math.round(arr[i+2]*255),
            Math.round(arr[i+3]*255)
          );
          addColor(ref, 'gradient', sType, hex, i);
        }
      };

      if (g.k) {
        if (g.k.a === 1 && Array.isArray(g.k.k)) {
          g.k.k.forEach(kf => {
            if (kf.s && Array.isArray(kf.s)) processArr(kf.s, kf);
          });
        } else if (Array.isArray(g.k.k)) {
          processArr(g.k.k, g.k);
        } else if (Array.isArray(g.k)) {
          processArr(g.k, g);
        }
      }
    }

    /* ── Recurse ── */
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k === 'c' || k === 'sc') continue;
      const v = obj[k];
      if (v && typeof v === 'object') walk(v);
    }
  }

  walk(data);
  return results;
}

/* =============================================
   COLOUR RENDERING
   ============================================= */

function extractAndRender() {
  if (!animData) return;
  allColors = extractColors(animData);
  renderColors();
}

function renderColors() {
  const isGrouped = groupCheckbox.checked;
  const useAdvGrad = gradientToggle.checked;

  let items = [];

  if (isGrouped) {
    Object.values(groupedColors).forEach(group => {
      if (currentFilter !== 'All') {
        if (!group.instances.some(i => i.shapeType.includes(currentFilter))) return;
      }
      const isGrad = group.instances.some(i => i.type === 'gradient');
      items.push({ group, isGrad, hex: group.hex, count: group.instances.length });
    });
  } else {
    allColors.forEach(entry => {
      if (currentFilter !== 'All' && !entry.shapeType.includes(currentFilter)) return;
      items.push({ entry, isGrad: entry.type === 'gradient', hex: entry.hex, count: 1 });
    });
  }

  colorStatEl.textContent = items.length;
  colorsEl.innerHTML = '';

  if (!items.length) {
    colorsEl.innerHTML = '<div class="no-colors"><i class="ri-palette-line"></i><br>No colours found</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'color-card';

    const isGrad = item.isGrad && useAdvGrad;

    if (item.count > 1 || isGrad) {
      const badge = document.createElement('div');
      badge.className = 'color-badge';
      if (isGrad) {
        badge.innerHTML = '<i class="ri-gradienter-line"></i>';
      } else {
        badge.innerHTML = `<i class="ri-stack-fill"></i> ${item.count}`;
      }
      card.appendChild(badge);
    }

    if (isGrad) {
      const gradCss = buildGradientPreviewCss(item.group || null, item.entry || null, isGrouped);
      const swatch = document.createElement('div');
      swatch.className = 'gradient-swatch';
      swatch.style.background = gradCss;
      card.appendChild(swatch);

      const hex = document.createElement('div');
      hex.className = 'color-hex gradient-label';
      hex.textContent = 'GRADIENT';
      card.appendChild(hex);

      card.addEventListener('click', () => {
        openGradientEditor(item.group || buildSingleGroupFromEntry(item.entry));
      });

    } else {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = item.hex;

      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = item.hex;
      picker.title = 'Pick colour';
      swatch.appendChild(picker);
      card.appendChild(swatch);

      const hexEl = document.createElement('div');
      hexEl.className = 'color-hex';
      hexEl.contentEditable = 'true';
      hexEl.spellcheck = false;
      hexEl.textContent = item.hex.toUpperCase();
      card.appendChild(hexEl);

      picker.addEventListener('input', debounce(() => {
        const newHex = picker.value;
        swatch.style.background = newHex;
        hexEl.textContent = newHex.toUpperCase();
        applyColorChange(item, newHex);
        debouncedReload();
      }, 80));

      const applyHexEdit = () => {
        const raw = hexEl.textContent.trim();
        const v = raw.startsWith('#') ? raw : '#' + raw;
        if (isValidHex(v)) {
          picker.value = v;
          swatch.style.background = v;
          hexEl.textContent = v.toUpperCase();
          applyColorChange(item, v);
          debouncedReload();
        }
      };
      hexEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyHexEdit(); hexEl.blur(); } });
      hexEl.addEventListener('blur', applyHexEdit);

      card.addEventListener('click', e => {
        if (e.target === hexEl) return;
        if (e.target === picker) return;
        picker.click();
      });
    }

    colorsEl.appendChild(card);
  });
}

function buildGradientPreviewCss(group, entry, isGrouped) {
  let hexList = [];
  if (isGrouped && group) {
    group.instances
      .filter(i => i.type === 'gradient')
      .forEach(i => { if (!hexList.includes(i.hex)) hexList.push(i.hex); });
  } else if (entry) {
    hexList = [entry.hex, '#333'];
  }
  if (hexList.length === 0) hexList = ['#000', '#fff'];
  if (hexList.length === 1) hexList.push('#555');
  const stops = hexList.map((h, i) => `${h} ${Math.round(i/(hexList.length-1)*100)}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

function buildSingleGroupFromEntry(entry) {
  return { hex: entry.hex, instances: [entry] };
}

/* =============================================
   APPLYING COLOUR CHANGES
   ============================================= */

function applyColorChange(item, newHex) {
  if (!animData) return;
  const { r, g, b } = hexToNorm(newHex);
  const isGrouped = groupCheckbox.checked;

  const instances = isGrouped ? (item.group || {instances:[]}).instances
                              : [item.entry];

  instances.forEach(inst => {
    if (!inst || !inst.ref) return;
    const ref = inst.ref;

    if (inst.type === 'solid') {
      if (ref.s && Array.isArray(ref.s)) {
        const a = ref.s[3] !== undefined ? ref.s[3] : 1;
        ref.s = [r, g, b, a];
      } else if (Array.isArray(ref.k)) {
        const a = ref.k[3] !== undefined ? ref.k[3] : 1;
        ref.k = [r, g, b, a];
      } else if (ref.k && Array.isArray(ref.k.k)) {
        const a = ref.k.k[3] !== undefined ? ref.k.k[3] : 1;
        ref.k.k = [r, g, b, a];
      }
    } else if (inst.type === 'gradient' && inst.gradIndex !== undefined) {
      const arr = resolveGradientArray(ref);
      if (arr && arr.length > inst.gradIndex + 3) {
        arr[inst.gradIndex + 1] = r;
        arr[inst.gradIndex + 2] = g;
        arr[inst.gradIndex + 3] = b;
      }
    }
  });

  if (isGrouped && item.group) item.group.hex = newHex;
  allColors = extractColors(animData);
}

function resolveGradientArray(ref) {
  if (Array.isArray(ref.k))       return ref.k;
  if (ref.k && Array.isArray(ref.k.k)) return ref.k.k;
  if (Array.isArray(ref.s))       return ref.s;
  if (ref.s && Array.isArray(ref.s[0])) return ref.s[0];
  if (Array.isArray(ref))         return ref;
  return null;
}

const debouncedReload = debounce(() => {
  pushHistory();
  reloadAnim();
}, 250);

/* =============================================
   FILTERS & GROUPING
   ============================================= */

$$('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderColors();
  });
});

groupCheckbox.addEventListener('change', renderColors);
gradientToggle.addEventListener('change', renderColors);

/* =============================================
   RESET
   ============================================= */

$('resetColorsBtn').addEventListener('click', () => {
  if (!originalAnimData) return;
  if (!confirm('Reset all colours to original?')) return;
  animData = deepCopy(originalAnimData);
  pushHistory();
  afterDataChange();
});

/* =============================================
   LAYERS
   ============================================= */

function renderLayers() {
  layerListEl.innerHTML = '';
  if (!animData?.layers) {
    layerListEl.innerHTML = '<div class="empty-state"><i class="ri-stack-line"></i>No layers</div>';
    return;
  }
  animData.layers.forEach((layer, idx) => {
    const row = document.createElement('div');
    row.className = 'layer-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'layer-name';
    nameInput.value = layer.nm || `Layer ${idx + 1}`;
    nameInput.addEventListener('change', () => { pushHistory(); layer.nm = nameInput.value; });

    const visCheckbox = document.createElement('input');
    visCheckbox.type = 'checkbox';
    visCheckbox.className = 'vis-toggle';
    visCheckbox.checked = !layer.hd;
    visCheckbox.title = 'Toggle visibility';
    visCheckbox.addEventListener('change', () => {
      pushHistory(); layer.hd = !visCheckbox.checked; reloadAnim();
    });

    row.appendChild(nameInput);
    row.appendChild(visCheckbox);
    layerListEl.appendChild(row);
  });
}

$('refreshLayers').addEventListener('click', renderLayers);

/* =============================================
   TABS
   ============================================= */

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${target}`).classList.add('active');
    if (target === 'themes') renderThemes();
    if (target === 'layers') renderLayers();
  });
});

/* =============================================
   THEMES
   ============================================= */

$('saveThemeBtn').addEventListener('click', () => {
  if (!animData) return alert('Load an animation first.');
  const groups = Object.values(groupedColors);
  if (!groups.length) return alert('No colours found to save.');

  const name = prompt('Theme name:', `Theme ${savedThemes.length + 1}`);
  if (!name) return;

  savedThemes.push({
    id: Date.now(),
    name,
    colors: groups.map(g => ({ hex: g.hex })),
  });
  localStorage.setItem('mm_themes', JSON.stringify(savedThemes));
  renderThemes();
});

function renderThemes() {
  if (!savedThemes.length) {
    themesList.innerHTML = '<div class="empty-state"><i class="ri-bookmark-line"></i>No themes saved yet</div>';
    return;
  }
  themesList.innerHTML = '';
  savedThemes.forEach(theme => {
    const card = document.createElement('div');
    card.className = 'theme-card';

    const head = document.createElement('div');
    head.className = 'theme-card-head';

    const nameEl = document.createElement('div');
    nameEl.className = 'theme-card-name';
    nameEl.textContent = theme.name;

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-primary';
    applyBtn.style.cssText = 'padding:4px 10px;font-size:11px;';
    applyBtn.innerHTML = '<i class="ri-palette-line"></i> Apply';
    applyBtn.addEventListener('click', () => applyTheme(theme));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger-sm';
    delBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
    delBtn.addEventListener('click', () => deleteTheme(theme.id));

    head.appendChild(nameEl);
    head.appendChild(applyBtn);
    head.appendChild(delBtn);

    const swatches = document.createElement('div');
    swatches.className = 'theme-swatches';
    theme.colors.slice(0, 9).forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'theme-swatch';
      sw.style.background = c.hex;
      sw.title = c.hex;
      swatches.appendChild(sw);
    });
    if (theme.colors.length > 9) {
      const more = document.createElement('span');
      more.className = 'theme-more';
      more.textContent = `+${theme.colors.length - 9}`;
      swatches.appendChild(more);
    }

    card.appendChild(head);
    card.appendChild(swatches);
    themesList.appendChild(card);
  });
}

function applyTheme(theme) {
  if (!animData) return alert('Load an animation first.');
  pushHistory();
  allColors = extractColors(animData);
  const groups = Object.values(groupedColors);

  theme.colors.forEach((tc, i) => {
    if (!groups[i]) return;
    const fakeItem = { group: groups[i], entry: groups[i].instances[0] };
    const wasGrouped = groupCheckbox.checked;
    groupCheckbox.checked = true;
    applyColorChange(fakeItem, tc.hex);
    groupCheckbox.checked = wasGrouped;
  });

  afterDataChange();
}

function deleteTheme(id) {
  if (!confirm('Delete this theme?')) return;
  savedThemes = savedThemes.filter(t => t.id !== id);
  localStorage.setItem('mm_themes', JSON.stringify(savedThemes));
  renderThemes();
}

/* =============================================
   AFTER DATA CHANGE — centralised
   ============================================= */

function afterDataChange() {
  extractAndRender();
  renderLayers();
  reloadAnim();
  updateAnimInfo();
}

/* =============================================
   GRADIENT EDITOR
   ============================================= */

function openGradientEditor(groupObj) {
  const gradInst = groupObj.instances.find(i => i.type === 'gradient');
  if (!gradInst) return alert('No gradient found in this group.');

  const ref = gradInst.ref;
  const rawArr = resolveGradientArray(ref);
  if (!rawArr) return alert('Cannot resolve gradient data array.');

  const stops = [];
  for (let i = 0; i < rawArr.length; i += 4) {
    if (i + 3 >= rawArr.length) break;
    const pos = rawArr[i];
    const r = rawArr[i+1], g = rawArr[i+2], b = rawArr[i+3];
    stops.push({
      pos: parseFloat(pos),
      r: parseFloat(r), g: parseFloat(g), b: parseFloat(b),
      hex: rgbToHex(Math.round(r*255), Math.round(g*255), Math.round(b*255)),
    });
  }
  stops.sort((a,b) => a.pos - b.pos);

  gradEdit = { groupObj, ref, rawArr, stops, selectedIdx: 0 };

  renderGradientEditor();
  openModal('gradient-editor-modal');
}

function renderGradientEditor() {
  if (!gradEdit) return;
  const { stops, selectedIdx } = gradEdit;

  const bar = $('gradientBar');
  const gradCss = stops.map(s => `${s.hex} ${(s.pos*100).toFixed(1)}%`).join(', ');
  bar.style.background = `linear-gradient(90deg, ${gradCss})`;

  bar.querySelectorAll('.gradient-stop-pin').forEach(el => el.remove());

  stops.forEach((s, idx) => {
    const pin = document.createElement('div');
    pin.className = 'gradient-stop-pin' + (idx === selectedIdx ? ' selected' : '');
    pin.style.left = (s.pos * 100) + '%';
    pin.style.background = s.hex;
    pin.title = `Stop ${idx+1}: ${s.hex} @ ${Math.round(s.pos*100)}%`;
    pin.addEventListener('mousedown',  e => { e.stopPropagation(); selectStop(idx); startDragPin(e, idx); });
    pin.addEventListener('touchstart', e => { e.stopPropagation(); selectStop(idx); startDragPin(e, idx); }, {passive:false});
    bar.appendChild(pin);
  });

  bar.onclick = e => {
    if (e.target !== bar) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    addStop(pos);
    renderGradientEditor();
  };

  $('gradientPositionsLabel').textContent = stops.map(s => Math.round(s.pos*100)+'%').join(' · ');
  $('stopCountLabel').textContent = stops.length;

  const list = $('gradientStopsList');
  list.innerHTML = '';

  stops.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'gs-row' + (idx === selectedIdx ? ' selected' : '');

    const swatch = document.createElement('div');
    swatch.className = 'gs-swatch';
    swatch.style.background = s.hex;

    const controls = document.createElement('div');
    controls.className = 'gs-controls';

    const inputs = document.createElement('div');
    inputs.className = 'gs-inputs';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = s.hex;
    colorPicker.className = 'gs-color-input';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'gs-hex';
    hexInput.value = s.hex.toUpperCase();
    hexInput.maxLength = 7;

    colorPicker.addEventListener('input', () => {
      s.hex = colorPicker.value;
      const { r, g, b } = hexToNorm(s.hex);
      s.r = r; s.g = g; s.b = b;
      hexInput.value = s.hex.toUpperCase();
      swatch.style.background = s.hex;
      const gradCss = gradEdit.stops.map(x => `${x.hex} ${(x.pos*100).toFixed(1)}%`).join(', ');
      $('gradientBar').style.background = `linear-gradient(90deg, ${gradCss})`;
    });

    hexInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const v = hexInput.value.trim().startsWith('#') ? hexInput.value.trim() : '#'+hexInput.value.trim();
      if (!isValidHex(v)) return;
      colorPicker.value = v;
      s.hex = v; const {r,g,b} = hexToNorm(v); s.r=r;s.g=g;s.b=b;
      swatch.style.background = v;
      renderGradientEditor();
    });
    hexInput.addEventListener('blur', () => {
      const v = hexInput.value.trim().startsWith('#') ? hexInput.value.trim() : '#'+hexInput.value.trim();
      if (!isValidHex(v)) { hexInput.value = s.hex.toUpperCase(); return; }
      colorPicker.value = v;
      s.hex = v; const {r,g,b} = hexToNorm(v); s.r=r;s.g=g;s.b=b;
    });

    inputs.appendChild(colorPicker);
    inputs.appendChild(hexInput);

    const posRow = document.createElement('div');
    posRow.className = 'gs-pos-row';

    const posLabel = document.createElement('span');
    posLabel.textContent = Math.round(s.pos * 100) + '%';
    posLabel.style.minWidth = '30px';

    const posSlider = document.createElement('input');
    posSlider.type = 'range'; posSlider.min = 0; posSlider.max = 100;
    posSlider.value = Math.round(s.pos * 100);
    posSlider.addEventListener('input', () => {
      s.pos = posSlider.value / 100;
      posLabel.textContent = posSlider.value + '%';
      gradEdit.stops.sort((a,b) => a.pos - b.pos);
      const gradCss = gradEdit.stops.map(x => `${x.hex} ${(x.pos*100).toFixed(1)}%`).join(', ');
      $('gradientBar').style.background = `linear-gradient(90deg, ${gradCss})`;
    });
    posSlider.addEventListener('change', () => renderGradientEditor());

    posRow.appendChild(posLabel);
    posRow.appendChild(posSlider);

    controls.appendChild(inputs);
    controls.appendChild(posRow);

    const delBtn = document.createElement('button');
    delBtn.className = 'gs-del';
    delBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
    delBtn.title = 'Remove stop';
    delBtn.addEventListener('click', () => {
      if (gradEdit.stops.length <= 2) return alert('Need at least 2 stops.');
      gradEdit.stops.splice(idx, 1);
      gradEdit.selectedIdx = 0;
      renderGradientEditor();
    });

    row.appendChild(swatch);
    row.appendChild(controls);
    row.appendChild(delBtn);
    row.addEventListener('click', () => selectStop(idx));
    list.appendChild(row);
  });

  const alphaSlider = $('gradientAlpha');
  alphaSlider.oninput = () => { $('gradientBar').style.opacity = alphaSlider.value; };

  $('addGradientStop').onclick    = () => { addStop(); renderGradientEditor(); };
  $('applyGradientChanges').onclick  = applyGradientEdits;
  $('gradientReverseBtn').onclick  = () => { reverseStops(); renderGradientEditor(); };
  $('gradientResetBtn').onclick    = () => { resetStops(); renderGradientEditor(); };
}

function selectStop(idx) {
  if (!gradEdit) return;
  gradEdit.selectedIdx = idx;
  $$('.gradient-stop-pin').forEach((el,i) => el.classList.toggle('selected', i === idx));
  $$('.gs-row').forEach((el,i) => el.classList.toggle('selected', i === idx));
}

function addStop(atPos) {
  if (!gradEdit) return;
  const stops = gradEdit.stops;
  const pos = atPos !== undefined ? atPos : (stops.length >= 2 ? (stops[0].pos + stops[stops.length-1].pos) / 2 : 0.5);
  const midHex = stops.length ? stops[Math.floor(stops.length/2)].hex : '#ffffff';
  const { r, g, b } = hexToNorm(midHex);
  stops.push({ pos, r, g, b, hex: midHex });
  stops.sort((a,b) => a.pos - b.pos);
}

function removeStop(idx) {
  if (!gradEdit || gradEdit.stops.length <= 2) return;
  gradEdit.stops.splice(idx, 1);
  gradEdit.selectedIdx = 0;
}

function reverseStops() {
  if (!gradEdit) return;
  gradEdit.stops = gradEdit.stops.map(s => ({ ...s, pos: 1 - s.pos })).sort((a,b) => a.pos - b.pos);
}

function resetStops() {
  if (!gradEdit) return;
  const raw = gradEdit.rawArr;
  const stops = [];
  for (let i = 0; i < raw.length; i += 4) {
    const r=raw[i+1], g=raw[i+2], b=raw[i+3];
    stops.push({ pos:raw[i], r, g, b, hex: rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255)) });
  }
  gradEdit.stops = stops.sort((a,b) => a.pos - b.pos);
}

function applyGradientEdits() {
  if (!gradEdit) return;
  const { ref, stops } = gradEdit;

  const newRaw = [];
  stops.forEach(s => {
    newRaw.push(s.pos, s.r, s.g, s.b);
  });

  if (Array.isArray(ref.k)) {
    ref.k.splice(0, ref.k.length, ...newRaw);
  } else if (ref.k && Array.isArray(ref.k.k)) {
    ref.k.k.splice(0, ref.k.k.length, ...newRaw);
  } else if (Array.isArray(ref.s)) {
    ref.s.splice(0, ref.s.length, ...newRaw);
  } else {
    ref.k = newRaw;
  }

  if (gradEdit.groupObj) gradEdit.groupObj.hex = stops[0]?.hex || '#000000';
  gradEdit = null;

  closeModal('gradient-editor-modal');
  pushHistory();
  afterDataChange();
}

/* Pin drag */
let _dragging = null;

function startDragPin(e, idx) {
  e.preventDefault();
  _dragging = idx;
  const bar = $('gradientBar');
  const rect = bar.getBoundingClientRect();

  function onMove(ev) {
    const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
    if (clientX == null) return;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    gradEdit.stops[_dragging].pos = pos;
    gradEdit.stops.sort((a,b) => a.pos - b.pos);
    const gradCss = gradEdit.stops.map(s => `${s.hex} ${(s.pos*100).toFixed(1)}%`).join(', ');
    bar.style.background = `linear-gradient(90deg, ${gradCss})`;
    const pins = bar.querySelectorAll('.gradient-stop-pin');
    pins.forEach((p,i) => { p.style.left = (gradEdit.stops[i].pos * 100) + '%'; });
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    _dragging = null;
    renderGradientEditor();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
}

/* =============================================
   SETTINGS MODAL
   ============================================= */

$('settingsBtn').addEventListener('click', () => {
  if (!animData) return alert('Load an animation first.');
  $('set-w').value  = animData.w;
  $('set-h').value  = animData.h;
  $('set-fr').value = animData.fr;
  const scale = parseFloat(animEl.style.getPropertyValue('--lottie-scale')) || 1;
  $('set-scale').value = Math.round(scale * 100);
  openModal('settings-modal');
});

$('applySettings').addEventListener('click', () => {
  const w  = parseInt($('set-w').value);
  const h  = parseInt($('set-h').value);
  const fr = parseFloat($('set-fr').value);
  const sc = parseFloat($('set-scale').value) / 100;

  if ([w,h,fr].some(v => isNaN(v) || v <= 0) || isNaN(sc) || sc <= 0) {
    return alert('Please enter valid positive values.');
  }

  if (animData.w !== w || animData.h !== h || animData.fr !== fr) {
    pushHistory();
    animData.w = w; animData.h = h; animData.fr = fr;
    reloadAnim();
    updateAnimInfo();
  }
  animEl.style.setProperty('--lottie-scale', sc);
  closeModal('settings-modal');
});

/* =============================================
   TGS SCAN
   ============================================= */

$('tgsScanBtn').addEventListener('click', () => {
  if (!animData) return alert('Load a Lottie file first.');
  runTgsScan();
});

function runTgsScan() {
  const { w, h, fr, op, ip = 0 } = animData;
  const duration = (op - ip) / fr;

  const checks = [
    { label: 'Size (512×512)', pass: w === 512 && h === 512, current: `${w}×${h}`, req: '512×512' },
    { label: 'Frame Rate (60 fps)', pass: fr === 60, current: `${fr} fps`, req: '60 fps' },
    { label: 'Duration (≤ 3s)', pass: duration <= 3, current: `${duration.toFixed(2)}s`, req: '≤ 3.0s' },
  ];

  const allPass = checks.every(c => c.pass);

  const resultsEl = $('tgs-results');
  resultsEl.innerHTML = `
    <div class="scan-summary ${allPass ? 'scan-pass' : 'scan-fail'}">
      <i class="ri-${allPass ? 'checkbox-circle' : 'error-warning'}-line"></i>
      ${allPass ? 'Passed! Ready for Telegram.' : 'Issues found. Fix before exporting.'}
    </div>
  ` + checks.map(c => `
    <div class="check-row ${c.pass ? 'check-pass' : 'check-fail'}">
      <div>
        <div class="check-label">${c.label}</div>
        <div class="check-val">${c.current} &nbsp;(req: ${c.req})</div>
      </div>
      <i class="ri-${c.pass ? 'check' : 'close'}-circle-fill check-icon"></i>
    </div>
  `).join('');

  $('tgsExportBtn').onclick = () => { closeModal('tgs-scan-modal'); exportTgs(); };
  openModal('tgs-scan-modal');
}

/* =============================================
   EXPORT — Telegram WebView Compatible
   ============================================= */

/* ---- Build blobs ---- */
function buildJsonBlob() {
  if (!animData) return null;
  return new Blob([JSON.stringify(animData, null, 2)], { type: 'application/json' });
}

function buildTgsBlob() {
  if (!animData) return null;
  const out = deepCopy(animData);
  out.tgs = 1;
  const compressed = pako.gzip(JSON.stringify(out));
  return new Blob([compressed], { type: 'application/octet-stream' });
}

/* ---- Strategy 1: Normal anchor download (real browsers) ---- */
function anchorDownload(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch(_) { return false; }
}

/* ---- Strategy 2: Web Share API ---- */
async function tryWebShare(blob, filename) {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    const file = new File([blob], filename, { type: blob.type });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch(e) {
    if (e.name === 'AbortError') return 'cancelled';
    return false;
  }
}

/* ---- Strategy 3: Upload to Cloudflare Worker, get a real download URL ---- */
async function uploadToServer(blob, filename) {
  try {
    const formData = new FormData();
    formData.append('file', blob, filename);

    const res = await fetch(WORKER_URL + '/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch(_) {
    return null;
  }
}

/* ---- QR Code (no library needed) ---- */
function getQrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
}

/* ---- Show result modal with URL + QR ---- */
function showDownloadLink(url, filename) {
  const box = $('exportModalBox');
  box.innerHTML = `
    <div class="modal-head">
      <h3><i class="ri-links-line"></i> File Ready!</h3>
      <button class="btn btn-ghost icon-btn modal-close-btn" data-modal="export-modal">
        <i class="ri-close-line"></i>
      </button>
    </div>

    <div style="text-align:center;margin:4px 0 14px;">
      <img src="${getQrUrl(url)}" width="160" height="160"
           style="border-radius:12px;border:4px solid var(--blue);padding:4px;background:white;"
           alt="QR Code" />
      <p style="margin:8px 0 0;font-size:12px;color:var(--text2);">
        📷 QR Code scan လုပ်ပြီး download ဆွဲနိုင်သည်
      </p>
    </div>

    <div style="display:flex;align-items:center;gap:8px;
                background:var(--surface2);border:1px solid var(--border);
                border-radius:10px;padding:10px 12px;margin-bottom:12px;">
      <input id="dlUrlInput" readonly value="${url}"
             style="flex:1;background:transparent;border:none;
                    font-family:var(--font-mono);font-size:11px;
                    color:var(--text);outline:none;min-width:0;" />
      <button id="copyUrlBtn" class="btn btn-primary" style="padding:6px 12px;font-size:12px;flex-shrink:0;">
        <i class="ri-clipboard-line"></i> Copy
      </button>
    </div>

    <div class="tg-save-steps">
      <div class="tg-step">
        <span class="tg-step-num">1</span>
        <span><strong>Copy</strong> ကိုနှိပ်ပြီး link ကို copy ကူးပါ</span>
      </div>
      <div class="tg-step">
        <span class="tg-step-num">2</span>
        <span>Chrome / Safari browser ဖွင့်ပြီး link paste လုပ်ပါ</span>
      </div>
      <div class="tg-step">
        <span class="tg-step-num">3</span>
        <span>File auto-download ဆင်းသွားပါလိမ့်မည် <span style="opacity:.6;">(1 hr မှသာ ရနိုင်သည်)</span></span>
      </div>
    </div>

    <div class="modal-footer">
      <a href="${url}" target="_blank" class="btn btn-primary"
         style="flex:1;justify-content:center;text-decoration:none;">
        <i class="ri-external-link-line"></i> Open Link
      </a>
      <button class="btn btn-ghost modal-close-btn" data-modal="export-modal" style="flex:1;justify-content:center;">
        Close
      </button>
    </div>
  `;

  $('copyUrlBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      $('copyUrlBtn').innerHTML = '<i class="ri-check-line"></i> Copied!';
      setTimeout(() => { $('copyUrlBtn').innerHTML = '<i class="ri-clipboard-line"></i> Copy'; }, 2000);
    }).catch(() => {
      $('dlUrlInput').select();
    });
  });
}

/* ---- Show base64 long-press fallback (last resort) ---- */
function showBase64Fallback(blob, filename) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUri = reader.result;
    const box = $('exportModalBox');
    box.innerHTML = `
      <div class="modal-head">
        <h3><i class="ri-save-line"></i> Save File</h3>
        <button class="btn btn-ghost icon-btn modal-close-btn" data-modal="export-modal">
          <i class="ri-close-line"></i>
        </button>
      </div>

      <p style="font-size:13px;color:var(--text2);margin:0 0 14px;line-height:1.6;">
        Telegram မှ direct download မရပါ။ အောက်ပါ နည်းလမ်းကို သုံးပါ:
      </p>

      <a href="${dataUri}" download="${filename}"
         style="display:flex;align-items:center;justify-content:center;gap:10px;
                padding:14px;border-radius:12px;text-decoration:none;
                background:linear-gradient(135deg,#0b84ff,#0055cc);
                color:white;font-weight:700;font-size:14px;
                box-shadow:0 4px 16px rgba(11,132,255,.4);margin-bottom:14px;">
        <i class="ri-download-2-line" style="font-size:20px;"></i>
        Download ${filename}
      </a>

      <div class="tg-save-steps">
        <div class="tg-step">
          <span class="tg-step-num">1</span>
          <span>အပေါ် <strong>Download</strong> button ကို <strong>ဖိထားပါ</strong> (Long press)</span>
        </div>
        <div class="tg-step">
          <span class="tg-step-num">2</span>
          <span><strong>"Download link"</strong> သို့မဟုတ် <strong>"Save"</strong> ကိုရွေးပါ</span>
        </div>
        <div class="tg-step" style="background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3);">
          <span class="tg-step-num" style="background:#f59e0b;">!</span>
          <span>မရပါက <strong>(•••) → Open in Browser</strong> → Chrome မှ download လုပ်ပါ</span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost modal-close-btn" data-modal="export-modal"
                style="width:100%;justify-content:center;">Close</button>
      </div>
    `;
  };
  reader.readAsDataURL(blob);
}

/* ---- Master export handler ---- */
async function smartExport(type) {
  const blob     = type === 'json' ? buildJsonBlob() : buildTgsBlob();
  const filename = type === 'json' ? 'lottie-edited.json' : 'animation.tgs';
  if (!blob) return;

  const box = $('exportModalBox');

  /* ── Strategy 1: Normal browser — anchor download, no modal needed ── */
  if (!isRestrictedWebView()) {
    const ok = anchorDownload(blob, filename);
    if (ok) { closeModal('export-modal'); return; }
  }

  /* ── We are inside a restricted WebView (Telegram etc.) ── */

  /* Show a "preparing" screen while we upload */
  box.innerHTML = `
    <div style="text-align:center;padding:40px 0;">
      <div class="spinner" style="margin:0 auto 14px;"></div>
      <div style="font-size:14px;font-weight:600;color:var(--text);">Preparing file...</div>
      <div style="font-size:12px;color:var(--text2);margin-top:6px;">Download link ပြင်ဆင်နေသည်</div>
    </div>
  `;
  openModal('export-modal');
  await new Promise(r => setTimeout(r, 80));

  /* ── Strategy 2: Telegram native downloadFile API (Bot API 8.0+) ──
       Upload to Worker first to get a real HTTPS URL, then hand it to
       Telegram.WebApp.downloadFile() which shows a native save dialog. */
  const tg = window.Telegram?.WebApp;
  if (tg && typeof tg.downloadFile === 'function') {
    const workerUrl = await uploadToServer(blob, filename);
    if (workerUrl) {
      closeModal('export-modal');
      tg.downloadFile(workerUrl, filename, status => {
        /* status: 'downloading' | 'cancelled' | 'failed' — ignore silently */
      });
      return;
    }
  }

  /* ── Strategy 3: Web Share API (iOS Safari in Mini App sometimes supports this) ── */
  const shared = await tryWebShare(blob, filename);
  if (shared === true)        { closeModal('export-modal'); return; }
  if (shared === 'cancelled') { closeModal('export-modal'); return; }

  /* ── Strategy 4: Upload to Worker → show URL + QR code for user to open in browser ── */
  const workerUrl = await uploadToServer(blob, filename);
  if (workerUrl) {
    showDownloadLink(workerUrl, filename);
    return;
  }

  /* ── Strategy 5: base64 data-URI long-press fallback (last resort) ── */
  showBase64Fallback(blob, filename);
}

/* ---- Export button ---- */
$('exportMenuBtn').addEventListener('click', () => {
  if (!animData) return alert('Load a Lottie file first.');
  const box = $('exportModalBox');
  const inTg = isRestrictedWebView();

  box.innerHTML = `
    <div class="export-icon"><i class="ri-download-cloud-2-line"></i></div>
    <div class="export-title">Export Animation</div>
    <p class="export-sub" style="text-align:center;margin-bottom:16px;">
      Format ကိုရွေးပြီး Download ဆွဲပါ
    </p>

    ${inTg ? `
    <div style="padding:10px 14px;background:rgba(42,171,238,.1);border:1px solid rgba(42,171,238,.3);
                border-radius:10px;font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6;">
      <i class="ri-telegram-line" style="color:#2AABEE;"></i>
      <strong style="color:var(--text);">Telegram မှဖွင့်ထားသည်</strong> —
      Download link တစ်ခုပေးပါမည်။ Chrome/Safari မှ ဖွင့်ပြီး save လုပ်နိုင်သည်။
    </div>` : ''}

    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="expJsonBtn" class="btn"
              style="border:1.5px solid var(--blue);color:var(--blue);
                     width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;">
        <i class="ri-file-code-line"></i> JSON
        <span style="font-size:11px;opacity:.6;margin-left:4px;">(After Effects / Web)</span>
      </button>
      <button id="expTgsBtn" class="btn btn-primary"
              style="background:linear-gradient(135deg,#2AABEE,#1a8bbf);border:none;
                     width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;
                     box-shadow:0 4px 14px rgba(42,171,238,.4);">
        <i class="ri-telegram-line"></i> TGS
        <span style="font-size:11px;opacity:.85;margin-left:4px;">(Telegram Sticker)</span>
      </button>
    </div>

    <div class="modal-footer" style="margin-top:14px;">
      <button class="btn btn-ghost modal-close-btn" data-modal="export-modal"
              style="width:100%;justify-content:center;">Cancel</button>
    </div>
  `;

  $('expJsonBtn').addEventListener('click', () => smartExport('json'));
  $('expTgsBtn').addEventListener('click',  () => smartExport('tgs'));
  openModal('export-modal');
});

/* =============================================
   MODAL HELPERS
   ============================================= */

function openModal(id) {
  $(id).classList.add('open');
  $(id).setAttribute('aria-hidden', 'false');
}
function closeModal(id) {
  $(id).classList.remove('open');
  $(id).setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.modal-close-btn');
  if (!btn) return;
  const modalId = btn.dataset.modal;
  if (modalId) closeModal(modalId);
  else {
    const overlay = btn.closest('.modal-overlay');
    if (overlay) closeModal(overlay.id);
  }
});

$$('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

/* =============================================
   DARK MODE
   ============================================= */

function applyThemeMode(dark) {
  document.body.classList.toggle('dark', dark);
  $('darkToggle').innerHTML = dark ? '<i class="ri-sun-line"></i>' : '<i class="ri-moon-line"></i>';
}

$('darkToggle').addEventListener('click', () => {
  const isDark = !document.body.classList.contains('dark');
  localStorage.setItem('mm_theme', isDark ? 'dark' : 'light');
  applyThemeMode(isDark);
});

/* =============================================
   TELEGRAM BUTTON
   ============================================= */

$('telegramBtn').addEventListener('click', () => window.open('https://t.me/Magic_Mall_Game_Shop', '_blank'));

/* =============================================
   INIT
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('mm_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyThemeMode(savedTheme === 'dark' || (savedTheme === null && prefersDark));

  /* FIX: isEmbedded() is now defined above — no longer crashes here */
  if (isEmbedded()) browserWarning.classList.add('visible');

  updateHistoryButtons();
  renderThemes();
  $('frameLabel').textContent = '0';

  const logoImg = document.querySelector('.brand-logo img');
  if (logoImg) {
    logoImg.onerror = () => {
      logoImg.style.display = 'none';
      $('fallbackIcon').style.display = 'block';
    };
  }
});
