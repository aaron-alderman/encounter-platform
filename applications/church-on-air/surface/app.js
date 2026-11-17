'use strict';
const $=id=>document.getElementById(id);const video=$('video');
let data,selected=0,mode='programme',activeField,renderPolling,formBaseline={};
const names={'2118035556764684571':'The overflow','2118033330834997550':'Perth revival','2112164997589774488':'Sunday service','2106759066815225895':'A place to call home','2048307680318750886':'All the glory'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tc=t=>{const f=Math.floor(Math.max(0,t)*25+.001);return [Math.floor(f/90000),Math.floor(f/1500)%60,Math.floor(f/25)%60,f%25].map(n=>String(n).padStart(2,'0')).join(':');};
const sec=n=>Number(n).toFixed(2).replace(/\.00$/,'');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5500);}
async function api(route,body){const response=await fetch(route,body?{method:'POST',headers:{'Content-Type':'application/json','X-Air-Token':data.token},body:JSON.stringify(body)}:undefined);const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed');return value;}
function receiptCurrent(){return data.receipt?.basis===data.plan.basis&&data.receipt?.projectHash===data.plan.projectHash&&data.receipt?.graphicsHash===data.plan.graphicsHash;}
async function load(initial=false){
 data=await api('/api/state');
 $('basis').textContent=data.plan.basis.slice(0,12);$('sequenceMeta').textContent=`${String(data.plan.shots.length).padStart(2,'0')} encounters · ${sec(data.plan.frames/data.plan.fps)} sec`;
 $('duration').textContent='/ '+tc(data.plan.frames/25);$('sourceCount').textContent=String(data.analysis.sources.length).padStart(2,'0');
 $('dirty').style.background=receiptCurrent()?'var(--green)':'var(--yellow)';
 $('renderStatus').textContent=data.job.status==='rendering'?'Rendering picture…':receiptCurrent()?'Rendered · source matched':'Source changed · render needed';
 $('export').disabled=data.job.status==='rendering';$('export').textContent=data.job.status==='rendering'?'Rendering…':'↗ Render film';
 $('sources').replaceChildren();
 for(const source of data.analysis.sources){
  const b=document.createElement('button');b.className='source-card';b.innerHTML=`<img src="/assets/thumb-${esc(source.id)}-30.jpg" alt="${esc(names[source.id])} source frame"><span><strong>${esc(names[source.id]||source.id)}</strong><small><i class="clip-dot"></i>${tc(source.duration).slice(3,8)} · ${source.bpmCandidate} bpm*</small></span>`;
  b.addEventListener('click',()=>sourcePreview(source));$('sources').append(b);
 }
 timeline();selectShot(Math.min(selected,data.plan.shots.length-1),false);
 if(initial&&data.receipt){video.src='/output/result.mp4?v='+data.receipt.sha256.slice(0,12);$('loading').hidden=true;}
 else if(initial){$('loading').hidden=false;video.style.display='none';}
 if(data.job.status==='rendering')pollRender();
}
function selectShot(index,seek=true){
 selected=index;const s=data.plan.shots[index];if(!s)return;
 $('selectedId').textContent=s.id.toUpperCase();$('selectedTitle').textContent=s.title;$('shotNumber').textContent=`${String(index+1).padStart(2,'0')} / ${String(data.plan.shots.length).padStart(2,'0')}`;
 formBaseline={title:s.title,in:sec(s.in),duration:sec(s.duration),layout:s.layout,transition:s.transition,tracking:s.tracking,caption:s.caption};
 for(const [k,v]of Object.entries(formBaseline))$('editForm').elements.namedItem(k).value=v;
 $('reason').textContent=s.reason;$('currentTreatment').textContent=`${s.layout.toUpperCase()} / ${s.tracking.toUpperCase()} TRACKING`;
 document.querySelectorAll('.shot').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index));});
 if(seek){programme();video.currentTime=s.timelineIn/25;updateTime();}
}
function timeline(){
 const total=data.plan.frames;$('pictureTrack').replaceChildren();$('graphicsTrack').replaceChildren();$('ticks').replaceChildren();$('audioGroups').replaceChildren();
 for(let t=0;t<=total/25;t+=5){const span=document.createElement('span');span.style.left=(t*25/total*100)+'%';span.textContent=tc(t).slice(3,8);$('ticks').append(span);}
 data.plan.shots.forEach((s,i)=>{
  const width=s.frames/total*100;const b=document.createElement('button');b.className='shot';b.style.width=`calc(${width}% - 2px)`;b.style.backgroundImage=`url('/assets/thumb-${s.clip}-${Math.floor(s.in/5)*5}.jpg')`;b.setAttribute('aria-label',`Shot ${i+1}, ${s.title}, ${sec(s.duration)} seconds`);b.innerHTML=`<strong>${esc(s.title)}</strong><small>${String(i+1).padStart(2,'0')} / ${sec(s.duration)}s</small>`;b.addEventListener('click',()=>selectShot(i));$('pictureTrack').append(b);
  const block=document.createElement('button');block.className='graphic-block'+(s.layout==='full'?' rest':'');block.style.width=`calc(${width}% - 2px)`;block.textContent=s.layout==='full'?'SPACE / OPEN PICTURE':`${s.transition.toUpperCase()} · ${s.layout.toUpperCase()}`;block.title=`${s.tracking} tracking / ${s.transition}`;block.onclick=()=>selectShot(i);$('graphicsTrack').append(block);
 });
 let groups=[];for(const s of data.plan.shots){if(s.audioContinuous)groups[groups.length-1].frames+=s.frames;else groups.push({clip:s.clip,frames:s.frames});}
 for(const g of groups){const block=document.createElement('div');block.style.width=g.frames/total*100+'%';block.textContent=names[g.clip];$('audioGroups').append(block);}
 requestAnimationFrame(drawWaveform);updateTime();
}
function drawWaveform(){
 const canvas=$('waveform'),rect=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(rect.width*devicePixelRatio));canvas.height=Math.round(54*devicePixelRatio);const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.strokeStyle='#82c8ab';c.lineWidth=Math.max(1,devicePixelRatio);
 const src=Object.fromEntries(data.analysis.sources.map(s=>[s.id,s]));
 for(let x=0;x<w;x+=2*devicePixelRatio){const frame=x/w*data.plan.frames,s=data.plan.shots.find(s=>frame>=s.timelineIn&&frame<s.timelineOut);if(!s)continue;const o=src[s.clip],t=s.in+(frame-s.timelineIn)/25,idx=Math.min(599,Math.max(0,Math.floor(t/o.analyzedSeconds*600))),level=Math.min(1,o.waveform[idx]*3);c.beginPath();c.moveTo(x,h/2-level*h*.42);c.lineTo(x,h/2+level*h*.42);c.stroke();}
}
function updateTime(){
 $('tc').textContent=tc(video.currentTime||0);const p=mode==='programme'?Math.min(1,(video.currentTime||0)/(data?.plan.frames/25||1)):0;const track=$('pictureTrack'),r=track.getBoundingClientRect(),parent=$('timeline').getBoundingClientRect();$('playhead').style.left=(r.left-parent.left+p*r.width)+'px';
 $('play').textContent=video.paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',video.paused?'Play':'Pause');
}
function programme(){if(mode!=='programme'){video.pause();video.src='/output/result.mp4?v='+(data.receipt?.sha256.slice(0,12)||'none');mode='programme';$('viewerTitle').textContent='Programme monitor';$('loading').hidden=!!data.receipt;video.style.display=data.receipt?'block':'none';}}
function sourcePreview(source){mode='source';video.pause();video.style.display='block';$('loading').hidden=true;video.src='/media/'+source.id+'.mp4';video.currentTime=0;$('viewerTitle').textContent='Source · '+names[source.id];toast('Source monitor: unprocessed footage and original audio. Use Programme to return to the cut.');}
function showDetails(title,eyebrow,html){$('detailTitle').textContent=title;$('detailEyebrow').textContent=eyebrow;$('detailContent').innerHTML=html;$('details').showModal();}
function inspectSelected(){const shot=data.plan.shots[selected],projection=data.projections.find(p=>p.source===shot.id);showDetails(shot.title,'ENCOUNTER / SOURCE CORRESPONDENCE',`<p>The visible shot and CLI refer to the same authored source identity. Direct edits are forward-verified by the retained Encounter runtime, then checked against the broadcast planning laws.</p><pre>${esc(JSON.stringify({shot,declaredEditRoutes:projection.edits,sourceOwners:['source/composition.encounter','source/composition.rel'],basis:data.plan.basis},null,2))}</pre><p>Local source replacement retains a predecessor. It does not implement signed-human platform retention or certify general authoring admission.</p>`);}
function analysisDetails(){
 showDetails('Rhythm, space & sequence','DIRECTOR’S ANALYSIS',`<p>First, acquire a signal. Then invite, accelerate, open the room, breathe, and come home. The 13.36-second worship centre drops the enclosure and most of the motion. The held invitation is deliberately longer than a logo sting.</p><div class="detail-grid"><div><h3>Measured observations</h3>${data.analysis.sources.map(s=>`<div class="analysis-source"><h3>${esc(names[s.id])}</h3><p><strong>${s.bpmCandidate} BPM candidate</strong> · ${sec(s.analyzedSeconds)} seconds observed<br>Phase candidate ${s.phaseCandidate}s · original source ${tc(s.duration).slice(3,8)}</p><p>${esc(s.tempoConfidence)}</p></div>`).join('')}</div><div><h3>Editorial decisions</h3>${data.plan.shots.map(s=>`<div class="analysis-source"><h3>${esc(s.title)}</h3><p><strong>${tc(s.timelineIn/25)} → ${tc(s.timelineOut/25)}</strong><br>${esc(s.reason)}</p></div>`).join('')}</div></div><p>${esc(data.analysis.method)}. ${esc(data.analysis.limits)}</p>`);
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));if(button.dataset.tab==='analysis')analysisDetails();if(button.dataset.tab==='source')inspectSelected();}));
$('closeDetails').onclick=()=>$('details').close();$('details').addEventListener('click',e=>{if(e.target===$('details'))$('details').close();});
$('inspectSelected').onclick=inspectSelected;$('showSources').onclick=analysisDetails;
$('fit').onclick=()=>{document.body.classList.toggle('theatre');requestAnimationFrame(updateTime);};
$('returnFilm').onclick=()=>{programme();updateTime();};
$('play').onclick=()=>{if(!video.src)return;video.paused?video.play().catch(e=>toast(e.message)):video.pause();};
$('back').onclick=()=>{video.pause();video.currentTime=Math.max(0,video.currentTime-1/25);};
$('forward').onclick=()=>{video.pause();video.currentTime=Math.min(video.duration||0,video.currentTime+1/25);};
$('previous').onclick=()=>selectShot(Math.max(0,selected-1));$('next').onclick=()=>selectShot(Math.min(data.plan.shots.length-1,selected+1));
$('mute').onclick=()=>{video.muted=!video.muted;$('mute').textContent=video.muted?'⊘':'♫';$('mute').setAttribute('aria-label',video.muted?'Unmute church audio':'Mute church audio');};
for(const event of ['timeupdate','play','pause','seeked','loadedmetadata'])video.addEventListener(event,updateTime);
video.addEventListener('error',()=>{if(mode==='programme'){$('loading').hidden=false;toast('The programme file is unavailable. Render the current composition.');}});
$('ruler').addEventListener('click',e=>{const r=$('ticks').getBoundingClientRect();if(e.clientX<r.left)return;programme();video.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*data.plan.frames/25;});
$('zoom').oninput=()=>{$('timeline').style.width=(Number($('zoom').value)*100)+'%';requestAnimationFrame(()=>{drawWaveform();updateTime();});};
window.addEventListener('resize',()=>{if(data){drawWaveform();updateTime();}});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)||$('details').open)return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.key==='ArrowLeft'){$('back').click();e.preventDefault();}if(e.key==='ArrowRight'){$('forward').click();e.preventDefault();}});
$('editForm').addEventListener('focusin',e=>{activeField=e.target.name;});
$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=new FormData(e.target),changes=[...form.entries()].filter(([k,v])=>v!==formBaseline[k]);
 if(!changes.length)return toast('The selected shot already matches these source values.');
 if(changes.length>1)return toast('Apply one field at a time so each source change has its own checked proposal.');
 const [field,value]=changes[0],button=e.target.querySelector('button');button.disabled=true;
 try{await api('/api/edit',{shot:data.plan.shots[selected].id,field,value,expectedBasis:data.plan.basis});await load();toast('Encounter source updated and forward-verified. Render to update the picture.');}catch(error){toast(error.message);}finally{button.disabled=false;}
});
function pollRender(){if(renderPolling)return;renderPolling=setInterval(async()=>{try{const next=await api('/api/state');data=next;if(next.job.status==='rendering')return;clearInterval(renderPolling);renderPolling=null;await load();if(next.job.status==='complete'){mode='source';programme();video.load();toast('Render complete. The programme monitor now shows the new picture.');}else if(next.job.status==='failed')toast(next.job.error);}catch(e){toast(e.message);clearInterval(renderPolling);renderPolling=null;}},2500);}
$('export').onclick=async()=>{try{await api('/api/render',{});await load();toast('Rendering the checked source. You can inspect the sequence while it runs.');}catch(e){toast(e.message);}};
load(true).catch(error=>{$('renderStatus').textContent='Source could not load';toast(error.message);});
