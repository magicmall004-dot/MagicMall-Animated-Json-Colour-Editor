/* ===========================
   Full script.js (patched)
   Base: your uploaded script-1.js. Added: Gradient Editor (Option B)
   Source (original): 1
   =========================== */

/* ===========================
   State & Core variables
   =========================== */
let animData = null;            // Modified Lottie data
let originalAnimData = null;    // Stored Original Lottie data (for reset)
let anim = null;                // Lottie animation instance
let loaderAnimInstance = null;  // Lottie instance for the loader

let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 60;

// State variable to store user themes
let savedThemes = JSON.parse(localStorage.getItem('lottieThemes')) || []; 

const slider = document.getElementById("frameSlider");
const frameLabel = document.getElementById("frameLabel");
const totalLabel = document.getElementById("totalLabel");
const groupCheckbox = document.getElementById("groupDuplicates");
const colorsContainer = document.getElementById("colors");
const colorStats = document.getElementById("colorStats");
const layerListEl = document.getElementById("layerList");

// NEW TGS SCAN MODAL REFERENCES
const tgsScanModal = document.getElementById('tgs-scan-modal');
const tgsResultsEl = document.getElementById('tgs-results');

// NEW ELEMENTS
const themesList = document.getElementById('themesList');
const loadingIndicator = document.getElementById('loadingIndicator');
const loaderAnimEl = document.getElementById('loaderAnim'); 
const animContainer = document.getElementById('anim'); 
const browserWarning = document.getElementById('browserWarning'); // New element reference

const setModal = document.getElementById('settings-modal');
const inpW = document.getElementById('set-w');
const inpH = document.getElementById('set-h');
const inpFR = document.getElementById('set-fr');
const inpScale = document.getElementById('set-scale'); 

const modal = document.getElementById('export-modal');
const modalCard = modal.querySelector('.modalCard');

const standardModalContentTemplate = `
    <div style="text-align:center; margin-bottom:16px;">
        <i class="ri-download-cloud-2-line" style="font-size:32px; color:var(--primary)"></i>
    </div>
    <h3 style="margin:0 0 8px 0; font-size:18px;">Export Animation</h3>
    <p class="muted" style="margin:0; font-size:13px; line-height:1.5;">ကြိုက်ရာfile အားdownloadဆွဲပါ။</p>

    <p id="browser-warning-text" style="
        font-size:14px; 
        color:#ef4444; 
        font-weight:600; 
        text-align:center; 
        margin:15px 0 10px 0;
        animation: pulse 1.5s infinite;
    ">
        <i class="ri-alert-line"></i>အကယ်၍ File download လုပ်လို့မရပါကအပေါ်က(•••)ကိုနှိပ်ပြီးအခြား Browserကနေဖွင့်ပါ။ >Chrome/Safari စသောပြင်ပ browser များမှဖွင့်သုံးမှသာ File download လုပ်နိုင်မှာပါ။
    </p>
    <style>
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
    </style>
    <div class="modal-btn-row">
        <button id="export-as-json" class="ghost" style="border:1px solid var(--primary); color:var(--primary)">
            <i class="ri-file-code-line"></i> Download JSON
        </button>
        <button id="export-as-tgs" class="primary" style="background:#2AABEE; border:none;">
            <i class="ri-telegram-line"></i> Download for Telegram
        </button>
        <button class="ghost modal-close" style="color:var(--text-muted); border-color:var(--surface-border)">
            Cancel
        </button>
    </div>
`;

let allExtractedColors = [];
let groupedColors = {};
let currentFilter = "All";

let playerState = { isPaused: true, currentFrame: 0 };

/* ===========================
   Debounced Reload & History
   =========================== */
function _reloadAndPush() {
    pushHistory(); // Save the state after the color change is complete
    reloadAnim();  // Reload the Lottie player with the updated animData
}

// Debounce the heavy operation (reloading Lottie and pushing history)
const debouncedReloadAnim = debounce(_reloadAndPush, 200);

// ===========================
// Utility: Debouncing function
// ===========================
function debounce(func, timeout = 300){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

/* ===========================
   Tab Logic
   =========================== */
window.switchTab = (tabName) => {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`.tab-btn[onclick="switchTab('${tabName}')"]`).classList.add('active');
  if (tabName === 'themes') renderThemes(); // Refresh themes when tab is opened
}

/* ===========================
   History
   =========================== */
function pushHistory() {
  if (!animData) return;
  const snap = JSON.parse(JSON.stringify(animData));
  const last = historyStack[historyStack.length - 1];
  // Basic check to prevent pushing identical states back-to-back
  if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
  historyStack.push(snap);
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}
function undoChange() {
  if (historyStack.length <= 1) return;
  redoStack.push(historyStack.pop());
  animData = JSON.parse(JSON.stringify(historyStack[historyStack.length - 1]));
  applyAfterDataChange();
  updateUndoRedoButtons();
}
function redoChange() {
  if (!redoStack.length) return;
  const state = redoStack.pop();
  historyStack.push(JSON.parse(JSON.stringify(animData)));
  animData = state;
  applyAfterDataChange();
  updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
  document.getElementById('undoBtn').disabled = historyStack.length <= 1;
  document.getElementById('redoBtn').disabled = redoStack.length === 0;
}
document.getElementById('undoBtn').addEventListener('click', undoChange);
document.getElementById('redoBtn').addEventListener('click', redoChange);
document.addEventListener('keydown', (e) => {
  const isCmd = e.ctrlKey || e.metaKey;
  if (!isCmd) return;
  if (e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoChange(); else undoChange();
  }
});

/* ===========================
   New Telegram Channel Button Logic
   =========================== */
document.getElementById('telegramBtn').addEventListener('click', () => {
  const url = 'https://t.me/Magic_Mall_Game_Shop';
  window.open(url, '_blank');
});

/* ===========================
   New TGS Scan Logic
   =========================== */

document.getElementById('tgsScanBtn').onclick = () => {
    if(!animData) return alert("Load a Lottie file first to scan its compatibility.");
    checkTgsCompatibility();
}

/**
 * Checks the animation data against the primary Telegram Sticker requirements.
 */
function checkTgsCompatibility() {
    const w = animData.w;
    const h = animData.h;
    const fr = animData.fr;
    const op = animData.op; // Total frames (start frame 0 to op-1)
    
    // Requirements
    const requiredSize = 512;
    const requiredFPS = 60;
    const maxDurationSeconds = 3;
    
    // Checks
    const sizePass = w === requiredSize && h === requiredSize;
    const fpsPass = fr === requiredFPS;
    const totalFrames = op - (animData.ip || 0); // op is end frame, ip is start frame (default 0)
    const durationPass = (totalFrames / fr) <= maxDurationSeconds; 
    
    // Generate Results HTML
    let overallPass = true;

    // Helper function to generate a check status row
    const getStatusRow = (condition, title, currentValue, requiredValue, unit = '') => {
        const statusClass = condition ? 'status-pass' : 'status-fail';
        const icon = condition ? 'ri-check-line' : 'ri-close-line';
        if (!condition) overallPass = false;

        return `
            <div class="status-check ${statusClass}">
                <div style="font-weight:600;">${title}</div>
                <div>
                    <span style="font-size:12px; margin-right:8px;">
                        Current: **${currentValue}** (Req: ${requiredValue}${unit})
                    </span>
                    <i class="status-icon ${icon}"></i>
                </div>
            </div>
        `;
    };

    let resultsHtml = '';
    resultsHtml += getStatusRow(
        sizePass, 
        'Size (512x512)', 
        `${w}x${h}`, 
        `${requiredSize}x${requiredSize}`
    );

    resultsHtml += getStatusRow(
        fpsPass, 
        'Frame Rate (60 FPS)', 
        fr, 
        requiredFPS,
        ' FPS'
    );
    
    const currentDuration = (totalFrames / fr).toFixed(2);
    resultsHtml += getStatusRow(
        durationPass, 
        'Duration (Max 3s)', 
        `${currentDuration}s`, 
        `${maxDurationSeconds}s`
    );
    
    // Add a final summary message
    let finalMessage = '';
    if (overallPass) {
        finalMessage = `<div style="text-align:center; padding:15px; margin-top:10px; border-radius:10px; background:#e0f7e0; color:#10b981; font-weight:700;">
                            <i class="ri-thumb-up-line"></i> အောင်မြင်ပါတယ်🎉 Telegram Stickerလိုအပ်ချက်များနှင့်ကိုက်ညီမှု့ရှိပါတယ်။
                        </div>`;
    } else {
         finalMessage = `<div style="text-align:center; padding:15px; margin-top:10px; border-radius:10px; background:#fee2e2; color:#ef4444; font-weight:700;">
                            <i class="ri-error-warning-line"></i> မအောင်မြင်ပါ😢 ကိုက်ညီအောင်exportမထုတ်ခင်settingsသို့သွားပြီးပြင်ပါ။  
                        </div>`;
    }

    tgsResultsEl.innerHTML = finalMessage + '<div style="margin-top:10px;">' + resultsHtml + '</div>';
    
    // Show the modal
    tgsScanModal.classList.add('show');
    
    // Set up modal buttons
    tgsScanModal.querySelectorAll('.modal-close').forEach(btn => {
        // Check if the button is the "Go to Export" one (first in the row)
        if (btn.classList.contains('primary')) {
            btn.onclick = () => {
                tgsScanModal.classList.remove('show');
                document.getElementById('exportMenuBtn').click(); // Open Export Modal
            };
        } else {
            // "Close" button
            btn.onclick = () => tgsScanModal.classList.remove('show');
        }
    });
}

/* ===========================
   Reset Logic
   =========================== */
document.getElementById('resetColorsBtn').addEventListener('click', () => {
  if (!originalAnimData) return;
  if (confirm("Reset all colors to original?")) {
    // Restore from backup
    animData = JSON.parse(JSON.stringify(originalAnimData));
    pushHistory();
    applyAfterDataChange();
  }
});

/* ===========================
   File Load (Unified for button and drop)
   =========================== */
async function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  
  try {
    let txt;
    if (name.endsWith('.tgs')) {
      const buf = await file.arrayBuffer();
      const decompressed = pako.ungzip(new Uint8Array(buf), { to: 'string' });
      txt = decompressed;
    } else {
      txt = await file.text();
    }
    originalAnimData = JSON.parse(txt);
    animData = JSON.parse(txt);
    historyStack = [];
    redoStack = [];
    historyStack.push(JSON.parse(JSON.stringify(animData)));
    updateUndoRedoButtons();

    document.getElementById('preview-placeholder').style.display = 'none';
    slider.disabled = false;
    
    extractAndRenderColors();
    renderLayers();
    reloadAnim();
  } catch (err) {
    console.error(err);
    alert('Error parsing file: ' + err.message);
  }
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
  await loadFile(e.target.files[0]);
  e.target.value = null; // Clear input for next load
});

/* ===========================
   Drag and Drop Logic
   =========================== */
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  document.body.addEventListener(eventName, () => document.body.classList.add('dragging'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  document.body.addEventListener(eventName, () => document.body.classList.remove('dragging'), false);
});

document.body.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  if(files.length > 0) {
    loadFile(files[0]);
  }
}

/* ===========================
   Lottie Player (Updated with Loader)
   =========================== */

// 1. Initialize Loader Animation (M logo animation.json)
function initLoader() {
    if (loaderAnimInstance) loaderAnimInstance.destroy();
    try {
      loaderAnimInstance = lottie.loadAnimation({
          container: loaderAnimEl,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: 'M_logo_animation.json' // Custom JSON file name for loading indicator
      });
    } catch(e){
      // ignore missing loader file
    }
}
initLoader(); 

/**
 * Loads and plays the animation based on the provided data, ensuring all listeners are active.
 * Shows/hides the loading indicator.
 * @param {object} data - The Lottie JSON data to use.
 */
function loadLottie(data) {
    loadingIndicator.style.display = 'flex'; // Show loading indicator
    
    // Use a slight delay to ensure the loader animation renders
    setTimeout(() => {
        if (anim) {
            try { playerState.currentFrame = anim.currentFrame; } catch(e){}
            anim.destroy();
            animContainer.innerHTML = '';
        }
        if (!data) {
            loadingIndicator.style.display = 'none';
            return;
        }

        anim = lottie.loadAnimation({
            container: animContainer,
            renderer: 'svg',
            loop: true,
            autoplay: false,
            animationData: data
        });

        anim.addEventListener('DOMLoaded', () => {
            const total = Math.round(anim.totalFrames || 0);
            slider.max = Math.max(0, total - 1);
            totalLabel.textContent = total;

            // Restore state or start from 0
            if (playerState.isPaused) {
                anim.goToAndStop(playerState.currentFrame || 0, true);
            } else {
                anim.goToAndPlay(playerState.currentFrame || 0, true);
            }
            document.getElementById('playPauseBtn').innerHTML = playerState.isPaused ? '<i class="ri-play-fill"></i>' : '<i class="ri-pause-fill"></i>';
            loadingIndicator.style.display = 'none'; // Hide loading indicator
        });

        anim.addEventListener('enterFrame', () => {
            try {
                if(!slider.matches(':active')) {
                    slider.value = anim.currentFrame;
                    frameLabel.textContent = Math.round(anim.currentFrame);
                }
            } catch(e){}
        });
    }, 50); // Small delay to allow the loading anim to start
}

function reloadAnim() {
    loadLottie(animData);
}

/* ===========================
   Player Controls
   =========================== */
slider.addEventListener('input', () => {
  if (!anim) return;
  playerState.currentFrame = parseFloat(slider.value);
  if (!anim.isPaused) { 
    anim.pause(); 
    document.getElementById('playPauseBtn').innerHTML = '<i class="ri-play-fill"></i>'; 
    playerState.isPaused = true; 
  }
  anim.goToAndStop(playerState.currentFrame, true);
  frameLabel.textContent = Math.round(playerState.currentFrame);
});
document.getElementById('playPauseBtn').addEventListener('click', () => {
  if (!anim) return;
  if (anim.isPaused) { 
    anim.play(); 
    document.getElementById('playPauseBtn').innerHTML = '<i class="ri-pause-fill"></i>'; 
    playerState.isPaused = false; 
  }
  else { 
    anim.pause(); 
    document.getElementById('playPauseBtn').innerHTML = '<i class="ri-play-fill"></i>'; 
    playerState.isPaused = true; 
  }
});

/* ===========================
   Settings Logic (Width, Height, FPS, SCALE)
   =========================== */
document.getElementById('settingsBtn').addEventListener('click', () => {
  if(!animData) return alert("Load a Lottie file first.");
  inpW.value = animData.w;
  inpH.value = animData.h;
  inpFR.value = animData.fr;

  // Load current scale value from CSS property if set, otherwise default to 100
  const currentScale = parseFloat(animContainer.style.getPropertyValue('--lottie-scale')) || 1;
  inpScale.value = Math.round(currentScale * 100); 

  setModal.classList.add('show');
});

setModal.querySelectorAll('.settings-close').forEach(btn => {
    btn.onclick = () => setModal.classList.remove('show');
});

document.getElementById('applySettings').addEventListener('click', () => {
  if(!animData) return;
  
  const newW = parseInt(inpW.value);
  const newH = parseInt(inpH.value);
  const newFr = parseFloat(inpFR.value);
  const newScale = parseFloat(inpScale.value) / 100; 
  
  if (isNaN(newW) || isNaN(newH) || isNaN(newFr) || newW <= 0 || newH <= 0 || newFr <= 0) {
      return alert("Please enter valid positive numbers for W, H, and FPS.");
  }
  if (isNaN(newScale) || newScale <= 0) {
      return alert("Please enter a valid positive number for Scale.");
  }

  let needsReload = false;

  // 1. Update animData (requires full reload)
  if(animData.w !== newW || animData.h !== newH || animData.fr !== newFr) {
    pushHistory();
    animData.w = newW;
    animData.h = newH;
    animData.fr = newFr;
    needsReload = true;
  }
  
  // 2. Update CSS Scale (does NOT require full reload, only visual update)
  const currentScaleCss = animContainer.style.getPropertyValue('--lottie-scale');
  if (currentScaleCss !== String(newScale)) {
     animContainer.style.setProperty('--lottie-scale', newScale);
  }

  if (needsReload) {
    reloadAnim(); 
    // totalFrames calculation is handled inside loadLottie DOMLoaded event
  }
  
  setModal.classList.remove('show');
});

/* ===========================
   Color Extraction & Rendering (FIXED/EXPANDED)
   =========================== */
function resetGroupedColors(){ groupedColors = {}; }
function rgbaToHex(arr){
  if(!arr || arr.length < 3) return '#000000';
  const r = Math.round(arr[0]*255), g = Math.round(arr[1]*255), b = Math.round(arr[2]*255);
  return rgbToHex(r,g,b);
}
function rgbToHex(r,g,b){
  return '#'+[r,g,b].map(x=>Math.round(x).toString(16).padStart(2,'0')).join('');
}
function hexToRgb(hex){
  // Pad if short (e.g. #FFF)
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  const bigint = parseInt(hex.slice(1),16);
  return { r: (bigint>>16)&255, g: (bigint>>8)&255, b: bigint & 255 };
}

function extractColors(obj){
  resetGroupedColors();
  const out = [];
  
  // Helper to store an instance
  const storeInstance = (ref, sType, type, hex, index) => {
    out.push({ref, shapeType:sType, hex, type, index}); 
    (groupedColors[hex]=groupedColors[hex]||{hex,instances:[]}).instances.push({ref, type, shapeType:sType, index});
  };

  const recursive = (o) => {
    if (!o || typeof o !== 'object') return;
    
    // --- 1. Solid Colors (Fills, Strokes, etc.) ---
    const checkSolidColor = (prop, sType) => {
        if (o[prop] && o[prop].k) {
            
            // Animated color (o.c.a === 1, array of keyframes with 's' property)
            if (o[prop].a === 1 && Array.isArray(o[prop].k)) {
                o[prop].k.forEach(kf => { 
                    if (kf.s && Array.isArray(kf.s)) { 
                        const hx = rgbaToHex(kf.s); 
                        storeInstance(kf, sType, 'solid', hx); 
                    }
                });
            } 
            // Static color (array of 4 [R, G, B, A] directly in 'k')
            else if (Array.isArray(o[prop].k)) {
                const hx = rgbaToHex(o[prop].k);
                storeInstance(o[prop], sType, 'solid', hx);
            }
            // Static color (value nested under 'k.k')
            else if (o[prop].k && Array.isArray(o[prop].k.k)) {
                const hx = rgbaToHex(o[prop].k.k);
                storeInstance(o[prop].k, sType, 'solid', hx);
            }
        }
    };

    let sType = 'Solid';
    if (o.ty === 'fl') sType = 'Fill';
    else if (o.ty === 'st') sType = 'Stroke';
    
    // Check main color property 'c'
    checkSolidColor('c', sType);
    
    // Check legacy stroke color property 'sc'
    checkSolidColor('sc', 'Stroke');
    
    // --- 2. Gradients ---
    if (o.g) {
      let gType = (o.ty === 'gf') ? 'Gradient Fill' : ((o.ty === 'gs') ? 'Gradient Stroke' : 'Gradient');

      const processGradientColorArray = (arr, ref) => {
        // Each color stop is 4 values: position, R, G, B
        const numStops = o.g.p || Math.floor(arr.length / 4);
        const loopLimit = numStops * 4;
        
        for (let i = 0; i < loopLimit; i += 4){
          // Colors are at index 1, 2, 3 (R, G, B) relative to the position
          const r = arr[i+1], g = arr[i+2], b = arr[i+3];
          const hx = rgbToHex(Math.round(r*255), Math.round(g*255), Math.round(b*255));
          // IMPORTANT: Grouping gradients by HEX is misleading as it breaks the color group when one stop changes.
          // However, to satisfy the existing groupedColors structure, we continue grouping by hex.
          // 'i' is the position index for update
          storeInstance(ref, gType, 'gradient', hx, i); 
        }
      };

      // Animated Gradient (o.g.k.a === 1)
      if (o.g.k && o.g.k.a === 1 && Array.isArray(o.g.k.k)) {
          o.g.k.k.forEach(kf => { 
              if (kf.s && Array.isArray(kf.s)) processGradientColorArray(kf.s, kf); 
          });
      }
      // Static Gradient (Color array directly in o.g.k)
      else if (o.g.k && Array.isArray(o.g.k)) {
          processGradientColorArray(o.g.k, o.g);
      }
      // Static Gradient (Color array in o.g.k.k - CRITICAL FIX)
      else if (o.g.k && o.g.k.k && Array.isArray(o.g.k.k)) { 
          processGradientColorArray(o.g.k.k, o.g.k); 
      }
    }
    
    // --- 3. Recurse (Avoid rechecking color properties) ---
    for (const k in o) {
        if (o.hasOwnProperty(k) && k !== 'c' && k !== 'sc' && k !== 'g') {
            recursive(o[k]);
        }
    }
  };
  recursive(obj);
  return out;
}

function extractAndRenderColors(){
  if (!animData) return;
  allExtractedColors = extractColors(animData);
  applyCurrentFilter();
}

function applyCurrentFilter(){
  const activeBtn = document.querySelector(`[data-filter="${currentFilter}"]`);
  filterAndRender(currentFilter, activeBtn);
}

document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyCurrentFilter();
  });
});
groupCheckbox.addEventListener('change', ()=> applyCurrentFilter());

function filterAndRender(filterType, activeButton) {
  let colorsToRender = [];
  const groupedMode = groupCheckbox.checked;

  const cond = (c) => {
    // If not grouped, c is a single instance object: {ref, shapeType, hex, type, index}
    if (!groupedMode && filterType === 'All') return true;
    if (!groupedMode) return c.shapeType.includes(filterType);
    
    // If grouped, c is a grouped object: {hex, instances: [...]}
    if (groupedMode) {
        if (filterType === 'All') return true;
        return c.instances.some(inst => inst.shapeType.includes(filterType));
    }
    return false;
  };

  if (groupedMode) {
    // Transform groupedColors map into an array of objects for rendering
    colorsToRender = Object.values(groupedColors).filter(cond).map(group => ({
        hex: group.hex,
        // Check if ANY instance in the group is a gradient
        isGradientGroup: group.instances.some(inst => inst.type === 'gradient'),
        layerCount: group.instances.length, 
        instances: group.instances,
    }));
  } else {
    colorsToRender = allExtractedColors.filter(cond);
  }

  colorStats.textContent = `${colorsToRender.length}`;
  renderColors(colorsToRender, groupedMode);
}

// =========================================================================
// FIX: renderColors function updated to correctly handle click events
// =========================================================================
function renderColors(colors, isGrouped) {
  colorsContainer.innerHTML = '';
  if (!colors || colors.length === 0) {
    colorsContainer.innerHTML = '<div class="muted">No colors found.</div>';
    return;
  }
  colors.forEach((c, idx) => {
    const card = document.createElement('div'); card.className = 'color-card';
    
    // --- Determine if this card represents a Gradient Group ---
    // If grouped: check the new isGradientGroup property.
    // If not grouped: check the type property of the single instance (c).
    const isGradient = isGrouped ? c.isGradientGroup : (c.type === 'gradient');
    
    let hexVal = '#000000';
    if (isGrouped) {
      hexVal = c.hex;
    } else {
      hexVal = c.hex || (c.ref && (c.ref.k ? (Array.isArray(c.ref.k) ? rgbaToHex(c.ref.k) : (c.ref.s ? rgbaToHex(c.ref.s) : '#000')) : '#000000'));
    }

    const hexInput = document.createElement('input'); 
    hexInput.className = 'hexInput'; 
    hexInput.value = hexVal.toUpperCase();
    
    let colorInput = null;
    let visualPreview = null;
    
    if (isGradient) {
        // --- GRADIENT CARD RENDERING ---
        
        // Disable hex input and mark as gradient
        hexInput.value = 'GRADIENT';
        hexInput.disabled = true;

        // Create the visual preview bar (gradient)
        visualPreview = document.createElement('div');
        visualPreview.style.width = '100%';
        visualPreview.style.height = '40px';
        visualPreview.style.borderRadius = '6px';
        visualPreview.style.marginBottom = '6px';
        visualPreview.style.cursor = 'pointer';
        // Mock gradient background (better if you can compute it, but use the hex for simplicity)
        // For grouped mode, the 'hex' is the first stop color, so a simple linear is better.
        visualPreview.style.background = `linear-gradient(90deg, ${hexVal} 0%, #000000 100%)`; 
        
        // Add Gradient Badge
        const badge = document.createElement('div');
        badge.className = 'color-group-badge';
        badge.innerHTML = `<i class="ri-gradienter-line"></i> ${isGrouped ? 'GRADIENT' : c.shapeType.toUpperCase()}`; 
        card.appendChild(badge);
        card.appendChild(visualPreview);
        
    } else {
        // --- SOLID COLOR CARD RENDERING ---
        
        // Create the standard <input type="color"> picker
        colorInput = document.createElement('input'); 
        colorInput.type = 'color';
        colorInput.value = hexVal;
        colorInput.className = 'color-picker-input';

        // Add Group Badge (if applicable)
        if (isGrouped && c.layerCount > 1) {
            const badge = document.createElement('div');
            badge.className = 'color-group-badge';
            badge.innerHTML = `<i class="ri-stack-fill"></i> <span>${c.layerCount}</span>`; 
            card.appendChild(badge);
        }
        
        card.appendChild(colorInput);
    }
    
    // Debounced Color/Hex Input Handler for SOLID Colors
    if (colorInput) {
        colorInput.addEventListener('input', () => {
            hexInput.value = colorInput.value.toUpperCase();
            applyColorChange(c, isGrouped, colorInput.value, false); 
            debouncedReloadAnim(); 
        });
    }

    hexInput.addEventListener('input', () => {
      // Only process hex changes if it's NOT a gradient card
      if (isGradient) return; 

      const v = hexInput.value.trim();
      hexInput.value = v.toUpperCase();
      if (/^#([A-Fa-f0-9]{6})$/.test(v)) {
        if(colorInput) colorInput.value = v; // Update picker if available
        applyColorChange(c, isGrouped, v, false); 
        debouncedReloadAnim(); 
      }
    });

    // =====================================================================
    // FIX: Click Handler Logic
    // Only open the gradient editor if the card represents a gradient.
    // =====================================================================
    card.addEventListener('click', (e) => {
        // Prevent click if targeting a standard color picker input itself
        if (e.target.matches('.color-picker-input')) {
            return;
        }

        if (isGradient) {
            // This is a gradient card (or gradient group), OPEN THE MODAL
            e.stopPropagation(); // Stop propagation to prevent accidental closing/misclicks
            openGradientEditor(c);
            return;
        } else {
            // This is a solid color card (or solid group), ACTIVATE THE COLOR PICKER
            
            // Check if the click was on the card but NOT on the hex input
            if (e.target !== hexInput && e.target.closest('.color-group-badge') === null && colorInput) {
                // Programmatically click the color input to open the native picker
                colorInput.click(); 
            }
        }
    });
    
    card.appendChild(hexInput);
    colorsContainer.appendChild(card);
  });
}
// =========================================================================

/**
 * Applies color change to animData without reloading the animation immediately.
 * @param {object} groupObj - The color reference object or single instance object.
 * @param {boolean} isGrouped - Whether the color is part of a group.
 * @param {string} hex - New HEX color string.
 * @param {boolean} [shouldReload=true] - Whether to force a reload (used by themes).
 */
function applyColorChange(groupObj, isGrouped, hex, shouldReload = true) {
  if (!animData) return;
  const { r, g, b } = hexToRgb(hex);
  const nr = r/255, ng = g/255, nb = b/255;

  // If grouped, iterate over all instances; otherwise, just process the single instance.
  const instances = isGrouped ? groupObj.instances : [groupObj];
  
  instances.forEach(inst => {
    if (!inst || !inst.ref) return;
    
    // --- SOLID COLOR/STROKE UPDATE ---
    if (inst.type === 'solid' || inst.type === 'stroke') {
      // 1. Check for keyframe start value (animated solid)
      if (inst.ref.hasOwnProperty('s') && Array.isArray(inst.ref.s)) {
        inst.ref.s = [nr, ng, nb, 1];
      } 
      // 2. Check for direct array value (static solid)
      else if (inst.ref.hasOwnProperty('k') && Array.isArray(inst.ref.k)) {
        inst.ref.k = [nr, ng, nb, 1];
      } 
      // 3. Check for nested k.k value (another static solid format)
      else if (inst.ref.k && Array.isArray(inst.ref.k.k)) { 
        inst.ref.k.k = [nr, ng, nb, 1]; 
      }
    } 
    // --- GRADIENT UPDATE ---
    else if (inst.type === 'gradient') {
      
      // Determine the correct array reference. It could be 'k' (static) or 's' (animated keyframe start).
      const arrRef = inst.ref.k || inst.ref.s;
      
      // CRITICAL FIX: Check if the array is directly under 'arrRef' OR nested under 'arrRef.k'
      let arr = Array.isArray(arrRef) ? arrRef : (arrRef && arrRef.k && arrRef.k.k && Array.isArray(arrRef.k.k) ? arrRef.k.k : null);

      if (arr && inst.index !== undefined) {
        // Gradient color stops are stored as [position, R, G, B, position, R, G, B, ...]
        const pos = inst.index; 
        if (arr.length > pos + 2) {
          arr[pos + 1] = nr; // R is at pos + 1
          arr[pos + 2] = ng; // G is at pos + 2
          arr[pos + 3] = nb; // B is at pos + 3
        }
      }
    }
  });

  if (isGrouped) groupObj.hex = hex;
  
  // Re-extract and re-render colors to update the UI list
  extractAndRenderColors(); 
  
  // Reload the animation to show the change (used mainly by themes to force reload)
  if (shouldReload) reloadAnim();
}

/* ===========================
   Layers UI
   =========================== */
function renderLayers() {
  layerListEl.innerHTML = '';
  if (!animData || !animData.layers) { layerListEl.innerHTML = '<div class="muted">No layers found</div>'; return; }
  animData.layers.forEach((layer, idx) => {
    const row = document.createElement('div'); row.className = 'layer';
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.value = layer.nm || ('Layer ' + idx);
    nameInput.addEventListener('change', ()=> { pushHistory(); layer.nm = nameInput.value; renderLayers(); });

    const vis = document.createElement('input'); vis.type='checkbox'; vis.checked = !layer.hd; vis.title = 'Visible';
    vis.addEventListener('change', ()=> { pushHistory(); layer.hd = !vis.checked; reloadAnim(); });

    row.appendChild(nameInput);
    row.appendChild(vis);
    layerListEl.appendChild(row);
  });
}
document.getElementById('refreshLayers').addEventListener('click', renderLayers);

/* ===========================
   Themes/Presets Logic
   =========================== */

function getCurrentTheme() {
    if (Object.keys(groupedColors).length === 0) return null;
    return Object.values(groupedColors).map(g => ({
        hex: g.hex,
        count: g.instances.length
    }));
}

document.getElementById('saveThemeBtn').addEventListener('click', () => {
    if (!animData) return alert("Load an animation first.");
    const themeData = getCurrentTheme();
    if (!themeData || themeData.length === 0) return alert("No colors detected to save.");
    
    const name = prompt("Enter a name for this color theme:", `Theme ${savedThemes.length + 1}`);
    if (!name) return;

    savedThemes.push({
        id: Date.now(),
        name: name,
        colors: themeData,
        date: new Date().toLocaleString()
    });
    localStorage.setItem('lottieThemes', JSON.stringify(savedThemes));
    renderThemes();
    alert(`Theme "${name}" saved!`);
});

function renderThemes() {
    themesList.innerHTML = '';
    if (savedThemes.length === 0) {
        themesList.innerHTML = '<p style="color:var(--text-muted); font-size:13px; text-align:center;">No themes saved yet.</p>';
        return;
    }

    savedThemes.forEach(theme => {
        const div = document.createElement('div');
        div.className = 'theme-card';

        // Header and Actions
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.innerHTML = `<h4 style="margin:0; font-size:14px; flex:1;">${theme.name}</h4>`;
        
        const applyBtn = document.createElement('button');
        applyBtn.innerHTML = '<i class="ri-palette-line"></i> Apply';
        applyBtn.className = 'primary';
        applyBtn.style.padding = '4px 8px';
        applyBtn.style.fontSize = '11px';
        applyBtn.style.marginRight = '5px';
        applyBtn.onclick = () => applyTheme(theme);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
        deleteBtn.className = 'danger-btn';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.onclick = () => deleteTheme(theme.id);

        header.appendChild(applyBtn);
        header.appendChild(deleteBtn);
        div.appendChild(header);


        // Color Swatches
        const swatches = document.createElement('div');
        swatches.style.display = 'flex';
        swatches.style.marginTop = '10px';
        swatches.style.gap = '3px';
        theme.colors.slice(0, 8).forEach(c => {
            const swatch = document.createElement('div');
            swatch.title = c.hex;
            swatch.style.width = '20px';
            swatch.style.height = '20px';
            swatch.style.backgroundColor = c.hex;
            swatch.style.border = '1px solid rgba(0,0,0,0.1)';
            swatch.style.borderRadius = '4px';
            swatches.appendChild(swatch);
        });
        if (theme.colors.length > 8) {
             swatches.innerHTML += `<span style="font-size:10px; color:var(--text-muted); margin-left:5px;">+${theme.colors.length - 8} more</span>`;
        }
        div.appendChild(swatches);

        themesList.appendChild(div);
    });
}

function applyTheme(theme) {
    if (!animData) return alert("Load an animation first.");
    if (Object.keys(groupedColors).length === 0) return alert("Animation has no editable colors.");

    pushHistory(); // Save current state before applying theme

    // Re-extract colors to get the latest groupedColors mapping
    allExtractedColors = extractColors(animData);
    const currentColorsArray = Object.values(groupedColors);
    
    // Simple Positional Application: Apply the theme's colors to the first N currently grouped colors.
    theme.colors.forEach((themeColor, index) => {
        if (currentColorsArray[index]) {
            const currentGroupObj = currentColorsArray[index];
            const newHex = themeColor.hex;
            
            // Apply the new color to the instance references in animData
            applyColorChange(currentGroupObj, true, newHex, false);
            
            // Immediately update the groupedColors hex cache for subsequent passes
            currentGroupObj.hex = newHex;
        }
    });
    
    // 3. Re-extract, Re-render UI, and Reload Animation once
    extractAndRenderColors(); // This calls filterAndRender which refreshes the UI
    reloadAnim();
    alert(`Theme "${theme.name}" applied!`);
}

function deleteTheme(id) {
    if (confirm("Are you sure you want to delete this theme?")) {
        savedThemes = savedThemes.filter(t => t.id !== id);
        localStorage.setItem('lottieThemes', JSON.stringify(savedThemes));
        renderThemes();
    }
}

/* ===========================
   Export Logic
   =========================== */

function applyAfterDataChange(){
  extractAndRenderColors();
  renderLayers();
  reloadAnim();
}

// Helper function to detect restrictive environment (Mini App View)
function isEmbeddedBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    // Check for general webview keywords
    if (ua.includes('wv') || ua.includes('fban') || ua.includes('fbav') || ua.includes('instagram')) {
        return true;
    }
    // Check specifically for Telegram's in-app browser
    if (ua.includes('telegram')) { 
        return true; 
    }
    try {
        // Check if the window is framed (Mini Apps run in an iframe)
        if (window.self !== window.top) {
            return true;
        }
    } catch (e) {
        // Accessing window.top can throw an error if blocked (common in webviews)
        return true; 
    }
    return false;
}

// Helper function for reliable download
function initiateDownload(blob, filename) {
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = filename; 
    
    // Use the standard click mechanism
    document.body.appendChild(a);
    a.click(); 
    document.body.removeChild(a);
    
    URL.revokeObjectURL(a.href);
}


function exportJson() {
    if (!animData) return;
    const final = JSON.parse(JSON.stringify(animData));
    const jsonString = JSON.stringify(final, null, 2);
    const blob = new Blob([jsonString], {type:'application/json'});
    
    initiateDownload(blob, 'lottie-modified.json');
}

function exportTgs(){
  if (!animData) return;
  // Use the original data as a base to avoid breaking TGS format requirements, 
  // but copy over the modified colors/properties.
  const finalExportData = JSON.parse(JSON.stringify(originalAnimData || animData));
  
  // A simplified and more focused deep copy of colors/properties is safer for TGS
  const deepTraverseAndCopyColors = (src, tgt) => {
    if (!src || !tgt || typeof src !== 'object' || typeof tgt !== 'object') return;
    
    // Check for color properties
    ['c', 'sc', 'g'].forEach(k => {
      if (src[k] && tgt[k]) {
        if (src[k].k !== undefined && tgt[k].k !== undefined) {
          // Copy color keyframe array or single value
          tgt[k].k = src[k].k;
        }
      }
    });
    
    // Recurse for nested objects/arrays
    for (const k in src) {
      if (!src.hasOwnProperty(k) || k === 'c' || k === 'sc' || k === 'g') continue;
      if (typeof src[k] === 'object' && typeof tgt[k] === 'object') {
        deepTraverseAndCopyColors(src[k], tgt[k]);
      }
    }
  };

  deepTraverseAndCopyColors(animData, finalExportData);

  finalExportData.tgs = 1; // Telegram sticker flag

  const jsonString = JSON.stringify(finalExportData);
  const compressed = pako.gzip(jsonString);
  const blob = new Blob([compressed], {type:'application/octet-stream'});
  
  initiateDownload(blob, 'animation.tgs');
}


// Function to attach download listeners to the standard modal content
function attachDownloadListeners() {
    // Clear previous listeners (important when restoring content)
    const jsonBtn = document.getElementById('export-as-json');
    const tgsBtn = document.getElementById('export-as-tgs');
    
    // Replace nodes to clear event listeners (cleanest way)
    if(jsonBtn) jsonBtn.replaceWith(jsonBtn.cloneNode(true));
    if(tgsBtn) tgsBtn.replaceWith(tgsBtn.cloneNode(true));
    
    // Get the fresh buttons
    document.getElementById('export-as-json').addEventListener('click', () => { exportJson(); modal.classList.remove('show'); });
    document.getElementById('export-as-tgs').addEventListener('click', () => { exportTgs(); modal.classList.remove('show'); });
    modalCard.querySelector('.modal-close').onclick = () => modal.classList.remove('show');
}


// Export Menu Button logic
document.getElementById('exportMenuBtn').onclick = () => {
    if(!animData) return alert("Load a Lottie file first.");

    if (isEmbeddedBrowser()) {
        // --- SCENARIO 1: Download WILL NOT WORK (Show Notice) ---
        // Refined modal content to be clearer and less alarming
        modalCard.innerHTML = `
            <div style="text-align:center; margin-bottom:16px;">
                <i class="ri-alert-line" style="font-size:32px; color:#ffc107;"></i>
            </div>
            <h3 style="margin:0 0 8px 0; font-size:18px;">ဤBrowserတွင်Downloadလုပ်လို့မရပါ။
            <p class="muted" style="margin:0; font-size:13px; line-height:1.5;">
                security အရဤ Browser တွင် file တိုက်ရိုက် download လုပ်ခွင့်ပိတ်ထားသောကြောင့်မရပါ။.
            </p>
            <p style="font-weight:600; font-size:14px; margin:15px 0 5px 0;">
                To save your work:
            </p>
            <ol style="padding-left: 20px; margin:0; font-size:13px;">
                <li>အပေါ်က(•••)ကိုနှိပ်ပြီးအခြား Browserကနေဖွင့်ပါ။</li>
                <li>"Open in Browser" ကိုနှိပ်ပြီး(Chrome/Safari/Google)တို့ကနေဖွင့်ပါ။.</li>
                <li>Browserကနေဖွင့်မှသာ File download လုပ်နိုင်ပါလိမ့်မယ်။</li>
            </ol>
            <div class="modal-btn-row" style="margin-top:20px;">
                <button class="ghost modal-close" style="color:var(--text-muted); border-color:var(--surface-border)">
                    Close Instructions
                </button>
            </div>
        `;
        modalCard.querySelector('.modal-close').onclick = () => modal.classList.remove('show');

    } else {
        // --- SCENARIO 2: Download SHOULD WORK (Show Buttons) ---
        modalCard.innerHTML = standardModalContentTemplate;
        attachDownloadListeners();
    }

    modal.classList.add('show');
}

/* ===========================
   Gradient Editor (Option B)
   ===========================
*/

let gradientEditing = null; // { groupObj, gradRef, rawArr, stops: [...] }

/**
 * Open Gradient Editor for a grouped color object (groupedColors entry)
 * groupObj: object from groupedColors (must have instances array)
 */
function openGradientEditor(groupObj) {
  if(!groupObj) return;
  // Find one gradient instance as reference
  const gradInstance = groupObj.instances.find(i => i.type === 'gradient');
  if(!gradInstance) return alert("No gradient instance available to edit.");

  // Build workingStops array from the underlying structure
  // gradInstance.ref may have .k (array) or .s for animated. We will support static and first keyframe of animated.
  const arrRef = gradInstance.ref.k || gradInstance.ref.s || null;
  let rawArr = null;

  // Raw arrays have pattern: [pos, r, g, b, pos, r, g, b, ...]
  // Some formats are nested; try to detect the deepest array.
  if (Array.isArray(arrRef)) rawArr = arrRef;
  else if (arrRef && arrRef.k && Array.isArray(arrRef.k)) rawArr = arrRef.k;
  else if (arrRef && arrRef.k && arrRef.k.k && Array.isArray(arrRef.k.k)) rawArr = arrRef.k.k;

  if(!rawArr) return alert("Unsupported gradient data structure.");

  // Convert rawArr -> stops [{pos:0..1, r,g,b, hex, rawIndex}]
  const stops = [];
  for(let i=0;i<rawArr.length;i+=4) {
    const pos = parseFloat(rawArr[i]); 
    const r = parseFloat(rawArr[i+1]), g = parseFloat(rawArr[i+2]), b = parseFloat(rawArr[i+3]);
    const hex = rgbToHex(Math.round(r*255), Math.round(g*255), Math.round(b*255));
    stops.push({ pos: pos, r, g, b, hex, rawIndex:i });
  }

  // Prepare editing context
  gradientEditing = {
    groupObj,
    gradRef: gradInstance.ref,
    rawArr,
    stops: stops.sort((a,b)=>a.pos-b.pos)
  };

  // Render editor UI
  renderGradientEditor();
  document.getElementById('gradient-editor-modal').classList.add('show');
  // mark modal close buttons
  document.querySelectorAll('#gradient-editor-modal .modal-close').forEach(btn => btn.onclick = () => {
    document.getElementById('gradient-editor-modal').classList.remove('show');
  });
}

/**
 * Render the gradient bar and stop list
 */
function renderGradientEditor(){
  if(!gradientEditing) return;
  const { stops } = gradientEditing;
  const bar = document.getElementById('gradientBar');
  const list = document.getElementById('gradientStopsList');
  const positionsLabel = document.getElementById('gradientPositionsLabel');
  const stopCountLabel = document.getElementById('stopCountLabel');

  // Build CSS gradient string
  const gradientCss = stops.map(s => `${s.hex} ${(s.pos*100).toFixed(1)}%`).join(', ');
  bar.style.background = `linear-gradient(90deg, ${gradientCss})`;
  positionsLabel.textContent = 'Stops: ' + stops.map(s => (s.pos*100).toFixed(0)+'%').join(' • ');
  stopCountLabel.textContent = String(stops.length);

  // Clear existing stops in bar
  bar.innerHTML = '';
  stops.forEach((s, idx) => {
    const stopEl = document.createElement('div');
    stopEl.className = 'gradient-stop';
    stopEl.style.left = (s.pos*100) + '%';
    stopEl.title = s.hex;
    stopEl.dataset.idx = idx;
    stopEl.style.background = s.hex;
    stopEl.addEventListener('mousedown', (e) => { e.stopPropagation(); selectStopByIndex(idx); startDragStop(e, idx); });
    stopEl.addEventListener('touchstart', (e) => { e.stopPropagation(); selectStopByIndex(idx); startDragStop(e, idx); }, {passive:false});
    bar.appendChild(stopEl);
  });

  // Build stops list
  list.innerHTML = '';
  stops.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'gradient-stop-row';
    row.dataset.idx = idx;

    const sw = document.createElement('div'); sw.className='gradient-stop-swatch'; sw.style.background = s.hex;
    const controls = document.createElement('div'); controls.className='gradient-stop-controls';

    // Color/Hex Group Container
    const colorHexGroup = document.createElement('div');
    colorHexGroup.className = 'gradient-color-input-group';
    
    // color picker
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = s.hex;
    colorInput.addEventListener('input', () => { 
        updateStopColor(idx, colorInput.value); 
        hexInput.value = colorInput.value.toUpperCase(); // Update linked hex input
        sw.style.background = colorInput.value; 
        renderGradientEditor(); 
    });

    // Hex Input
    const hexInput = document.createElement('input'); 
    hexInput.type='text'; 
    hexInput.className='hexInput gradient-hex-input'; 
    hexInput.value = s.hex.toUpperCase();
    hexInput.addEventListener('input', () => {
        const v = hexInput.value.trim();
        hexInput.value = v.toUpperCase();
        if (/^#([A-Fa-f0-9]{6})$/.test(v)) {
            colorInput.value = v; // Update linked color input
            updateStopColor(idx, v); 
            sw.style.background = v; 
            renderGradientEditor(); 
        }
    });

    // Add picker and hex to the group
    colorHexGroup.appendChild(colorInput);
    colorHexGroup.appendChild(hexInput);


    // position slider
    const posRange = document.createElement('input'); posRange.type='range'; posRange.min=0; posRange.max=100; posRange.value = Math.round(s.pos*100);
    posRange.addEventListener('input', () => { updateStopPosition(idx, posRange.value/100); renderGradientEditor(); });
    
    // ** START FIX: NEW WRAPPER for the slider (crucial for mobile stacking) **
    const sliderTrackWrap = document.createElement('div');
    sliderTrackWrap.className = 'slider-track-wrap';
    sliderTrackWrap.appendChild(posRange);


    // delete button
    const delBtn = document.createElement('button'); 
    delBtn.className='danger-btn'; // Changed from 'ghost' to 'danger-btn' for styling consistency
    delBtn.innerHTML='<i class="ri-delete-bin-line"></i>';
    delBtn.addEventListener('click', ()=> { removeStop(idx); renderGradientEditor(); });


    // Append to row structure
    // Group 1: Swatch and Delete button 
    const swatchAndDeleteContainer = document.createElement('div');
    // ** ADDED CLASS HERE to match CSS **
    swatchAndDeleteContainer.className = 'swatch-and-delete'; 
    
    swatchAndDeleteContainer.appendChild(sw);
    swatchAndDeleteContainer.appendChild(delBtn); // Put the delete button next to the swatch
    
    row.appendChild(swatchAndDeleteContainer);
    
    // Group 2: Controls (Color/Hex and Slider)
    controls.appendChild(colorHexGroup); // Add the Color/Hex group
    controls.appendChild(sliderTrackWrap); // ** APPEND THE NEW SLIDER WRAPPER **
    
    row.appendChild(controls);
    // ** END FIX **

    list.appendChild(row);
  });

  // wire add / apply controls
  const addBtn = document.getElementById('addGradientStop');
  if(addBtn) addBtn.onclick = () => { addStop(); renderGradientEditor(); };
  const applyBtn = document.getElementById('applyGradientChanges');
  if(applyBtn) applyBtn.onclick = () => { applyGradientEdits(); document.getElementById('gradient-editor-modal').classList.remove('show'); };
  const discardBtn = document.getElementById('discardGradientChanges');
  if(discardBtn) discardBtn.onclick = () => { gradientEditing=null; document.getElementById('gradient-editor-modal').classList.remove('show'); };
  const revBtn = document.getElementById('gradientReverseBtn');
  if(revBtn) revBtn.onclick = () => { reverseStops(); renderGradientEditor(); };
  const resetBtn = document.getElementById('gradientResetBtn');
  if(resetBtn) resetBtn.onclick = () => { resetStops(); renderGradientEditor(); };

  // alpha preview control
  const alpha = document.getElementById('gradientAlpha');
  if(alpha) {
    alpha.oninput = () => {
      const a = parseFloat(alpha.value);
      bar.style.opacity = String(a);
    };
  }
}

/* Stop operations */
function selectStopByIndex(idx){
  const bar = document.getElementById('gradientBar');
  if(!bar) return;
  bar.querySelectorAll('.gradient-stop').forEach(s => s.classList.toggle('active', Number(s.dataset.idx) === idx));
}

function addStop(){
  if(!gradientEditing) return;
  const stops = gradientEditing.stops;
  let pos = 0.5;
  if(stops.length >= 2) pos = (stops[0].pos + stops[stops.length-1].pos)/2;
  const hex = stops.length ? stops[Math.floor(stops.length/2)].hex : '#FFFFFF';
  stops.push({ pos, r: hexToRgb(hex).r/255, g: hexToRgb(hex).g/255, b: hexToRgb(hex).b/255, hex, rawIndex: null });
  stops.sort((a,b)=>a.pos-b.pos);
}

function removeStop(idx){
  if(!gradientEditing) return;
  if(gradientEditing.stops.length <= 2) return alert("Gradient needs at least 2 stops.");
  gradientEditing.stops.splice(idx,1);
}

/* Update single stop position (0..1) */
function updateStopPosition(idx, newPos) {
  if(!gradientEditing) return;
  gradientEditing.stops[idx].pos = Math.min(1, Math.max(0, parseFloat(newPos)));
  gradientEditing.stops.sort((a,b)=>a.pos-b.pos);
}

/* Update color of stop */
function updateStopColor(idx, hex) {
  if(!gradientEditing) return;
  const s = gradientEditing.stops[idx];
  s.hex = hex;
  const rgb = hexToRgb(hex);
  s.r = rgb.r/255; s.g = rgb.g/255; s.b = rgb.b/255;
}

/* Reverse stops order */
function reverseStops(){
  if(!gradientEditing) return;
  gradientEditing.stops = gradientEditing.stops.slice().map(s => ({ ...s, pos: 1 - s.pos})).sort((a,b)=>a.pos-b.pos);
}

/* Reset to original (rebuild from rawArr) */
function resetStops(){
  if(!gradientEditing) return;
  const raw = gradientEditing.rawArr;
  const newStops = [];
  for(let i=0;i<raw.length;i+=4){
    const pos = raw[i]; const r=raw[i+1], g=raw[i+2], b=raw[i+3];
    newStops.push({ pos:parseFloat(pos), r, g, b, hex: rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255)), rawIndex:i});
  }
  gradientEditing.stops = newStops.sort((a,b)=>a.pos-b.pos);
}

/* Dragging logic: listen mouse move until mouseup, convert pageX to pos in bar */
let dragging = null;
function startDragStop(e, idx){
  e.preventDefault();
  dragging = { idx, startX: e.clientX || (e.touches && e.touches[0].clientX) };
  const bar = document.getElementById('gradientBar');
  if(!bar) return;
  const rect = bar.getBoundingClientRect();

  function onMove(ev){
    const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX);
    let relative = (clientX - rect.left) / rect.width;
    relative = Math.min(1, Math.max(0, relative));
    updateStopPosition(dragging.idx, relative);
    renderGradientEditor();
  }
  function onUp(){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    dragging = null;
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('touchend', onUp);
}

/**
 * Apply gradient edits back into animation data.
 * This will locate the correct raw array and write new values (positions and r,g,b)
 */
function applyGradientEdits(){
  if(!gradientEditing) return;
  const { gradRef, stops } = gradientEditing;
  // rebuild raw array as [pos, r, g, b, ...] where r/g/b are normalized 0..1
  const newRaw = [];
  stops.forEach(s => {
    newRaw.push(parseFloat(s.pos));
    newRaw.push(parseFloat(s.r));
    newRaw.push(parseFloat(s.g));
    newRaw.push(parseFloat(s.b));
  });

  // Place back into gradRef in safest slot
  if(Array.isArray(gradRef.k)) {
    // static gradient
    gradRef.k.length = 0;
    for(let i=0;i<newRaw.length;i++) gradRef.k[i] = newRaw[i];
  } else if (gradRef.s && Array.isArray(gradRef.s)) {
    // animated -> try to update first keyframe start values
    if (Array.isArray(gradRef.s) && gradRef.s.length && Array.isArray(gradRef.s[0])) {
      gradRef.s[0].length = 0;
      for(let i=0;i<newRaw.length;i++) gradRef.s[0][i] = newRaw[i];
    } else {
      gradRef.k = newRaw;
    }
  } else {
    // fallback: set gradRef.k
    gradRef.k = newRaw;
  }

  // Update grouped hex label to first stop hex for UI consistency
  if(gradientEditing.groupObj) gradientEditing.groupObj.hex = stops[0] ? stops[0].hex : '#000000';

  // re-extract and reload
  extractAndRenderColors();
  reloadAnim();

  // clear editing context
  gradientEditing = null;
}

/* ===========================
   Initialization & small helpers
   =========================== */

function isObject(o){ return o && typeof o === 'object'; }

// This Export Menu Button logic is kept here as it was defined here originally.
document.getElementById('exportMenuBtn').onclick = () => {
    if(!animData) return alert("Load a Lottie file first.");

    if (isEmbeddedBrowser()) {
        // --- SCENARIO 1: Download WILL NOT WORK (Show Notice) ---
        modalCard.innerHTML = `
            <div style="text-align:center; margin-bottom:16px;">
                <i class="ri-alert-line" style="font-size:32px; color:#ffc107;"></i>
            </div>
            <h3 style="margin:0 0 8px 0; font-size:18px;">ဤBrowserတွင်Downloadလုပ်လို့မရပါ။
            <p class="muted" style="margin:0; font-size:13px; line-height:1.5;">
                security အရဤ Browser တွင် file တိုက်ရိုက် download လုပ်ခွင့်ပိတ်ထားသောကြောင့်မရပါ။.
            </p>
            <p style="font-weight:600; font-size:14px; margin:15px 0 5px 0;">
                To save your work:
            </p>
            <ol style="padding-left: 20px; margin:0; font-size:13px;">
                <li>အပေါ်က(•••)ကိုနှိပ်ပြီးအခြား Browserကနေဖွင့်ပါ။</li>
                <li>"Open in Browser" ကိုနှိပ်ပြီး(Chrome/Safari/Google)တို့ကနေဖွင့်ပါ။.</li>
                <li>Browserကနေဖွင့်မှသာ File download လုပ်နိုင်ပါလိမ့်မယ်။</li>
            </ol>
            <div class="modal-btn-row" style="margin-top:20px;">
                <button class="ghost modal-close" style="color:var(--text-muted); border-color:var(--surface-border)">
                    Close Instructions
                </button>
            </div>
        `;
        modalCard.querySelector('.modal-close').onclick = () => modal.classList.remove('show');

    } else {
        // --- SCENARIO 2: Download SHOULD WORK (Show Buttons) ---
        modalCard.innerHTML = standardModalContentTemplate;
        attachDownloadListeners();
    }

    modal.classList.add('show');
}


/* --- Dark Mode Toggle & Persistence Logic (Cleaned and unified) --- */

// 1. Function to update the icon based on the mode
function updateDarkToggleIcon(isDark) {
    const darkToggle = document.getElementById('darkToggle');
    if (darkToggle) {
        // Show Sun icon if currently Dark (click to go Light)
        // Show Moon icon if currently Light (click to go Dark)
        darkToggle.innerHTML = isDark
            ? '<i class="ri-sun-line"></i>' 
            : '<i class="ri-moon-line"></i>';
    }
}

// 2. Add click listener to the button
document.getElementById('darkToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    // Save preference to localStorage
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Update the button icon
    updateDarkToggleIcon(isDark);
});


// 3. SINGLE, UNIFIED DOMContentLoaded Listener
document.addEventListener('DOMContentLoaded', () => {
    // Initial setup of themes
    renderThemes();

    // DARK MODE PERSISTENCE CHECK
    const body = document.body;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let isDark = false;

    if (savedTheme === 'dark' || (savedTheme === null && prefersDark)) {
        body.classList.add('dark');
        isDark = true;
    } else {
        // Ensure 'dark' class is removed if theme is 'light' or default is light
        body.classList.remove('dark');
    }
    
    // Set the initial icon state based on the determined mode
    updateDarkToggleIcon(isDark);

    // BROWSER WARNING
    if (isEmbeddedBrowser()) {
        browserWarning.style.display = 'block';
    }
    
    // FINAL INIT (from your original code)
    document.getElementById('frameLabel').textContent = '0';
    updateUndoRedoButtons();
});
