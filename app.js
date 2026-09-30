import { clamp, guessBackground, trimBounds, cropSprite, cellRect, spriteRect } from './core.js';
import { renderFoliage, foliagePalettes } from './foliage.js';

const $ = id => document.getElementById(id);
const state = { sprites:[], selected:null, view:'atlas', size:1024, columns:4, rows:4, padding:4, pixel:false, grid:true, zoom:'fit', background:0, source:null, groups:[], original:false, picking:false, processing:false };
const atlas=$('atlas-canvas'), actx=atlas.getContext('2d'), sourceCanvas=$('source-canvas'), sctx=sourceCanvas.getContext('2d');
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
const pending=new Map(); let sequence=0, spriteId=0, processingVersion=0, sourceVersion=0, processTimer, toastTimer, renderFrame=0, drag=null, listDrag=null;
const rpc=(type,payload={},transfer=[])=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({type,id,...payload},transfer);});
worker.onmessage=({data})=>{ const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.type==='error'?job.reject(new Error(data.message)):job.resolve(data); };
worker.onerror=()=>{for(const job of pending.values())job.reject(new Error('Image processing failed. Try a smaller image or reload the page.'));pending.clear();toast('Image processing is unavailable. Please reload the page.',true);};
function toast(message,error=false) { const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,error?8000:4500); }
const handle=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>toast(e.message||'Something went wrong.',true));
const selected=()=>state.sprites.find(s=>s.id===state.selected);
function newCanvas(width,height,data) { const c=document.createElement('canvas');c.width=width;c.height=height;if(data)c.getContext('2d').putImageData(new ImageData(data,width,height),0,0);return c; }
function resetSprite(s) {s.scale=100;s.offsetX=0;s.offsetY=0;}
function safeName(name) {return (name.replace(/\.[a-z0-9]+$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim()||'sprite').slice(0,80);}
function options() {
  const hex=$('bg-color').value;
  return { color:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),remove:$('remove-bg').checked,protectEnclosed:$('protect-enclosed').checked,tolerance:+$('tolerance').value,softness:+$('softness').value,defringe:+$('defringe').value,minArea:+$('min-area').value||1,mergeGap:+$('merge-gap').value||0,mode:$('detection').value,columns:+$('source-columns').value||1,rows:+$('source-rows').value||1 };
}
function syncExtractionLabels() {
  $('color-hex').textContent=$('bg-color').value;
  for(const key of ['tolerance','softness','defringe'])$(key+'-value').textContent=$(key).value+(key==='defringe'?' px':'');
  $('object-options').hidden=$('detection').value==='grid';$('source-grid-options').hidden=$('detection').value!=='grid';
}
function setView(view) {
  state.view=view;
  document.body.classList.toggle('editing-foliage',view==='foliage');
  for(const name of ['atlas','source','foliage']) { $('tab-'+name).classList.toggle('active',view===name);$('tab-'+name).setAttribute('aria-selected',String(view===name));$(name+'-view').hidden=view!==name; }
  $('atlas-settings').hidden=view!=='atlas';$('sprite-settings').hidden=view!=='atlas';$('export-settings').hidden=view!=='atlas';$('extraction-settings').hidden=view!=='source';$('foliage-settings').hidden=view!=='foliage';
  if(view==='foliage')updateFoliage();
  if(view==='atlas') {state.picking=false;$('pick-color').classList.remove('primary');}
  syncViewInfo();requestRender();requestAnimationFrame(resizePreviews);
}
function syncViewInfo() {const size=state.view==='foliage'?+$('foliage-size').value:state.size;$('view-info').textContent=state.view==='source'&&state.source?`${state.source.width} × ${state.source.height}`:`${size} × ${size}`;}
function syncAtlasSettings() {
  const count=state.sprites.length;
  $('columns').value=state.columns;$('rows').value=state.rows;$('atlas-size').value=state.size;$('padding').value=state.padding;
  const w=state.size/state.columns,h=state.size/state.rows;
  $('atlas-status').textContent=`${state.columns} × ${state.rows} grid · ${Math.floor(w)}${Math.floor(w)!==Math.floor(h)?' × '+Math.floor(h):''} px cells`;
  $('capacity-info').textContent=`${count} of ${state.columns*state.rows} slots used`;
  $('sprite-count').textContent=count;$('library-empty').hidden=count>0;$('library-tools').hidden=!count;$('atlas-empty').hidden=count>0;
  $('export-atlas').disabled=!count;$('export-json').disabled=!count;
  const slot=$('move-slot'),value=selected()?.slot;slot.replaceChildren();
  for(let i=0;i<state.columns*state.rows;i++) {const op=document.createElement('option');op.value=i;const occupying=state.sprites.find(s=>s.slot===i);op.textContent=`${i+1} · R${Math.floor(i/state.columns)+1} C${i%state.columns+1}${occupying&&occupying.id!==state.selected?' (swap)':''}`;slot.append(op);} if(value!==undefined)slot.value=value;
  syncViewInfo();
}
function syncSelection({light=false}={}) {
  const s=selected();$('selection-empty').hidden=!!s;$('selection-controls').hidden=!s;$('selected-slot').textContent=s?`SLOT ${s.slot+1}`:'—';
  for(const tile of $('sprite-list').children)tile.classList.toggle('selected',+tile.dataset.id===state.selected);
  if(!s)return;
  if(!light) {$('sprite-name').value=s.name;$('sprite-dimensions').textContent=`${s.width} × ${s.height} px · original cutout`;drawThumbnail($('sprite-preview'),s);$('move-slot').value=s.slot;}
  $('scale-number').value=Math.round(s.scale);$('scale-range').value=clamp(s.scale,5,300);$('offset-x').value=Math.round(s.offsetX);$('offset-y').value=Math.round(s.offsetY);
  $('clipping-warning').hidden=!spriteRect(s,cellRect(s.slot,state.size,state.columns,state.rows),state.padding).clipped;
}
function selectSprite(id) {state.selected=id;syncSelection();requestRender();}
function drawThumbnail(canvas,sprite) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=!state.pixel;
  const scale=Math.min((canvas.width-12)/sprite.width,(canvas.height-12)/sprite.height);const w=sprite.width*scale,h=sprite.height*scale;
  ctx.drawImage(sprite.canvas,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
}
function buildList() {
  $('sprite-list').replaceChildren();
  for(const s of [...state.sprites].sort((a,b)=>a.slot-b.slot)) {
    const tile=document.createElement('button');tile.type='button';tile.className='sprite-tile';tile.dataset.id=s.id;tile.draggable=true;tile.setAttribute('aria-label',`${s.name}, slot ${s.slot+1}`);
    const thumb=newCanvas(96,96);drawThumbnail(thumb,s);const info=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small');name.textContent=s.name;meta.textContent=`${s.width} × ${s.height} · #${s.slot+1}`;info.append(name,meta);tile.append(thumb,info);
    tile.addEventListener('click',()=>{selectSprite(s.id);setView('atlas');});
    tile.addEventListener('dragstart',e=>{listDrag=s.id;e.dataTransfer.setData('text/plain',String(s.id));e.dataTransfer.effectAllowed='move';});
    tile.addEventListener('dragover',e=>{if(listDrag!==null){e.preventDefault();tile.classList.add('drag-over');}});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag-over'));
    tile.addEventListener('drop',e=>{if(listDrag!==null){e.preventDefault();e.stopPropagation();moveSprite(listDrag,s.slot);listDrag=null;}});
    tile.addEventListener('dragend',()=>{listDrag=null;for(const el of $('sprite-list').children)el.classList.remove('drag-over');});
    $('sprite-list').append(tile);
  }
  syncAtlasSettings();syncSelection();requestRender();
}
function moveSprite(id,slot) {
  const s=state.sprites.find(s=>s.id===id),other=state.sprites.find(s=>s.slot===slot);if(!s)return;if(other&&other!==s)other.slot=s.slot;s.slot=slot;state.selected=s.id;buildList();
}
function ensureCapacity(extra) {
  const required=state.sprites.length+extra;if(required>1024)throw new Error('This atlas supports up to 1024 sprites. Remove some sprites before adding more.');
  if(required>state.columns*state.rows) {state.rows=Math.min(32,Math.ceil(required/state.columns));if(required>state.columns*state.rows)state.columns=Math.ceil(required/state.rows);}
}
function addSprites(items,prefix='sprite') {
  ensureCapacity(items.length);const occupied=new Set(state.sprites.map(s=>s.slot));let slot=0;
  for(const item of items) {while(occupied.has(slot))slot++;occupied.add(slot);const s={id:++spriteId,name:item.name||`${prefix}_${String(slot+1).padStart(3,'0')}`,width:item.width,height:item.height,canvas:item.canvas||newCanvas(item.width,item.height,new Uint8ClampedArray(item.buffer)),slot:slot++,scale:100,offsetX:0,offsetY:0};state.sprites.push(s);if(!state.selected)state.selected=s.id;}
  buildList();setView('atlas');toast(`${items.length} sprite${items.length===1?'':'s'} added to the atlas.`);
}
async function decode(file) {
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)&&! /\.(png|jpe?g|webp)$/i.test(file.name))throw new Error('Choose a PNG, JPEG or WebP image.');
  let image;
  try {image=await createImageBitmap(file);}catch {throw new Error(`Could not read ${file.name}. Choose a valid image file.`);}
  const {width,height}=image;
  if(width*height>16777216||width>8192||height>8192) {image.close();throw new Error('Image is too large. Use at most 16 megapixels and 8192 pixels per side.');}
  const canvas=newCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();return {width,height,canvas,data:ctx.getImageData(0,0,width,height).data};
}
async function loadSource(file) {
  const version=++sourceVersion;processingVersion++;state.processing=true;$('extract-sprites').disabled=true;$('source-status').textContent='Opening image…';
  try {
    const image=await decode(file);if(version!==sourceVersion)return;
    const guessed=guessBackground(image.data,image.width,image.height);$('bg-color').value='#'+guessed.color.map(v=>v.toString(16).padStart(2,'0')).join('');$('remove-bg').checked=!guessed.hasTransparentBorder;
    state.source={...image,name:safeName(file.name),cleaned:null};state.groups=[];sourceCanvas.width=image.width;sourceCanvas.height=image.height;state.original=false;state.picking=false;
    $('source-clean').classList.add('active');$('source-clean').setAttribute('aria-pressed','true');$('source-original').classList.remove('active');$('source-original').setAttribute('aria-pressed','false');$('pick-color').classList.remove('primary');$('source-empty').hidden=true;$('source-dot').hidden=false;$('pick-color').disabled=false;$('detected-count').textContent='Detecting…';syncExtractionLabels();
    const bytes=image.data.slice();await rpc('source',{buffer:bytes.buffer,width:image.width,height:image.height},[bytes.buffer]);if(version!==sourceVersion)return;setView('source');drawSource();scheduleProcess(0);
  } catch(e) {state.processing=false;state.source=null;$('source-empty').hidden=false;$('source-status').textContent='No source image';toast(e.message,true);}
}
async function importPNGs(files) {
  if(!files.length)return;ensureCapacity(files.length);const sprites=[];let skipped=0;
  for(const file of files) {
    const image=await decode(file),bounds=trimBounds(image.data,image.width,image.height);if(!bounds){skipped++;continue;}
    sprites.push({name:safeName(file.name),width:bounds.width,height:bounds.height,canvas:newCanvas(bounds.width,bounds.height,cropSprite(image.data,image.width,bounds))});
  }
  if(sprites.length)addSprites(sprites);if(skipped)toast(`${skipped} fully transparent image${skipped===1?' was':'s were'} skipped.`);
}
function scheduleProcess(delay=150) {
  syncExtractionLabels();if(!state.source)return;const version=++processingVersion;clearTimeout(processTimer);state.processing=true;$('extract-sprites').disabled=true;$('source-status').textContent='Cleaning and detecting…';$('detected-count').textContent='Detecting…';
  processTimer=setTimeout(handle(async()=>{
    const image=state.source;const result=await rpc('process',{options:options()});if(version!==processingVersion||state.source!==image)return;
    image.cleaned=newCanvas(image.width,image.height,new Uint8ClampedArray(result.buffer));state.groups=result.groups;state.processing=false;
    $('detected-count').textContent=`${state.groups.length} sprite${state.groups.length===1?'':'s'}`;$('extract-sprites').disabled=!state.groups.length;$('source-status').textContent=`${image.width} × ${image.height} px · ${state.groups.length} detected`;
    drawSource();
  }),delay);
}
async function extractSprites() {
  if(state.processing||!state.groups.length)return;ensureCapacity(state.groups.length);const version=processingVersion,prefix=state.source.name;$('extract-sprites').disabled=true;
  try {const result=await rpc('extract');if(version!==processingVersion)throw new Error('Extraction settings changed. Wait for the preview, then try again.');addSprites(result.sprites,prefix);}finally {$('extract-sprites').disabled=state.processing||!state.groups.length;}
}
function drawAtlas({guides=true,canvas=atlas}={}) {
  if(canvas.width!==state.size)canvas.width=state.size;if(canvas.height!==state.size)canvas.height=state.size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,state.size,state.size);ctx.imageSmoothingEnabled=!state.pixel;ctx.imageSmoothingQuality='high';
  for(const s of state.sprites) {
    const c=cellRect(s.slot,state.size,state.columns,state.rows),r=spriteRect(s,c,state.padding);
    ctx.save();ctx.beginPath();ctx.rect(r.clip.x,r.clip.y,r.clip.width,r.clip.height);ctx.clip();ctx.drawImage(s.canvas,r.x,r.y,r.width,r.height);ctx.restore();
  }
  if(!guides)return canvas;
  const displayScale=atlas.clientWidth/state.size||.5,line=1/displayScale;
  if(state.grid) {
    ctx.strokeStyle='#8492a460';ctx.lineWidth=line;ctx.beginPath();
    for(let col=1;col<state.columns;col++){const x=Math.floor(col*state.size/state.columns);ctx.moveTo(x,0);ctx.lineTo(x,state.size);}
    for(let row=1;row<state.rows;row++){const y=Math.floor(row*state.size/state.rows);ctx.moveTo(0,y);ctx.lineTo(state.size,y);}ctx.stroke();
    ctx.fillStyle='#d6e0ed99';ctx.font=`${11/displayScale}px ui-monospace,monospace`;
    for(const s of state.sprites){const c=cellRect(s.slot,state.size,state.columns,state.rows);ctx.fillText(String(s.slot+1).padStart(2,'0'),c.x+8/displayScale,c.y+17/displayScale);}
  }
  const s=selected();if(s) {
    const c=cellRect(s.slot,state.size,state.columns,state.rows),r=spriteRect(s,c,state.padding);
    ctx.fillStyle='#c5f36b08';ctx.fillRect(c.x,c.y,c.width,c.height);ctx.strokeStyle='#c5f36b';ctx.lineWidth=1.5/displayScale;ctx.strokeRect(c.x+line,c.y+line,c.width-2*line,c.height-2*line);
    const v=r.visible;
    if(v.width&&v.height){ctx.save();ctx.setLineDash([4/displayScale,4/displayScale]);ctx.strokeStyle='#e8ffc5a0';ctx.lineWidth=line;ctx.strokeRect(v.x,v.y,v.width,v.height);ctx.restore();const hs=10/displayScale;ctx.fillStyle='#c5f36b';ctx.strokeStyle='#142209';ctx.lineWidth=line;ctx.fillRect(v.x+v.width-hs/2,v.y+v.height-hs/2,hs,hs);ctx.strokeRect(v.x+v.width-hs/2,v.y+v.height-hs/2,hs,hs);}
  }
  return canvas;
}
function drawSource() {
  const image=state.source;if(!image){sctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);return;}
  sctx.clearRect(0,0,image.width,image.height);sctx.drawImage(state.original?image.canvas:(image.cleaned||image.canvas),0,0);
  const ratio=sourceCanvas.clientWidth/image.width||1;sctx.lineWidth=1.5/ratio;sctx.strokeStyle='#c5f36b';sctx.font=`${11/ratio}px ui-monospace,monospace`;
  for(let i=0;i<state.groups.length;i++) {const g=state.groups[i];sctx.strokeRect(g.x,g.y,g.width,g.height);const label=String(i+1),tw=sctx.measureText(label).width+8/ratio;const ty=Math.max(g.y,16/ratio);sctx.fillStyle='#16210e';sctx.fillRect(g.x,ty-16/ratio,tw,16/ratio);sctx.fillStyle='#d1f798';sctx.fillText(label,g.x+4/ratio,ty-4/ratio);}
  sourceCanvas.classList.toggle('picking',state.picking);
}
function requestRender() {if(renderFrame)return;renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(state.view==='atlas')drawAtlas();else if(state.view==='source')drawSource();});}
function resizePreviews() {
  for(const kind of ['atlas','source','foliage']) {
    if(state.view!==kind)continue;
    const stage=$(kind+'-stage'),wrap=$(kind+'-wrap'),style=getComputedStyle(stage),availableW=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2,availableH=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-2;
    const width=kind==='foliage'?+$('foliage-size').value:kind==='atlas'?state.size:(state.source?.width||1024),height=kind==='foliage'?width:kind==='atlas'?state.size:(state.source?.height||1024);
    const fit=Math.max(.01,Math.min(availableW/width,availableH/height));const ratio=kind==='atlas'&&state.zoom!=='fit'?+state.zoom:fit;
    wrap.style.width=Math.max(1,Math.round(width*ratio))+'px';wrap.style.height=Math.max(1,Math.round(height*ratio))+'px';
  }
  requestRender();
}
function canvasPoint(event,canvas) {const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};}
atlas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const p=canvasPoint(event,atlas),slot=Math.floor(clamp(p.y,0,state.size-1)*state.rows/state.size)*state.columns+Math.floor(clamp(p.x,0,state.size-1)*state.columns/state.size),s=state.sprites.find(s=>s.slot===slot);
  if(!s){selectSprite(null);return;}selectSprite(s.id);const r=spriteRect(s,cellRect(s.slot,state.size,state.columns,state.rows),state.padding),v=r.visible,hit=18*state.size/atlas.clientWidth;
  const scaling=Math.hypot(p.x-(v.x+v.width),p.y-(v.y+v.height))<hit;
  drag={id:s.id,x:p.x,y:p.y,offsetX:s.offsetX,offsetY:s.offsetY,scale:s.scale,scaling,startDistance:Math.hypot(p.x-(r.x+r.width/2),p.y-(r.y+r.height/2)),centerX:r.x+r.width/2,centerY:r.y+r.height/2};
  atlas.setPointerCapture(event.pointerId);atlas.focus({preventScroll:true});event.preventDefault();
});
atlas.addEventListener('pointermove',event=>{
  const p=canvasPoint(event,atlas);
  if(!drag){const s=selected();if(s){const v=spriteRect(s,cellRect(s.slot,state.size,state.columns,state.rows),state.padding).visible;atlas.style.cursor=Math.hypot(p.x-v.x-v.width,p.y-v.y-v.height)<18*state.size/atlas.clientWidth?'nwse-resize':'grab';}return;}
  const s=state.sprites.find(s=>s.id===drag.id);if(!s)return;
  if(drag.scaling)s.scale=clamp(drag.scale*Math.hypot(p.x-drag.centerX,p.y-drag.centerY)/Math.max(1,drag.startDistance),5,400);
  else {const c=cellRect(s.slot,state.size,state.columns,state.rows);s.offsetX=clamp(Math.round(drag.offsetX+p.x-drag.x),-c.width,c.width);s.offsetY=clamp(Math.round(drag.offsetY+p.y-drag.y),-c.height,c.height);}
  syncSelection({light:true});requestRender();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])atlas.addEventListener(name,()=>{drag=null;atlas.style.cursor='grab';});
atlas.addEventListener('keydown',event=>{
  const s=selected();if(!s)return;const delta=event.shiftKey?10:1;
  if(event.key==='ArrowLeft')s.offsetX-=delta;else if(event.key==='ArrowRight')s.offsetX+=delta;else if(event.key==='ArrowUp')s.offsetY-=delta;else if(event.key==='ArrowDown')s.offsetY+=delta;else return;
  event.preventDefault();syncSelection({light:true});requestRender();
});
atlas.addEventListener('dragover',event=>{if(listDrag!==null)event.preventDefault();});
atlas.addEventListener('drop',event=>{if(listDrag===null)return;event.preventDefault();event.stopPropagation();const p=canvasPoint(event,atlas);const slot=Math.floor(clamp(p.y,0,state.size-1)*state.rows/state.size)*state.columns+Math.floor(clamp(p.x,0,state.size-1)*state.columns/state.size);moveSprite(listDrag,slot);listDrag=null;});

sourceCanvas.addEventListener('pointerdown',event=>{
  if(!state.picking||!state.source)return;const p=canvasPoint(event,sourceCanvas),x=clamp(Math.floor(p.x),0,state.source.width-1),y=clamp(Math.floor(p.y),0,state.source.height-1),i=(y*state.source.width+x)*4;
  if(state.source.data[i+3]===0){toast('That pixel is already transparent. Pick an opaque background pixel.');return;}
  $('bg-color').value='#'+[0,1,2].map(c=>state.source.data[i+c].toString(16).padStart(2,'0')).join('');$('remove-bg').checked=true;state.picking=false;state.original=false;syncSourceToggle();$('pick-color').classList.remove('primary');$('source-hint').textContent='Background color sampled';scheduleProcess();drawSource();
});

function download(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportPNG() {
  if(!state.sprites.length)return;const button=$('export-atlas');button.disabled=true;button.textContent='Exporting…';
  try {const c=drawAtlas({guides:false,canvas:newCanvas(state.size,state.size)}),data=c.getContext('2d').getImageData(0,0,state.size,state.size).data,regions=state.sprites.map(s=>cellRect(s.slot,state.size,state.columns,state.rows));const result=await rpc('export',{buffer:data.buffer,width:state.size,height:state.size,bleed:+$('bleed').value||0,regions},[data.buffer]);download(result.blob,safeName($('filename').value)+'.png');toast('Transparent atlas exported. Preview guides are excluded.');}finally{button.textContent='Export PNG';button.disabled=!state.sprites.length;}
}
function exportJSON() {
  const frames={};const names=new Set();
  for(const s of [...state.sprites].sort((a,b)=>a.slot-b.slot)) {
    let name=s.name,index=2;while(names.has(name))name=`${s.name}_${index++}`;names.add(name);
    const cell=cellRect(s.slot,state.size,state.columns,state.rows),r=spriteRect(s,cell,state.padding);
    frames[name]={frame:{x:cell.x,y:cell.y,w:cell.width,h:cell.height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:cell.width,h:cell.height},sourceSize:{w:cell.width,h:cell.height},pivot:{x:.5,y:.5},slot:s.slot,content:{x:r.visible.x,y:r.visible.y,w:r.visible.width,h:r.visible.height},originalSize:{w:s.width,h:s.height},transform:{scale:s.scale,offsetX:s.offsetX,offsetY:s.offsetY},clipped:r.clipped};
  }
  const json={frames,meta:{app:'Sprite Toolbox',version:'1.0',image:safeName($('filename').value)+'.png',format:'RGBA8888',size:{w:state.size,h:state.size},scale:'1',grid:{columns:state.columns,rows:state.rows},padding:state.padding}};download(new Blob([JSON.stringify(json,null,2)],{type:'application/json'}),safeName($('filename').value)+'.json');toast('Frame data exported. Frames use the complete grid cells.');
}
async function exportSprite() {const s=selected();if(!s)return;const data=s.canvas.getContext('2d').getImageData(0,0,s.width,s.height).data;const result=await rpc('export',{buffer:data.buffer,width:s.width,height:s.height,bleed:+$('bleed').value||0,regions:[{x:0,y:0,width:s.width,height:s.height}]},[data.buffer]);download(result.blob,safeName(s.name)+'.png');}

// Import actions always use local files; there are no network requests for images.
for(const id of ['import-atlas','empty-import','source-import'])$(id).addEventListener('click',()=>$('atlas-file').click());
for(const id of ['import-pngs','empty-pngs'])$(id).addEventListener('click',()=>$('png-files').click());
$('atlas-file').addEventListener('change',handle(async event=>{const file=event.target.files[0];event.target.value='';if(file)await loadSource(file);}));
$('png-files').addEventListener('change',handle(async event=>{const files=[...event.target.files];event.target.value='';await importPNGs(files);}));
$('tab-atlas').addEventListener('click',()=>setView('atlas'));$('tab-source').addEventListener('click',()=>setView('source'));$('tab-foliage').addEventListener('click',()=>setView('foliage'));
for(const id of ['bg-color','tolerance','softness','defringe','min-area','merge-gap','source-columns','source-rows','detection','remove-bg','protect-enclosed'])$(id).addEventListener('input',()=>{
  const el=$(id);if(el.type==='number'){const value=Number(el.value);if(!Number.isFinite(value)||value<+el.min||value>+el.max)return;}scheduleProcess();
});
for(const id of ['min-area','merge-gap','source-columns','source-rows'])$(id).addEventListener('change',()=>{$(id).value=clamp(+$(id).value||+$(id).min,+$(id).min,+$(id).max);scheduleProcess();});
$('pick-color').addEventListener('click',()=>{state.picking=!state.picking;$('pick-color').classList.toggle('primary',state.picking);if(state.picking){state.original=true;syncSourceToggle();$('source-hint').textContent='Click the background in the image';}drawSource();});
function syncSourceToggle() {$('source-original').classList.toggle('active',state.original);$('source-clean').classList.toggle('active',!state.original);$('source-original').setAttribute('aria-pressed',String(state.original));$('source-clean').setAttribute('aria-pressed',String(!state.original));}
$('source-original').addEventListener('click',()=>{state.original=true;syncSourceToggle();drawSource();});$('source-clean').addEventListener('click',()=>{state.original=false;syncSourceToggle();drawSource();});
$('extract-sprites').addEventListener('click',handle(extractSprites));
for(const id of ['atlas-size','columns','rows','padding'])$(id).addEventListener('change',()=>{
  if(id==='atlas-size')state.size=+$('atlas-size').value;
  else if(id==='padding')state.padding=clamp(+$('padding').value||0,0,64);
  else {const columns=clamp(+$('columns').value||1,1,32),rows=clamp(+$('rows').value||1,1,32);if(columns*rows<state.sprites.length){toast('Keep enough grid slots for every sprite.',true);syncAtlasSettings();return;}state.columns=columns;state.rows=rows;const sorted=[...state.sprites].sort((a,b)=>a.slot-b.slot);if(sorted.some(s=>s.slot>=columns*rows))sorted.forEach((s,i)=>s.slot=i);}
  syncAtlasSettings();buildList();resizePreviews();
});
$('show-grid').addEventListener('change',()=>{state.grid=$('show-grid').checked;requestRender();});
$('pixel-mode').addEventListener('change',()=>{state.pixel=$('pixel-mode').checked;atlas.classList.toggle('pixelated',state.pixel);buildList();});
$('zoom').addEventListener('change',()=>{state.zoom=$('zoom').value;resizePreviews();});
$('preview-bg').addEventListener('click',()=>{state.background=(state.background+1)%3;const wrap=$('atlas-wrap');wrap.classList.toggle('light',state.background===1);wrap.classList.toggle('dark',state.background===2);const name=['checkerboard','light','dark'][state.background];$('preview-bg').title=`Preview background: ${name}`;$('preview-bg').setAttribute('aria-label',`Preview background: ${name}. Click to change.`);});
$('sprite-name').addEventListener('input',()=>{const s=selected();if(!s)return;s.name=$('sprite-name').value||'sprite';const tile=[...$('sprite-list').children].find(t=>+t.dataset.id===s.id);tile.querySelector('strong').textContent=s.name;tile.setAttribute('aria-label',`${s.name}, slot ${s.slot+1}`);});
for(const id of ['scale-number','scale-range','offset-x','offset-y'])$(id).addEventListener('input',()=>{
  const s=selected();if(!s||$(id).value==='')return;const value=Number($(id).value);if(!Number.isFinite(value))return;
  if(id.startsWith('scale'))s.scale=clamp(value,5,400);else s[id==='offset-x'?'offsetX':'offsetY']=clamp(value,-state.size,state.size);
  if(id==='scale-range')$('scale-number').value=Math.round(s.scale);else if(id==='scale-number')$('scale-range').value=clamp(s.scale,5,300);
  $('clipping-warning').hidden=!spriteRect(s,cellRect(s.slot,state.size,state.columns,state.rows),state.padding).clipped;requestRender();
});
for(const id of ['scale-number','offset-x','offset-y'])$(id).addEventListener('change',()=>syncSelection({light:true}));
$('center-sprite').addEventListener('click',()=>{const s=selected();if(s){s.offsetX=0;s.offsetY=0;syncSelection();requestRender();}});
$('fit-sprite').addEventListener('click',()=>{const s=selected();if(s){resetSprite(s);syncSelection();requestRender();}});
$('fit-all').addEventListener('click',()=>{state.sprites.forEach(resetSprite);syncSelection();requestRender();toast('All sprites fitted and centered.');});
$('move-slot').addEventListener('change',()=>moveSprite(state.selected,+$('move-slot').value));
$('remove-sprite').addEventListener('click',()=>{const index=state.sprites.findIndex(s=>s.id===state.selected);if(index<0)return;state.sprites.splice(index,1);state.selected=state.sprites[Math.min(index,state.sprites.length-1)]?.id||null;buildList();});
$('clear-all').addEventListener('click',()=>$('confirm-dialog').showModal());
$('confirm-dialog').addEventListener('close',()=>{if($('confirm-dialog').returnValue==='clear'){state.sprites=[];state.selected=null;buildList();}});
$('export-atlas').addEventListener('click',handle(exportPNG));$('export-json').addEventListener('click',handle(exportJSON));$('export-sprite').addEventListener('click',handle(exportSprite));
$('bleed').addEventListener('change',()=>$('bleed').value=clamp(+$('bleed').value||0,0,8));

let fileDragDepth=0, droppedFile=null;
document.addEventListener('dragenter',event=>{if(listDrag!==null||!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();fileDragDepth++;$('drop-overlay').hidden=false;});
document.addEventListener('dragleave',()=>{fileDragDepth=Math.max(0,fileDragDepth-1);if(!fileDragDepth)$('drop-overlay').hidden=true;});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
document.addEventListener('drop',handle(async event=>{if(listDrag!==null)return;const files=[...event.dataTransfer.files];if(!files.length)return;event.preventDefault();fileDragDepth=0;$('drop-overlay').hidden=true;if(files.length===1){droppedFile=files[0];$('import-filename').textContent=droppedFile.name;$('single-import-dialog').showModal();}else await importPNGs(files);}));
$('single-import-dialog').addEventListener('close',handle(async()=>{const file=droppedFile;droppedFile=null;if(!file)return;if($('single-import-dialog').returnValue==='atlas')await loadSource(file);else if($('single-import-dialog').returnValue==='sprite')await importPNGs([file]);}));
let foliageFrame=0,foliageBackground=0;
function foliageOptions() {return {kind:$('foliage-kind').value,seed:+$('foliage-seed').value||1,size:+$('foliage-size').value,leafColor:$('foliage-color').value,trunkColor:$('foliage-trunk-color').value,width:+$('foliage-width').value,height:+$('foliage-height').value,density:+$('foliage-density').value,brush:+$('foliage-brush').value,thickness:+$('foliage-trunk').value,volume:+$('foliage-volume').value,texture:+$('foliage-texture').value,lightDirection:$('foliage-light').value};}
function updateFoliage() {
  for(const id of ['width','height','density','brush','trunk','volume','texture'])$('foliage-'+id+'-value').textContent=$('foliage-'+id).value+'%';
  if(foliageFrame)return;foliageFrame=requestAnimationFrame(()=>{foliageFrame=0;const meta=renderFoliage($('foliage-canvas'),foliageOptions());$('foliage-status').textContent=`${meta.size} × ${meta.size} · seed ${meta.seed} · transparent RGBA`;syncViewInfo();resizePreviews();});
}
for(const id of ['kind','seed','size','color','trunk-color','width','height','density','brush','trunk','volume','texture','light'])$('foliage-'+id).addEventListener('input',updateFoliage);
$('foliage-seed').addEventListener('change',()=>{$('foliage-seed').value=clamp(Math.round(+$('foliage-seed').value)||1,1,999999);updateFoliage();});
$('foliage-palette').addEventListener('change',()=>{const palette=foliagePalettes[$('foliage-palette').value];$('foliage-color').value=palette.leaf;$('foliage-trunk-color').value=palette.trunk;updateFoliage();});
$('foliage-random').addEventListener('click',()=>{$('foliage-seed').value=Math.floor(Math.random()*999999)+1;updateFoliage();});
$('foliage-bg').addEventListener('click',()=>{foliageBackground=(foliageBackground+1)%3;$('foliage-wrap').classList.toggle('light',foliageBackground===1);$('foliage-wrap').classList.toggle('dark',foliageBackground===2);$('foliage-bg').title=`Preview background: ${['checkerboard','light','dark'][foliageBackground]}`;});
$('foliage-add').addEventListener('click',handle(()=>{const config=foliageOptions(),c=newCanvas(config.size,config.size);renderFoliage(c,config);const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,bounds=trimBounds(data,c.width,c.height);if(!bounds)throw new Error('No visible foliage to add.');addSprites([{name:`${config.kind}_${config.seed}`,width:bounds.width,height:bounds.height,canvas:newCanvas(bounds.width,bounds.height,cropSprite(data,c.width,bounds))}]);}));
$('foliage-export').addEventListener('click',handle(async()=>{const config=foliageOptions(),c=newCanvas(config.size,config.size);renderFoliage(c,config);const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const result=await rpc('export',{buffer:data.buffer,width:c.width,height:c.height,bleed:2,regions:[{x:0,y:0,width:c.width,height:c.height}]},[data.buffer]);download(result.blob,`${config.kind}_${config.seed}.png`);toast('Foliage exported with transparency and clean edges.');}));
new ResizeObserver(resizePreviews).observe(document.querySelector('.editor-toolbar'));window.addEventListener('resize',resizePreviews);
syncAtlasSettings();syncSelection();syncExtractionLabels();setView('atlas');
