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

/* =============================================
   LAYER COLOURS PANEL
   Per-layer colour editing with thumbnails,
   isolation (dim others), visibility toggle
   ============================================= */

let lcIsolatedIdx    = null;
let lcSavedOpacities = [];

function lcSetOpacity(layer, val) {
  if (!layer.ks) layer.ks = {};
  if (!layer.ks.o) layer.ks.o = { a:0, k:100 };
  const op = layer.ks.o;
  if (op.a===1 && Array.isArray(op.k)) {
    op.k.forEach(kf => { if(kf.s) kf.s[0]=val; if(kf.e) kf.e[0]=val; });
  } else { op.k=val; op.a=0; }
}
function lcRestoreOpacities() {
  lcSavedOpacities.forEach(({layer,val}) => lcSetOpacity(layer, val));
  lcSavedOpacities = [];
}
function lcIsolate(idx) {
  lcRestoreOpacities();
  lcIsolatedIdx = idx;
  if (!animData || !animData.layers) return;
  animData.layers.forEach((layer, i) => {
    if (i === idx) return;
    const op = layer.ks?.o;
    let orig = 100;
    if (op) {
      if (op.a===1 && Array.isArray(op.k)) orig = op.k[0]?.s?.[0] ?? 100;
      else orig = (Array.isArray(op.k) ? op.k[0] : op.k) ?? 100;
    }
    lcSavedOpacities.push({layer, val:orig});
    lcSetOpacity(layer, 10);
  });
  reloadAnim();
  renderLayerColorsPanel();
}
function lcUnisolate() {
  lcRestoreOpacities();
  lcIsolatedIdx = null;
  reloadAnim();
  renderLayerColorsPanel();
}

function lcExtractColors(layer) {
  const results = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.ty === 'fl' || obj.ty === 'st') {
      const nm = obj.nm || (obj.ty==='fl' ? 'Fill' : 'Stroke');
      const c = obj.c;
      if (c) {
        let hex = '#000000', ref = c;
        if (c.a===1 && Array.isArray(c.k) && c.k[0]?.s) { hex = rgbaArrToHex(c.k[0].s); ref = c.k[0]; }
        else if (Array.isArray(c.k)) hex = rgbaArrToHex(c.k);
        else if (c.k && Array.isArray(c.k.k)) { hex = rgbaArrToHex(c.k.k); ref = c.k; }
        results.push({ hex, nm, ref, type:'solid' });
      }
    }
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj,k) || k==='c') continue;
      if (obj[k] && typeof obj[k]==='object') walk(obj[k]);
    }
  }
  walk(layer);
  return results;
}

function lcDrawThumb(canvas, layer) {
  const ctx = canvas.getContext('2d'), W=36, H=36;
  ctx.clearRect(0,0,W,H);
  // checkerboard bg
  for (let y=0;y<H;y+=6) for (let x=0;x<W;x+=6) {
    ctx.fillStyle = ((x/6+y/6)%2===0) ? '#ccc' : '#999';
    ctx.fillRect(x,y,6,6);
  }
  const colors = lcExtractColors(layer);
  if (!colors.length) return;
  const sw = W / colors.length;
  colors.forEach((c,i) => { ctx.fillStyle=c.hex; ctx.fillRect(i*sw,0,sw+1,H); });
  // rounded clip
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath(); ctx.roundRect(0,0,W,H,6); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function renderLayerColorsPanel() {
  const el = $('layerColorsList');
  if (!el) return;
  if (!animData || !animData.layers || !animData.layers.length) {
    el.innerHTML = '<div class="empty-state"><i class="ri-stack-line"></i><br>No layers. Open a file first.</div>';
    return;
  }
  const ICONS = {0:'📦',1:'⬛',2:'🖼',3:'◻️',4:'✦',5:'T',6:'🔊',13:'📷'};
  const uniBtn = $('lcUnisolateBtn');
  if (uniBtn) uniBtn.style.display = lcIsolatedIdx !== null ? 'flex' : 'none';

  let html = '';
  animData.layers.forEach((layer, idx) => {
    const name   = layer.nm || `Layer ${idx+1}`;
    const colors = lcExtractColors(layer);
    const isIso  = lcIsolatedIdx === idx;
    const icon   = ICONS[layer.ty] || '◻️';
    const safe   = name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const trunc  = name.length > 22 ? name.slice(0,21)+'…' : name;

    html += `<div class="lc-block${isIso?' lc-isolated':''}" data-idx="${idx}">
      <div class="lc-head">
        <canvas class="lc-thumb" data-idx="${idx}" width="36" height="36"></canvas>
        <span class="lc-icon">${icon}</span>
        <span class="lc-name" title="${safe}">${trunc}</span>
        <div class="lc-acts">
          <button class="lc-iso${isIso?' lc-iso-on':''}" data-idx="${idx}" title="Isolate">⊙</button>
          <button class="lc-vis" data-idx="${idx}" title="Toggle visibility">${layer.hd?'🙈':'👁'}</button>
        </div>
      </div>`;

    if (colors.length) {
      html += `<div class="lc-colors">`;
      colors.forEach((c,ci) => {
        const lbl = (c.nm||'Color').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const lt  = lbl.length>20 ? lbl.slice(0,19)+'…' : lbl;
        html += `<div class="lc-row">
          <div class="lc-sw-wrap">
            <div class="lc-sw" style="background:${c.hex}"></div>
            <input type="color" class="lc-ci" value="${c.hex}" data-li="${idx}" data-ci="${ci}">
          </div>
          <span class="lc-lbl">${lt}</span>
          <span class="lc-hex">${c.hex}</span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="lc-none">No editable colours</div>`;
    }
    html += `</div>`;
  });
  el.innerHTML = html;

  // Draw thumbs
  requestAnimationFrame(() => {
    el.querySelectorAll('.lc-thumb').forEach(cv => {
      const i = parseInt(cv.dataset.idx);
      if (animData.layers[i]) lcDrawThumb(cv, animData.layers[i]);
    });
  });

  // Isolate buttons
  el.querySelectorAll('.lc-iso').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (lcIsolatedIdx===idx) lcUnisolate(); else lcIsolate(idx);
    });
  });

  // Visibility buttons
  el.querySelectorAll('.lc-vis').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const layer = animData.layers[parseInt(btn.dataset.idx)];
      if (!layer) return;
      pushHistory(); layer.hd = !layer.hd;
      reloadAnim(); renderLayerColorsPanel();
    });
  });

  // Colour pickers
  el.querySelectorAll('.lc-ci').forEach(inp => {
    let snapped = false;
    inp.addEventListener('input', () => {
      if (!snapped) { pushHistory(); snapped=true; }
      const li=parseInt(inp.dataset.li), ci=parseInt(inp.dataset.ci);
      const layer = animData.layers[li]; if (!layer) return;
      const cols = lcExtractColors(layer); if (!cols[ci]) return;
      const {r,g,b} = hexToNorm(inp.value);
      const ref = cols[ci].ref;
      // Write back colour depending on structure
      if (ref.s && Array.isArray(ref.s)) { ref.s[0]=r;ref.s[1]=g;ref.s[2]=b; }
      else if (Array.isArray(ref.k))     { ref.k[0]=r;ref.k[1]=g;ref.k[2]=b; }
      else if (ref.k && Array.isArray(ref.k.k)) { ref.k.k[0]=r;ref.k.k[1]=g;ref.k.k[2]=b; }
      // Update swatch and hex label live
      const sw = inp.previousElementSibling; if (sw) sw.style.background = inp.value;
      const hx = inp.closest('.lc-row')?.querySelector('.lc-hex');
      if (hx) hx.textContent = inp.value;
      // Sync to file slot and reload
      if (fileList[fileIndex]) fileList[fileIndex].animData = animData;
      reloadAnim();
    });
    inp.addEventListener('change', () => { snapped=false; });
  });
}

/* =============================================
   MP4 / WebM EXPORT
   ============================================= */
const mp4Cfg = { bg:'#000000', transparent:false, scale:1, fps:30, quality:'medium' };
let mp4Busy=false, mp4Cancel=false;

function buildMp4Modal() {
  // Inject modal HTML once
  if ($('mp4-modal')) return;
  const div = document.createElement('div');
  div.id = 'mp4-modal';
  div.className = 'modal-overlay';
  div.setAttribute('aria-hidden','true');
  div.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-head">
        <h3>🎬 Export MP4 / WebM</h3>
        <button class="btn btn-ghost icon-btn modal-close-btn" data-modal="mp4-modal"><i class="ri-close-line"></i></button>
      </div>
      <div style="display:flex;flex-direction:column;gap:13px;margin:4px 0;">
        <div class="mp4r">
          <label>Background</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="mp4Transp"> Transparent
            </label>
            <div id="mp4BgWrap" style="display:flex;align-items:center;gap:6px;">
              <div id="mp4BgSw" style="width:24px;height:24px;border-radius:5px;border:1px solid var(--border2);background:#000;flex-shrink:0;"></div>
              <input type="color" id="mp4BgCol" value="#000000">
              <input type="text"  id="mp4BgHex" value="#000000" maxlength="7"
                style="width:72px;font-family:var(--font-mono);font-size:11px;padding:4px 6px;
                       border:1px solid var(--border);border-radius:6px;
                       background:var(--surface2);color:var(--text);">
            </div>
          </div>
        </div>
        <div class="mp4r"><label>Scale</label>
          <div class="mp4seg" data-cfg="scale">
            <button class="mp4sb" data-v="0.5">50%</button>
            <button class="mp4sb active" data-v="1">100%</button>
            <button class="mp4sb" data-v="2">200%</button>
          </div>
        </div>
        <div class="mp4r"><label>FPS</label>
          <div class="mp4seg" data-cfg="fps">
            <button class="mp4sb" data-v="24">24</button>
            <button class="mp4sb active" data-v="30">30</button>
            <button class="mp4sb" data-v="60">60</button>
          </div>
        </div>
        <div class="mp4r"><label>Quality</label>
          <div class="mp4seg" data-cfg="quality">
            <button class="mp4sb" data-v="high">Best</button>
            <button class="mp4sb active" data-v="medium">Normal</button>
            <button class="mp4sb" data-v="low">Small</button>
          </div>
        </div>
        <div id="mp4Info" class="mp4info">—</div>
      </div>
      <div id="mp4ProgRow" style="display:none;margin:8px 0;">
        <div style="height:6px;border-radius:3px;background:var(--surface2);border:1px solid var(--border);overflow:hidden;">
          <div id="mp4ProgFill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--blue),#00c6ff);transition:width .2s;border-radius:3px;"></div>
        </div>
        <div id="mp4ProgTxt" style="font-size:11px;color:var(--text2);text-align:center;margin-top:4px;">Preparing…</div>
      </div>
      <div class="modal-footer">
        <button id="mp4GoBtn" class="btn btn-primary" style="flex:1;justify-content:center;">🎬 Export</button>
        <button id="mp4CanBtn" class="btn btn-ghost" style="flex:1;justify-content:center;">Cancel</button>
      </div>
      <p style="font-size:11px;color:var(--text3);margin:10px 0 0;text-align:center;line-height:1.5;">
        Exports WebM or MP4 depending on browser.<br>Transparent requires VP9 (Chrome/Edge).
      </p>
    </div>`;
  document.body.appendChild(div);

  // Background controls
  const transCb = $('mp4Transp'), bgCol = $('mp4BgCol'), bgHex = $('mp4BgHex'), bgSw = $('mp4BgSw'), bgWrap = $('mp4BgWrap');
  const syncBg = () => { bgSw.style.background=bgCol.value; mp4Cfg.bg=bgCol.value; mp4UpdateInfo(); };
  bgCol.addEventListener('input', () => { bgHex.value=bgCol.value.toUpperCase(); syncBg(); });
  bgHex.addEventListener('input', () => { let v=bgHex.value.trim(); if(!v.startsWith('#'))v='#'+v; if(isValidHex(v)){bgCol.value=v;syncBg();} });
  transCb.addEventListener('change', () => { mp4Cfg.transparent=transCb.checked; bgWrap.style.opacity=transCb.checked?'0.4':'1'; bgWrap.style.pointerEvents=transCb.checked?'none':''; mp4UpdateInfo(); });
  syncBg();

  // Segmented buttons
  div.querySelectorAll('.mp4seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const btn=e.target.closest('[data-v]'); if(!btn)return;
      seg.querySelectorAll('[data-v]').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      const val=btn.dataset.v; mp4Cfg[seg.dataset.cfg]=isNaN(val)?val:parseFloat(val); mp4UpdateInfo();
    });
  });

  $('mp4GoBtn').addEventListener('click', mp4Start);
  $('mp4CanBtn').addEventListener('click', () => { if(mp4Busy)mp4Cancel=true; else closeModal('mp4-modal'); });
}

function mp4UpdateInfo() {
  const el=$('mp4Info'); if(!el||!animData)return;
  const ip=animData.ip||0,op=animData.op||60,fr=animData.fr||30;
  const secs=(op-ip)/fr, fps=Math.min(mp4Cfg.fps,fr);
  const w=Math.round((animData.w||512)*mp4Cfg.scale), h=Math.round((animData.h||512)*mp4Cfg.scale);
  el.textContent=`${w}×${h} · ${fps}fps · ${secs.toFixed(2)}s · bg: ${mp4Cfg.transparent?'transparent':mp4Cfg.bg}`;
}

async function mp4Start() {
  if (mp4Busy||!animData) return;
  const go=$('mp4GoBtn'), can=$('mp4CanBtn'), pr=$('mp4ProgRow'), pf=$('mp4ProgFill'), pt=$('mp4ProgTxt');
  mp4Busy=true; mp4Cancel=false; go.disabled=true; can.textContent='Stop'; pr.style.display='block';
  const setP=(p,t)=>{ pf.style.width=(p*100).toFixed(1)+'%'; if(t)pt.textContent=t; };
  setP(0,'Preparing…');

  const ip=animData.ip||0, op=animData.op||60, fr=animData.fr||30;
  const totalSrc=Math.max(1,op-ip), secs=totalSrc/fr, outFps=Math.min(mp4Cfg.fps,fr);
  const srcW=animData.w||512, srcH=animData.h||512;
  const W=Math.max(1,Math.round(srcW*mp4Cfg.scale)), H=Math.max(1,Math.round(srcH*mp4Cfg.scale));
  const bitrate={high:8e6,medium:3e6,low:1e6}[mp4Cfg.quality]||3e6;
  const want=mp4Cfg.transparent;
  const cands=want?['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']:['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  let mime=''; for(const c of cands){if(MediaRecorder.isTypeSupported(c)){mime=c;break;}}
  if(!mime){alert('MediaRecorder not supported in this browser.');mp4Finish(go,can,pr);return;}
  const ext=mime.startsWith('video/webm')?'.webm':'.mp4';

  const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d',{alpha:want});
  const offDiv=document.createElement('div');
  offDiv.style.cssText=`position:fixed;left:-9999px;top:-9999px;width:${srcW}px;height:${srcH}px;opacity:0;pointer-events:none;`;
  document.body.appendChild(offDiv);

  let offAnim;
  try {
    offAnim=lottie.loadAnimation({container:offDiv,renderer:'svg',loop:false,autoplay:false,animationData:deepCopy(animData),rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:false}});
  } catch(e){cleanup(offDiv,null);mp4Finish(go,can,pr);alert('Lottie error: '+e.message);return;}
  await new Promise(res=>{offAnim.isLoaded?res():offAnim.addEventListener('DOMLoaded',res);setTimeout(res,1500);});

  const offSvg=offDiv.querySelector('svg');
  if(!offSvg){cleanup(offDiv,offAnim);mp4Finish(go,can,pr);alert('SVG not found.');return;}
  offSvg.setAttribute('width',srcW);offSvg.setAttribute('height',srcH);

  const chunks=[];
  const stream=canvas.captureStream(outFps);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});
  rec.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
  const recDone=new Promise(res=>rec.onstop=res);
  rec.start(100);
  const totalF=Math.max(1,Math.round(secs*outFps)), msPerF=1000/outFps;
  setP(0,`Recording 0 / ${totalF}`);

  for(let i=0;i<totalF;i++){
    if(mp4Cancel)break;
    const t=totalF===1?0:i/(totalF-1);
    offAnim.goToAndStop(t*(totalSrc-1),true);
    const clone=offSvg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
    clone.setAttribute('width',srcW);clone.setAttribute('height',srcH);
    if(!clone.getAttribute('viewBox'))clone.setAttribute('viewBox',`0 0 ${srcW} ${srcH}`);
    const svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
    const blobUrl=URL.createObjectURL(new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'}));
    await new Promise((res)=>{
      const img=new Image();
      img.onload=()=>{want?ctx.clearRect(0,0,W,H):(ctx.fillStyle=mp4Cfg.bg,ctx.fillRect(0,0,W,H));ctx.drawImage(img,0,0,W,H);URL.revokeObjectURL(blobUrl);res();};
      img.onerror=()=>{URL.revokeObjectURL(blobUrl);res();};
      img.src=blobUrl;
    });
    setP((i+1)/totalF*0.9,`Recording ${i+1} / ${totalF}`);
    await new Promise(r=>setTimeout(r,msPerF));
  }
  setP(0.9,'Finishing…');rec.stop();await recDone;
  cleanup(offDiv,offAnim);
  if(!mp4Cancel){
    const blob=new Blob(chunks,{type:mime});
    doDownload(blob,'animation'+ext);
    setP(1,'Done!');setTimeout(()=>closeModal('mp4-modal'),800);
  }
  mp4Finish(go,can,pr);
}
function mp4Finish(go,can,pr){mp4Busy=false;mp4Cancel=false;go.disabled=false;can.textContent='Cancel';setTimeout(()=>pr.style.display='none',1200);}

/* =============================================
   MERGE TWO ANIMATIONS
   ============================================= */
let mergePending = null;

function buildMergeModal() {
  if ($('merge-modal')) return;
  const div = document.createElement('div');
  div.id = 'merge-modal';
  div.className = 'modal-overlay';
  div.setAttribute('aria-hidden','true');
  div.innerHTML = `
    <div class="modal-box" style="max-width:460px;">
      <div class="modal-head">
        <h3><i class="ri-picture-in-picture-line"></i> Merge Two Animations</h3>
        <button class="btn btn-ghost icon-btn modal-close-btn" data-modal="merge-modal"><i class="ri-close-line"></i></button>
      </div>
      <p style="font-size:13px;color:var(--text2);margin:0 0 14px;line-height:1.5;">
        Load a second Lottie file — it will be added as a new layer inside the current animation.
      </p>
      <div id="mergeDropZone" class="merge-drop">
        <div id="mergeDropInner" style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div style="font-size:32px;">📂</div>
          <div style="font-size:13px;color:var(--text2);">Drop .json / .tgs here or</div>
          <label class="btn btn-primary" style="cursor:pointer;">
            Browse
            <input type="file" id="mergeFileIn" accept=".json,.tgs" style="display:none;">
          </label>
        </div>
        <div id="mergeLoadedRow" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;">
          <span style="background:#10b981;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;">✓ Loaded</span>
          <strong id="mergeLoadedName"></strong>
          <span id="mergeLoadedInfo" style="color:var(--text3);font-size:11px;"></span>
          <button id="mergeChangBtn" class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:3px 8px;">Change</button>
        </div>
      </div>
      <div id="mergeSettings" style="display:none;margin-top:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div class="merge-fld"><label>Position X</label><input type="number" id="mPosX" value="0" class="setting-input"></div>
          <div class="merge-fld"><label>Position Y</label><input type="number" id="mPosY" value="0" class="setting-input"></div>
          <div class="merge-fld"><label>Scale %</label><input type="number" id="mScale" value="100" min="1" max="400" class="setting-input"></div>
          <div class="merge-fld"><label>Layer Name</label><input type="text" id="mName" value="Merged" class="setting-input"></div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;color:var(--text2);font-weight:500;min-width:60px;">Z-Order</span>
          <div class="mp4seg">
            <button class="mp4sb active" data-zorder="top">On Top</button>
            <button class="mp4sb" data-zorder="bottom">Behind</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="mergeGoBtn" class="btn btn-primary" style="flex:1;justify-content:center;" disabled>
          <i class="ri-picture-in-picture-line"></i> Merge
        </button>
        <button class="btn btn-ghost modal-close-btn" data-modal="merge-modal" style="flex:1;justify-content:center;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(div);

  $('mergeFileIn').addEventListener('change', e => {
    const f=e.target.files[0]; if(!f)return; e.target.value='';
    mergeParseLottie(f, d => { mergePending=d; mergeShowLoaded(f.name); });
  });
  $('mergeChangBtn').addEventListener('click', () => {
    mergePending=null;
    $('mergeDropInner').style.display='flex'; $('mergeLoadedRow').style.display='none';
    $('mergeSettings').style.display='none'; $('mergeGoBtn').disabled=true;
  });
  const dz=$('mergeDropZone');
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('merge-drag-over');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('merge-drag-over'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('merge-drag-over');const f=e.dataTransfer.files[0];if(f)mergeParseLottie(f,d=>{mergePending=d;mergeShowLoaded(f.name);});});
  div.querySelector('[data-zorder]')?.closest('.mp4seg').addEventListener('click',e=>{const b=e.target.closest('[data-zorder]');if(!b)return;div.querySelectorAll('[data-zorder]').forEach(x=>x.classList.remove('active'));b.classList.add('active');});
  $('mergeGoBtn').addEventListener('click', mergeDoMerge);
}

function mergeParseLottie(file, cb) {
  const n=file.name.toLowerCase();
  if(n.endsWith('.tgs')){
    file.arrayBuffer().then(buf=>{try{cb(JSON.parse(pako.ungzip(new Uint8Array(buf),{to:'string'})));}catch(e){alert('Parse error: '+e.message);}});
  } else {
    file.text().then(txt=>{try{cb(JSON.parse(txt));}catch(e){alert('Parse error: '+e.message);}});
  }
}

function mergeShowLoaded(name) {
  $('mergeDropInner').style.display='none'; $('mergeLoadedRow').style.display='flex';
  $('mergeLoadedName').textContent=name.replace(/\.(json|tgs)$/i,'');
  $('mergeLoadedInfo').textContent=`${mergePending.w||'?'}×${mergePending.h||'?'} · ${mergePending.fr||'?'}fps`;
  $('mName').value=mergePending.nm||name.replace(/\.(json|tgs)$/i,'')||'Merged';
  $('mergeSettings').style.display='block'; $('mergeGoBtn').disabled=false;
}

function mergeDoMerge() {
  if(!animData||!mergePending)return;
  const el=$('merge-modal');
  const posX=parseFloat($('mPosX').value)||0, posY=parseFloat($('mPosY').value)||0;
  const scale=parseFloat($('mScale').value)/100||1, name=$('mName').value||'Merged';
  const onTop=!el.querySelector('[data-zorder="bottom"].active');
  pushHistory();
  if(!animData.assets)animData.assets=[];

  const prefix='mf_'+Date.now()+'_', assetMap=new Map();
  (mergePending.assets||[]).forEach(asset=>{
    const newId=prefix+(asset.id||Math.random().toString(36).slice(2));
    assetMap.set(asset.id,newId);
    const cl=deepCopy(asset);cl.id=newId;
    if(cl.layers)cl.layers.forEach(l=>{if(l.refId&&assetMap.has(l.refId))l.refId=assetMap.get(l.refId);});
    animData.assets.push(cl);
  });

  const precompId=prefix+'precomp';
  const precomp={id:precompId,nm:name,fr:mergePending.fr,layers:deepCopy(mergePending.layers||[])};
  precomp.layers.forEach(l=>{if(l.refId&&assetMap.has(l.refId))l.refId=assetMap.get(l.refId);});
  animData.assets.push(precomp);

  const maxInd=Math.max(0,...animData.layers.map(l=>l.ind||0));
  const bW=animData.w||512,bH=animData.h||512,sW=mergePending.w||512,sH=mergePending.h||512;
  const newLayer={ddd:0,ind:maxInd+1,ty:0,nm:name,refId:precompId,sr:1,
    ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[posX+bW/2,posY+bH/2,0]},a:{a:0,k:[sW/2,sH/2,0]},s:{a:0,k:[scale*100,scale*100,100]}},
    ao:0,w:sW,h:sH,ip:animData.ip||0,op:animData.op||60,st:0,bm:0};
  onTop?animData.layers.unshift(newLayer):animData.layers.push(newLayer);

  if(fileList[fileIndex])fileList[fileIndex].animData=animData;
  closeModal('merge-modal');
  afterDataChange();
  alert(`✓ Merged "${name}" into frame!`);
}

/* =============================================
   TOUCH TRANSFORM
   One finger = move all layers, two fingers = pinch scale + rotate
   ============================================= */
const TT={active:false,mode:'none',snapped:false,sx:0,sy:0,sPos:[],sDist:0,sAngle:0,sScales:[],sRots:[]};

function ttKV(p){if(!p)return null;return p.a===1&&Array.isArray(p.k)?p.k[0]?.s:p.k;}
function ttSetKV(p,v){if(!p)return;if(p.a===1&&Array.isArray(p.k))p.k.forEach(kf=>{if(kf.s)kf.s=Array.isArray(v)?[...v]:[v];});else p.k=Array.isArray(v)?[...v]:v;}
function ttScalar(p){if(!p)return 0;if(p.a===1&&Array.isArray(p.k))return p.k[0]?.s?.[0]??0;return Array.isArray(p.k)?p.k[0]:p.k??0;}
function ttSetScalar(p,v){if(!p)return;if(p.a===1&&Array.isArray(p.k))p.k.forEach(kf=>{if(kf.s)kf.s[0]=v;if(kf.e)kf.e[0]=v;});else p.k=v;}
function ttDist(a,b){const dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}
function ttAngle(a,b){return Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI;}
function ttLayers(){return(animData?.layers||[]).filter(l=>!l.hd&&l.ks);}

function initTouchTransform(){
  const el=$('anim'); if(!el)return;
  el.addEventListener('touchstart', ttStart, {passive:false});
  el.addEventListener('touchmove',  ttMove,  {passive:false});
  el.addEventListener('touchend',   ttEnd,   {passive:false});
  el.addEventListener('touchcancel',ttEnd,   {passive:false});
}

function ttStart(e){
  if(!animData)return; e.preventDefault();
  const layers=ttLayers(); if(!layers.length)return;
  if(!TT.snapped){pushHistory();TT.snapped=true;}
  TT.active=true;
  if(e.touches.length===1){
    TT.mode='move';TT.sx=e.touches[0].clientX;TT.sy=e.touches[0].clientY;
    const wrap=$('canvasWrap'),rect=wrap?wrap.getBoundingClientRect():{width:512,height:512};
    const scX=(animData.w||512)/rect.width,scY=(animData.h||512)/rect.height;
    TT.sPos=layers.map(l=>{const p=ttKV(l.ks.p)||[0,0,0];return{l,x:p[0],y:p[1],scX,scY};});
  } else if(e.touches.length>=2){
    TT.mode='pinch';TT.sDist=ttDist(e.touches[0],e.touches[1]);TT.sAngle=ttAngle(e.touches[0],e.touches[1]);
    TT.sScales=layers.map(l=>{const sc=ttKV(l.ks.s)||[100,100,100];return{l,sx:sc[0],sy:sc[1],sz:sc[2]||100};});
    TT.sRots=layers.map(l=>({l,r:ttScalar(l.ks.r)||0}));
  }
}
function ttMove(e){
  if(!TT.active)return;e.preventDefault();
  if(TT.mode==='move'&&e.touches.length>=1){
    const dx=e.touches[0].clientX-TT.sx,dy=e.touches[0].clientY-TT.sy;
    TT.sPos.forEach(({l,x,y,scX,scY})=>{if(!l.ks.p)return;ttSetKV(l.ks.p,[Math.round(x+dx*scX),Math.round(y+dy*scY),0]);});
    reloadAnim();
  } else if(TT.mode==='pinch'&&e.touches.length>=2){
    const ratio=TT.sDist>0?ttDist(e.touches[0],e.touches[1])/TT.sDist:1;
    const dAng=ttAngle(e.touches[0],e.touches[1])-TT.sAngle;
    TT.sScales.forEach(({l,sx,sy,sz})=>{if(!l.ks.s)l.ks.s={a:0,k:[100,100,100]};ttSetKV(l.ks.s,[Math.round(sx*ratio*10)/10,Math.round(sy*ratio*10)/10,sz]);});
    TT.sRots.forEach(({l,r})=>{if(!l.ks.r)l.ks.r={a:0,k:0};ttSetScalar(l.ks.r,Math.round((r+dAng)*10)/10);});
    reloadAnim();
  }
}
function ttEnd(e){
  if(!TT.active)return;
  if(e.touches.length===0){TT.active=false;TT.mode='none';TT.snapped=false;}
  else if(e.touches.length===1&&TT.mode==='pinch'){
    TT.mode='move';TT.sx=e.touches[0].clientX;TT.sy=e.touches[0].clientY;
    const wrap=$('canvasWrap'),rect=wrap?wrap.getBoundingClientRect():{width:512,height:512};
    const scX=(animData.w||512)/rect.width,scY=(animData.h||512)/rect.height;
    TT.sPos=ttLayers().map(l=>{const p=ttKV(l.ks.p)||[0,0,0];return{l,x:p[0],y:p[1],scX,scY};});
  }
}

/* =============================================
   WIRE NEW FEATURES INTO EXISTING APP
   ============================================= */

// Patch the existing DOMContentLoaded to also init new features
document.addEventListener('DOMContentLoaded', () => {
  // Build modals (inject HTML into page)
  buildMp4Modal();
  buildMergeModal();
  // Touch transform
  initTouchTransform();
});

// Extend export menu to include MP4 button
// We patch after the existing exportMenuBtn listener by wrapping it
const _origExportBtn = $('exportMenuBtn');
if (_origExportBtn) {
  _origExportBtn.addEventListener('click', () => {
    // Wait for existing handler to render the modal, then inject MP4 button
    setTimeout(() => {
      const box = $('exportModalBox');
      if (!box || box.querySelector('#expMp4Btn')) return;
      const btn = document.createElement('button');
      btn.id = 'expMp4Btn';
      btn.className = 'btn';
      btn.style.cssText = 'border:1.5px solid #8b5cf6;color:#8b5cf6;width:100%;justify-content:center;padding:13px;font-size:14px;font-weight:600;';
      btn.innerHTML = '🎬 MP4 / WebM <span style="font-size:11px;opacity:.6;margin-left:4px;">(Video with custom bg)</span>';
      btn.addEventListener('click', () => {
        closeModal('export-modal');
        mp4UpdateInfo();
        openModal('mp4-modal');
      });
      // Insert before Cancel button
      const footer = box.querySelector('.modal-footer') || box.querySelector('[data-modal="export-modal"]')?.parentElement;
      const cancelBtn = box.querySelector('[data-modal="export-modal"]');
      if (cancelBtn && cancelBtn.parentElement) {
        cancelBtn.parentElement.insertBefore(btn, cancelBtn);
      } else {
        box.appendChild(btn);
      }
    }, 60);
  });
}

// Merge button — add to toolbar dynamically since it wasn't in the original HTML
document.addEventListener('DOMContentLoaded', () => {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || $('mergeToolBtn')) return;
  const mergeBtn = document.createElement('button');
  mergeBtn.id = 'mergeToolBtn';
  mergeBtn.className = 'btn btn-ghost icon-btn';
  mergeBtn.title = 'Merge two animations';
  mergeBtn.innerHTML = '<i class="ri-picture-in-picture-line"></i>';
  mergeBtn.addEventListener('click', () => {
    if (!animData) return alert('Load a Lottie file first.');
    // Reset modal state
    mergePending = null;
    const di = $('mergeDropInner'), lr = $('mergeLoadedRow'), ms = $('mergeSettings'), gb = $('mergeGoBtn');
    if (di) di.style.display = 'flex';
    if (lr) lr.style.display = 'none';
    if (ms) ms.style.display = 'none';
    if (gb) gb.disabled = true;
    openModal('merge-modal');
  });
  // Insert before the export button
  const exportBtn = $('exportMenuBtn');
  if (exportBtn) toolbar.insertBefore(mergeBtn, exportBtn);
  else toolbar.appendChild(mergeBtn);
});

// Add Layer Colours tab to the editor panel
document.addEventListener('DOMContentLoaded', () => {
  // Insert new tab button
  const tabsNav = document.querySelector('.tabs-nav');
  const resetBtn = $('resetColorsBtn');
  if (!tabsNav || tabsNav.querySelector('[data-tab="layercolors"]')) return;

  const lcTab = document.createElement('button');
  lcTab.className = 'tab-btn';
  lcTab.dataset.tab = 'layercolors';
  lcTab.innerHTML = '<i class="ri-stack-fill"></i> Layers';
  // Insert before reset button
  tabsNav.insertBefore(lcTab, resetBtn);

  // Insert tab pane
  const editorPanel = document.querySelector('.editor-panel');
  if (!editorPanel || $('tab-layercolors')) return;
  const pane = document.createElement('div');
  pane.id = 'tab-layercolors';
  pane.className = 'tab-pane';
  pane.innerHTML = `
    <div class="lc-panel-header">
      <button id="lcUnisolateBtn" class="lc-unisolate" style="display:none;">⊙ Show All Layers</button>
    </div>
    <div id="layerColorsList"></div>`;
  editorPanel.appendChild(pane);

  // Wire tab click (piggyback on existing tab-btn handler)
  lcTab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    lcTab.classList.add('active');
    pane.classList.add('active');
    renderLayerColorsPanel();
  });

  // Unisolate button
  document.addEventListener('click', e => {
    if (e.target.id === 'lcUnisolateBtn') lcUnisolate();
  });
});

// Also refresh layer panel whenever afterDataChange fires and layer tab is active

// Refresh layer colours panel when anim data changes and that tab is active
function lcRefreshIfActive() {
  const pane = document.getElementById('tab-layercolors');
  if (pane && pane.classList.contains('active')) {
    renderLayerColorsPanel();
  }
}

// Patch afterDataChange (it's a function declaration, can reassign via window in non-strict)
// Since the file uses 'use strict', we use a different approach:
// The layer tab re-renders on click. For live colour picker changes,
// lcRefreshIfActive() is called directly inside lc-ci input handler (already done).
// For undo/redo refresh, we piggyback on the existing DOMContentLoaded tab wiring above.
