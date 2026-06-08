/* =============================================
   MAGIC MALL LOTTIE COLOUR EDITOR — script.js
   Features: multi-file, before/after, palette
   generator, GIF export, gradient editor
   ============================================= */
'use strict';

if (!window.pako) {
  document.body.innerHTML = '<div style="color:red;padding:24px;">pako.js failed to load. Refresh.</div>';
  throw new Error('pako missing');
}

/* =============================================
   STATE
   ============================================= */
let animData         = null;
let originalAnimData = null;
let animInstance     = null;
let allColors        = [];
let groupedColors    = {};
let currentFilter    = 'All';
let historyStack     = [];
let redoStack        = [];
const MAX_HISTORY    = 60;
let savedThemes      = JSON.parse(localStorage.getItem('mm_themes') || '[]');
let playerPaused     = true;
let gradEdit         = null;

/* Multi-file */
let fileList  = [];
let fileIndex = 0;

/* Before/After */
let baActive    = false;
let baBeforeAnim = null;
let baAfterAnim  = null;

/* Palette */
let generatedPalette = [];
let paletteMode      = 'hsv';

/* GIF */
const GIF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
let gifWorkerBlobUrl  = null;
let gifBusy           = false;
let gifCancel         = false;
const gifSettings     = { background:'transparent', fps:24, scale:1, quality:10 };

/* =============================================
   DOM
   ============================================= */
const $  = id => document.getElementById(id);
const $$ = s  => document.querySelectorAll(s);

const animEl             = $('anim');
const frameSlider        = $('frameSlider');
const frameLabel         = $('frameLabel');
const totalLabel         = $('totalLabel');
const colorsEl           = $('colors');
const colorStatEl        = $('colorStats');
const layerListEl        = $('layerList');
const loadingOverlay     = $('loadingOverlay');
const previewPlaceholder = $('preview-placeholder');
const animInfoEl         = $('animInfo');
const themesList         = $('themesList');
const groupCheckbox      = $('groupDuplicates');
const gradientToggle     = $('gradientToggle');
const browserWarning     = $('browserWarning');
const fileBar            = $('fileBar');
const fileTabs           = $('fileTabs');
const fileCounter        = $('fileCounter');
const canvasWrap         = $('canvasWrap');
const baWrap             = $('baWrap');

/* =============================================
   UTILITIES
   ============================================= */
function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function deepCopy(o){ return JSON.parse(JSON.stringify(o)); }
function rgbaArrToHex(a){ if(!a||a.length<3)return '#000000'; return rgbToHex(Math.round(a[0]*255),Math.round(a[1]*255),Math.round(a[2]*255)); }
function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function hexToNorm(hex){
  if(!hex||hex.length<4)return{r:0,g:0,b:0};
  if(hex.length===4)hex=`#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  const n=parseInt(hex.slice(1),16);
  return{r:((n>>16)&255)/255,g:((n>>8)&255)/255,b:(n&255)/255};
}
function hexToRgb255(hex){ const{r,g,b}=hexToNorm(hex); return{r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)}; }
function isValidHex(v){ return /^#([0-9A-Fa-f]{6})$/.test(v.trim()); }

/* =============================================
   COLOUR SPACE (palette gen)
   ============================================= */
function rgbToHsv(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=max===0?0:d/max,v=max;
  if(d!==0){switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return{h,s,v};
}
function hsvToRgb(h,s,v){
  let r,g,b;const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
  switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
  return{r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};
}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  let h=0,s=0;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return{h,s,l};
}
function hslToRgb(h,s,l){
  if(s===0){const v=Math.round(l*255);return{r:v,g:v,b:v};}
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const hue=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return{r:Math.round(hue(p,q,h+1/3)*255),g:Math.round(hue(p,q,h)*255),b:Math.round(hue(p,q,h-1/3)*255)};
}

function interpolatePalette(hexA,hexB,count,mode){
  const a=hexToRgb255(hexA),b=hexToRgb255(hexB),result=[];
  for(let i=0;i<count;i++){
    const t=count===1?0:i/(count-1);
    let c;
    if(mode==='rgb'){
      c={r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)};
    } else if(mode==='hsv'){
      const ha=rgbToHsv(a.r,a.g,a.b),hb=rgbToHsv(b.r,b.g,b.b);
      let dh=hb.h-ha.h;if(dh>0.5)dh-=1;if(dh<-0.5)dh+=1;
      c=hsvToRgb(ha.h+dh*t,ha.s+(hb.s-ha.s)*t,ha.v+(hb.v-ha.v)*t);
    } else {
      const ha=rgbToHsl(a.r,a.g,a.b),hb=rgbToHsl(b.r,b.g,b.b);
      let dh=hb.h-ha.h;if(dh>0.5)dh-=1;if(dh<-0.5)dh+=1;
      c=hslToRgb(ha.h+dh*t,ha.s+(hb.s-ha.s)*t,ha.l+(hb.l-ha.l)*t);
    }
    result.push(rgbToHex(c.r,c.g,c.b));
  }
  return result;
}

/* =============================================
   HISTORY
   ============================================= */
function pushHistory(){
  if(!animData)return;
  const snap=deepCopy(animData),last=historyStack[historyStack.length-1];
  if(last&&JSON.stringify(last)===JSON.stringify(snap))return;
  historyStack.push(snap);
  if(historyStack.length>MAX_HISTORY)historyStack.shift();
  redoStack=[];updateHistoryBtns();
  if(fileList[fileIndex]){fileList[fileIndex].historyStack=historyStack;fileList[fileIndex].redoStack=redoStack;}
}
function undoChange(){ if(historyStack.length<=1)return; redoStack.push(historyStack.pop()); animData=deepCopy(historyStack[historyStack.length-1]); afterDataChange();updateHistoryBtns(); }
function redoChange(){ if(!redoStack.length)return; historyStack.push(deepCopy(animData)); animData=redoStack.pop(); afterDataChange();updateHistoryBtns(); }
function updateHistoryBtns(){ $('undoBtn').disabled=historyStack.length<=1; $('redoBtn').disabled=redoStack.length===0; }
$('undoBtn').addEventListener('click',undoChange);
$('redoBtn').addEventListener('click',redoChange);
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.contentEditable==='true')return;
  if(!(e.ctrlKey||e.metaKey))return;
  if(e.key.toLowerCase()!=='z')return;
  e.preventDefault(); e.shiftKey?redoChange():undoChange();
});

/* =============================================
   MULTI-FILE
   ============================================= */
async function parseFile(file){
  const name=file.name.toLowerCase();
  let txt;
  if(name.endsWith('.tgs')){const buf=await file.arrayBuffer();txt=pako.ungzip(new Uint8Array(buf),{to:'string'});}
  else txt=await file.text();
  return JSON.parse(txt);
}

async function loadFiles(fileArray){
  if(!fileArray.length)return;
  const parsed=[];
  for(const f of fileArray){
    try{const data=await parseFile(f);parsed.push({name:f.name,animData:deepCopy(data),originalAnimData:deepCopy(data),historyStack:[deepCopy(data)],redoStack:[]});}
    catch(e){alert(`Failed: ${f.name}\n${e.message}`);}
  }
  if(!parsed.length)return;
  fileList=parsed;fileIndex=0;
  activateFile(0);updateFileBar();
}

function activateFile(idx){
  if(!fileList[idx])return;
  fileIndex=idx;
  const slot=fileList[idx];
  animData=slot.animData;originalAnimData=slot.originalAnimData;
  historyStack=slot.historyStack;redoStack=slot.redoStack;
  previewPlaceholder.style.display='none';
  frameSlider.disabled=false;
  updateHistoryBtns();afterDataChange();updateAnimInfo();updateFileBar();
  if(baActive)refreshBA();
}

function updateFileBar(){
  if(fileList.length<=1){fileBar.classList.add('hidden');return;}
  fileBar.classList.remove('hidden');
  fileCounter.textContent=`${fileIndex+1} / ${fileList.length}`;
  fileTabs.innerHTML='';
  fileList.forEach((f,i)=>{
    const tab=document.createElement('button');
    tab.className='file-tab'+(i===fileIndex?' active':'');
    tab.textContent=f.name.replace(/\.(json|tgs)$/i,'');tab.title=f.name;
    tab.addEventListener('click',()=>activateFile(i));
    fileTabs.appendChild(tab);
  });
}

function goFile(dir){activateFile((fileIndex+dir+fileList.length)%fileList.length);}
$('filePrevBtn').addEventListener('click',()=>goFile(-1));
$('fileNextBtn').addEventListener('click',()=>goFile(+1));
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.contentEditable==='true')return;
  if(fileList.length<=1)return;
  if(e.key==='ArrowLeft'){e.preventDefault();goFile(-1);}
  if(e.key==='ArrowRight'){e.preventDefault();goFile(+1);}
});

$('fileInput').addEventListener('change',async e=>{await loadFiles([...e.target.files]);e.target.value=null;});

['dragenter','dragover','dragleave','drop'].forEach(ev=>document.body.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();}));
['dragenter','dragover'].forEach(ev=>document.body.addEventListener(ev,()=>document.body.classList.add('dragging')));
['dragleave','drop'].forEach(ev=>document.body.addEventListener(ev,()=>document.body.classList.remove('dragging')));
document.body.addEventListener('drop',e=>{
  const files=[...e.dataTransfer.files].filter(f=>/\.(json|tgs)$/i.test(f.name));
  if(files.length)loadFiles(files);
});

function updateAnimInfo(){
  if(!animData){animInfoEl.textContent='';return;}
  const name=fileList[fileIndex]?.name||'';
  animInfoEl.textContent=`${animData.w}x${animData.h} · ${animData.fr}fps${name?' · '+name:''}`;
}

/* =============================================
   LOTTIE PLAYER
   ============================================= */
function reloadAnim(){
  showLoading(true);
  setTimeout(()=>{
    let saved=0;
    if(animInstance){try{saved=animInstance.currentFrame;}catch(_){}animInstance.destroy();animEl.innerHTML='';}
    if(!animData){showLoading(false);return;}
    animInstance=lottie.loadAnimation({container:animEl,renderer:'svg',loop:true,autoplay:false,animationData:deepCopy(animData)});
    let done=false;
    const onLoad=()=>{
      if(done)return;done=true;
      const total=Math.round(animInstance.totalFrames||0);
      frameSlider.max=Math.max(0,total-1);totalLabel.textContent=total;
      const go=Math.min(saved,total-1);
      playerPaused?animInstance.goToAndStop(go,true):animInstance.goToAndPlay(go,true);
      updatePlayBtn();showLoading(false);
    };
    animInstance.addEventListener('DOMLoaded',onLoad);
    animInstance.addEventListener('data_ready',onLoad);
    setTimeout(onLoad,1500);
    animInstance.addEventListener('enterFrame',()=>{
      if(!frameSlider.matches(':active')){const f=Math.round(animInstance.currentFrame);frameSlider.value=f;frameLabel.textContent=f;}
    });
  },30);
}

function showLoading(on){loadingOverlay.style.display=on?'flex':'none';}
function updatePlayBtn(){$('playPauseBtn').innerHTML=playerPaused?'<i class="ri-play-fill"></i>':'<i class="ri-pause-fill"></i>';}

$('playPauseBtn').addEventListener('click',()=>{
  if(!animInstance)return;
  playerPaused=!playerPaused;
  playerPaused?animInstance.pause():animInstance.play();
  updatePlayBtn();
  if(baActive){playerPaused?[baBeforeAnim,baAfterAnim].forEach(a=>a&&a.pause()):[baBeforeAnim,baAfterAnim].forEach(a=>a&&a.play());}
});

frameSlider.addEventListener('input',()=>{
  if(!animInstance)return;
  const f=parseFloat(frameSlider.value);
  if(!playerPaused){animInstance.pause();playerPaused=true;updatePlayBtn();}
  animInstance.goToAndStop(f,true);frameLabel.textContent=Math.round(f);
  if(baActive){baBeforeAnim&&baBeforeAnim.goToAndStop(f,true);baAfterAnim&&baAfterAnim.goToAndStop(f,true);}
});

/* =============================================
   BEFORE / AFTER
   ============================================= */
$('beforeAfterBtn').addEventListener('click',()=>{
  if(!animData)return alert('Load an animation first.');
  baActive=!baActive;
  $('beforeAfterBtn').classList.toggle('active',baActive);
  canvasWrap.classList.toggle('hidden',baActive);
  baWrap.classList.toggle('hidden',!baActive);
  if(baActive)refreshBA();else destroyBA();
});

function refreshBA(){
  destroyBA();
  if(!originalAnimData||!animData)return;
  baBeforeAnim=lottie.loadAnimation({container:$('animBefore'),renderer:'svg',loop:true,autoplay:!playerPaused,animationData:deepCopy(originalAnimData)});
  baAfterAnim =lottie.loadAnimation({container:$('animAfter'), renderer:'svg',loop:true,autoplay:!playerPaused,animationData:deepCopy(animData)});
}

function destroyBA(){
  if(baBeforeAnim){try{baBeforeAnim.destroy();}catch(_){}baBeforeAnim=null;$('animBefore').innerHTML='';}
  if(baAfterAnim) {try{baAfterAnim.destroy(); }catch(_){}baAfterAnim=null; $('animAfter').innerHTML='';}
}

/* =============================================
   COLOUR EXTRACTION
   ============================================= */
function extractColors(data){
  const results=[];groupedColors={};
  function add(ref,type,shapeType,hex,gradIndex){
    const e={ref,type,shapeType,hex,gradIndex};results.push(e);
    if(!groupedColors[hex])groupedColors[hex]={hex,instances:[]};
    groupedColors[hex].instances.push(e);
  }
  function walk(obj){
    if(!obj||typeof obj!=='object')return;
    if(obj.ty==='fl'||obj.ty==='st'){
      const sType=obj.ty==='fl'?'Fill':'Stroke',c=obj.c;
      if(c){
        if(c.a===1&&Array.isArray(c.k))c.k.forEach(kf=>{if(kf.s&&Array.isArray(kf.s))add(kf,'solid',sType,rgbaArrToHex(kf.s));});
        else if(Array.isArray(c.k))add(c,'solid',sType,rgbaArrToHex(c.k));
        else if(c.k&&Array.isArray(c.k.k))add(c.k,'solid',sType,rgbaArrToHex(c.k.k));
      }
    }
    if((obj.ty==='gf'||obj.ty==='gs')&&obj.g){
      const sType=obj.ty==='gf'?'Gradient Fill':'Gradient Stroke',g=obj.g,numStops=g.p||0;
      const proc=(arr,ref)=>{const cnt=numStops>0?numStops:Math.floor(arr.length/4);for(let i=0;i<cnt*4;i+=4){if(i+3>=arr.length)break;add(ref,'gradient',sType,rgbToHex(Math.round(arr[i+1]*255),Math.round(arr[i+2]*255),Math.round(arr[i+3]*255)),i);}};
      if(g.k){
        if(g.k.a===1&&Array.isArray(g.k.k))g.k.k.forEach(kf=>{if(kf.s&&Array.isArray(kf.s))proc(kf.s,kf);});
        else if(Array.isArray(g.k.k))proc(g.k.k,g.k);
        else if(Array.isArray(g.k))proc(g.k,g);
      }
    }
    for(const k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k)||k==='c'||k==='sc')continue;
      if(obj[k]&&typeof obj[k]==='object')walk(obj[k]);
    }
  }
  walk(data);return results;
}

/* =============================================
   COLOUR RENDERING
   ============================================= */
function extractAndRender(){if(!animData)return;allColors=extractColors(animData);renderColors();}

function renderColors(){
  const isGrouped=groupCheckbox.checked,useAdv=gradientToggle.checked;
  let items=[];
  if(isGrouped){
    Object.values(groupedColors).forEach(group=>{
      if(currentFilter!=='All'&&!group.instances.some(i=>i.shapeType.includes(currentFilter)))return;
      items.push({group,isGrad:group.instances.some(i=>i.type==='gradient'),hex:group.hex,count:group.instances.length});
    });
  } else {
    allColors.forEach(e=>{
      if(currentFilter!=='All'&&!e.shapeType.includes(currentFilter))return;
      items.push({entry:e,isGrad:e.type==='gradient',hex:e.hex,count:1});
    });
  }
  colorStatEl.textContent=items.length;colorsEl.innerHTML='';
  if(!items.length){colorsEl.innerHTML='<div class="no-colors"><i class="ri-palette-line"></i><br>No colours found</div>';return;}

  items.forEach(item=>{
    const card=document.createElement('div');card.className='color-card';
    const isGrad=item.isGrad&&useAdv;

    if(item.count>1||isGrad){
      const badge=document.createElement('div');badge.className='color-badge';
      badge.innerHTML=isGrad?'<i class="ri-gradienter-line"></i>':`<i class="ri-stack-fill"></i> ${item.count}`;
      card.appendChild(badge);
    }

    if(isGrad){
      const gradCss=buildGradPreview(item);
      const sw=document.createElement('div');sw.className='gradient-swatch';sw.style.background=gradCss;card.appendChild(sw);
      const hx=document.createElement('div');hx.className='color-hex gradient-label';hx.textContent='GRADIENT';card.appendChild(hx);
      card.addEventListener('click',()=>openGradientEditor(item.group||buildSingleGroup(item.entry)));
    } else {
      const sw=document.createElement('div');sw.className='color-swatch';sw.style.background=item.hex;
      const picker=document.createElement('input');picker.type='color';picker.value=item.hex;
      sw.appendChild(picker);card.appendChild(sw);
      const hexEl=document.createElement('div');hexEl.className='color-hex';hexEl.contentEditable='true';hexEl.spellcheck=false;hexEl.textContent=item.hex.toUpperCase();
      card.appendChild(hexEl);
      picker.addEventListener('input',debounce(()=>{sw.style.background=picker.value;hexEl.textContent=picker.value.toUpperCase();applyColorChange(item,picker.value);debouncedReload();},80));
      const applyHex=()=>{let v=hexEl.textContent.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v))return;picker.value=v;sw.style.background=v;hexEl.textContent=v.toUpperCase();applyColorChange(item,v);debouncedReload();};
      hexEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyHex();hexEl.blur();}});
      hexEl.addEventListener('blur',applyHex);
      card.addEventListener('click',e=>{if(e.target===hexEl||e.target===picker)return;picker.click();});
    }
    colorsEl.appendChild(card);
  });
}

function buildGradPreview(item){
  let hl=[];
  if(item.group)item.group.instances.filter(i=>i.type==='gradient').forEach(i=>{if(!hl.includes(i.hex))hl.push(i.hex);});
  else if(item.entry)hl=[item.entry.hex,'#333'];
  if(!hl.length)hl=['#000','#fff'];if(hl.length===1)hl.push('#555');
  return`linear-gradient(90deg,${hl.map((h,i)=>`${h} ${Math.round(i/(hl.length-1)*100)}%`).join(',')})`;
}
function buildSingleGroup(entry){return{hex:entry.hex,instances:[entry]};}

/* =============================================
   APPLYING COLOUR CHANGES
   ============================================= */
function applyColorChange(item,newHex){
  if(!animData)return;
  const{r,g,b}=hexToNorm(newHex);
  const isGrouped=groupCheckbox.checked;
  const instances=isGrouped?(item.group||{instances:[]}).instances:[item.entry];
  instances.forEach(inst=>{
    if(!inst||!inst.ref)return;
    const ref=inst.ref;
    if(inst.type==='solid'){
      if(ref.s&&Array.isArray(ref.s)){const a=ref.s[3]??1;ref.s=[r,g,b,a];}
      else if(Array.isArray(ref.k)){const a=ref.k[3]??1;ref.k=[r,g,b,a];}
      else if(ref.k&&Array.isArray(ref.k.k)){const a=ref.k.k[3]??1;ref.k.k=[r,g,b,a];}
    } else if(inst.type==='gradient'&&inst.gradIndex!==undefined){
      const arr=resolveGradArr(ref);
      if(arr&&arr.length>inst.gradIndex+3){arr[inst.gradIndex+1]=r;arr[inst.gradIndex+2]=g;arr[inst.gradIndex+3]=b;}
    }
  });
  if(isGrouped&&item.group)item.group.hex=newHex;
  allColors=extractColors(animData);
  if(fileList[fileIndex])fileList[fileIndex].animData=animData;
}

function resolveGradArr(ref){
  if(Array.isArray(ref.k))return ref.k;
  if(ref.k&&Array.isArray(ref.k.k))return ref.k.k;
  if(Array.isArray(ref.s))return ref.s;
  if(Array.isArray(ref))return ref;
  return null;
}

const debouncedReload=debounce(()=>{pushHistory();reloadAnim();if(baActive)refreshBA();},250);

/* =============================================
   FILTERS
   ============================================= */
$$('.pill').forEach(btn=>{
  btn.addEventListener('click',()=>{$$('.pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentFilter=btn.dataset.filter;renderColors();});
});
groupCheckbox.addEventListener('change',renderColors);
gradientToggle.addEventListener('change',renderColors);

/* =============================================
   RESET
   ============================================= */
$('resetColorsBtn').addEventListener('click',()=>{
  if(!originalAnimData)return;
  if(!confirm('Reset all colours to original?'))return;
  animData=deepCopy(originalAnimData);
  if(fileList[fileIndex])fileList[fileIndex].animData=animData;
  pushHistory();afterDataChange();
});

/* =============================================
   LAYERS
   ============================================= */
function renderLayers(){
  layerListEl.innerHTML='';
  if(!animData||!animData.layers){layerListEl.innerHTML='<div class="empty-state"><i class="ri-stack-line"></i>No layers</div>';return;}
  animData.layers.forEach((layer,idx)=>{
    const row=document.createElement('div');row.className='layer-row';
    const ni=document.createElement('input');ni.type='text';ni.className='layer-name';ni.value=layer.nm||`Layer ${idx+1}`;
    ni.addEventListener('change',()=>{pushHistory();layer.nm=ni.value;});
    const vc=document.createElement('input');vc.type='checkbox';vc.className='vis-toggle';vc.checked=!layer.hd;
    vc.addEventListener('change',()=>{pushHistory();layer.hd=!vc.checked;reloadAnim();});
    row.appendChild(ni);row.appendChild(vc);layerListEl.appendChild(row);
  });
}
$('refreshLayers').addEventListener('click',renderLayers);

/* =============================================
   TABS
   ============================================= */
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    $$('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');$(`tab-${btn.dataset.tab}`).classList.add('active');
    if(btn.dataset.tab==='themes')renderThemes();
    if(btn.dataset.tab==='layers')renderLayers();
    if(btn.dataset.tab==='palette')renderPalettePreview();
  });
});

/* =============================================
   PALETTE GENERATOR
   ============================================= */
function renderPalettePreview(){
  const start=$('palStartPicker').value,end=$('palEndPicker').value;
  const count=Math.max(2,Math.min(32,parseInt($('palCount').value)||5));
  generatedPalette=interpolatePalette(start,end,count,paletteMode);

  const preview=$('palPreview');preview.innerHTML='';
  generatedPalette.forEach(hex=>{const sw=document.createElement('div');sw.className='pal-swatch';sw.style.background=hex;sw.title=hex;preview.appendChild(sw);});

  $('palHexList').innerHTML=generatedPalette.map(h=>`<span class="pal-hex-chip" onclick="navigator.clipboard&&navigator.clipboard.writeText('${h}');this.textContent='Copied!';setTimeout(()=>this.textContent='${h}',1200)">${h}</span>`).join('');
  $('palApply').disabled=!animData;
}

['palStartPicker','palEndPicker'].forEach(id=>{
  $(id).addEventListener('input',()=>{
    const isStart=id==='palStartPicker',hex=$(id).value;
    $(isStart?'palStartSwatch':'palEndSwatch').style.background=hex;
    $(isStart?'palStartHex':'palEndHex').value=hex.toUpperCase();
    renderPalettePreview();
  });
});
['palStartHex','palEndHex'].forEach(id=>{
  $(id).addEventListener('input',()=>{
    let v=$(id).value.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v))return;
    const isStart=id==='palStartHex';
    $(isStart?'palStartPicker':'palEndPicker').value=v;
    $(isStart?'palStartSwatch':'palEndSwatch').style.background=v;
    renderPalettePreview();
  });
});
$('palCountDec').addEventListener('click',()=>{$('palCount').value=Math.max(2,parseInt($('palCount').value)-1);renderPalettePreview();});
$('palCountInc').addEventListener('click',()=>{$('palCount').value=Math.min(32,parseInt($('palCount').value)+1);renderPalettePreview();});
$('palCount').addEventListener('input',renderPalettePreview);
$$('.mode-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{$$('.mode-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');paletteMode=btn.dataset.mode;renderPalettePreview();});
});
$('palGenerate').addEventListener('click',renderPalettePreview);
$('palApply').addEventListener('click',()=>{
  if(!animData||!generatedPalette.length)return;
  pushHistory();allColors=extractColors(animData);
  const groups=Object.values(groupedColors);
  generatedPalette.forEach((hex,i)=>{
    if(!groups[i])return;
    const prev=groupCheckbox.checked;groupCheckbox.checked=true;
    applyColorChange({group:groups[i],entry:groups[i].instances[0]},hex);
    groupCheckbox.checked=prev;
  });
  afterDataChange();
  alert('Applied '+generatedPalette.length+' palette colours!');
});

/* =============================================
   THEMES
   ============================================= */
$('saveThemeBtn').addEventListener('click',()=>{
  if(!animData)return alert('Load an animation first.');
  const groups=Object.values(groupedColors);if(!groups.length)return alert('No colours found.');
  const name=prompt('Theme name:',`Theme ${savedThemes.length+1}`);if(!name)return;
  savedThemes.push({id:Date.now(),name,colors:groups.map(g=>({hex:g.hex}))});
  localStorage.setItem('mm_themes',JSON.stringify(savedThemes));renderThemes();
});

function renderThemes(){
  if(!savedThemes.length){themesList.innerHTML='<div class="empty-state"><i class="ri-bookmark-line"></i>No themes saved yet</div>';return;}
  themesList.innerHTML='';
  savedThemes.forEach(theme=>{
    const card=document.createElement('div');card.className='theme-card';
    const head=document.createElement('div');head.className='theme-card-head';
    const nm=document.createElement('div');nm.className='theme-card-name';nm.textContent=theme.name;
    const ab=document.createElement('button');ab.className='btn btn-primary';ab.style.cssText='padding:4px 10px;font-size:11px;';
    ab.innerHTML='<i class="ri-palette-line"></i> Apply';ab.addEventListener('click',()=>applyTheme(theme));
    const db=document.createElement('button');db.className='btn-danger-sm';db.innerHTML='<i class="ri-delete-bin-line"></i>';
    db.addEventListener('click',()=>deleteTheme(theme.id));
    head.appendChild(nm);head.appendChild(ab);head.appendChild(db);
    const sw=document.createElement('div');sw.className='theme-swatches';
    theme.colors.slice(0,9).forEach(c=>{const s=document.createElement('div');s.className='theme-swatch';s.style.background=c.hex;s.title=c.hex;sw.appendChild(s);});
    if(theme.colors.length>9){const m=document.createElement('span');m.className='theme-more';m.textContent=`+${theme.colors.length-9}`;sw.appendChild(m);}
    card.appendChild(head);card.appendChild(sw);themesList.appendChild(card);
  });
}

function applyTheme(theme){
  if(!animData)return alert('Load an animation first.');
  pushHistory();allColors=extractColors(animData);
  const groups=Object.values(groupedColors);
  theme.colors.forEach((tc,i)=>{
    if(!groups[i])return;
    const prev=groupCheckbox.checked;groupCheckbox.checked=true;
    applyColorChange({group:groups[i],entry:groups[i].instances[0]},tc.hex);
    groupCheckbox.checked=prev;
  });
  afterDataChange();
}

function deleteTheme(id){
  if(!confirm('Delete this theme?'))return;
  savedThemes=savedThemes.filter(t=>t.id!==id);
  localStorage.setItem('mm_themes',JSON.stringify(savedThemes));renderThemes();
}

/* =============================================
   AFTER DATA CHANGE
   ============================================= */
function afterDataChange(){
  extractAndRender();renderLayers();reloadAnim();updateAnimInfo();
  if(baActive)refreshBA();
  if(fileList[fileIndex])fileList[fileIndex].animData=animData;
}

/* =============================================
   GRADIENT EDITOR
   ============================================= */
function openGradientEditor(groupObj){
  const gi=groupObj.instances.find(i=>i.type==='gradient');if(!gi)return alert('No gradient found.');
  const ref=gi.ref,rawArr=resolveGradArr(ref);if(!rawArr)return alert('Cannot resolve gradient array.');
  const stops=[];
  for(let i=0;i<rawArr.length;i+=4){
    if(i+3>=rawArr.length)break;
    const r=rawArr[i+1],g=rawArr[i+2],b=rawArr[i+3];
    stops.push({pos:parseFloat(rawArr[i]),r:parseFloat(r),g:parseFloat(g),b:parseFloat(b),hex:rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255))});
  }
  stops.sort((a,b)=>a.pos-b.pos);
  gradEdit={groupObj,ref,rawArr,stops,selectedIdx:0};
  renderGradientEditor();openModal('gradient-editor-modal');
}

function renderGradientEditor(){
  if(!gradEdit)return;
  const{stops,selectedIdx}=gradEdit,bar=$('gradientBar');
  bar.style.background=`linear-gradient(90deg,${stops.map(s=>`${s.hex} ${(s.pos*100).toFixed(1)}%`).join(',')})`;
  bar.querySelectorAll('.gradient-stop-pin').forEach(el=>el.remove());
  stops.forEach((s,idx)=>{
    const pin=document.createElement('div');
    pin.className='gradient-stop-pin'+(idx===selectedIdx?' selected':'');
    pin.style.left=(s.pos*100)+'%';pin.style.background=s.hex;
    pin.addEventListener('mousedown',e=>{e.stopPropagation();selGradStop(idx);startDragPin(e,idx);});
    pin.addEventListener('touchstart',e=>{e.stopPropagation();selGradStop(idx);startDragPin(e,idx);},{passive:false});
    bar.appendChild(pin);
  });
  bar.onclick=e=>{if(e.target!==bar)return;const r=bar.getBoundingClientRect();addGStop(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));renderGradientEditor();};
  $('gradientPositionsLabel').textContent=stops.map(s=>Math.round(s.pos*100)+'%').join(' · ');
  $('stopCountLabel').textContent=stops.length;

  const list=$('gradientStopsList');list.innerHTML='';
  stops.forEach((s,idx)=>{
    const row=document.createElement('div');row.className='gs-row'+(idx===selectedIdx?' selected':'');
    const sw=document.createElement('div');sw.className='gs-swatch';sw.style.background=s.hex;
    const ctrl=document.createElement('div');ctrl.className='gs-controls';
    const inp=document.createElement('div');inp.className='gs-inputs';
    const cp=document.createElement('input');cp.type='color';cp.value=s.hex;cp.className='gs-color-input';
    const hx=document.createElement('input');hx.type='text';hx.className='gs-hex';hx.value=s.hex.toUpperCase();hx.maxLength=7;
    cp.addEventListener('input',()=>{s.hex=cp.value;const{r,g,b}=hexToNorm(s.hex);s.r=r;s.g=g;s.b=b;hx.value=s.hex.toUpperCase();sw.style.background=s.hex;const gc=gradEdit.stops.map(x=>`${x.hex} ${(x.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;});
    hx.addEventListener('blur',()=>{let v=hx.value.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v)){hx.value=s.hex.toUpperCase();return;}cp.value=v;s.hex=v;const{r,g,b}=hexToNorm(v);s.r=r;s.g=g;s.b=b;renderGradientEditor();});
    inp.appendChild(cp);inp.appendChild(hx);
    const pr=document.createElement('div');pr.className='gs-pos-row';
    const pl=document.createElement('span');pl.textContent=Math.round(s.pos*100)+'%';pl.style.minWidth='30px';
    const ps=document.createElement('input');ps.type='range';ps.min=0;ps.max=100;ps.value=Math.round(s.pos*100);
    ps.addEventListener('input',()=>{s.pos=ps.value/100;pl.textContent=ps.value+'%';gradEdit.stops.sort((a,b)=>a.pos-b.pos);const gc=gradEdit.stops.map(x=>`${x.hex} ${(x.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;});
    ps.addEventListener('change',()=>renderGradientEditor());
    pr.appendChild(pl);pr.appendChild(ps);ctrl.appendChild(inp);ctrl.appendChild(pr);
    const del=document.createElement('button');del.className='gs-del';del.innerHTML='<i class="ri-delete-bin-line"></i>';
    del.addEventListener('click',()=>{if(gradEdit.stops.length<=2)return alert('Need at least 2 stops.');gradEdit.stops.splice(idx,1);gradEdit.selectedIdx=0;renderGradientEditor();});
    row.appendChild(sw);row.appendChild(ctrl);row.appendChild(del);
    row.addEventListener('click',()=>selGradStop(idx));
    list.appendChild(row);
  });

  $('addGradientStop').onclick=()=>{addGStop();renderGradientEditor();};
  $('applyGradientChanges').onclick=applyGradientEdits;
  $('gradientReverseBtn').onclick=()=>{gradEdit.stops=gradEdit.stops.map(s=>({...s,pos:1-s.pos})).sort((a,b)=>a.pos-b.pos);renderGradientEditor();};
  $('gradientResetBtn').onclick=()=>{
    const raw=gradEdit.rawArr,ns=[];
    for(let i=0;i<raw.length;i+=4){const r=raw[i+1],g=raw[i+2],b=raw[i+3];ns.push({pos:raw[i],r,g,b,hex:rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255))});}
    gradEdit.stops=ns.sort((a,b)=>a.pos-b.pos);renderGradientEditor();
  };
  $('gradientAlpha').oninput=()=>{bar.style.opacity=$('gradientAlpha').value;};
}

function selGradStop(idx){gradEdit.selectedIdx=idx;$$('.gradient-stop-pin').forEach((el,i)=>el.classList.toggle('selected',i===idx));$$('.gs-row').forEach((el,i)=>el.classList.toggle('selected',i===idx));}
function addGStop(atPos){
  if(!gradEdit)return;
  const s=gradEdit.stops,pos=atPos!==undefined?atPos:(s.length>=2?(s[0].pos+s[s.length-1].pos)/2:0.5);
  const mh=s.length?s[Math.floor(s.length/2)].hex:'#ffffff';
  const{r,g,b}=hexToNorm(mh);s.push({pos,r,g,b,hex:mh});s.sort((a,b)=>a.pos-b.pos);
}
function applyGradientEdits(){
  if(!gradEdit)return;
  const{ref,stops}=gradEdit,newRaw=[];
  stops.forEach(s=>newRaw.push(s.pos,s.r,s.g,s.b));
  if(Array.isArray(ref.k))ref.k.splice(0,ref.k.length,...newRaw);
  else if(ref.k&&Array.isArray(ref.k.k))ref.k.k.splice(0,ref.k.k.length,...newRaw);
  else if(Array.isArray(ref.s))ref.s.splice(0,ref.s.length,...newRaw);
  else ref.k=newRaw;
  if(gradEdit.groupObj)gradEdit.groupObj.hex=stops[0]?.hex||'#000000';
  gradEdit=null;closeModal('gradient-editor-modal');pushHistory();afterDataChange();
}

let _drag=null;
function startDragPin(e,idx){
  e.preventDefault();_drag=idx;
  const bar=$('gradientBar'),rect=bar.getBoundingClientRect();
  const onMove=ev=>{const cx=ev.clientX||(ev.touches&&ev.touches[0].clientX);if(cx==null)return;const pos=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));gradEdit.stops[_drag].pos=pos;gradEdit.stops.sort((a,b)=>a.pos-b.pos);const gc=gradEdit.stops.map(s=>`${s.hex} ${(s.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;bar.querySelectorAll('.gradient-stop-pin').forEach((p,i)=>{p.style.left=(gradEdit.stops[i].pos*100)+'%';});};
  const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);window.removeEventListener('touchmove',onMove);window.removeEventListener('touchend',onUp);_drag=null;renderGradientEditor();};
  window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);
  window.addEventListener('touchmove',onMove,{passive:false});window.addEventListener('touchend',onUp);
}

/* =============================================
   GIF EXPORT
   ============================================= */
async function getGifWorkerBlobUrl(){
  if(gifWorkerBlobUrl)return gifWorkerBlobUrl;
  const res=await fetch(GIF_WORKER_URL,{mode:'cors'});
  if(!res.ok)throw new Error(`Worker fetch failed: ${res.status}`);
  const text=await res.text();
  gifWorkerBlobUrl=URL.createObjectURL(new Blob([text],{type:'application/javascript'}));
  return gifWorkerBlobUrl;
}

function initGifModal(){
  $('gif-bg-swatches').addEventListener('click',e=>{
    const btn=e.target.closest('.gif-bg-swatch');
    if(!btn||btn.querySelector('input[type=color]'))return;
    $$('.gif-bg-swatch').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');gifSettings.background=btn.dataset.bg;updateGifInfo();
  });
  $('gif-bg-custom').addEventListener('input',e=>{
    $$('.gif-bg-swatch').forEach(b=>b.classList.remove('active'));
    e.target.closest('label').classList.add('active');
    gifSettings.background=e.target.value;updateGifInfo();
  });
  ['gif-fps-seg','gif-scale-seg','gif-quality-seg'].forEach(id=>{
    $(id).addEventListener('click',e=>{
      const btn=e.target.closest('[data-value]');if(!btn)return;
      $(id).querySelectorAll('[data-value]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      gifSettings[$(id).dataset.name]=parseFloat(btn.dataset.value);
      updateGifInfo();
    });
  });
  $('gif-modal-go').addEventListener('click',startGifEncoding);
  $('gif-modal-cancel').addEventListener('click',()=>{if(gifBusy){gifCancel=true;return;}closeModal('gif-modal');});
}

function updateGifInfo(){
  if(!animData){$('gif-info').textContent='—';return;}
  const ip=animData.ip||0,op=animData.op||60,fr=animData.fr||30;
  const secs=Math.max(1,op-ip)/fr,fps=Math.min(gifSettings.fps,fr);
  const w=Math.round((animData.w||512)*gifSettings.scale),h=Math.round((animData.h||512)*gifSettings.scale);
  const frames=Math.max(1,Math.round(secs*fps));
  $('gif-info').textContent=`${w}x${h} · ${frames} frames @ ${fps}fps · ${secs.toFixed(2)}s`;
}

async function startGifEncoding(){
  if(gifBusy||!animData)return;
  if(typeof window.GIF!=='function')return alert('gif.js failed to load. Check internet connection.');
  const m={go:$('gif-modal-go'),cancel:$('gif-modal-cancel'),progressRow:$('gif-progress-row'),fill:$('gif-progress-fill'),text:$('gif-progress-text')};
  gifBusy=true;gifCancel=false;
  m.progressRow.classList.remove('hidden');m.go.disabled=true;m.cancel.textContent='Stop';
  const setP=(p,t)=>{m.fill.style.width=(Math.max(0,Math.min(1,p))*100).toFixed(1)+'%';if(t)m.text.textContent=t;};
  setP(0,'Preparing...');

  let workerScript;
  try{workerScript=await getGifWorkerBlobUrl();}
  catch(e){finishGifUI(m);alert('Could not load gif.worker: '+e.message);return;}

  const ip=animData.ip||0,op=animData.op||60,fr=animData.fr||30;
  const totalSrc=Math.max(1,op-ip),secs=totalSrc/fr;
  const targetFps=Math.min(gifSettings.fps,fr),outFrames=Math.max(1,Math.round(secs*targetFps));
  const srcW=animData.w||512,srcH=animData.h||512;
  const w=Math.max(1,Math.round(srcW*gifSettings.scale)),h=Math.max(1,Math.round(srcH*gifSettings.scale));
  const delay=Math.round(1000/targetFps);
  const transparent=gifSettings.background==='transparent',bgColor=transparent?'#ffffff':gifSettings.background;

  const offDiv=document.createElement('div');
  offDiv.style.cssText=`position:fixed;left:-99999px;top:-99999px;width:${srcW}px;height:${srcH}px;pointer-events:none;opacity:0;`;
  document.body.appendChild(offDiv);

  let offAnim;
  try{offAnim=lottie.loadAnimation({container:offDiv,renderer:'svg',loop:false,autoplay:false,animationData:deepCopy(animData),rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:false,hideOnTransparent:true}});}
  catch(e){cleanup(offDiv,null);finishGifUI(m);alert('Lottie init failed: '+e.message);return;}

  await new Promise(res=>{if(offAnim.isLoaded)return res();offAnim.addEventListener('DOMLoaded',res);setTimeout(res,1500);});

  const offSvg=offDiv.querySelector('svg');
  if(!offSvg){cleanup(offDiv,offAnim);finishGifUI(m);alert('Offscreen SVG not produced.');return;}
  offSvg.setAttribute('width',srcW);offSvg.setAttribute('height',srcH);

  const gif=new GIF({workers:4,quality:gifSettings.quality,width:w,height:h,workerScript,transparent:transparent?0xff00ff:null,background:bgColor,repeat:0});
  const fc=document.createElement('canvas');fc.width=w;fc.height=h;
  const fctx=fc.getContext('2d',{willReadFrequently:transparent});
  fctx.imageSmoothingEnabled=true;fctx.imageSmoothingQuality='high';

  const BAYER8=[0,48,12,60,3,51,15,63,32,16,44,28,35,19,47,31,8,56,4,52,11,59,7,55,40,24,36,20,43,27,39,23,2,50,14,62,1,49,13,61,34,18,46,30,33,17,45,29,10,58,6,54,9,57,5,53,42,26,38,22,41,25,37,21];

  setP(0,`Rendering 0 / ${outFrames}`);
  let blobUrl=null;
  try{
    for(let i=0;i<outFrames;i++){
      if(gifCancel)break;
      const tNorm=outFrames===1?0:i/(outFrames-1);
      offAnim.goToAndStop(tNorm*(totalSrc-1),true);
      const clone=offSvg.cloneNode(true);
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
      clone.setAttribute('width',srcW);clone.setAttribute('height',srcH);
      if(!clone.getAttribute('viewBox'))clone.setAttribute('viewBox',`0 0 ${srcW} ${srcH}`);
      const svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
      blobUrl=URL.createObjectURL(new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'}));
      const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('decode failed'));im.src=blobUrl;});
      URL.revokeObjectURL(blobUrl);blobUrl=null;
      if(transparent){
        fctx.clearRect(0,0,w,h);fctx.drawImage(img,0,0,w,h);
        const id=fctx.getImageData(0,0,w,h),d=id.data;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,a=d[p+3],thr=(BAYER8[(y&7)*8+(x&7)]+0.5)*4;if(a<=0||(a<255&&a<thr)){d[p]=0xff;d[p+1]=0x00;d[p+2]=0xff;}else if(d[p]===0xff&&d[p+1]===0x00&&d[p+2]===0xff){d[p+2]=0xfe;}d[p+3]=255;}
        fctx.putImageData(id,0,0);
      } else {fctx.fillStyle=bgColor;fctx.fillRect(0,0,w,h);fctx.drawImage(img,0,0,w,h);}
      gif.addFrame(fc,{delay,copy:true});
      setP(0.5*(i+1)/outFrames,`Rendering ${i+1} / ${outFrames}`);
      if(i%4===0)await new Promise(r=>setTimeout(r,0));
    }
  } catch(e){if(blobUrl)URL.revokeObjectURL(blobUrl);cleanup(offDiv,offAnim);finishGifUI(m);alert('Render error: '+e.message);return;}

  if(gifCancel){cleanup(offDiv,offAnim);finishGifUI(m);return;}
  setP(0.5,'Encoding...');
  gif.on('progress',p=>{if(!gifCancel)setP(0.5+p*0.5,`Encoding ${(p*100).toFixed(0)}%`);});
  gif.on('finished',blob=>{cleanup(offDiv,offAnim);if(!gifCancel)doDownload(blob,'animation.gif');finishGifUI(m);closeModal('gif-modal');});
  gif.on('abort',()=>{cleanup(offDiv,offAnim);finishGifUI(m);});
  try{gif.render();}catch(e){cleanup(offDiv,offAnim);finishGifUI(m);alert('GIF encode error: '+e.message);}
}

function cleanup(container,anim){try{if(anim)anim.destroy();}catch(_){}try{if(container&&container.parentNode)container.parentNode.removeChild(container);}catch(_){}}
function finishGifUI(m){gifBusy=false;gifCancel=false;m.go.disabled=false;m.cancel.textContent='Cancel';m.progressRow.classList.add('hidden');$('gif-progress-fill').style.width='0%';$('gif-progress-text').textContent='Preparing...';}

/* =============================================
   SETTINGS MODAL
   ============================================= */
$('settingsBtn').addEventListener('click',()=>{
  if(!animData)return alert('Load an animation first.');
  $('set-w').value=animData.w;$('set-h').value=animData.h;$('set-fr').value=animData.fr;
  $('set-scale').value=Math.round((parseFloat(animEl.style.getPropertyValue('--lottie-scale'))||1)*100);
  openModal('settings-modal');
});
$('applySettings').addEventListener('click',()=>{
  const w=parseInt($('set-w').value),h=parseInt($('set-h').value),fr=parseFloat($('set-fr').value),sc=parseFloat($('set-scale').value)/100;
  if([w,h,fr].some(v=>isNaN(v)||v<=0)||isNaN(sc)||sc<=0)return alert('Enter valid positive values.');
  if(animData.w!==w||animData.h!==h||animData.fr!==fr){pushHistory();animData.w=w;animData.h=h;animData.fr=fr;reloadAnim();updateAnimInfo();}
  animEl.style.setProperty('--lottie-scale',sc);closeModal('settings-modal');
});

/* =============================================
   TGS SCAN
   ============================================= */
$('tgsScanBtn').addEventListener('click',()=>{if(!animData)return alert('Load a file first.');runTgsScan();});
function runTgsScan(){
  const{w,h,fr,op,ip=0}=animData,dur=(op-ip)/fr;
  const checks=[{label:'Size (512x512)',pass:w===512&&h===512,current:`${w}x${h}`,req:'512x512'},{label:'Frame Rate (60 fps)',pass:fr===60,current:`${fr} fps`,req:'60 fps'},{label:'Duration (max 3s)',pass:dur<=3,current:`${dur.toFixed(2)}s`,req:'3.0s'}];
  const allPass=checks.every(c=>c.pass);
  $('tgs-results').innerHTML=`<div class="scan-summary ${allPass?'scan-pass':'scan-fail'}"><i class="ri-${allPass?'checkbox-circle':'error-warning'}-line"></i>${allPass?'Passed! Ready for Telegram.':'Issues found.'}</div>`
    +checks.map(c=>`<div class="check-row ${c.pass?'check-pass':'check-fail'}"><div><div class="check-label">${c.label}</div><div class="check-val">${c.current} (req: ${c.req})</div></div><i class="ri-${c.pass?'check':'close'}-circle-fill check-icon"></i></div>`).join('');
  $('tgsExportBtn').onclick=()=>{closeModal('tgs-scan-modal');exportTgs();};
  openModal('tgs-scan-modal');
}

/* =============================================
   EXPORT
   ============================================= */
function doDownload(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportJson(){if(!animData)return;doDownload(new Blob([JSON.stringify(animData,null,2)],{type:'application/json'}),'lottie-edited.json');}
function exportTgs(){if(!animData)return;const out=deepCopy(animData);out.tgs=1;doDownload(new Blob([pako.gzip(JSON.stringify(out))],{type:'application/octet-stream'}),'animation.tgs');}

$('exportMenuBtn').addEventListener('click',()=>{
  if(!animData)return alert('Load a Lottie file first.');
  const box=$('exportModalBox');
  box.innerHTML=`
    <div class="export-icon"><i class="ri-download-cloud-2-line"></i></div>
    <div class="export-title">Export Animation</div>
    <p class="export-sub" style="text-align:center;margin-bottom:18px;">Download format ကိုရွေးပါ</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="expJsonBtn" class="btn" style="border:1.5px solid var(--blue);color:var(--blue);width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;">
        <i class="ri-file-code-line"></i> JSON <span style="font-size:11px;opacity:.6;margin-left:4px;">(After Effects / Web)</span>
      </button>
      <button id="expTgsBtn" class="btn btn-primary" style="background:linear-gradient(135deg,#2AABEE,#1a8bbf);border:none;width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;">
        <i class="ri-telegram-line"></i> TGS <span style="font-size:11px;opacity:.85;margin-left:4px;">(Telegram Sticker)</span>
      </button>
      <button id="expGifBtn" class="btn" style="border:1.5px solid #10b981;color:#10b981;width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;">
        <i class="ri-image-gif-line"></i> GIF <span style="font-size:11px;opacity:.6;margin-left:4px;">(Animated GIF)</span>
      </button>
    </div>
    <div class="modal-footer" style="margin-top:14px;">
      <button class="btn btn-ghost modal-close-btn" data-modal="export-modal" style="width:100%;justify-content:center;">Cancel</button>
    </div>`;
  $('expJsonBtn').addEventListener('click',()=>{exportJson();closeModal('export-modal');});
  $('expTgsBtn').addEventListener('click',()=>{exportTgs();closeModal('export-modal');});
  $('expGifBtn').addEventListener('click',()=>{closeModal('export-modal');updateGifInfo();openModal('gif-modal');});
  openModal('export-modal');
});

/* =============================================
   MODAL HELPERS
   ============================================= */
function openModal(id){$(id).classList.add('open');$(id).setAttribute('aria-hidden','false');}
function closeModal(id){$(id).classList.remove('open');$(id).setAttribute('aria-hidden','true');}
document.addEventListener('click',e=>{
  const btn=e.target.closest('.modal-close-btn');if(!btn)return;
  const id=btn.dataset.modal;if(id)closeModal(id);
  else{const o=btn.closest('.modal-overlay');if(o)closeModal(o.id);}
});
$$('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);}));

/* =============================================
   DARK MODE
   ============================================= */
function applyDarkMode(dark){document.body.classList.toggle('dark',dark);$('darkToggle').innerHTML=dark?'<i class="ri-sun-line"></i>':'<i class="ri-moon-line"></i>';}
$('darkToggle').addEventListener('click',()=>{const d=!document.body.classList.contains('dark');localStorage.setItem('mm_theme',d?'dark':'light');applyDarkMode(d);});
$('telegramBtn').addEventListener('click',()=>window.open('https://t.me/Magic_Mall_Game_Shop','_blank'));

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('mm_theme'),pref=window.matchMedia('(prefers-color-scheme:dark)').matches;
  applyDarkMode(saved==='dark'||(saved===null&&pref));
  updateHistoryBtns();renderThemes();renderPalettePreview();initGifModal();
  $('frameLabel').textContent='0';
  const logoImg=document.querySelector('.brand-logo img');
  if(logoImg)logoImg.onerror=()=>{logoImg.style.display='none';$('fallbackIcon').style.display='block';};
});
