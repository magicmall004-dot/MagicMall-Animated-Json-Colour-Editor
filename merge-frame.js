/* merge-frame.js — Composite two Lottie animations into one frame */
import { state, dom } from './state.js';
import { saveSnapshot, toast, downloadBlob } from './utils.js';
import { renderPreview } from './preview.js';
import { buildLayersList } from './layers.js';
import { renderInspector } from './inspector.js';

let pendingData = null;

export function initMergeFrame() {
    buildMergeModal();
    document.getElementById('btn-merge-frame')?.addEventListener('click', () => {
        if (!state.lottieData) { toast('Load a Lottie file first', 'info'); return; }
        openMergeModal();
    });
}

function buildMergeModal() {
    if (document.getElementById('merge-modal')) return;
    const el = document.createElement('div');
    el.id = 'merge-modal';
    el.className = 'lc-modal-overlay';
    el.innerHTML = `
    <div class="lc-modal-box" style="max-width:480px;">
        <div class="lc-modal-head">
            <h3>🖼 Merge Two Animations</h3>
            <button id="merge-x">✕</button>
        </div>
        <p style="font-size:13px;color:var(--text2,#666);margin:0 0 14px;line-height:1.5;">
            Load a second Lottie file. It will be added as a new layer on top of the current animation.
        </p>

        <div id="merge-drop" class="merge-drop-zone">
            <div id="merge-drop-inner">
                <div style="font-size:36px;margin-bottom:6px;">📂</div>
                <div style="font-size:13px;color:var(--text2,#666);margin-bottom:10px;">Drop .json / .tgs here or</div>
                <label class="merge-browse-btn">
                    Browse File
                    <input type="file" id="merge-file-input" accept=".json,.tgs" style="display:none;">
                </label>
            </div>
            <div id="merge-loaded-info" style="display:none;align-items:center;gap:8px;font-size:13px;">
                <span style="background:#10b981;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;">✓ Loaded</span>
                <span id="merge-file-name" style="font-weight:600;"></span>
                <span id="merge-file-info" style="color:var(--text3,#999);font-size:11px;"></span>
                <button id="merge-change" style="margin-left:auto;font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border,#ddd);background:transparent;cursor:pointer;color:var(--text2,#666);">Change</button>
            </div>
        </div>

        <div id="merge-settings" style="display:none;margin-top:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="merge-field">
                    <label>Position X</label>
                    <input type="number" id="merge-px" value="0" step="1">
                </div>
                <div class="merge-field">
                    <label>Position Y</label>
                    <input type="number" id="merge-py" value="0" step="1">
                </div>
                <div class="merge-field">
                    <label>Scale %</label>
                    <input type="number" id="merge-sc" value="100" min="1" max="400">
                </div>
                <div class="merge-field">
                    <label>Layer Name</label>
                    <input type="text" id="merge-nm" value="Merged Layer">
                </div>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
                <label style="font-size:12px;color:var(--text2,#666);font-weight:500;">Z-Order</label>
                <div class="mp4-seg" data-for="zorder">
                    <button data-z="top" class="mp4-seg-on">On Top</button>
                    <button data-z="bottom">Behind</button>
                </div>
            </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="merge-go" style="flex:1;padding:11px;border-radius:10px;background:var(--blue,#0b84ff);color:#fff;border:none;font-weight:600;cursor:pointer;font-size:14px;" disabled>
                ✦ Merge into Frame
            </button>
            <button id="merge-cancel" style="flex:1;padding:11px;border-radius:10px;background:transparent;border:1px solid var(--border,#ddd);cursor:pointer;font-size:14px;">
                Cancel
            </button>
        </div>
    </div>`;
    document.body.appendChild(el);

    // Close
    el.querySelector('#merge-x').onclick     = closeMergeModal;
    el.querySelector('#merge-cancel').onclick = closeMergeModal;
    el.addEventListener('click', e => { if (e.target === el) closeMergeModal(); });

    // File input
    el.querySelector('#merge-file-input').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        e.target.value = '';
        parseLottieFile(f, d => { pendingData = d; showMergeLoaded(f.name); });
    });

    // Change button
    el.querySelector('#merge-change').addEventListener('click', () => {
        pendingData = null;
        el.querySelector('#merge-loaded-info').style.display = 'none';
        el.querySelector('#merge-drop-inner').style.display  = 'flex';
        el.querySelector('#merge-settings').style.display    = 'none';
        el.querySelector('#merge-go').disabled = true;
    });

    // Drop zone
    const drop = el.querySelector('#merge-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('merge-drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('merge-drag-over'));
    drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('merge-drag-over');
        const f = e.dataTransfer.files[0];
        if (f) parseLottieFile(f, d => { pendingData = d; showMergeLoaded(f.name); });
    });

    // Z-order seg
    el.querySelector('[data-for="zorder"]').addEventListener('click', e => {
        const btn = e.target.closest('[data-z]'); if (!btn) return;
        el.querySelectorAll('[data-z]').forEach(b => b.classList.remove('mp4-seg-on'));
        btn.classList.add('mp4-seg-on');
    });

    // Merge
    el.querySelector('#merge-go').addEventListener('click', doMerge);
}

function parseLottieFile(file, cb) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.tgs')) {
        file.arrayBuffer().then(buf => {
            try { cb(JSON.parse(pako.ungzip(new Uint8Array(buf), { to: 'string' }))); }
            catch(e) { toast('Failed to parse TGS: ' + e.message, 'error'); }
        });
    } else {
        file.text().then(txt => {
            try { cb(JSON.parse(txt)); }
            catch(e) { toast('Failed to parse JSON: ' + e.message, 'error'); }
        });
    }
}

function showMergeLoaded(name) {
    const el = document.getElementById('merge-modal');
    el.querySelector('#merge-drop-inner').style.display  = 'none';
    el.querySelector('#merge-loaded-info').style.display = 'flex';
    el.querySelector('#merge-file-name').textContent = name.replace(/\.(json|tgs)$/i,'');
    el.querySelector('#merge-file-info').textContent =
        `${pendingData.w||'?'}×${pendingData.h||'?'} · ${pendingData.fr||'?'}fps`;
    el.querySelector('#merge-nm').value = pendingData.nm || name.replace(/\.(json|tgs)$/i,'') || 'Merged Layer';
    el.querySelector('#merge-settings').style.display = 'block';
    el.querySelector('#merge-go').disabled = false;
}

function openMergeModal() {
    pendingData = null;
    const el = document.getElementById('merge-modal');
    el.querySelector('#merge-loaded-info').style.display = 'none';
    el.querySelector('#merge-drop-inner').style.display  = 'flex';
    el.querySelector('#merge-settings').style.display    = 'none';
    el.querySelector('#merge-go').disabled = true;
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('lc-modal-open'));
}

function closeMergeModal() {
    const el = document.getElementById('merge-modal');
    el.classList.remove('lc-modal-open');
    setTimeout(() => el.style.display = 'none', 250);
    pendingData = null;
}

function doMerge() {
    if (!state.lottieData || !pendingData) return;
    const el  = document.getElementById('merge-modal');
    const posX  = parseFloat(el.querySelector('#merge-px').value) || 0;
    const posY  = parseFloat(el.querySelector('#merge-py').value) || 0;
    const scale = parseFloat(el.querySelector('#merge-sc').value) / 100 || 1;
    const name  = el.querySelector('#merge-nm').value || 'Merged Layer';
    const onTop = !el.querySelector('[data-z="bottom"].mp4-seg-on');

    saveSnapshot();

    if (!state.lottieData.assets) state.lottieData.assets = [];

    // Prefix all asset IDs from second file to avoid collisions
    const prefix   = `mf_${Date.now()}_`;
    const assetMap = new Map();

    (pendingData.assets || []).forEach(asset => {
        const newId = prefix + (asset.id || Math.random().toString(36).slice(2));
        assetMap.set(asset.id, newId);
        const cloned = JSON.parse(JSON.stringify(asset));
        cloned.id = newId;
        if (cloned.layers) remapRefs(cloned.layers, assetMap);
        state.lottieData.assets.push(cloned);
    });

    // Wrap second file's layers in a precomp asset
    const precompId = prefix + 'precomp';
    const precompAsset = {
        id: precompId, nm: name,
        fr: pendingData.fr,
        layers: JSON.parse(JSON.stringify(pendingData.layers || [])),
    };
    remapRefs(precompAsset.layers, assetMap);
    state.lottieData.assets.push(precompAsset);

    // Create precomp layer
    const maxInd = Math.max(0, ...state.lottieData.layers.map(l => l.ind || 0));
    const baseW = state.lottieData.w || 512;
    const baseH = state.lottieData.h || 512;
    const srcW  = pendingData.w || 512;
    const srcH  = pendingData.h || 512;
    const newLayer = {
        ddd:0, ind:maxInd+1, ty:0, nm:name,
        refId: precompId, sr:1,
        ks:{
            o:{a:0,k:100}, r:{a:0,k:0},
            p:{a:0,k:[posX + baseW/2, posY + baseH/2, 0]},
            a:{a:0,k:[srcW/2, srcH/2, 0]},
            s:{a:0,k:[scale*100, scale*100, 100]},
        },
        ao:0, w:srcW, h:srcH,
        ip: state.lottieData.ip||0, op: state.lottieData.op||60,
        st:0, bm:0,
    };

    onTop ? state.lottieData.layers.unshift(newLayer)
          : state.lottieData.layers.push(newLayer);

    toast(`Merged "${name}" into frame`, 'success');
    closeMergeModal();
    renderPreview({ autoplay:false, preserveFrame:false });
    buildLayersList();
    renderInspector();
}

function remapRefs(layers, map) {
    if (!Array.isArray(layers)) return;
    layers.forEach(l => { if (l.refId && map.has(l.refId)) l.refId = map.get(l.refId); });
}
