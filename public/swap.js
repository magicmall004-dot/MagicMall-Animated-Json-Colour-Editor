(function(){
'use strict';

const $=s=>document.querySelector(s);
let data=null,refs=[],groups=[],anim=null,fname='sticker',tmr,cmpOn=false,hist=[],hi=-1;
let TU=[0,1,0],shown=null,seq=0,seeking=false,lastSeek=0,wasPlaying=false;
const fxEff=()=>document.documentElement.classList.contains('lite')||matchMedia('(prefers-reduced-motion:reduce)').matches?'lite':'full';
function ef(){const n=performance.now();if(seeking||n-lastSeek<(fxEff()==='full'?33:120))return;lastSeek=n;$('#swseek').value=anim.currentFrame}
function syncTune(){const[a,b,c]=TU;$('#swth').value=a;$('#swts').value=b*100;$('#swtl').value=c;$('#swth').nextElementSibling.textContent=a+'°';$('#swts').nextElementSibling.textContent=Math.round(b*100)+'%';$('#swtl').nextElementSibling.textContent=c}
const PRE=['#2AABEE','#FF3EA5','#7C5CFF','#22C55E','#FFB020','#FF5A4F','#FFFFFF','#111111'];

/* ---------- colour maths (OKLab / OKLCH) ---------- */
const cl=v=>Math.min(1,Math.max(0,v));
const lin=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const gam=c=>c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055;
function toLCH([r,g,b]){r=lin(cl(r));g=lin(cl(g));b=lin(cl(b));
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.0883024619*0+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 const L=.2104542553*l+.793617785*m-.0040720468*s,A=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
 return{L,C:Math.hypot(A,B),h:(Math.atan2(B,A)*180/Math.PI+360)%360}}
function lab2rgb(L,A,B){const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3;
 return[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]}
function fromLCH(L,C,h){L=cl(L);let o;for(let i=0;i<40;i++){const a=h*Math.PI/180;o=lab2rgb(L,C*Math.cos(a),C*Math.sin(a));
  if(o.every(v=>v>=-.001&&v<=1.001))break;C*=.94}
 return o.map(v=>gam(cl(v)))}
const hex=rgb=>'#'+rgb.map(v=>Math.round(cl(v)*255).toString(16).padStart(2,'0')).join('');
function parseHex(s){s=s.trim().replace('#','');if(/^[0-9a-f]{3}$/i.test(s))s=s.replace(/./g,'$&$&');if(!/^[0-9a-f]{6}$/i.test(s))return null;
 return[0,2,4].map(i=>parseInt(s.substr(i,2),16)/255)}

/* Shade-preserving recolour: anchor maps exactly to target, every other shade keeps its distance */
function adapt(m,a,t){
 let L=(m.L<=a.L&&a.L>.001)?m.L*t.L/a.L:t.L+(m.L-a.L)*(1-t.L)/Math.max(1-a.L,.001),C,h;
 if(a.C>.02){C=Math.min(m.C*Math.min(t.C/a.C,4),.4);const dh=((t.h-a.h+540)%360)-180;h=m.C>.02?m.h+dh:t.h}
 else{C=t.C*Math.max(0,1-Math.abs(L-t.L)*1.2);h=t.h}
 return fromLCH(L,C,h)}

/* ---------- read colours from Lottie ---------- */
function addRgb(arr,i){if([0,1,2].every(k=>typeof arr[i+k]==='number'))refs.push({arr,i,o:[arr[i],arr[i+1],arr[i+2]]})}
function prop(p,grad){
 if(!p||!Array.isArray(p.k))return;
 const each=a=>{if(!Array.isArray(a))return;if(grad){for(let j=0;j<grad;j++)addRgb(a,j*4+1)}else addRgb(a,0)};
 if(typeof p.k[0]==='number')each(p.k);else p.k.forEach(kf=>{if(kf){each(kf.s);each(kf.e)}})}
function walk(n){
 if(!n||typeof n!=='object')return;
 if(Array.isArray(n)){n.forEach(walk);return}
 if((n.ty==='fl'||n.ty==='st')&&n.c)prop(n.c,0);
 else if((n.ty==='gf'||n.ty==='gs')&&n.g)prop(n.g.k,n.g.p);
 for(const k in n)if(n[k]&&typeof n[k]==='object')walk(n[k])}

function nameOf({L,C,h}){
 if(C<.035||((L<.2||L>.93)&&C<.06))return L<.3?'Black':L<.55?'Dark grey':L<.82?'Grey':'White';
 const t=[[18,'Pink'],[42,'Red'],[70,'Orange'],[100,'Yellow'],[125,'Lime'],[165,'Green'],[195,'Teal'],[220,'Cyan'],[275,'Blue'],[325,'Purple'],[355,'Pink'],[361,'Red']];
 return t.find(x=>h<x[0])[1]}

function build(){
 const map=new Map();
 refs.forEach(r=>{const k=r.o.map(v=>v.toFixed(3)).join();let e=map.get(k);
  if(!e){e={rgb:r.o,lch:toLCH(r.o),refs:[]};map.set(k,e)}e.refs.push(r)});
 const cols=[...map.values()],bk={},chro=[],out=[];
 cols.forEach(c=>{const{L,C}=c.lch;
  if(C<.035||((L<.2||L>.93)&&C<.06)){const k=L<.38?'d':L<.82?'m':'l';(bk[k]=bk[k]||[]).push(c)}else chro.push(c)});
 out.push(...Object.values(bk));
 if(chro.length){
  chro.sort((a,b)=>a.lch.h-b.lch.h);let big=0,bi=0;
  chro.forEach((c,i)=>{const n=chro[(i+1)%chro.length];let d=n.lch.h-c.lch.h;if(d<=0)d+=360;if(d>big){big=d;bi=(i+1)%chro.length}});
  const ord=chro.slice(bi).concat(chro.slice(0,bi));let cur=[ord[0]];out.push(cur);
  for(let i=1;i<ord.length;i++){let d=ord[i].lch.h-ord[i-1].lch.h;if(d<0)d+=360;if(d>22){cur=[];out.push(cur)}cur.push(ord[i])}}
 groups=out.map((mem,id)=>{
  const anchor=mem.reduce((a,b)=>b.refs.length>a.refs.length?b:a);
  const g={id,mem,anchor:anchor.lch,hex:hex(anchor.rgb),t:hex(anchor.rgb),sel:false,k:1,count:mem.reduce((s,c)=>s+c.refs.length,0),name:nameOf(anchor.lch)};
  mem.forEach(c=>c.refs.forEach(r=>{r.g=g;r.lch=c.lch}));return g}).sort((a,b)=>b.count-a.count);
 const seen={};groups.forEach(g=>{seen[g.name]=(seen[g.name]||0)+1;if(seen[g.name]>1)g.name+=' '+seen[g.name]})}

/* ---------- apply + preview ---------- */
function apply(){
 groups.forEach(g=>{const rgb=parseHex(g.t);g.tl=(!cmpOn&&g.sel&&rgb&&g.t.toLowerCase()!==g.hex)?toLCH(rgb):null});
 refs.forEach(r=>{const g=r.g;let v=r.o;if(g.tl){const w=adapt(r.lch,g.anchor,g.tl);v=g.k<1?r.o.map((o,i)=>o+(w[i]-o)*g.k):w}
  if(!cmpOn&&(TU[0]||TU[1]!==1||TU[2])){const q=toLCH(v);v=fromLCH(q.L+TU[2]/100,q.C*TU[1],q.h+TU[0])}
  r.cur=v;r.arr[r.i]=+v[0].toFixed(4);r.arr[r.i+1]=+v[1].toFixed(4);r.arr[r.i+2]=+v[2].toFixed(4)});
 const gl=groups.filter(g=>g.tl).pop(),sg=$('#swstage');sg.classList.toggle('glow',!!gl);if(gl)sg.style.setProperty('--gc',gl.t);
 drawChips();clearTimeout(tmr);tmr=setTimeout(load,fxEff()==='full'?40:90)}
function load(){
 const z=pako.gzip(JSON.stringify(data),{level:6}).length,sz=$('#swsize');sz.textContent='TGS '+(z/1024).toFixed(1)+' / 64 KB';sz.style.color=z>65536?'#ffb020':'';
 const my=++seq,f=shown?shown.a.currentFrame:0,paused=shown?shown.a.isPaused:false;
 const el=document.createElement('div');el.className='swlot';$('#swstage').insertBefore(el,$('#swempty'));
 const n=lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:false,animationData:JSON.parse(JSON.stringify(data))});
 n.addEventListener('DOMLoaded',()=>{
  if(my!==seq){n.destroy();el.remove();return}
  const prev=shown;shown={a:n,el};anim=n;n.setSubframe(fxEff()==='full');n.addEventListener('enterFrame',ef);
  paused?n.goToAndStop(f,true):n.goToAndPlay(f,true);
  if(prev){prev.a.destroy();prev.el.remove()}})}
/* ---------- UI ---------- */
function drawChips(en){
 const cc=$('#swchips');if(en){cc.classList.add('enter');setTimeout(()=>cc.classList.remove('enter'),900)}
 cc.innerHTML=groups.map((g,n)=>{
  const sh=[...g.mem].sort((a,b)=>a.lch.L-b.lch.L).map(c=>hex(c.refs[0].cur||c.rgb));
  const bg=sh.length>1?`linear-gradient(90deg,${sh.join(',')})`:sh[0];
  return`<button class="chip ${g.sel?'on':''}" data-id="${g.id}" style="--i:${n}" aria-pressed="${g.sel}"><i style="background:${bg}"></i><b>${g.name}</b><small>${g.mem.length} shade${g.mem.length>1?'s':''}</small><em>✓</em></button>`}).join('')}
function drawRows(){
 const s=groups.filter(g=>g.sel);
 $('#swrows').innerHTML=s.length?s.map(g=>`<div class="row" data-id="${g.id}">
  <div class="pair"><div class="sw" style="background:${g.hex}" title="Original"></div><span class="arrow">→</span>
  <label class="sw" style="background:${g.t}" data-new><input type="color" value="${g.t}" aria-label="Pick new ${g.name}"></label></div>
  <div class="fields"><input class="hex" value="${g.t}" maxlength="7" spellcheck="false" aria-label="${g.name} colour code"><button class="btn" data-undo>Reset</button></div>
  <div class="dots">${PRE.map(c=>`<button data-c="${c}" style="background:${c}" aria-label="Use ${c}"></button>`).join('')}</div>
  <label class="str">Strength<input type="range" min="0" max="100" value="${Math.round(g.k*100)}"><b>${Math.round(g.k*100)}%</b></label>
  <div class="meta">${g.name} · original ${g.hex.toUpperCase()} · ${g.mem.length} shade${g.mem.length>1?'s':''} follow</div></div>`).join(''):
  '<div class="hint">Pick a colour on the right to start swapping.</div>'}
function setT(g,h,row,skipText){
 g.t=h;if(row){row.querySelector('[data-new]').style.background=h;row.querySelector('input[type=color]').value=h;
  if(!skipText)row.querySelector('.hex').value=h}apply()}
function commit(){const s=JSON.stringify([groups.map(g=>[g.sel,g.t,g.k]),TU]);if(s===hist[hi])return;hist=hist.slice(0,hi+1);hist.push(s);hi=hist.length-1;hb()}
function hb(){$('#swundo').disabled=hi<1;$('#swredo').disabled=hi>=hist.length-1}
function go(d){const n=hi+d;if(!data||n<0||n>=hist.length)return;hi=n;{const[S,T]=JSON.parse(hist[hi]);S.forEach((v,i)=>Object.assign(groups[i],{sel:v[0],t:v[1],k:v[2]}));TU=T;syncTune()}hb();drawChips();drawRows();apply()}
const gOf=el=>{const row=el.closest('.row');return row?[row,groups.find(x=>x.id==row.dataset.id)]:[]};
$('#swchips').onclick=e=>{const c=e.target.closest('.chip');if(!c)return;const g=groups.find(x=>x.id==c.dataset.id);g.sel=!g.sel;if(!g.sel){g.t=g.hex;g.k=1}drawChips();drawRows();apply();commit()};
$('#swrows').addEventListener('input',e=>{const[row,g]=gOf(e.target);if(!g)return;const t=e.target;
 if(t.type==='color')setT(g,t.value,row);
 else if(t.type==='range'){g.k=t.value/100;t.nextElementSibling.textContent=t.value+'%';apply()}
 else if(t.classList.contains('hex')){const v=t.value.trim().replace('#',''),rgb=parseHex(v);t.classList.toggle('bad',!rgb);if(rgb&&v.length===6)setT(g,hex(rgb),row,true)}});
$('#swrows').addEventListener('change',e=>{const[row,g]=gOf(e.target);if(!g)return;
 if(e.target.classList.contains('hex')){const rgb=parseHex(e.target.value);if(rgb)setT(g,hex(rgb),row);else e.target.value=g.t;e.target.classList.remove('bad')}commit()});
$('#swrows').addEventListener('click',e=>{const[row,g]=gOf(e.target);const t=e.target.closest('button');if(!g||!t)return;
 if(t.dataset.c){setT(g,t.dataset.c.toLowerCase(),row);commit()}
 else if('undo' in t.dataset){g.t=g.hex;g.k=1;drawRows();apply();commit()}});
$('#swreset').onclick=()=>{TU=[0,1,0];syncTune();groups.forEach(g=>{g.sel=false;g.t=g.hex;g.k=1});drawChips();drawRows();apply();commit()};
$('#swundo').onclick=()=>go(-1);$('#swredo').onclick=()=>go(1);
const cb=$('#swcmp'),cmp=v=>{if(cmpOn!==v){cmpOn=v;apply()}};
cb.addEventListener('pointerdown',e=>{e.preventDefault();cmp(true)});['pointerup','pointerleave','pointercancel'].forEach(n=>cb.addEventListener(n,()=>cmp(false)));cb.oncontextmenu=e=>e.preventDefault();
function info(){$('#swseek').max=Math.round(data.op-data.ip);$('#swseek').value=0;const d=(data.op-data.ip)/data.fr,w=[];if(data.w!==512||data.h!==512)w.push('Telegram stickers need 512×512');if(data.fr>60)w.push('max 60 fps');if(d>3.05)w.push('max 3 s');
 $('#swinfo').innerHTML=data.w+'×'+data.h+' · '+data.fr+' fps · '+d.toFixed(1)+' s<br>'+(w.length?'<span class="warn">'+w.join(' · ')+'</span>':'Fits the Telegram sticker format')}
$('#swbgs').onclick=e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('#swbgs button').forEach(x=>x.classList.toggle('on',x===b));$('#swstage').className='stage bg-'+b.dataset.bg};
$('#swplay').onclick=()=>{if(!anim)return;anim.isPaused?anim.play():anim.pause();$('#swplay').textContent=anim.isPaused?'Pause':'Play'};

function toast(m){const t=$('#swtoast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
async function openFile(f){
 if(!f)return;
 try{const u=new Uint8Array(await f.arrayBuffer());
  const txt=(u[0]===0x1f&&u[1]===0x8b)?pako.ungzip(u,{to:'string'}):new TextDecoder().decode(u);
  const d=JSON.parse(txt);if(!Array.isArray(d.layers))throw 0;
  data=d;fname=f.name.replace(/\.(json|tgs)$/i,'');refs=[];walk(data);
  if(!refs.length){toast('No colours found in this file');return}
  build();$('#swempty').style.display='none';
  ['play','cmp','seek','reset','dlJson','dlTgs'].forEach(i=>$('#sw'+i).disabled=false);$('#swplay').textContent='Pause';
  if(shown){shown.a.destroy();shown.el.remove();shown=null}anim=null;TU=[0,1,0];syncTune();hist=[];hi=-1;commit();info();drawChips(true);drawRows();load();toast(groups.length+' colour groups found')
 }catch(err){toast('Could not read that file. Use a Lottie .json or .tgs')}}
$('#swfile').onchange=e=>{openFile(e.target.files[0]);e.target.value=''};
$('#swopen').onclick=$('#swopen2').onclick=()=>$('#swfile').click();
const st=$('#swstage');
['dragenter','dragover'].forEach(n=>st.addEventListener(n,e=>{e.stopPropagation();e.preventDefault();st.classList.add('over')}));
['dragleave','drop'].forEach(n=>st.addEventListener(n,e=>{e.stopPropagation();e.preventDefault();st.classList.remove('over')}));
st.addEventListener('drop',e=>openFile(e.dataTransfer.files[0]));
st.addEventListener('click',e=>{if(!data||!e.target.closest('.swlot'))return;
 const cs=getComputedStyle(e.target);let f=cs.fill;if(!f||f==='none')f=cs.stroke;
 const m=f&&f.match(/url\(["']?#([^"')]+)/);if(m){const s=document.getElementById(m[1]);const sp=s&&s.querySelector('stop');f=sp&&(sp.getAttribute('stop-color')||sp.style.stopColor)}
 if(!f||f==='none'){toast('Tap a coloured shape');return}
 const p=document.createElement('i');p.style.color=f;document.body.append(p);const c=getComputedStyle(p).color.match(/[\d.]+/g);p.remove();if(!c)return;
 const t=c.slice(0,3).map(v=>v/255);let best,bd=9;
 groups.forEach(g=>g.mem.forEach(M=>{const q=M.refs[0].cur||M.rgb,d=Math.hypot(q[0]-t[0],q[1]-t[1],q[2]-t[2]);if(d<bd){bd=d;best=g}}));
 if(best){best.sel=true;drawChips();drawRows();commit();toast('Picked '+best.name)}});
addEventListener('keydown',e=>{if(document.body.dataset.view!=='swap')return;const tg=e.target.tagName,m=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
 if(m&&k==='z'){e.preventDefault();go(e.shiftKey?1:-1)}else if(m&&k==='y'){e.preventDefault();go(1)}
 else if(e.key===' '&&data&&tg!=='INPUT'&&tg!=='BUTTON'){e.preventDefault();$('#swplay').click()}});

function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function out(blob,name){if(window.doDownload)return window.doDownload(blob,name);save(blob,name)}
$('#swdlJson').onclick=()=>out(new Blob([JSON.stringify(data)],{type:'application/json'}),fname+'-recolour.json');
$('#swdlTgs').onclick=()=>{const z=pako.gzip(JSON.stringify(data),{level:9});if(z.length>65536)toast('TGS is '+(z.length/1024).toFixed(1)+' KB. Telegram limit is 64 KB');out(new Blob([z]),fname+'-recolour.tgs')};

['th','ts','tl'].forEach(i=>{$('#sw'+i).addEventListener('input',()=>{TU=[+$('#swth').value,$('#swts').value/100,+$('#swtl').value];syncTune();apply()});$('#sw'+i).addEventListener('change',commit)});
$('#swmagic').onclick=()=>{if(!data)return;const sp=$('#swsch').value.split(',').map(Number),h0=Math.random()*360;let i=0;
 groups.forEach(g=>{g.sel=true;g.k=1;const a=g.anchor;g.t=hex(a.C>.04?fromLCH(a.L,Math.min(.2,a.C*.9+.04),h0+sp[i++%sp.length]):fromLCH(a.L,a.L>.05&&a.L<.95?.03:.012,h0))});
 drawChips();drawRows();apply();commit();toast('New palette. Tap again for another')};
const sk=$('#swseek');
sk.addEventListener('input',()=>{seeking=true;anim.goToAndStop(+sk.value,true);$('#swplay').textContent='Play'});
sk.addEventListener('change',()=>seeking=false);
document.addEventListener('visibilitychange',()=>{if(!anim)return;if(document.hidden){wasPlaying=!anim.isPaused;anim.pause()}else if(wasPlaying)anim.play()});
syncTune();

document.querySelectorAll('#viewSwitch [data-view]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.view;document.body.dataset.view=v;$('#swapView').hidden=v!=='swap';
 document.querySelectorAll('#viewSwitch [data-view]').forEach(x=>x.classList.toggle('active',x===b));if(v!=='swap'&&anim)anim.pause();else if(anim&&!wasPlaying)anim.play();window.scrollTo({top:0})}));

})();
