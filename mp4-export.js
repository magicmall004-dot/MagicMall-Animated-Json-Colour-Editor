/* mp4-export.js — MP4/WebM export with custom background */
import { state, dom } from './state.js';
import { toast, downloadBlob } from './utils.js';

let busy=false, cancel=false;
const cfg = { bg:'#000000', transparent:false, scale:1, fps:30, quality:'medium' };

export function initMp4Export() {
    document.getElementById('export-mp4')?.addEventListener('click',()=>{
        if(!state.lottieData) return;
        dom.exportDropdown?.classList.remove('open');
        openMp4Modal();
    });
    buildMp4Modal();
}

function buildMp4Modal() {
    if(document.getElementById('mp4-modal')) return;
    const el=document.createElement('div');
    el.id='mp4-modal';
    el.className='lc-modal-overlay';
    el.innerHTML=`
    <div class="lc-modal-box">
        <div class="lc-modal-head">
            <h3>🎬 Export MP4 / WebM</h3>
            <button id="mp4-x">✕</button>
        </div>
        <div class="mp4-rows">
            <div class="mp4-row">
                <label>Background</label>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
                        <input type="checkbox" id="mp4-transp"> Transparent
                    </label>
                    <div id="mp4-bg-wrap" style="display:flex;align-items:center;gap:6px;">
                        <div id="mp4-bg-sw" style="width:24px;height:24px;border-radius:5px;border:1px solid #ccc;background:#000;"></div>
                        <input type="color" id="mp4-bg-color" value="#000000">
                        <input type="text" id="mp4-bg-hex" value="#000000" maxlength="7"
                            style="width:70px;font-family:monospace;font-size:11px;padding:3px 6px;
                                   border:1px solid var(--border,#ddd);border-radius:5px;
                                   background:var(--surface,#fff);color:var(--text,#000);">
                    </div>
                </div>
            </div>
            <div class="mp4-row">
                <label>Scale</label>
                <div class="mp4-seg" data-cfg="scale">
                    <button data-v="0.5">50%</button>
                    <button data-v="1" class="mp4-seg-on">100%</button>
                    <button data-v="2">200%</button>
                </div>
            </div>
            <div class="mp4-row">
                <label>FPS</label>
                <div class="mp4-seg" data-cfg="fps">
                    <button data-v="24">24</button>
                    <button data-v="30" class="mp4-seg-on">30</button>
                    <button data-v="60">60</button>
                </div>
            </div>
            <div class="mp4-row">
                <label>Quality</label>
                <div class="mp4-seg" data-cfg="quality">
                    <button data-v="high">Best</button>
                    <button data-v="medium" class="mp4-seg-on">Normal</button>
                    <button data-v="low">Small</button>
                </div>
            </div>
            <div id="mp4-info" class="mp4-info">—</div>
        </div>
        <div id="mp4-prog-row" style="display:none;margin:8px 0;">
            <div style="height:6px;border-radius:3px;background:var(--border,#eee);overflow:hidden;">
                <div id="mp4-prog-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#0b84ff,#00c6ff);transition:width .2s;border-radius:3px;"></div>
            </div>
            <div id="mp4-prog-text" style="font-size:11px;color:var(--text2,#666);text-align:center;margin-top:4px;">Preparing…</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="mp4-go" style="flex:1;padding:11px;border-radius:10px;background:var(--blue,#0b84ff);color:#fff;border:none;font-weight:600;cursor:pointer;font-size:14px;">🎬 Export</button>
            <button id="mp4-cancel" style="flex:1;padding:11px;border-radius:10px;background:transparent;border:1px solid var(--border,#ddd);cursor:pointer;font-size:14px;">Cancel</button>
        </div>
        <p style="font-size:11px;color:var(--text3,#999);margin:10px 0 0;text-align:center;line-height:1.5;">
            Exports WebM or MP4 depending on browser.<br>Transparent needs VP9 (Chrome/Edge).
        </p>
    </div>`;
    document.body.appendChild(el);

    el.querySelector('#mp4-x').onclick      = closeMp4Modal;
    el.querySelector('#mp4-cancel').onclick = ()=>{ if(busy)cancel=true; else closeMp4Modal(); };
    el.addEventListener('click',e=>{ if(e.target===el&&!busy) closeMp4Modal(); });
    el.querySelector('#mp4-go').onclick     = startMp4;

    // BG colour
    const transCb=el.querySelector('#mp4-transp');
    const bgColor=el.querySelector('#mp4-bg-color');
    const bgHex  =el.querySelector('#mp4-bg-hex');
    const bgSw   =el.querySelector('#mp4-bg-sw');
    const bgWrap =el.querySelector('#mp4-bg-wrap');

    const syncBg=()=>{ bgSw.style.background=bgColor.value; cfg.bg=bgColor.value; updateMp4Info(); };
    bgColor.addEventListener('input',()=>{ bgHex.value=bgColor.value.toUpperCase(); syncBg(); });
    bgHex.addEventListener('input',()=>{
        let v=bgHex.value.trim(); if(!v.startsWith('#'))v='#'+v;
        if(/^#[0-9a-fA-F]{6}$/.test(v)){ bgColor.value=v; syncBg(); }
    });
    transCb.addEventListener('change',()=>{
        cfg.transparent=transCb.checked;
        bgWrap.style.opacity=transCb.checked?'0.4':'1';
        bgWrap.style.pointerEvents=transCb.checked?'none':'';
        updateMp4Info();
    });
    syncBg();

    // Segmented
    el.querySelectorAll('.mp4-seg').forEach(seg=>{
        seg.addEventListener('click',e=>{
            const btn=e.target.closest('[data-v]'); if(!btn) return;
            seg.querySelectorAll('[data-v]').forEach(b=>b.classList.remove('mp4-seg-on'));
            btn.classList.add('mp4-seg-on');
            const key=seg.dataset.cfg, val=btn.dataset.v;
            cfg[key]=isNaN(val)?val:parseFloat(val);
            updateMp4Info();
        });
    });
}

function updateMp4Info() {
    const info=document.getElementById('mp4-info'); if(!info||!state.lottieData) return;
    const ip=state.lottieData.ip||0,op=state.lottieData.op||60,fr=state.lottieData.fr||30;
    const secs=(op-ip)/fr, fps=Math.min(cfg.fps,fr);
    const w=Math.round((state.lottieData.w||512)*cfg.scale);
    const h=Math.round((state.lottieData.h||512)*cfg.scale);
    info.textContent=`${w}×${h} · ${fps}fps · ${secs.toFixed(2)}s · bg: ${cfg.transparent?'transparent':cfg.bg}`;
}

function openMp4Modal() {
    updateMp4Info();
    const el=document.getElementById('mp4-modal');
    if(el){ el.style.display='flex'; requestAnimationFrame(()=>el.classList.add('lc-modal-open')); }
}
function closeMp4Modal() {
    const el=document.getElementById('mp4-modal');
    if(el){ el.classList.remove('lc-modal-open'); setTimeout(()=>el.style.display='none',250); }
}

async function startMp4() {
    if(busy||!state.lottieData) return;
    const goBtn=document.getElementById('mp4-go');
    const canBtn=document.getElementById('mp4-cancel');
    const progRow=document.getElementById('mp4-prog-row');
    const progFill=document.getElementById('mp4-prog-fill');
    const progText=document.getElementById('mp4-prog-text');

    busy=true; cancel=false;
    goBtn.disabled=true; canBtn.textContent='Stop';
    progRow.style.display='block';
    const setP=(p,t)=>{ progFill.style.width=(p*100).toFixed(1)+'%'; if(t) progText.textContent=t; };
    setP(0,'Preparing…');

    const ip=state.lottieData.ip||0,op=state.lottieData.op||60,fr=state.lottieData.fr||30;
    const totalSrc=Math.max(1,op-ip), secs=totalSrc/fr;
    const outFps=Math.min(cfg.fps,fr);
    const srcW=state.lottieData.w||512, srcH=state.lottieData.h||512;
    const W=Math.max(1,Math.round(srcW*cfg.scale)), H=Math.max(1,Math.round(srcH*cfg.scale));
    const bitrate={high:8e6,medium:3e6,low:1e6}[cfg.quality]||3e6;

    const want=cfg.transparent;
    const candidates=want
        ?['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
        :['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    let mimeType='';
    for(const c of candidates){ if(MediaRecorder.isTypeSupported(c)){mimeType=c;break;} }
    if(!mimeType){ toast('MediaRecorder not supported in this browser','error'); finish(goBtn,canBtn,progRow); return; }

    const ext=mimeType.startsWith('video/webm')?'.webm':'.mp4';
    const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d',{alpha:want});

    const offDiv=document.createElement('div');
    offDiv.style.cssText=`position:fixed;left:-9999px;top:-9999px;width:${srcW}px;height:${srcH}px;opacity:0;pointer-events:none;`;
    document.body.appendChild(offDiv);

    let offAnim;
    try {
        offAnim=lottie.loadAnimation({container:offDiv,renderer:'svg',loop:false,autoplay:false,
            animationData:JSON.parse(JSON.stringify(state.lottieData)),
            rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:false}});
    } catch(e){ cleanDiv(offDiv,null); finish(goBtn,canBtn,progRow); toast('Lottie init: '+e.message,'error'); return; }

    await new Promise(res=>{ offAnim.isLoaded?res():offAnim.addEventListener('DOMLoaded',res); setTimeout(res,1500); });
    const offSvg=offDiv.querySelector('svg');
    if(!offSvg){ cleanDiv(offDiv,offAnim); finish(goBtn,canBtn,progRow); toast('SVG not found','error'); return; }
    offSvg.setAttribute('width',srcW); offSvg.setAttribute('height',srcH);

    const chunks=[];
    const stream=canvas.captureStream(outFps);
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:bitrate});
    recorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
    const done=new Promise(res=>recorder.onstop=res);
    recorder.start(100);

    const totalFrames=Math.max(1,Math.round(secs*outFps));
    const msPerFrame=1000/outFps;
    setP(0,`Recording 0 / ${totalFrames}`);

    for(let i=0;i<totalFrames;i++){
        if(cancel) break;
        const t=totalFrames===1?0:i/(totalFrames-1);
        offAnim.goToAndStop(t*(totalSrc-1),true);
        const clone=offSvg.cloneNode(true);
        clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
        clone.setAttribute('width',srcW); clone.setAttribute('height',srcH);
        if(!clone.getAttribute('viewBox')) clone.setAttribute('viewBox',`0 0 ${srcW} ${srcH}`);
        const svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
        const blobUrl=URL.createObjectURL(new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'}));
        await new Promise((res,rej)=>{
            const img=new Image();
            img.onload=()=>{
                want?ctx.clearRect(0,0,W,H):(ctx.fillStyle=cfg.bg,ctx.fillRect(0,0,W,H));
                ctx.drawImage(img,0,0,W,H); URL.revokeObjectURL(blobUrl); res();
            };
            img.onerror=()=>{ URL.revokeObjectURL(blobUrl); rej(); };
            img.src=blobUrl;
        }).catch(()=>{});
        setP((i+1)/totalFrames*0.9,`Recording ${i+1} / ${totalFrames}`);
        await new Promise(r=>setTimeout(r,msPerFrame));
    }

    setP(0.9,'Finishing…'); recorder.stop(); await done;
    cleanDiv(offDiv,offAnim);
    if(!cancel){
        const blob=new Blob(chunks,{type:mimeType});
        const base=(dom.fileNameLabel?.textContent||'animation').replace(/\.(json|tgs)$/i,'');
        downloadBlob(blob,base+ext);
        toast(`Exported ${ext.slice(1).toUpperCase()} (${W}×${H}, ${(blob.size/1024).toFixed(1)} KB)`,'success');
        setP(1,'Done!'); setTimeout(closeMp4Modal,800);
    } else { toast('Cancelled','info'); }
    finish(goBtn,canBtn,progRow);
}

function cleanDiv(container,anim){ try{anim&&anim.destroy();}catch(_){} try{container?.parentNode?.removeChild(container);}catch(_){} }
function finish(go,can,pr){ busy=false;cancel=false; go.disabled=false; can.textContent='Cancel'; setTimeout(()=>pr.style.display='none',1200); }
