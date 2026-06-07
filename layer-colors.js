/* layer-colors.js — Per-layer colour panel with thumbnails + isolation */
import { state, dom } from './state.js';
import { extractColors } from './colors.js';
import { rgbToHex, hexToRgb, saveSnapshot, toast } from './utils.js';
import { renderPreviewSilent } from './preview.js';

let isolatedIdx = null;
let savedOpacities = [];

/* ── Helpers ── */
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trunc(s,n) { return s.length>n ? s.slice(0,n-1)+'…' : s; }
function typeIcon(ty) { return ({0:'📦',1:'⬛',2:'🖼',3:'◻️',4:'✦',5:'T',6:'🔊',13:'📷'})[ty]||'◻️'; }

function setLayerOpacity(layer, val) {
    if (!layer.ks) layer.ks = {};
    if (!layer.ks.o) layer.ks.o = { a:0, k:100 };
    const op = layer.ks.o;
    if (op.a===1 && Array.isArray(op.k)) {
        op.k.forEach(kf=>{ if(kf.s)kf.s[0]=val; if(kf.e)kf.e[0]=val; });
    } else { op.k=val; op.a=0; }
}

function restoreOpacities() {
    savedOpacities.forEach(({layer,val})=>setLayerOpacity(layer,val));
    savedOpacities=[];
}

function isolateLayer(idx) {
    restoreOpacities();
    isolatedIdx = idx;
    state.flatLayers.forEach((entry,i)=>{
        if(i===idx) return;
        const layer = entry.layer;
        const op = layer.ks?.o;
        let orig = 100;
        if(op) orig = op.a===1 ? (op.k[0]?.s?.[0]??op.k[0]??100) : (Array.isArray(op.k)?op.k[0]:op.k)??100;
        savedOpacities.push({layer,val:orig});
        setLayerOpacity(layer,10);
    });
    renderPreviewSilent({stopPlayback:false});
    renderLayerColorsPanel();
}

function unisolate() {
    restoreOpacities();
    isolatedIdx = null;
    renderPreviewSilent({stopPlayback:false});
    renderLayerColorsPanel();
}

function drawThumb(canvas, idx) {
    const ctx = canvas.getContext('2d');
    const W=36, H=36;
    ctx.clearRect(0,0,W,H);
    // checkerboard
    for(let y=0;y<H;y+=6) for(let x=0;x<W;x+=6) {
        ctx.fillStyle=((x/6+y/6)%2===0)?'#ccc':'#999';
        ctx.fillRect(x,y,6,6);
    }
    const entry = state.flatLayers[idx];
    if(!entry) return;
    const colors = extractColors(entry.layer);
    if(!colors.length) return;
    const sw = W/colors.length;
    colors.forEach((c,i)=>{
        ctx.fillStyle = rgbToHex(c.color[0],c.color[1],c.color[2]);
        ctx.fillRect(i*sw,0,sw+1,H);
    });
    // round clip
    ctx.globalCompositeOperation='destination-in';
    ctx.beginPath(); ctx.roundRect(0,0,W,H,6); ctx.fill();
    ctx.globalCompositeOperation='source-over';
}

export function renderLayerColorsPanel() {
    const el = dom.inspectorContent;
    if(!state.lottieData||!state.flatLayers.length) {
        el.innerHTML=`<div class="empty-state"><p>Import a Lottie file first</p></div>`; return;
    }

    let html = `<div class="lc-panel">
        <div class="lc-header">
            <span class="lc-title">Layers &amp; Colours</span>
            <button class="lc-unisolate-btn" id="lc-unisolate" style="display:${isolatedIdx!==null?'flex':'none'}">
                ⊙ Show All
            </button>
        </div>`;

    state.flatLayers.forEach((entry,idx)=>{
        const layer=entry.layer, name=layer.nm||`Layer ${idx+1}`;
        const colors=extractColors(layer), isIso=isolatedIdx===idx;
        html+=`<div class="lc-layer-block${isIso?' lc-isolated':''}" data-idx="${idx}">
            <div class="lc-layer-head">
                <canvas class="lc-thumb" data-idx="${idx}" width="36" height="36"></canvas>
                <span class="lc-type">${typeIcon(layer.ty)}</span>
                <span class="lc-name" title="${escH(name)}">${escH(trunc(name,22))}</span>
                <div class="lc-actions">
                    <button class="lc-iso-btn${isIso?' lc-iso-active':''}" data-idx="${idx}" title="Isolate">⊙</button>
                    <button class="lc-vis-btn" data-idx="${idx}" title="Visibility">${layer.hd?'🙈':'👁'}</button>
                </div>
            </div>
            <div class="lc-colors-list">`;

        if(colors.length) {
            colors.forEach((c,ci)=>{
                const hex=rgbToHex(c.color[0],c.color[1],c.color[2]);
                html+=`<div class="lc-color-row">
                    <div class="lc-sw-wrap">
                        <div class="lc-sw" style="background:${hex}"></div>
                        <input type="color" class="lc-ci" value="${hex}" data-li="${idx}" data-ci="${ci}">
                    </div>
                    <span class="lc-clabel">${escH(trunc(c.label||'Color',20))}</span>
                    <span class="lc-chex">${hex}</span>
                </div>`;
            });
        } else {
            html+=`<div class="lc-no-colors">No editable colours</div>`;
        }
        html+=`</div></div>`;
    });

    html+=`</div>`;
    el.innerHTML=html;

    // Draw thumbnails
    requestAnimationFrame(()=>{
        el.querySelectorAll('.lc-thumb').forEach(c=>drawThumb(c,parseInt(c.dataset.idx)));
    });

    // Isolate buttons
    el.querySelectorAll('.lc-iso-btn').forEach(btn=>{
        btn.addEventListener('click',e=>{
            e.stopPropagation();
            const idx=parseInt(btn.dataset.idx);
            if(isolatedIdx===idx) unisolate(); else isolateLayer(idx);
        });
    });

    // Visibility
    el.querySelectorAll('.lc-vis-btn').forEach(btn=>{
        btn.addEventListener('click',e=>{
            e.stopPropagation();
            const layer=state.flatLayers[parseInt(btn.dataset.idx)]?.layer;
            if(!layer) return;
            saveSnapshot(); layer.hd=!layer.hd;
            renderPreviewSilent({stopPlayback:false});
            renderLayerColorsPanel();
        });
    });

    // Unisolate
    document.getElementById('lc-unisolate')?.addEventListener('click',unisolate);

    // Colour pickers
    el.querySelectorAll('.lc-ci').forEach(inp=>{
        let snap=false;
        inp.addEventListener('input',()=>{
            if(!snap){saveSnapshot();snap=true;}
            const li=parseInt(inp.dataset.li), ci=parseInt(inp.dataset.ci);
            const layer=state.flatLayers[li]?.layer; if(!layer) return;
            const colors=extractColors(layer); if(!colors[ci]) return;
            colors[ci].setter(hexToRgb(inp.value));
            const sw=inp.previousElementSibling; if(sw) sw.style.background=inp.value;
            const hexSpan=inp.closest('.lc-color-row')?.querySelector('.lc-chex');
            if(hexSpan) hexSpan.textContent=inp.value;
            renderPreviewSilent({stopPlayback:true});
        });
        inp.addEventListener('change',()=>{snap=false;});
    });
}

export function cleanupLayerColorsPanel() {
    if(isolatedIdx!==null) unisolate();
}
