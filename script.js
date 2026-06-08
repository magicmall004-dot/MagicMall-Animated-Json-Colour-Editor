'use strict';

if (!window.pako) {
  document.body.innerHTML = '<div style="color:red;padding:24px;">pako.js failed to load. Refresh.</div>';
  throw new Error('pako missing');
}

/* ── STATE ── */
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
let generatedPalette = [];
let paletteMode      = 'hsv';

/* ── DOM ── */
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

/* ── UTILITIES ── */
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

/* ── COLOUR SPACES ── */
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=max===0?0:d/max,v=max;if(d!==0){switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}return{h,s,v};}
function hsvToRgb(h,s,v){let r,g,b;const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}return{r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}return{h,s,l};}
function hslToRgb(h,s,l){if(s===0){const v=Math.round(l*255);return{r:v,g:v,b:v};}const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;const hue=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};return{r:Math.round(hue(p,q,h+1/3)*255),g:Math.round(hue(p,q,h)*255),b:Math.round(hue(p,q,h-1/3)*255)};}

function interpolatePalette(hexA,hexB,count,mode){
  const a=hexToRgb255(hexA),b=hexToRgb255(hexB),result=[];
  for(let i=0;i<count;i++){
    const t=count===1?0:i/(count-1);let c;
    if(mode==='rgb'){c={r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)};}
    else if(mode==='hsv'){const ha=rgbToHsv(a.r,a.g,a.b),hb=rgbToHsv(b.r,b.g,b.b);let dh=hb.h-ha.h;if(dh>0.5)dh-=1;if(dh<-0.5)dh+=1;c=hsvToRgb(ha.h+dh*t,ha.s+(hb.s-ha.s)*t,ha.v+(hb.v-ha.v)*t);}
    else{const ha=rgbToHsl(a.r,a.g,a.b),hb=rgbToHsl(b.r,b.g,b.b);let dh=hb.h-ha.h;if(dh>0.5)dh-=1;if(dh<-0.5)dh+=1;c=hslToRgb(ha.h+dh*t,ha.s+(hb.s-ha.s)*t,ha.l+(hb.l-ha.l)*t);}
    result.push(rgbToHex(c.r,c.g,c.b));
  }
  return result;
}

/* ── HISTORY ── */
function pushHistory(){if(!animData)return;const snap=deepCopy(animData),last=historyStack[historyStack.length-1];if(last&&JSON.stringify(last)===JSON.stringify(snap))return;historyStack.push(snap);if(historyStack.length>MAX_HISTORY)historyStack.shift();redoStack=[];updateHistoryBtns();}
function undoChange(){if(historyStack.length<=1)return;redoStack.push(historyStack.pop());animData=deepCopy(historyStack[historyStack.length-1]);afterDataChange();updateHistoryBtns();}
function redoChange(){if(!redoStack.length)return;historyStack.push(deepCopy(animData));animData=redoStack.pop();afterDataChange();updateHistoryBtns();}
function updateHistoryBtns(){$('undoBtn').disabled=historyStack.length<=1;$('redoBtn').disabled=redoStack.length===0;}
$('undoBtn').addEventListener('click',undoChange);
$('redoBtn').addEventListener('click',redoChange);
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.contentEditable==='true')return;if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z')return;e.preventDefault();e.shiftKey?redoChange():undoChange();});

/* ── FILE LOAD ── */
async function loadFile(file){
  if(!file)return;
  const name=file.name.toLowerCase();
  try{
    let txt;
    if(name.endsWith('.tgs')){const buf=await file.arrayBuffer();txt=pako.ungzip(new Uint8Array(buf),{to:'string'});}
    else txt=await file.text();
    const parsed=JSON.parse(txt);
    originalAnimData=deepCopy(parsed);animData=deepCopy(parsed);
    historyStack=[deepCopy(animData)];redoStack=[];updateHistoryBtns();
    previewPlaceholder.style.display='none';frameSlider.disabled=false;
    afterDataChange();updateAnimInfo();
  }catch(e){alert('Failed to parse file:\n'+e.message);}
}
$('fileInput').addEventListener('change',async e=>{await loadFile(e.target.files[0]);e.target.value=null;});
['dragenter','dragover','dragleave','drop'].forEach(ev=>document.body.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();}));
['dragenter','dragover'].forEach(ev=>document.body.addEventListener(ev,()=>document.body.classList.add('dragging')));
['dragleave','drop'].forEach(ev=>document.body.addEventListener(ev,()=>document.body.classList.remove('dragging')));
document.body.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)loadFile(f);});
function updateAnimInfo(){if(!animData){animInfoEl.textContent='';return;}animInfoEl.textContent=`${animData.w}x${animData.h} · ${animData.fr}fps`;}

/* ── PLAYER ── */
function reloadAnim(){
  showLoading(true);
  setTimeout(()=>{
    let saved=0;
    if(animInstance){try{saved=animInstance.currentFrame;}catch(_){}animInstance.destroy();animEl.innerHTML='';}
    if(!animData){showLoading(false);return;}
    animInstance=lottie.loadAnimation({container:animEl,renderer:'svg',loop:true,autoplay:false,animationData:deepCopy(animData)});
    let done=false;
    const onLoad=()=>{if(done)return;done=true;const total=Math.round(animInstance.totalFrames||0);frameSlider.max=Math.max(0,total-1);totalLabel.textContent=total;const go=Math.min(saved,total-1);playerPaused?animInstance.goToAndStop(go,true):animInstance.goToAndPlay(go,true);updatePlayBtn();showLoading(false);};
    animInstance.addEventListener('DOMLoaded',onLoad);animInstance.addEventListener('data_ready',onLoad);setTimeout(onLoad,1500);
    animInstance.addEventListener('enterFrame',()=>{if(!frameSlider.matches(':active')){const f=Math.round(animInstance.currentFrame);frameSlider.value=f;frameLabel.textContent=f;}});
  },30);
}
function showLoading(on){loadingOverlay.style.display=on?'flex':'none';}
function updatePlayBtn(){$('playPauseBtn').innerHTML=playerPaused?'<i class="ri-play-fill"></i>':'<i class="ri-pause-fill"></i>';}
$('playPauseBtn').addEventListener('click',()=>{if(!animInstance)return;playerPaused=!playerPaused;playerPaused?animInstance.pause():animInstance.play();updatePlayBtn();});
frameSlider.addEventListener('input',()=>{if(!animInstance)return;const f=parseFloat(frameSlider.value);if(!playerPaused){animInstance.pause();playerPaused=true;updatePlayBtn();}animInstance.goToAndStop(f,true);frameLabel.textContent=Math.round(f);});

/* ── COLOUR EXTRACTION ── */
function extractColors(data){
  const results=[];groupedColors={};
  function add(ref,type,shapeType,hex,gradIndex){const e={ref,type,shapeType,hex,gradIndex};results.push(e);if(!groupedColors[hex])groupedColors[hex]={hex,instances:[]};groupedColors[hex].instances.push(e);}
  function walk(obj){
    if(!obj||typeof obj!=='object')return;
    if(obj.ty==='fl'||obj.ty==='st'){const sType=obj.ty==='fl'?'Fill':'Stroke',c=obj.c;if(c){if(c.a===1&&Array.isArray(c.k))c.k.forEach(kf=>{if(kf.s&&Array.isArray(kf.s))add(kf,'solid',sType,rgbaArrToHex(kf.s));});else if(Array.isArray(c.k))add(c,'solid',sType,rgbaArrToHex(c.k));else if(c.k&&Array.isArray(c.k.k))add(c.k,'solid',sType,rgbaArrToHex(c.k.k));}}
    if((obj.ty==='gf'||obj.ty==='gs')&&obj.g){const sType=obj.ty==='gf'?'Gradient Fill':'Gradient Stroke',g=obj.g,numStops=g.p||0;const proc=(arr,ref)=>{const cnt=numStops>0?numStops:Math.floor(arr.length/4);for(let i=0;i<cnt*4;i+=4){if(i+3>=arr.length)break;add(ref,'gradient',sType,rgbToHex(Math.round(arr[i+1]*255),Math.round(arr[i+2]*255),Math.round(arr[i+3]*255)),i);}};if(g.k){if(g.k.a===1&&Array.isArray(g.k.k))g.k.k.forEach(kf=>{if(kf.s&&Array.isArray(kf.s))proc(kf.s,kf);});else if(Array.isArray(g.k.k))proc(g.k.k,g.k);else if(Array.isArray(g.k))proc(g.k,g);}}
    for(const k in obj){if(!Object.prototype.hasOwnProperty.call(obj,k)||k==='c'||k==='sc')continue;if(obj[k]&&typeof obj[k]==='object')walk(obj[k]);}
  }
  walk(data);return results;
}

/* ── COLOUR RENDERING ── */
function extractAndRender(){if(!animData)return;allColors=extractColors(animData);renderColors();}
function renderColors(){
  const isGrouped=groupCheckbox.checked,useAdv=gradientToggle.checked;let items=[];
  if(isGrouped){Object.values(groupedColors).forEach(g=>{if(currentFilter!=='All'&&!g.instances.some(i=>i.shapeType.includes(currentFilter)))return;items.push({group:g,isGrad:g.instances.some(i=>i.type==='gradient'),hex:g.hex,count:g.instances.length});});}
  else{allColors.forEach(e=>{if(currentFilter!=='All'&&!e.shapeType.includes(currentFilter))return;items.push({entry:e,isGrad:e.type==='gradient',hex:e.hex,count:1});});}
  colorStatEl.textContent=items.length;colorsEl.innerHTML='';
  if(!items.length){colorsEl.innerHTML='<div class="no-colors"><i class="ri-palette-line"></i><br>No colours found</div>';return;}
  items.forEach(item=>{
    const card=document.createElement('div');card.className='color-card';
    const isGrad=item.isGrad&&useAdv;
    if(item.count>1||isGrad){const badge=document.createElement('div');badge.className='color-badge';badge.innerHTML=isGrad?'<i class="ri-gradienter-line"></i>':`<i class="ri-stack-fill"></i> ${item.count}`;card.appendChild(badge);}
    if(isGrad){
      const gradCss=buildGradPreview(item);const sw=document.createElement('div');sw.className='gradient-swatch';sw.style.background=gradCss;card.appendChild(sw);
      const hx=document.createElement('div');hx.className='color-hex gradient-label';hx.textContent='GRADIENT';card.appendChild(hx);
      card.addEventListener('click',()=>openGradientEditor(item.group||{hex:item.entry.hex,instances:[item.entry]}));
    }else{
      const sw=document.createElement('div');sw.className='color-swatch';sw.style.background=item.hex;
      const picker=document.createElement('input');picker.type='color';picker.value=item.hex;sw.appendChild(picker);card.appendChild(sw);
      const hexEl=document.createElement('div');hexEl.className='color-hex';hexEl.contentEditable='true';hexEl.spellcheck=false;hexEl.textContent=item.hex.toUpperCase();card.appendChild(hexEl);
      picker.addEventListener('input',debounce(()=>{sw.style.background=picker.value;hexEl.textContent=picker.value.toUpperCase();applyColorChange(item,picker.value);debouncedReload();},80));
      const applyHex=()=>{let v=hexEl.textContent.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v))return;picker.value=v;sw.style.background=v;hexEl.textContent=v.toUpperCase();applyColorChange(item,v);debouncedReload();};
      hexEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyHex();hexEl.blur();}});
      hexEl.addEventListener('blur',applyHex);
      card.addEventListener('click',e=>{if(e.target===hexEl||e.target===picker)return;picker.click();});
    }
    colorsEl.appendChild(card);
  });
}
function buildGradPreview(item){let hl=[];if(item.group)item.group.instances.filter(i=>i.type==='gradient').forEach(i=>{if(!hl.includes(i.hex))hl.push(i.hex);});else if(item.entry)hl=[item.entry.hex,'#333'];if(!hl.length)hl=['#000','#fff'];if(hl.length===1)hl.push('#555');return`linear-gradient(90deg,${hl.map((h,i)=>`${h} ${Math.round(i/(hl.length-1)*100)}%`).join(',')})`;}

/* ── APPLY COLOUR ── */
function applyColorChange(item,newHex){
  if(!animData)return;const{r,g,b}=hexToNorm(newHex);const isGrouped=groupCheckbox.checked;
  const instances=isGrouped?(item.group||{instances:[]}).instances:[item.entry];
  instances.forEach(inst=>{if(!inst||!inst.ref)return;const ref=inst.ref;
    if(inst.type==='solid'){if(ref.s&&Array.isArray(ref.s)){const a=ref.s[3]??1;ref.s=[r,g,b,a];}else if(Array.isArray(ref.k)){const a=ref.k[3]??1;ref.k=[r,g,b,a];}else if(ref.k&&Array.isArray(ref.k.k)){const a=ref.k.k[3]??1;ref.k.k=[r,g,b,a];}}
    else if(inst.type==='gradient'&&inst.gradIndex!==undefined){const arr=resolveGradArr(ref);if(arr&&arr.length>inst.gradIndex+3){arr[inst.gradIndex+1]=r;arr[inst.gradIndex+2]=g;arr[inst.gradIndex+3]=b;}}
  });
  if(isGrouped&&item.group)item.group.hex=newHex;allColors=extractColors(animData);
}
function resolveGradArr(ref){if(Array.isArray(ref.k))return ref.k;if(ref.k&&Array.isArray(ref.k.k))return ref.k.k;if(Array.isArray(ref.s))return ref.s;if(Array.isArray(ref))return ref;return null;}
const debouncedReload=debounce(()=>{pushHistory();reloadAnim();},250);

/* ── FILTERS ── */
$$('.pill').forEach(btn=>{btn.addEventListener('click',()=>{$$('.pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentFilter=btn.dataset.filter;renderColors();});});
groupCheckbox.addEventListener('change',renderColors);
gradientToggle.addEventListener('change',renderColors);

/* ── RESET ── */
$('resetColorsBtn').addEventListener('click',()=>{if(!originalAnimData)return;if(!confirm('Reset all colours?'))return;animData=deepCopy(originalAnimData);pushHistory();afterDataChange();});

/* ── LAYERS ── */
function renderLayers(){
  layerListEl.innerHTML='';
  if(!animData||!animData.layers){layerListEl.innerHTML='<div class="empty-state"><i class="ri-stack-line"></i>No layers</div>';return;}
  animData.layers.forEach((layer,idx)=>{const row=document.createElement('div');row.className='layer-row';const ni=document.createElement('input');ni.type='text';ni.className='layer-name';ni.value=layer.nm||`Layer ${idx+1}`;ni.addEventListener('change',()=>{pushHistory();layer.nm=ni.value;});const vc=document.createElement('input');vc.type='checkbox';vc.className='vis-toggle';vc.checked=!layer.hd;vc.addEventListener('change',()=>{pushHistory();layer.hd=!vc.checked;reloadAnim();});row.appendChild(ni);row.appendChild(vc);layerListEl.appendChild(row);});
}
$('refreshLayers').addEventListener('click',renderLayers);

/* ── TABS ── */
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));$$('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');$(`tab-${btn.dataset.tab}`).classList.add('active');
    if(btn.dataset.tab==='themes')renderThemes();
    if(btn.dataset.tab==='layers')renderLayers();
    if(btn.dataset.tab==='palette')buildPalette();
  });
});

/* ── PALETTE GENERATOR ── */
function buildPalette(){
  const start=$('palStartPicker').value,end=$('palEndPicker').value;
  const count=Math.max(2,Math.min(32,parseInt($('palCount').value)||5));
  generatedPalette=interpolatePalette(start,end,count,paletteMode);

  // Gradient preview strip between pickers
  $('palGradPreview').style.background=`linear-gradient(90deg,${start},${end})`;

  // Swatches row
  const sw=$('palSwatches');sw.innerHTML='';
  generatedPalette.forEach((hex,i)=>{
    const s=document.createElement('div');s.className='pal-swatch-block';
    s.style.background=hex;s.style.flex='1';
    s.title=hex;
    // tooltip on hover
    s.setAttribute('data-hex',hex);
    sw.appendChild(s);
  });

  // Hex chips
  const ch=$('palChips');ch.innerHTML='';
  generatedPalette.forEach(hex=>{
    const c=document.createElement('button');c.className='pal-chip';c.textContent=hex;
    c.title='Click to copy';
    c.addEventListener('click',()=>{
      navigator.clipboard&&navigator.clipboard.writeText(hex);
      c.textContent='Copied!';c.classList.add('copied');
      setTimeout(()=>{c.textContent=hex;c.classList.remove('copied');},1400);
    });
    ch.appendChild(c);
  });

  $('palApplyBtn').disabled=!animData;
}

// Wire palette controls
$('palStartPicker').addEventListener('input',e=>{$('palStartSwatch').style.background=e.target.value;$('palStartHex').value=e.target.value.toUpperCase();buildPalette();});
$('palEndPicker').addEventListener('input',e=>{$('palEndSwatch').style.background=e.target.value;$('palEndHex').value=e.target.value.toUpperCase();buildPalette();});
$('palStartHex').addEventListener('input',e=>{let v=e.target.value.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v))return;$('palStartPicker').value=v;$('palStartSwatch').style.background=v;buildPalette();});
$('palEndHex').addEventListener('input',e=>{let v=e.target.value.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v))return;$('palEndPicker').value=v;$('palEndSwatch').style.background=v;buildPalette();});
$('palCountDec').addEventListener('click',()=>{$('palCount').value=Math.max(2,parseInt($('palCount').value)-1);buildPalette();});
$('palCountInc').addEventListener('click',()=>{$('palCount').value=Math.min(32,parseInt($('palCount').value)+1);buildPalette();});
$('palCount').addEventListener('input',buildPalette);
$$('.mode-pill').forEach(btn=>{btn.addEventListener('click',()=>{$$('.mode-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');paletteMode=btn.dataset.mode;buildPalette();});});
$('palGenBtn').addEventListener('click',buildPalette);
$('palApplyBtn').addEventListener('click',()=>{
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
  alert('Applied '+generatedPalette.length+' palette colours to animation!');
});

/* ── THEMES ── */
$('saveThemeBtn').addEventListener('click',()=>{if(!animData)return alert('Load an animation first.');const groups=Object.values(groupedColors);if(!groups.length)return alert('No colours found.');const name=prompt('Theme name:',`Theme ${savedThemes.length+1}`);if(!name)return;savedThemes.push({id:Date.now(),name,colors:groups.map(g=>({hex:g.hex}))});localStorage.setItem('mm_themes',JSON.stringify(savedThemes));renderThemes();});
function renderThemes(){
  if(!savedThemes.length){themesList.innerHTML='<div class="empty-state"><i class="ri-bookmark-line"></i>No themes saved yet</div>';return;}
  themesList.innerHTML='';
  savedThemes.forEach(theme=>{const card=document.createElement('div');card.className='theme-card';const head=document.createElement('div');head.className='theme-card-head';const nm=document.createElement('div');nm.className='theme-card-name';nm.textContent=theme.name;const ab=document.createElement('button');ab.className='btn btn-primary';ab.style.cssText='padding:4px 10px;font-size:11px;';ab.innerHTML='<i class="ri-palette-line"></i> Apply';ab.addEventListener('click',()=>applyTheme(theme));const db=document.createElement('button');db.className='btn-danger-sm';db.innerHTML='<i class="ri-delete-bin-line"></i>';db.addEventListener('click',()=>deleteTheme(theme.id));head.appendChild(nm);head.appendChild(ab);head.appendChild(db);const sw=document.createElement('div');sw.className='theme-swatches';theme.colors.slice(0,9).forEach(c=>{const s=document.createElement('div');s.className='theme-swatch';s.style.background=c.hex;s.title=c.hex;sw.appendChild(s);});if(theme.colors.length>9){const m=document.createElement('span');m.className='theme-more';m.textContent=`+${theme.colors.length-9}`;sw.appendChild(m);}card.appendChild(head);card.appendChild(sw);themesList.appendChild(card);});
}
function applyTheme(theme){if(!animData)return alert('Load animation first.');pushHistory();allColors=extractColors(animData);const groups=Object.values(groupedColors);theme.colors.forEach((tc,i)=>{if(!groups[i])return;const prev=groupCheckbox.checked;groupCheckbox.checked=true;applyColorChange({group:groups[i],entry:groups[i].instances[0]},tc.hex);groupCheckbox.checked=prev;});afterDataChange();}
function deleteTheme(id){if(!confirm('Delete?'))return;savedThemes=savedThemes.filter(t=>t.id!==id);localStorage.setItem('mm_themes',JSON.stringify(savedThemes));renderThemes();}

/* ── AFTER DATA CHANGE ── */
function afterDataChange(){extractAndRender();renderLayers();reloadAnim();updateAnimInfo();}

/* ── GRADIENT EDITOR ── */
function openGradientEditor(groupObj){
  const gi=groupObj.instances.find(i=>i.type==='gradient');if(!gi)return alert('No gradient found.');
  const ref=gi.ref,rawArr=resolveGradArr(ref);if(!rawArr)return alert('Cannot resolve gradient array.');
  const stops=[];for(let i=0;i<rawArr.length;i+=4){if(i+3>=rawArr.length)break;const r=rawArr[i+1],g=rawArr[i+2],b=rawArr[i+3];stops.push({pos:parseFloat(rawArr[i]),r:parseFloat(r),g:parseFloat(g),b:parseFloat(b),hex:rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255))});}
  stops.sort((a,b)=>a.pos-b.pos);gradEdit={groupObj,ref,rawArr,stops,selectedIdx:0};renderGradientEditor();openModal('gradient-editor-modal');
}
function renderGradientEditor(){
  if(!gradEdit)return;const{stops,selectedIdx}=gradEdit,bar=$('gradientBar');
  bar.style.background=`linear-gradient(90deg,${stops.map(s=>`${s.hex} ${(s.pos*100).toFixed(1)}%`).join(',')})`;
  bar.querySelectorAll('.gradient-stop-pin').forEach(el=>el.remove());
  stops.forEach((s,idx)=>{const pin=document.createElement('div');pin.className='gradient-stop-pin'+(idx===selectedIdx?' selected':'');pin.style.left=(s.pos*100)+'%';pin.style.background=s.hex;pin.addEventListener('mousedown',e=>{e.stopPropagation();selGS(idx);startDragPin(e,idx);});pin.addEventListener('touchstart',e=>{e.stopPropagation();selGS(idx);startDragPin(e,idx);},{passive:false});bar.appendChild(pin);});
  bar.onclick=e=>{if(e.target!==bar)return;const r=bar.getBoundingClientRect();addGStop(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));renderGradientEditor();};
  $('gradientPositionsLabel').textContent=stops.map(s=>Math.round(s.pos*100)+'%').join(' · ');$('stopCountLabel').textContent=stops.length;
  const list=$('gradientStopsList');list.innerHTML='';
  stops.forEach((s,idx)=>{
    const row=document.createElement('div');row.className='gs-row'+(idx===selectedIdx?' selected':'');
    const sw=document.createElement('div');sw.className='gs-swatch';sw.style.background=s.hex;
    const ctrl=document.createElement('div');ctrl.className='gs-controls';const inp=document.createElement('div');inp.className='gs-inputs';
    const cp=document.createElement('input');cp.type='color';cp.value=s.hex;cp.className='gs-color-input';
    const hx=document.createElement('input');hx.type='text';hx.className='gs-hex';hx.value=s.hex.toUpperCase();hx.maxLength=7;
    cp.addEventListener('input',()=>{s.hex=cp.value;const{r,g,b}=hexToNorm(s.hex);s.r=r;s.g=g;s.b=b;hx.value=s.hex.toUpperCase();sw.style.background=s.hex;const gc=gradEdit.stops.map(x=>`${x.hex} ${(x.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;});
    hx.addEventListener('blur',()=>{let v=hx.value.trim();if(!v.startsWith('#'))v='#'+v;if(!isValidHex(v)){hx.value=s.hex.toUpperCase();return;}cp.value=v;s.hex=v;const{r,g,b}=hexToNorm(v);s.r=r;s.g=g;s.b=b;renderGradientEditor();});
    inp.appendChild(cp);inp.appendChild(hx);
    const pr=document.createElement('div');pr.className='gs-pos-row';const pl=document.createElement('span');pl.textContent=Math.round(s.pos*100)+'%';pl.style.minWidth='30px';
    const ps=document.createElement('input');ps.type='range';ps.min=0;ps.max=100;ps.value=Math.round(s.pos*100);ps.addEventListener('input',()=>{s.pos=ps.value/100;pl.textContent=ps.value+'%';gradEdit.stops.sort((a,b)=>a.pos-b.pos);const gc=gradEdit.stops.map(x=>`${x.hex} ${(x.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;});ps.addEventListener('change',()=>renderGradientEditor());
    pr.appendChild(pl);pr.appendChild(ps);ctrl.appendChild(inp);ctrl.appendChild(pr);
    const del=document.createElement('button');del.className='gs-del';del.innerHTML='<i class="ri-delete-bin-line"></i>';del.addEventListener('click',()=>{if(gradEdit.stops.length<=2)return alert('Need at least 2 stops.');gradEdit.stops.splice(idx,1);gradEdit.selectedIdx=0;renderGradientEditor();});
    row.appendChild(sw);row.appendChild(ctrl);row.appendChild(del);row.addEventListener('click',()=>selGS(idx));list.appendChild(row);
  });
  $('addGradientStop').onclick=()=>{addGStop();renderGradientEditor();};
  $('applyGradientChanges').onclick=applyGradientEdits;
  $('gradientReverseBtn').onclick=()=>{gradEdit.stops=gradEdit.stops.map(s=>({...s,pos:1-s.pos})).sort((a,b)=>a.pos-b.pos);renderGradientEditor();};
  $('gradientResetBtn').onclick=()=>{const raw=gradEdit.rawArr,ns=[];for(let i=0;i<raw.length;i+=4){const r=raw[i+1],g=raw[i+2],b=raw[i+3];ns.push({pos:raw[i],r,g,b,hex:rgbToHex(Math.round(r*255),Math.round(g*255),Math.round(b*255))});}gradEdit.stops=ns.sort((a,b)=>a.pos-b.pos);renderGradientEditor();};
  $('gradientAlpha').oninput=()=>{bar.style.opacity=$('gradientAlpha').value;};
}
function selGS(idx){gradEdit.selectedIdx=idx;$$('.gradient-stop-pin').forEach((el,i)=>el.classList.toggle('selected',i===idx));$$('.gs-row').forEach((el,i)=>el.classList.toggle('selected',i===idx));}
function addGStop(atPos){if(!gradEdit)return;const s=gradEdit.stops,pos=atPos!==undefined?atPos:(s.length>=2?(s[0].pos+s[s.length-1].pos)/2:0.5);const mh=s.length?s[Math.floor(s.length/2)].hex:'#ffffff';const{r,g,b}=hexToNorm(mh);s.push({pos,r,g,b,hex:mh});s.sort((a,b)=>a.pos-b.pos);}
function applyGradientEdits(){if(!gradEdit)return;const{ref,stops}=gradEdit,newRaw=[];stops.forEach(s=>newRaw.push(s.pos,s.r,s.g,s.b));if(Array.isArray(ref.k))ref.k.splice(0,ref.k.length,...newRaw);else if(ref.k&&Array.isArray(ref.k.k))ref.k.k.splice(0,ref.k.k.length,...newRaw);else if(Array.isArray(ref.s))ref.s.splice(0,ref.s.length,...newRaw);else ref.k=newRaw;if(gradEdit.groupObj)gradEdit.groupObj.hex=stops[0]?.hex||'#000000';gradEdit=null;closeModal('gradient-editor-modal');pushHistory();afterDataChange();}
let _drag=null;
function startDragPin(e,idx){e.preventDefault();_drag=idx;const bar=$('gradientBar'),rect=bar.getBoundingClientRect();const onMove=ev=>{const cx=ev.clientX||(ev.touches&&ev.touches[0].clientX);if(cx==null)return;const pos=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));gradEdit.stops[_drag].pos=pos;gradEdit.stops.sort((a,b)=>a.pos-b.pos);const gc=gradEdit.stops.map(s=>`${s.hex} ${(s.pos*100).toFixed(1)}%`).join(',');bar.style.background=`linear-gradient(90deg,${gc})`;bar.querySelectorAll('.gradient-stop-pin').forEach((p,i)=>{p.style.left=(gradEdit.stops[i].pos*100)+'%';});};const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);window.removeEventListener('touchmove',onMove);window.removeEventListener('touchend',onUp);_drag=null;renderGradientEditor();};window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);window.addEventListener('touchmove',onMove,{passive:false});window.addEventListener('touchend',onUp);}

/* ── SETTINGS ── */
$('settingsBtn').addEventListener('click',()=>{if(!animData)return alert('Load an animation first.');$('set-w').value=animData.w;$('set-h').value=animData.h;$('set-fr').value=animData.fr;$('set-scale').value=Math.round((parseFloat(animEl.style.getPropertyValue('--lottie-scale'))||1)*100);openModal('settings-modal');});
$('applySettings').addEventListener('click',()=>{const w=parseInt($('set-w').value),h=parseInt($('set-h').value),fr=parseFloat($('set-fr').value),sc=parseFloat($('set-scale').value)/100;if([w,h,fr].some(v=>isNaN(v)||v<=0)||isNaN(sc)||sc<=0)return alert('Enter valid positive values.');if(animData.w!==w||animData.h!==h||animData.fr!==fr){pushHistory();animData.w=w;animData.h=h;animData.fr=fr;reloadAnim();updateAnimInfo();}animEl.style.setProperty('--lottie-scale',sc);closeModal('settings-modal');});

/* ── TGS SCAN ── */
$('tgsScanBtn').addEventListener('click',()=>{if(!animData)return alert('Load a file first.');runTgsScan();});
function runTgsScan(){const{w,h,fr,op,ip=0}=animData,dur=(op-ip)/fr;const checks=[{label:'Size (512x512)',pass:w===512&&h===512,current:`${w}x${h}`,req:'512x512'},{label:'Frame Rate (60 fps)',pass:fr===60,current:`${fr} fps`,req:'60 fps'},{label:'Duration (max 3s)',pass:dur<=3,current:`${dur.toFixed(2)}s`,req:'3.0s'}];const allPass=checks.every(c=>c.pass);$('tgs-results').innerHTML=`<div class="scan-summary ${allPass?'scan-pass':'scan-fail'}"><i class="ri-${allPass?'checkbox-circle':'error-warning'}-line"></i>${allPass?'Passed! Ready for Telegram.':'Issues found.'}</div>`+checks.map(c=>`<div class="check-row ${c.pass?'check-pass':'check-fail'}"><div><div class="check-label">${c.label}</div><div class="check-val">${c.current} (req: ${c.req})</div></div><i class="ri-${c.pass?'check':'close'}-circle-fill check-icon"></i></div>`).join('');$('tgsExportBtn').onclick=()=>{closeModal('tgs-scan-modal');exportTgs();};openModal('tgs-scan-modal');}

/* ── EXPORT ── */
function doDownload(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportJson(){if(!animData)return;doDownload(new Blob([JSON.stringify(animData,null,2)],{type:'application/json'}),'lottie-edited.json');}
function exportTgs(){if(!animData)return;const out=deepCopy(animData);out.tgs=1;doDownload(new Blob([pako.gzip(JSON.stringify(out))],{type:'application/octet-stream'}),'animation.tgs');}

$('exportMenuBtn').addEventListener('click',()=>{
  if(!animData)return alert('Load a Lottie file first.');
  const box=$('exportModalBox');
  box.innerHTML=`
    <div class="export-modal-inner">
      <div class="export-modal-icon"><i class="ri-download-cloud-2-line"></i></div>
      <div class="export-modal-title">Export Animation</div>
      <p class="export-modal-sub">Format ကိုရွေးပြီး Download ဆွဲပါ</p>
      <div class="export-btn-list">
        <button id="expJsonBtn" class="export-choice-btn export-choice-json">
          <span class="export-choice-icon"><i class="ri-file-code-line"></i></span>
          <span class="export-choice-info">
            <span class="export-choice-name">JSON</span>
            <span class="export-choice-desc">After Effects / Web</span>
          </span>
          <i class="ri-arrow-right-line export-choice-arrow"></i>
        </button>
        <button id="expTgsBtn" class="export-choice-btn export-choice-tgs">
          <span class="export-choice-icon"><i class="ri-telegram-line"></i></span>
          <span class="export-choice-info">
            <span class="export-choice-name">TGS</span>
            <span class="export-choice-desc">Telegram Sticker</span>
          </span>
          <i class="ri-arrow-right-line export-choice-arrow"></i>
        </button>
        <button id="expGifBtn" class="export-choice-btn export-choice-gif">
          <span class="export-choice-icon"><i class="ri-image-gif-line"></i></span>
          <span class="export-choice-info">
            <span class="export-choice-name">GIF</span>
            <span class="export-choice-desc">Animated GIF — opens gif.ezgif.com</span>
          </span>
          <i class="ri-external-link-line export-choice-arrow"></i>
        </button>
      </div>
      <button class="btn btn-ghost modal-close-btn" data-modal="export-modal" style="width:100%;justify-content:center;margin-top:4px;">Cancel</button>
    </div>`;
  $('expJsonBtn').addEventListener('click',()=>{exportJson();closeModal('export-modal');});
  $('expTgsBtn').addEventListener('click',()=>{exportTgs();closeModal('export-modal');});
  $('expGifBtn').addEventListener('click',()=>{
    // Export JSON first then open ezgif converter
    exportJson();
    setTimeout(()=>window.open('https://ezgif.com/lottie-to-gif','_blank'),400);
    closeModal('export-modal');
  });
  openModal('export-modal');
});

/* ── MODALS ── */
function openModal(id){$(id).classList.add('open');$(id).setAttribute('aria-hidden','false');}
function closeModal(id){$(id).classList.remove('open');$(id).setAttribute('aria-hidden','true');}
document.addEventListener('click',e=>{const btn=e.target.closest('.modal-close-btn');if(!btn)return;const id=btn.dataset.modal;if(id)closeModal(id);else{const o=btn.closest('.modal-overlay');if(o)closeModal(o.id);}});
$$('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);}));

/* ── DARK MODE ── */
function applyDark(dark){document.body.classList.toggle('dark',dark);$('darkToggle').innerHTML=dark?'<i class="ri-sun-line"></i>':'<i class="ri-moon-line"></i>';}
$('darkToggle').addEventListener('click',()=>{const d=!document.body.classList.contains('dark');localStorage.setItem('mm_theme',d?'dark':'light');applyDark(d);});
$('telegramBtn').addEventListener('click',()=>window.open('https://t.me/Magic_Mall_Game_Shop','_blank'));

/* ── INIT ── */
document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('mm_theme'),pref=window.matchMedia('(prefers-color-scheme:dark)').matches;
  applyDark(saved==='dark'||(saved===null&&pref));
  updateHistoryBtns();renderThemes();buildPalette();
  $('frameLabel').textContent='0';
  const logoImg=document.querySelector('.brand-logo img');
  if(logoImg)logoImg.onerror=()=>{logoImg.style.display='none';$('fallbackIcon').style.display='block';};
});

/* ============================================================
   NEW FEATURES — appended to script.js
   1. Layer Colours Panel (per-layer colour editing + isolation)
   2. MP4 / WebM Export
   3. Merge Two Animations into one frame
   4. Touch Transform (Android/iOS pinch + rotate + drag)
   ============================================================ */

/* ── shared: extract layer colours ── */
function extractLayerColors(layer) {
  const results = [];
  function walk(obj, label) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.ty === 'fl' || obj.ty === 'st') {
      const sType = obj.ty === 'fl' ? 'Fill' : 'Stroke';
      const nm    = obj.nm || sType;
      const c = obj.c;
      if (c) {
        let hex = '#000000';
        if (c.a === 1 && Array.isArray(c.k) && c.k[0]?.s) hex = rgbaArrToHex(c.k[0].s);
        else if (Array.isArray(c.k)) hex = rgbaArrToHex(c.k);
        else if (c.k && Array.isArray(c.k.k)) hex = rgbaArrToHex(c.k.k);
        results.push({ hex, label: nm, ref: c.a === 1 ? c.k[0] : c, type: 'solid' });
      }
    }
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k) || k === 'c') continue;
      if (obj[k] && typeof obj[k] === 'object') walk(obj[k]);
    }
  }
  walk(layer);
  return results;
}

/* ═══════════════════════════════════════════════
   1. LAYER COLOURS PANEL
   ═══════════════════════════════════════════════ */
let lcIsolatedIdx    = null;
let lcSavedOpacities = [];

function lcSetOpacity(layer, val) {
  if (!layer.ks) layer.ks = {};
  if (!layer.ks.o) layer.ks.o = { a: 0, k: 100 };
  const op = layer.ks.o;
  if (op.a === 1 && Array.isArray(op.k)) {
    op.k.forEach(kf => { if (kf.s) kf.s[0] = val; if (kf.e) kf.e[0] = val; });
  } else { op.k = val; op.a = 0; }
}
function lcRestoreOpacities() {
  lcSavedOpacities.forEach(({ layer, val }) => lcSetOpacity(layer, val));
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
    if (op) orig = op.a === 1 ? (op.k[0]?.s?.[0] ?? 100) : (Array.isArray(op.k) ? op.k[0] : op.k) ?? 100;
    lcSavedOpacities.push({ layer, val: orig });
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

function lcDrawThumb(canvas, layer) {
  const ctx = canvas.getContext('2d'), W = 36, H = 36;
  ctx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) {
    ctx.fillStyle = ((x / 6 + y / 6) % 2 === 0) ? '#ccc' : '#999';
    ctx.fillRect(x, y, 6, 6);
  }
  const colors = extractLayerColors(layer);
  if (!colors.length) return;
  const sw = W / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c.hex;
    ctx.fillRect(i * sw, 0, sw + 1, H);
  });
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 6); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function renderLayerColorsPanel() {
  const el = $('layerColorsPanel');
  if (!el) return;
  if (!animData || !animData.layers || !animData.layers.length) {
    el.innerHTML = '<div class="empty-state"><i class="ri-stack-line"></i><br>No layers found.<br>Open a Lottie file first.</div>';
    return;
  }
  const ICONS = { 0:'📦', 1:'⬛', 2:'🖼', 3:'◻️', 4:'✦', 5:'T', 6:'🔊', 13:'📷' };

  let html = `<div class="lcp-header">
    <span class="lcp-title">Layers &amp; Colours</span>
    <button id="lcUnisolateBtn" class="lcp-unisolate-btn" style="display:${lcIsolatedIdx !== null ? 'flex' : 'none'}">
      ⊙ Show All
    </button>
  </div>`;

  animData.layers.forEach((layer, idx) => {
    const name    = layer.nm || `Layer ${idx + 1}`;
    const colors  = extractLayerColors(layer);
    const isIso   = lcIsolatedIdx === idx;
    const icon    = ICONS[layer.ty] || '◻️';
    const nameEsc = name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const nameTrn = name.length > 22 ? name.slice(0, 21) + '…' : name;

    html += `<div class="lcp-block${isIso ? ' lcp-isolated' : ''}" data-idx="${idx}">
      <div class="lcp-head">
        <canvas class="lcp-thumb" data-idx="${idx}" width="36" height="36"></canvas>
        <span class="lcp-icon">${icon}</span>
        <span class="lcp-name" title="${nameEsc}">${nameTrn}</span>
        <div class="lcp-actions">
          <button class="lcp-iso-btn${isIso ? ' lcp-iso-on' : ''}" data-idx="${idx}" title="Isolate layer">⊙</button>
          <button class="lcp-vis-btn" data-idx="${idx}" title="Toggle visibility">${layer.hd ? '🙈' : '👁'}</button>
        </div>
      </div>`;

    if (colors.length) {
      html += `<div class="lcp-colors">`;
      colors.forEach((c, ci) => {
        const lbl = (c.label || 'Color').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const lb2 = lbl.length > 20 ? lbl.slice(0,19)+'…' : lbl;
        html += `<div class="lcp-row">
          <div class="lcp-sw-wrap">
            <div class="lcp-sw" style="background:${c.hex}"></div>
            <input type="color" class="lcp-ci" value="${c.hex}" data-li="${idx}" data-ci="${ci}">
          </div>
          <span class="lcp-lbl">${lb2}</span>
          <span class="lcp-hex">${c.hex}</span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="lcp-none">No editable colours</div>`;
    }
    html += `</div>`;
  });

  el.innerHTML = html;

  // Draw thumbs
  requestAnimationFrame(() => {
    el.querySelectorAll('.lcp-thumb').forEach(canvas => {
      const i = parseInt(canvas.dataset.idx);
      if (animData.layers[i]) lcDrawThumb(canvas, animData.layers[i]);
    });
  });

  // Isolate buttons
  el.querySelectorAll('.lcp-iso-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (lcIsolatedIdx === idx) lcUnisolate(); else lcIsolate(idx);
    });
  });

  // Visibility
  el.querySelectorAll('.lcp-vis-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const layer = animData.layers[parseInt(btn.dataset.idx)];
      if (!layer) return;
      pushHistory(); layer.hd = !layer.hd;
      reloadAnim(); renderLayerColorsPanel();
    });
  });

  // Unisolate
  $('lcUnisolateBtn')?.addEventListener('click', lcUnisolate);

  // Colour pickers
  el.querySelectorAll('.lcp-ci').forEach(inp => {
    let snapped = false;
    inp.addEventListener('input', () => {
      if (!snapped) { pushHistory(); snapped = true; }
      const li = parseInt(inp.dataset.li), ci = parseInt(inp.dataset.ci);
      const layer = animData.layers[li]; if (!layer) return;
      const colors = extractLayerColors(layer); if (!colors[ci]) return;
      const { r, g, b } = hexToNorm(inp.value);
      const ref = colors[ci].ref;
      if (ref.s && Array.isArray(ref.s)) { ref.s[0]=r; ref.s[1]=g; ref.s[2]=b; }
      else if (Array.isArray(ref.k)) { ref.k[0]=r; ref.k[1]=g; ref.k[2]=b; }
      // Update swatch
      const sw = inp.previousElementSibling; if (sw) sw.style.background = inp.value;
      const hexSpan = inp.closest('.lcp-row')?.querySelector('.lcp-hex');
      if (hexSpan) hexSpan.textContent = inp.value;
      reloadAnim();
    });
    inp.addEventListener('change', () => { snapped = false; });
  });
}

/* ═══════════════════════════════════════════════
   2. MP4 / WebM EXPORT
   ═══════════════════════════════════════════════ */
const mp4Cfg = { bg: '#000000', transparent: false, scale: 1, fps: 30, quality: 'medium' };
let mp4Busy = false, mp4Cancel = false;

function mp4UpdateInfo() {
  const el = $('mp4Info'); if (!el || !animData) return;
  const ip=animData.ip||0, op=animData.op||60, fr=animData.fr||30;
  const secs=(op-ip)/fr, fps=Math.min(mp4Cfg.fps, fr);
  const w=Math.round((animData.w||512)*mp4Cfg.scale), h=Math.round((animData.h||512)*mp4Cfg.scale);
  el.textContent = `${w}×${h} · ${fps}fps · ${secs.toFixed(2)}s · bg: ${mp4Cfg.transparent?'transparent':mp4Cfg.bg}`;
}

function mp4InitModal() {
  // Background colour
  const transCb  = $('mp4Transp');
  const bgColor  = $('mp4BgColor');
  const bgHex    = $('mp4BgHex');
  const bgSwatch = $('mp4BgSwatch');
  const bgWrap   = $('mp4BgWrap');

  const syncBg = () => { bgSwatch.style.background = bgColor.value; mp4Cfg.bg = bgColor.value; mp4UpdateInfo(); };
  bgColor.addEventListener('input', () => { bgHex.value = bgColor.value.toUpperCase(); syncBg(); });
  bgHex.addEventListener('input', () => {
    let v = bgHex.value.trim(); if (!v.startsWith('#')) v = '#' + v;
    if (isValidHex(v)) { bgColor.value = v; syncBg(); }
  });
  transCb.addEventListener('change', () => {
    mp4Cfg.transparent = transCb.checked;
    bgWrap.style.opacity = transCb.checked ? '0.4' : '1';
    bgWrap.style.pointerEvents = transCb.checked ? 'none' : '';
    mp4UpdateInfo();
  });
  syncBg();

  // Segmented buttons
  ['mp4ScaleSeg','mp4FpsSeg','mp4QualSeg'].forEach(segId => {
    $(segId)?.addEventListener('click', e => {
      const btn = e.target.closest('[data-v]'); if (!btn) return;
      $(segId).querySelectorAll('[data-v]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = $(segId).dataset.cfg, val = btn.dataset.v;
      mp4Cfg[key] = isNaN(val) ? val : parseFloat(val);
      mp4UpdateInfo();
    });
  });

  $('mp4GoBtn').addEventListener('click', mp4Start);
  $('mp4CancelBtn').addEventListener('click', () => {
    if (mp4Busy) mp4Cancel = true;
    else closeModal('mp4-modal');
  });
}

async function mp4Start() {
  if (mp4Busy || !animData) return;
  const goBtn  = $('mp4GoBtn'), canBtn = $('mp4CancelBtn');
  const progRow= $('mp4ProgRow'), progFill=$('mp4ProgFill'), progText=$('mp4ProgText');
  mp4Busy=true; mp4Cancel=false;
  goBtn.disabled=true; canBtn.textContent='Stop';
  progRow.style.display='block';
  const setP=(p,t)=>{ progFill.style.width=(p*100).toFixed(1)+'%'; if(t)progText.textContent=t; };
  setP(0,'Preparing…');

  const ip=animData.ip||0, op=animData.op||60, fr=animData.fr||30;
  const totalSrc=Math.max(1,op-ip), secs=totalSrc/fr;
  const outFps=Math.min(mp4Cfg.fps,fr);
  const srcW=animData.w||512, srcH=animData.h||512;
  const W=Math.max(1,Math.round(srcW*mp4Cfg.scale)), H=Math.max(1,Math.round(srcH*mp4Cfg.scale));
  const bitrate={high:8e6,medium:3e6,low:1e6}[mp4Cfg.quality]||3e6;
  const want=mp4Cfg.transparent;
  const candidates = want
    ? ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
    : ['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  let mime='';
  for(const c of candidates){ if(MediaRecorder.isTypeSupported(c)){mime=c;break;} }
  if(!mime){ alert('MediaRecorder not supported in this browser'); mp4Finish(goBtn,canBtn,progRow); return; }
  const ext=mime.startsWith('video/webm')?'.webm':'.mp4';
  const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d',{alpha:want});
  const offDiv=document.createElement('div');
  offDiv.style.cssText=`position:fixed;left:-9999px;top:-9999px;width:${srcW}px;height:${srcH}px;opacity:0;pointer-events:none;`;
  document.body.appendChild(offDiv);
  let offAnim;
  try {
    offAnim=lottie.loadAnimation({container:offDiv,renderer:'svg',loop:false,autoplay:false,
      animationData:deepCopy(animData),
      rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:false}});
  } catch(e){ mp4Cleanup(offDiv,null); mp4Finish(goBtn,canBtn,progRow); alert('Lottie error: '+e.message); return; }
  await new Promise(res=>{ offAnim.isLoaded?res():offAnim.addEventListener('DOMLoaded',res); setTimeout(res,1500); });
  const offSvg=offDiv.querySelector('svg');
  if(!offSvg){ mp4Cleanup(offDiv,offAnim); mp4Finish(goBtn,canBtn,progRow); alert('SVG not found'); return; }
  offSvg.setAttribute('width',srcW); offSvg.setAttribute('height',srcH);
  const chunks=[];
  const stream=canvas.captureStream(outFps);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});
  rec.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
  const recDone=new Promise(res=>rec.onstop=res);
  rec.start(100);
  const totalF=Math.max(1,Math.round(secs*outFps)), msPerF=1000/outFps;
  setP(0,`Recording 0 / ${totalF}`);
  for(let i=0;i<totalF;i++){
    if(mp4Cancel) break;
    const t=totalF===1?0:i/(totalF-1);
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
      img.onload=()=>{ want?ctx.clearRect(0,0,W,H):(ctx.fillStyle=mp4Cfg.bg,ctx.fillRect(0,0,W,H)); ctx.drawImage(img,0,0,W,H); URL.revokeObjectURL(blobUrl); res(); };
      img.onerror=()=>{ URL.revokeObjectURL(blobUrl); res(); };
      img.src=blobUrl;
    });
    setP((i+1)/totalF*0.9,`Recording ${i+1} / ${totalF}`);
    await new Promise(r=>setTimeout(r,msPerF));
  }
  setP(0.9,'Finishing…'); rec.stop(); await recDone;
  mp4Cleanup(offDiv,offAnim);
  if(!mp4Cancel){
    const blob=new Blob(chunks,{type:mime});
    doDownload(blob,'animation'+ext);
    setP(1,'Done!'); setTimeout(()=>closeModal('mp4-modal'),800);
  }
  mp4Finish(goBtn,canBtn,progRow);
}
function mp4Cleanup(container,anim){ try{anim&&anim.destroy();}catch(_){} try{container?.parentNode?.removeChild(container);}catch(_){} }
function mp4Finish(go,can,pr){ mp4Busy=false;mp4Cancel=false; go.disabled=false; can.textContent='Cancel'; setTimeout(()=>pr.style.display='none',1200); }

/* ═══════════════════════════════════════════════
   3. MERGE TWO ANIMATIONS
   ═══════════════════════════════════════════════ */
let mergePendingData = null;

function mergeInitModal() {
  $('mergeBtn')?.addEventListener('click', () => {
    if (!animData) return alert('Load a Lottie file first.');
    mergePendingData = null;
    $('mergeDropInner').style.display  = 'flex';
    $('mergeLoadedInfo').style.display = 'none';
    $('mergeSettings').style.display   = 'none';
    $('mergeGoBtn').disabled = true;
    openModal('merge-modal');
  });

  $('mergeFileInput')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    mergeParseLottie(f, d => { mergePendingData = d; mergeShowLoaded(f.name); });
  });

  $('mergeChangeBtn')?.addEventListener('click', () => {
    mergePendingData = null;
    $('mergeDropInner').style.display  = 'flex';
    $('mergeLoadedInfo').style.display = 'none';
    $('mergeSettings').style.display   = 'none';
    $('mergeGoBtn').disabled = true;
  });

  const dz = $('mergeDropZone');
  dz?.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('merge-drag-over'); });
  dz?.addEventListener('dragleave', () => dz.classList.remove('merge-drag-over'));
  dz?.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('merge-drag-over');
    const f = e.dataTransfer.files[0];
    if (f) mergeParseLottie(f, d => { mergePendingData = d; mergeShowLoaded(f.name); });
  });

  // Z-order toggle
  $('mergeSettings')?.querySelectorAll('[data-zorder]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('mergeSettings').querySelectorAll('[data-zorder]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  $('mergeGoBtn')?.addEventListener('click', mergeDoMerge);
}

function mergeParseLottie(file, cb) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.tgs')) {
    file.arrayBuffer().then(buf => {
      try { cb(JSON.parse(pako.ungzip(new Uint8Array(buf), { to: 'string' }))); }
      catch(e) { alert('Failed to parse TGS: ' + e.message); }
    });
  } else {
    file.text().then(txt => {
      try { cb(JSON.parse(txt)); }
      catch(e) { alert('Failed to parse JSON: ' + e.message); }
    });
  }
}

function mergeShowLoaded(name) {
  $('mergeDropInner').style.display  = 'none';
  $('mergeLoadedInfo').style.display = 'flex';
  $('mergeFileName').textContent = name.replace(/\.(json|tgs)$/i, '');
  $('mergeFileInfo').textContent = `${mergePendingData.w||'?'}×${mergePendingData.h||'?'} · ${mergePendingData.fr||'?'}fps`;
  $('mergeLayerName').value = mergePendingData.nm || name.replace(/\.(json|tgs)$/i,'') || 'Merged';
  $('mergeSettings').style.display = 'block';
  $('mergeGoBtn').disabled = false;
}

function mergeDoMerge() {
  if (!animData || !mergePendingData) return;
  const posX   = parseFloat($('mergePosX').value) || 0;
  const posY   = parseFloat($('mergePosY').value) || 0;
  const scale  = parseFloat($('mergeScale').value) / 100 || 1;
  const name   = $('mergeLayerName').value || 'Merged';
  const onTop  = !$('mergeSettings').querySelector('[data-zorder="bottom"].active');

  pushHistory();
  if (!animData.assets) animData.assets = [];

  const prefix   = 'mf_' + Date.now() + '_';
  const assetMap = new Map();

  (mergePendingData.assets || []).forEach(asset => {
    const newId = prefix + (asset.id || Math.random().toString(36).slice(2));
    assetMap.set(asset.id, newId);
    const cloned = deepCopy(asset); cloned.id = newId;
    if (cloned.layers) cloned.layers.forEach(l => { if (l.refId && assetMap.has(l.refId)) l.refId = assetMap.get(l.refId); });
    animData.assets.push(cloned);
  });

  const precompId = prefix + 'precomp';
  const precomp   = { id: precompId, nm: name, fr: mergePendingData.fr, layers: deepCopy(mergePendingData.layers || []) };
  precomp.layers.forEach(l => { if (l.refId && assetMap.has(l.refId)) l.refId = assetMap.get(l.refId); });
  animData.assets.push(precomp);

  const maxInd = Math.max(0, ...animData.layers.map(l => l.ind || 0));
  const bW = animData.w || 512, bH = animData.h || 512;
  const sW = mergePendingData.w || 512, sH = mergePendingData.h || 512;
  const newLayer = {
    ddd:0, ind:maxInd+1, ty:0, nm:name, refId:precompId, sr:1,
    ks:{ o:{a:0,k:100}, r:{a:0,k:0},
         p:{a:0,k:[posX+bW/2, posY+bH/2, 0]},
         a:{a:0,k:[sW/2, sH/2, 0]},
         s:{a:0,k:[scale*100, scale*100, 100]} },
    ao:0, w:sW, h:sH, ip:animData.ip||0, op:animData.op||60, st:0, bm:0,
  };
  onTop ? animData.layers.unshift(newLayer) : animData.layers.push(newLayer);

  closeModal('merge-modal');
  afterDataChange();
  alert(`✓ Merged "${name}" into frame!`);
}

/* ═══════════════════════════════════════════════
   4. TOUCH TRANSFORM (move / pinch-scale / rotate)
   ═══════════════════════════════════════════════ */
const TT = { active:false, mode:'none', snapped:false, startX:0, startY:0, startPositions:[], startDist:0, startAngle:0, startScales:[], startRotations:[] };

function ttGetKV(prop) {
  if (!prop) return null;
  return prop.a===1&&Array.isArray(prop.k) ? prop.k[0]?.s : prop.k;
}
function ttSetKV(prop, val) {
  if (!prop) return;
  if (prop.a===1&&Array.isArray(prop.k)) prop.k.forEach(kf=>{ if(kf.s)kf.s=Array.isArray(val)?[...val]:[val]; });
  else prop.k = Array.isArray(val)?[...val]:val;
}
function ttGetScalar(prop) {
  if (!prop) return 0;
  if (prop.a===1&&Array.isArray(prop.k)) return prop.k[0]?.s?.[0]??0;
  return Array.isArray(prop.k)?prop.k[0]:prop.k??0;
}
function ttSetScalar(prop, val) {
  if (!prop) return;
  if (prop.a===1&&Array.isArray(prop.k)) prop.k.forEach(kf=>{ if(kf.s)kf.s[0]=val; if(kf.e)kf.e[0]=val; });
  else prop.k=val;
}
function ttDist(a,b){ const dx=a.clientX-b.clientX,dy=a.clientY-b.clientY; return Math.sqrt(dx*dx+dy*dy); }
function ttAngle(a,b){ return Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI; }

function ttGetLayers() {
  // We treat all visible layers as selectable via touch on the preview
  if (!animData || !animData.layers) return [];
  return animData.layers.filter(l => !l.hd && l.ks);
}

function initTouchTransform() {
  const player = $('anim');
  if (!player) return;
  player.addEventListener('touchstart',  ttStart,  { passive:false });
  player.addEventListener('touchmove',   ttMove,   { passive:false });
  player.addEventListener('touchend',    ttEnd,    { passive:false });
  player.addEventListener('touchcancel', ttEnd,    { passive:false });
}

function ttStart(e) {
  if (!animData) return;
  e.preventDefault();
  const layers = ttGetLayers();
  if (!layers.length) return;
  if (!TT.snapped) { pushHistory(); TT.snapped=true; }
  TT.active=true;

  if (e.touches.length===1) {
    TT.mode='move'; TT.startX=e.touches[0].clientX; TT.startY=e.touches[0].clientY;
    const rect = $('canvasWrap')?.getBoundingClientRect() || {width:512,height:512};
    const scX  = (animData.w||512)/rect.width, scY=(animData.h||512)/rect.height;
    TT.startPositions = layers.map(layer=>{
      const p=ttGetKV(layer.ks.p)||[0,0,0]; return{layer,x:p[0],y:p[1],scX,scY};
    });
  } else if (e.touches.length>=2) {
    TT.mode='pinch'; TT.startDist=ttDist(e.touches[0],e.touches[1]); TT.startAngle=ttAngle(e.touches[0],e.touches[1]);
    TT.startScales    = layers.map(layer=>{ const sc=ttGetKV(layer.ks.s)||[100,100,100]; return{layer,sx:sc[0],sy:sc[1],sz:sc[2]||100}; });
    TT.startRotations = layers.map(layer=>({ layer, r:ttGetScalar(layer.ks.r)||0 }));
  }
}

function ttMove(e) {
  if (!TT.active) return;
  e.preventDefault();
  if (TT.mode==='move'&&e.touches.length>=1) {
    const dx=e.touches[0].clientX-TT.startX, dy=e.touches[0].clientY-TT.startY;
    TT.startPositions.forEach(({layer,x,y,scX,scY})=>{
      if(!layer.ks.p) return;
      ttSetKV(layer.ks.p,[Math.round(x+dx*scX),Math.round(y+dy*scY),0]);
    });
    reloadAnim();
  } else if (TT.mode==='pinch'&&e.touches.length>=2) {
    const ratio = TT.startDist>0 ? ttDist(e.touches[0],e.touches[1])/TT.startDist : 1;
    const dAngle = ttAngle(e.touches[0],e.touches[1])-TT.startAngle;
    TT.startScales.forEach(({layer,sx,sy,sz})=>{
      if(!layer.ks.s) layer.ks.s={a:0,k:[100,100,100]};
      ttSetKV(layer.ks.s,[Math.round(sx*ratio*10)/10,Math.round(sy*ratio*10)/10,sz]);
    });
    TT.startRotations.forEach(({layer,r})=>{
      if(!layer.ks.r) layer.ks.r={a:0,k:0};
      ttSetScalar(layer.ks.r,Math.round((r+dAngle)*10)/10);
    });
    reloadAnim();
  }
}

function ttEnd(e) {
  if (!TT.active) return;
  if (e.touches.length===0) { TT.active=false; TT.mode='none'; TT.snapped=false; }
  else if (e.touches.length===1&&TT.mode==='pinch') {
    TT.mode='move'; TT.startX=e.touches[0].clientX; TT.startY=e.touches[0].clientY;
    const rect=$('canvasWrap')?.getBoundingClientRect()||{width:512,height:512};
    const scX=(animData.w||512)/rect.width, scY=(animData.h||512)/rect.height;
    TT.startPositions=ttGetLayers().map(layer=>{ const p=ttGetKV(layer.ks.p)||[0,0,0]; return{layer,x:p[0],y:p[1],scX,scY}; });
  }
}

/* ═══════════════════════════════════════════════
   WIRE UP — extend existing tab system + export
   ═══════════════════════════════════════════════ */

// Extend tab click handler to include layercolors tab
document.addEventListener('DOMContentLoaded', () => {
  // Layer colours tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === 'layercolors') {
      btn.addEventListener('click', () => renderLayerColorsPanel());
    }
  });

  // Re-render layer colours panel when data changes
  const origAfterDataChange = window._afterDataChange;

  // Init MP4 modal controls
  mp4InitModal();

  // Init merge modal
  mergeInitModal();

  // Init touch transform
  initTouchTransform();
});

// Override afterDataChange to also refresh layer panel if active
const _origAfterDataChange = afterDataChange;
function afterDataChange() {
  _origAfterDataChange();
  // If layer colours tab is active, refresh it
  if ($('tab-layercolors')?.classList.contains('active')) {
    renderLayerColorsPanel();
  }
}

// Override export menu to add MP4 button
const _origExportClick = $('exportMenuBtn')?.onclick;
$('exportMenuBtn')?.addEventListener('click', function handler() {
  // The existing listener fires first. We patch the modal content after it renders.
  setTimeout(() => {
    const box = $('exportModalBox');
    if (!box) return;
    // Add MP4 button if not already there
    if (!box.querySelector('#expMp4Btn')) {
      const mp4Btn = document.createElement('button');
      mp4Btn.id = 'expMp4Btn';
      mp4Btn.className = 'export-choice-btn export-choice-mp4';
      mp4Btn.innerHTML = `
        <span class="export-choice-icon">🎬</span>
        <span class="export-choice-info">
          <span class="export-choice-name">MP4 / WebM</span>
          <span class="export-choice-desc">Video with custom background</span>
        </span>
        <i class="ri-arrow-right-line export-choice-arrow"></i>`;
      mp4Btn.addEventListener('click', () => {
        closeModal('export-modal');
        mp4UpdateInfo();
        openModal('mp4-modal');
      });
      const btnList = box.querySelector('.export-btn-list');
      if (btnList) btnList.appendChild(mp4Btn);
    }
  }, 50);
}, false);
