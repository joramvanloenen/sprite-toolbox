// Pixel operations are independent of the DOM, and run in a worker in the app.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const isPowerOfTwo = value => Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
const neighbors = (i, w, h, fn, diagonal = false) => {
  const x = i % w, y = Math.floor(i / w);
  if (x > 0) fn(i - 1); if (x + 1 < w) fn(i + 1);
  if (y > 0) fn(i - w); if (y + 1 < h) fn(i + w);
  if (diagonal) {
    if (x > 0 && y > 0) fn(i - w - 1);
    if (x + 1 < w && y > 0) fn(i - w + 1);
    if (x > 0 && y + 1 < h) fn(i + w - 1);
    if (x + 1 < w && y + 1 < h) fn(i + w + 1);
  }
};

export function guessBackground(data, width, height) {
  const bins = new Map(); let transparent = 0, total = 0;
  const sample = i => {
    total++; const p = i * 4;
    if (data[p + 3] < 16) { transparent++; return; }
    const key = [0,1,2].map(c => Math.round(data[p + c] / 8)).join(',');
    const bin = bins.get(key) || { n:0, rgb:[0,0,0] };
    bin.n++; bin.rgb.forEach((_, c) => bin.rgb[c] += data[p+c]); bins.set(key, bin);
  };
  const step = Math.max(1, Math.floor((width + height) / 1200));
  for (let x = 0; x < width; x += step) { sample(x); sample((height - 1) * width + x); }
  for (let y = 0; y < height; y += step) { sample(y * width); sample(y * width + width - 1); }
  const best = [...bins.values()].sort((a,b) => b.n - a.n)[0];
  return { color:best ? best.rgb.map(c => Math.round(c / best.n)) : [255,255,255], hasTransparentBorder:transparent > total / 2 };
}

export function cleanBackground(input, width, height, options = {}) {
  const { color = [255,255,255], tolerance = 12, softness = 18, defringe = 2, remove = true, protectEnclosed = false } = options;
  const n = width * height, data = new Uint8ClampedArray(input);
  if (!remove) return data;
  const distance = i => {
    const p = i * 4;
    return Math.sqrt(((input[p]-color[0])**2 + (input[p+1]-color[1])**2 + (input[p+2]-color[2])**2) / 3);
  };
  const threshold = tolerance + Math.max(softness, 0.001);
  let removable;
  if (protectEnclosed) {
    removable = new Uint8Array(n); const queue = new Int32Array(n); let head = 0, tail = 0;
    const add = i => { if (!removable[i] && (input[i*4+3] === 0 || distance(i) <= threshold)) { removable[i] = 1; queue[tail++] = i; } };
    for (let x = 0; x < width; x++) { add(x); add((height-1)*width+x); }
    for (let y = 0; y < height; y++) { add(y*width); add(y*width+width-1); }
    // Existing transparent holes are also valid background seeds.
    for (let i = 0; i < n; i++) if (input[i*4+3] === 0) add(i);
    while (head < tail) neighbors(queue[head++], width, height, add);
  }
  for (let i = 0; i < n; i++) {
    if (removable && !removable[i]) continue;
    const d = distance(i), amount = softness > 0 ? clamp((d-tolerance)/softness, 0, 1) : (d > tolerance ? 1 : 0);
    data[i*4+3] = Math.round(input[i*4+3] * amount);
  }
  if (!defringe) return data;

  // Erode the cutout to locate unpolluted interior colors, then propagate the
  // nearest interior sample to the edge. Solve C = alpha*F + (1-alpha)*B there.
  const depth = new Uint8Array(n); depth.fill(255);
  const queue = new Int32Array(n); let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (!data[i*4+3]) { depth[i] = 0; queue[tail++] = i; }
  const boundary = i => { if (depth[i] === 255) { depth[i] = 1; queue[tail++] = i; } };
  for (let x=0; x<width; x++) { boundary(x); boundary((height-1)*width+x); }
  for (let y=0; y<height; y++) { boundary(y*width); boundary(y*width+width-1); }
  while (head < tail) {
    const i = queue[head++]; if (depth[i] >= defringe + 1) continue;
    neighbors(i,width,height,j => { if (depth[j] === 255) { depth[j] = depth[i] + 1; queue[tail++] = j; } });
  }
  const nearest = new Int32Array(n); nearest.fill(-1); head = 0; tail = 0;
  for (let i=0; i<n; i++) if (data[i*4+3] >= 250 && depth[i] > defringe) { nearest[i] = i; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    neighbors(i,width,height,j => { if (data[j*4+3] && nearest[j] === -1) { nearest[j] = nearest[i]; queue[tail++] = j; } });
  }
  for (let i=0; i<n; i++) {
    const p = i*4, seed = nearest[i]*4;
    // A PNG's existing fractional alpha is already a matte; do not key it twice.
    if (!data[p+3] || input[p+3] < 250 || depth[i] > defringe || seed < 0 || (removable && !removable[i] && distance(i) <= threshold)) continue;
    let dot = 0, norm = 0;
    for (let c=0;c<3;c++) { const f=input[seed+c]-color[c], v=input[p+c]-color[c]; dot+=f*v; norm+=f*f; }
    if (norm < 64) continue;
    const alpha = clamp(dot/norm, 0, 1); if (alpha < .008 || alpha > .995) continue;
    let residual = 0;
    for (let c=0;c<3;c++) residual += (input[p+c] - (alpha*input[seed+c] + (1-alpha)*color[c]))**2;
    // Only undo a plausible matte mixture; preserve unrelated edge colors.
    if (residual/3 > Math.max(18, tolerance)**2) continue;
    for (let c=0;c<3;c++) data[p+c] = clamp((input[p+c] - (1-alpha)*color[c])/alpha, 0, 255);
    data[p+3] = Math.round(input[p+3]*alpha);
  }
  return data;
}

export function isolateObjects(data, width, height, { minArea = 16, mergeGap = 2, mode = 'objects', columns = 4, rows = 4 } = {}) {
  const n = width*height;
  if (mode === 'grid') {
    const groups = [];
    for (let row=0;row<rows;row++) for (let col=0;col<columns;col++) {
      const x0=Math.floor(col*width/columns), x1=Math.floor((col+1)*width/columns), y0=Math.floor(row*height/rows), y1=Math.floor((row+1)*height/rows);
      let x=width,y=height,right=0,bottom=0,area=0;
      for (let cy=y0;cy<y1;cy++) for (let cx=x0;cx<x1;cx++) if (data[(cy*width+cx)*4+3]>0) { x=Math.min(x,cx); y=Math.min(y,cy); right=Math.max(right,cx+1); bottom=Math.max(bottom,cy+1); area++; }
      if (area >= minArea) groups.push({x,y,width:right-x,height:bottom-y,area,sourceSlot:row*columns+col, ids:[]});
    }
    return { groups, labels:null };
  }
  const labels = new Int32Array(n), queue = new Int32Array(n), parts=[]; let label=0;
  for (let i=0;i<n;i++) {
    if (labels[i] || data[i*4+3] === 0) continue;
    label++; let head=0,tail=1; queue[0]=i; labels[i]=label;
    let x=width,y=height,right=0,bottom=0;
    while (head<tail) {
      const p=queue[head++],px=p%width,py=Math.floor(p/width);
      x=Math.min(x,px); y=Math.min(y,py); right=Math.max(right,px+1); bottom=Math.max(bottom,py+1);
      neighbors(p,width,height,j=>{ if (!labels[j] && data[j*4+3]>0) { labels[j]=label; queue[tail++]=j; } },true);
    }
    parts.push({x,y,width:right-x,height:bottom-y,area:tail,ids:[label]});
  }
  // Joining by proximity lets an eye, sparkle or detached limb travel with its
  // object. Spatial buckets avoid quadratic scans on noisy images.
  if (mergeGap > 0 && parts.length > 1) {
    const parent=parts.map((_,i)=>i), root=i=>{ while(parent[i]!==i) { parent[i]=parent[parent[i]]; i=parent[i]; } return i; };
    const buckets=new Map(), size=Math.max(32,mergeGap*4);
    parts.forEach((a,i)=>{
      const l=Math.floor((a.x-mergeGap)/size),r=Math.floor((a.x+a.width+mergeGap)/size),t=Math.floor((a.y-mergeGap)/size),b=Math.floor((a.y+a.height+mergeGap)/size), seen=new Set();
      for (let by=t;by<=b;by++) for(let bx=l;bx<=r;bx++) {
        const key=bx+','+by,list=buckets.get(key)||[];
        for (const j of list) if (!seen.has(j)) {
          seen.add(j); const p=parts[j];
          const dx=Math.max(0,a.x-(p.x+p.width),p.x-(a.x+a.width)),dy=Math.max(0,a.y-(p.y+p.height),p.y-(a.y+a.height));
          if (Math.hypot(dx,dy)<=mergeGap) parent[root(i)]=root(j);
        }
        list.push(i); buckets.set(key,list);
      }
    });
    const merged=new Map();
    parts.forEach((a,i)=>{ const k=root(i),g=merged.get(k);
      if (!g) merged.set(k,{...a,ids:[...a.ids]});
      else { const r=Math.max(g.x+g.width,a.x+a.width),b=Math.max(g.y+g.height,a.y+a.height); g.x=Math.min(g.x,a.x);g.y=Math.min(g.y,a.y);g.width=r-g.x;g.height=b-g.y;g.area+=a.area;g.ids.push(...a.ids); }
    });
    parts.splice(0,parts.length,...merged.values());
  }
  const groups=parts.filter(a=>a.area>=minArea);
  // Reading order is stable even when sprites have different heights.
  groups.sort((a,b)=>a.y-b.y||a.x-b.x);
  const ordered=[]; let row=[]; let rowY=-Infinity,rowH=0;
  for (const g of groups) {
    if (row.length && g.y>rowY+Math.max(3,rowH*.35)) { ordered.push(...row.sort((a,b)=>a.x-b.x)); row=[]; }
    if (!row.length) { rowY=g.y;rowH=g.height; } else rowH=Math.min(rowH,g.height);
    row.push(g);
  }
  ordered.push(...row.sort((a,b)=>a.x-b.x));
  return {groups:ordered,labels};
}

export function cropSprite(data, width, group, labels = null) {
  const output=new Uint8ClampedArray(group.width*group.height*4), ids=new Set(group.ids);
  for(let y=0;y<group.height;y++) for(let x=0;x<group.width;x++) {
    const i=(group.y+y)*width+group.x+x,p=i*4,q=(y*group.width+x)*4;
    if (labels && !ids.has(labels[i])) continue;
    output.set(data.subarray(p,p+4),q);
  }
  return output;
}

export function trimBounds(data,width,height) {
  let x=width,y=height,r=0,b=0;
  for(let i=0;i<width*height;i++) if(data[i*4+3]>0) { const px=i%width,py=Math.floor(i/width); x=Math.min(x,px);y=Math.min(y,py);r=Math.max(r,px+1);b=Math.max(b,py+1); }
  return r>x&&b>y ? {x,y,width:r-x,height:b-y,ids:[]} : null;
}

export function cellRect(slot, size, columns, rows) {
  const col=slot%columns,row=Math.floor(slot/columns);
  const x=Math.floor(col*size/columns),y=Math.floor(row*size/rows);
  return {x,y,width:Math.floor((col+1)*size/columns)-x,height:Math.floor((row+1)*size/rows)-y};
}
export function spriteRect(sprite, cell, padding=4) {
  const pad=clamp(padding,0,Math.min(cell.width,cell.height)/2-1);
  const fit=Math.min((cell.width-2*pad)/sprite.width,(cell.height-2*pad)/sprite.height);
  const width=Math.max(1,Math.round(sprite.width*fit*sprite.scale/100)),height=Math.max(1,Math.round(sprite.height*fit*sprite.scale/100));
  const x=Math.round(cell.x+(cell.width-width)/2+sprite.offsetX),y=Math.round(cell.y+(cell.height-height)/2+sprite.offsetY);
  const clip={x:cell.x+Math.ceil(pad),y:cell.y+Math.ceil(pad),width:cell.width-2*Math.ceil(pad),height:cell.height-2*Math.ceil(pad)};
  const vx=Math.max(x,clip.x),vy=Math.max(y,clip.y),vr=Math.min(x+width,clip.x+clip.width),vb=Math.min(y+height,clip.y+clip.height);
  return {x,y,width,height,fit,clip,visible:{x:vx,y:vy,width:Math.max(0,vr-vx),height:Math.max(0,vb-vy)},clipped:x<clip.x||y<clip.y||x+width>clip.x+clip.width||y+height>clip.y+clip.height};
}

// RGB-only extrusion: alpha is deliberately never written. Restrict propagation
// to each cell so neighboring sprites cannot contaminate one another.
export function bleedTransparent(data,width,height,radius=2,regions=[{x:0,y:0,width,height}]) {
  if (!radius) return data;
  for(const region of regions) {
    const rw=region.width,rh=region.height,n=rw*rh,nearest=new Int32Array(n),depth=new Uint8Array(n),queue=new Int32Array(n); nearest.fill(-1);
    let head=0,tail=0;
    for(let y=0;y<rh;y++) for(let x=0;x<rw;x++) { const j=y*rw+x,i=(region.y+y)*width+region.x+x;
      if(data[i*4+3]>0) { nearest[j]=i;queue[tail++]=j; }
    }
    while(head<tail) {
      const j=queue[head++]; if(depth[j]>=radius) continue;
      neighbors(j,rw,rh,k=>{ if(nearest[k]>=0) return; nearest[k]=nearest[j];depth[k]=depth[j]+1;queue[tail++]=k;
        const i=((region.y+Math.floor(k/rw))*width+region.x+k%rw)*4,p=nearest[k]*4;
        data[i]=data[p];data[i+1]=data[p+1];data[i+2]=data[p+2];
      });
    }
  }
  return data;
}

const crcTable=Uint32Array.from({length:256},(_,i)=>{ for(let k=0;k<8;k++) i=i&1?0xedb88320^(i>>>1):i>>>1; return i>>>0; });
const crc32=bytes=>{ let c=0xffffffff; for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0; };
function chunk(type,bytes) {
  const out=new Uint8Array(bytes.length+12),view=new DataView(out.buffer);view.setUint32(0,bytes.length);
  out.set(new TextEncoder().encode(type),4);out.set(bytes,8);view.setUint32(out.length-4,crc32(out.subarray(4,out.length-4)));return out;
}
export async function encodePNG(data,width,height) {
  // Encoding directly retains RGB under alpha=0; canvas.toBlob would discard it.
  const scanlines=new Uint8Array((width*4+1)*height);
  for(let y=0;y<height;y++) scanlines.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  const stream=new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
