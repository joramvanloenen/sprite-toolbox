// Leaf-built foliage. Cluster volumes guide placement and light but are never filled.
// All drawing is against transparent pixels; there is no background to key out.
export const foliagePalettes = {
  woodland:{leaf:'#79a83e',trunk:'#86644a'},
  sage:{leaf:'#5d947d',trunk:'#766353'},
  autumn:{leaf:'#d4a23c',trunk:'#826048'},
  rust:{leaf:'#be633e',trunk:'#765741'}
};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function seededRandom(seed) {
  let value=(Number(seed)||1)>>>0;
  return ()=>{value+=0x6d2b79f5;let t=value;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c,alpha=1)=>`rgba(${c.map(v=>Math.round(clamp(v,0,255))).join(',')},${alpha})`;
const shade=(base,light,contrast=1,warm=0)=>{
  const shadow=mix(base,[19,39,36],.72),highlight=mix(base,[242,228,153],.49+warm);
  const amount=clamp(.54+(light-.54)*contrast,0,1);
  return amount<.55?mix(shadow,base,amount/.55):mix(base,highlight,(amount-.55)/.45);
};
function leafPath(ctx,length,halfWidth,bend,serrated) {
  ctx.beginPath();ctx.moveTo(0,0);
  for(const side of [-1,1]) {
    for(let k=1;k<=16;k++) {
      const t=side===-1?k/16:1-k/16;
      const profile=Math.pow(Math.sin(t*Math.PI),.82);
      const tooth=serrated?(k%2?.91:1.06):1;
      ctx.lineTo(t*length,Math.sin(t*Math.PI)*bend+side*halfWidth*profile*tooth);
    }
  }
  ctx.closePath();
}

// Opposite leaf pairs and terminal leaves grow along short sprigs, as in a real
// leafy branch. The ellipsoid is only a placement rule, never a visible surface.
export function generateLeafCluster(cluster,config,random) {
  const {x,y,rx,ry}=cluster,{brush=.5,density=.65,pine=false}=config;
  const leaves=[],twigs=[],baseLength=9+brush*23;
  const sprays=clamp(Math.round(rx*ry/(baseLength*baseLength)*(.42+density*.57)),pine?5:3,pine?13:9);
  const addLeaf=(px,py,angle,length,width,z,variation)=>{
    const cx=px+Math.cos(angle)*length*.5,cy=py+Math.sin(angle)*length*.5;
    const nx=clamp((cx-x)/rx,-1,1),ny=clamp((cy-y)/ry,-1,1),nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    leaves.push({x:px,y:py,angle,length,halfWidth:width,nx,ny,nz,z:z+nz*.38,variation,bend:(random()-.5)*width*.65,seed:Math.floor(random()*0xffffffff)});
  };
  const rotation=random()*Math.PI*2;
  for(let i=0;i<sprays;i++) {
    const angle=rotation+i*2.39996323+(random()-.5)*.5,r=.54+random()*.39;
    const sx=x+(random()-.5)*rx*.36,sy=y+(random()-.5)*ry*.36;
    const tx=x+Math.cos(angle)*rx*r,ty=y+Math.sin(angle)*ry*r;
    const dir=Math.atan2(ty-sy,tx-sx),depth=random()*.35;
    twigs.push({x:sx,y:sy,tx,ty});
    const pairs=pine?5:3+(random()>.65?1:0);
    for(let pair=0;pair<pairs;pair++) {
      const t=.18+pair/(pairs-1)*.63,px=sx+(tx-sx)*t,py=sy+(ty-sy)*t;
      for(const side of [-1,1]) {
        const a=dir+side*(pine?.67:1.02)+(random()-.5)*.45;
        const length=baseLength*(.73+random()*.45)*(pine?.82:1);
        addLeaf(px,py,a,length,length*(pine?.10:.27+random()*.07),depth+t*.1,(random()-.5)*.13);
      }
    }
    const length=baseLength*(.83+random()*.3);
    addLeaf(tx,ty,dir+(random()-.5)*.38,length,length*(pine?.11:.30),depth+.15,(random()-.5)*.13);
  }
  // Small front sprigs break up the center without a backing disk or ellipse.
  return {leaves:leaves.sort((a,b)=>a.z-b.z),twigs};
}

function drawLeaf(ctx,blade,config,globalLight) {
  const {leaf,light,volume,texture,pine}=config,{x,y,length,halfWidth,bend,angle,nx,ny,nz,variation,seed}=blade;
  const contrast=.40+volume*.83;
  const diffuse=Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]);
  const illumination=clamp(.10+diffuse*.49+globalLight*.49+variation,0,1);
  const pigment=shade(leaf,illumination,contrast),lit=mix(pigment,[231,228,163],.16),dark=mix(pigment,[25,49,39],.24);
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  leafPath(ctx,length,halfWidth,bend,!pine);
  // Each leaf has a softly folded blade. All canopy light is carried by leaves.
  const gradient=ctx.createLinearGradient(0,-halfWidth,length*.3,halfWidth);
  gradient.addColorStop(0,css(lit));gradient.addColorStop(.43,css(pigment));gradient.addColorStop(.51,css(mix(pigment,lit,.25)));gradient.addColorStop(1,css(dark));
  ctx.fillStyle=gradient;ctx.fill();
  ctx.strokeStyle=css(mix(pigment,[20,46,29],.33),.45);ctx.lineWidth=pine?.25:.45;ctx.stroke();
  if(!pine) {
    ctx.save();ctx.clip();
    const random=seededRandom(seed);
    if(texture>0) {
      // Broad, low-contrast pigment strokes stay inside the individual blade.
      for(let i=0;i<3;i++) {
        const t=.2+random()*.55,py=(random()-.5)*halfWidth*.9,span=length*(.16+random()*.18);
        ctx.strokeStyle=css(i%2?mix(pigment,[30,58,31],.28):lit,texture*.34);ctx.lineWidth=halfWidth*(.3+random()*.45);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(t*length,py);ctx.quadraticCurveTo(t*length+span*.3,py-halfWidth*.25,t*length+span,py);ctx.stroke();
      }
    }
    ctx.strokeStyle=css(mix(lit,leaf,.25),.42+.14*texture);ctx.lineWidth=.48;ctx.lineCap='round';
    for(let i=0;i<4;i++) {const t=.22+i*.16,centerY=Math.sin(t*Math.PI)*bend;
      for(const side of [-1,1]) {const endT=t+.14;ctx.beginPath();ctx.moveTo(t*length,centerY);ctx.quadraticCurveTo((t+.07)*length,centerY+side*halfWidth*.3,endT*length,Math.sin(endT*Math.PI)*(bend+side*halfWidth*.83));ctx.stroke();}
    }
    ctx.restore();
  }
  ctx.strokeStyle=css(lit,pine?.5:.7);ctx.lineWidth=pine?.3:.6;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(length*.45,bend*1.4,length*.93,bend*.12);ctx.stroke();ctx.restore();
}

function drawCluster(ctx,cluster,config,geometry) {
  const {leaves,twigs}=geometry;
  ctx.strokeStyle=css(mix(config.trunkColor,config.leaf,.38),.95);ctx.lineWidth=config.pine?.65:.8;ctx.lineCap='round';
  for(const twig of twigs) {ctx.beginPath();ctx.moveTo(twig.x,twig.y);ctx.lineTo(twig.tx,twig.ty);ctx.stroke();}
  for(const blade of leaves)drawLeaf(ctx,blade,config,cluster.globalLight);
  return leaves.length;
}
function taperedBranch(ctx,points,width,color,light) {
  const [start,control,end]=points,dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  ctx.beginPath();ctx.moveTo(start[0]+nx*width,start[1]+ny*width);ctx.quadraticCurveTo(control[0]+nx*width*.6,control[1]+ny*width*.6,end[0],end[1]);ctx.quadraticCurveTo(control[0]-nx*width*.6,control[1]-ny*width*.6,start[0]-nx*width,start[1]-ny*width);ctx.closePath();
  const gradient=ctx.createLinearGradient(start[0]-width,start[1],start[0]+width,start[1]);const left=light[0]<0;
  gradient.addColorStop(0,css(mix(color,left?[217,187,133]:[37,34,33],left?.25:.47)));gradient.addColorStop(.45,css(color));gradient.addColorStop(1,css(mix(color,left?[37,34,33]:[217,187,133],left?.47:.25)));ctx.fillStyle=gradient;ctx.fill();
}
// A sampled spine is shared by the silhouette, bark and branch attachments.
// Horizontal cross-sections keep even the strongest waves from folding over.
export function generateTrunkGeometry(config,canopy,random) {
  const {kind='tree',thickness=.5,straightness=.75,waveStrength=0,waveFrequency=1.5}=config;
  const base=kind==='bush'?448:470,top=kind==='pine'?118:canopy.y-35,length=base-top;
  const halfWidth=6+clamp(thickness,0,1)*13,natural=1-clamp(straightness,0,1);
  const lean=(random()-.5)*52,sweep=(random()-.5)*65,crook=(random()-.5)*24,phase=(random()-.5)*Math.PI*.7;
  const amplitude=clamp(waveStrength,0,1)*52,frequency=clamp(waveFrequency,.5,3);
  const points=Array.from({length:97},(_,i)=>{
    const t=i/96,envelope=Math.sin(Math.PI*t);
    const bend=natural*(lean*t+sweep*envelope+crook*Math.sin(2*Math.PI*t));
    const wave=amplitude*envelope*Math.sin(2*Math.PI*frequency*t+phase);
    return {x:256+bend+wave,y:base-t*length,halfWidth:halfWidth*(.16+.84*Math.pow(1-t,.62))+11*Math.exp(-t*length/17)};
  });
  const atY=y=>{
    const position=clamp((base-y)/length,0,1)*96,index=Math.min(95,Math.floor(position)),fraction=position-index;
    const a=points[index],b=points[index+1];
    return {x:a.x+(b.x-a.x)*fraction,y:base-position/96*length,halfWidth:a.halfWidth+(b.halfWidth-a.halfWidth)*fraction};
  };
  const branches=[],count=kind==='pine'?11:kind==='bush'?7:9,start=Math.min(70,length*.45);
  const spacing=Math.min(kind==='pine'?22:15,(length-start-12)/(count-1));
  for(let i=0;i<count;i++) {
    const side=i%2?-1:1,origin=atY(base-start-i*spacing),tipY=canopy.y+(random()-.5)*canopy.ry*.9;
    const tipX=256+side*(canopy.rx*(.32+random()*.38));
    branches.push({points:[[origin.x,origin.y],[origin.x+side*canopy.rx*.15,origin.y-45],[tipX,kind==='pine'?origin.y-25:tipY]],width:halfWidth*(.33+random()*.23)});
  }
  const bark=[];
  for(let i=0;i<20;i++) {
    const y=base-length*(.06+random()*.8),offset=(random()-.5)*1.5,span=20+random()*26,alpha=.35+random()*.3;
    const strokes=Array.from({length:7},(_,j)=>{
      const p=atY(y+span*j/6);
      return [p.x+offset*p.halfWidth+Math.sin(j*.8)*1.2,p.y];
    });
    bark.push({points:strokes,alpha});
  }
  const bounds={minX:Infinity,maxX:-Infinity,minY:top,maxY:base+4};
  const include=(x,y,padding=0)=>{
    bounds.minX=Math.min(bounds.minX,x-padding);bounds.maxX=Math.max(bounds.maxX,x+padding);
    bounds.minY=Math.min(bounds.minY,y-padding);bounds.maxY=Math.max(bounds.maxY,y+padding);
  };
  for(const p of points)include(p.x,p.y,p.halfWidth);
  for(const branch of branches)for(const [x,y] of branch.points)include(x,y,branch.width);
  return {points,branches,bark,bounds};
}
function drawTrunk(ctx,config,geometry) {
  const {trunkColor,light}=config,{points,branches,bark}=geometry;
  for(const branch of branches)taperedBranch(ctx,branch.points,branch.width,trunkColor,light);
  ctx.beginPath();ctx.moveTo(points[0].x-points[0].halfWidth,points[0].y);
  for(const p of points.slice(1))ctx.lineTo(p.x-p.halfWidth,p.y);
  for(const p of [...points].reverse())ctx.lineTo(p.x+p.halfWidth,p.y);
  ctx.quadraticCurveTo(points[0].x,points[0].y+4,points[0].x-points[0].halfWidth,points[0].y);
  ctx.closePath();ctx.fillStyle=css(trunkColor);ctx.fill();ctx.save();ctx.clip();
  // Shading ribbons follow the curved spine instead of a fixed world-space gradient.
  const left=light[0]<0,lit=mix(trunkColor,[225,189,134],.37),dark=mix(trunkColor,[38,34,34],.6);
  const a=left?lit:dark,b=left?dark:lit;
  for(let i=0;i<24;i++) {
    const t=(i+.5)/24,lo=-1+i/12-.012,hi=-1+(i+1)/12+.012;
    ctx.beginPath();
    points.forEach((p,j)=>{if(j)ctx.lineTo(p.x+p.halfWidth*lo,p.y);else ctx.moveTo(p.x+p.halfWidth*lo,p.y+4);});
    for(const p of [...points].reverse())ctx.lineTo(p.x+p.halfWidth*hi,p.y);
    ctx.lineTo(points[0].x+points[0].halfWidth*hi,points[0].y+4);ctx.closePath();
    ctx.fillStyle=css(t<.45?mix(a,trunkColor,t/.45):mix(trunkColor,b,(t-.45)/.55));ctx.fill();
  }
  ctx.lineWidth=1.5;ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of bark) {
    ctx.strokeStyle=css(mix(trunkColor,[37,31,29],.6),stroke.alpha);ctx.beginPath();
    stroke.points.forEach(([x,y],i)=>{if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
  }
  ctx.restore();
}
function canopyRules(kind,width,height,density,random) {
  if(kind==='pine') {
    const clusters=[],levels=7+Math.round(density*4),rx=132*width,top=65+(1-height)*120,bottom=400;
    for(let i=0;i<levels;i++) {
      const t=i/(levels-1),y=top+t*(bottom-top),spread=rx*(.12+t*.88),count=2+Math.round(t*3);
      for(let j=0;j<count;j++) {const x=256+(j/(count-1)-.5)*spread*1.6+(random()-.5)*13;clusters.push({x,y:y+(random()-.5)*13,rx:spread/(count*.55),ry:18+height*14+t*9,z:i+j*.05});}
    }
    return {x:256,y:(top+bottom)/2,rx,ry:(bottom-top)/2,clusters};
  }
  const shrub=kind==='bush',rx=(shrub?175:156)*width,ry=(shrub?104:139)*height,cy=shrub?349:206+(1-height)*60;
  const clusters=[],count=10+Math.round(density*22);
  // Back silhouette clusters establish a continuous, asymmetrical crown.
  for(let i=0;i<9;i++) {
    const angle=i*Math.PI*2/9+(random()-.5)*.25,r=.64+random()*.09;
    clusters.push({x:256+Math.cos(angle)*rx*r,y:cy+Math.sin(angle)*ry*r,rx:rx*(.31+random()*.10),ry:ry*(.35+random()*.10),z:-1+random()*.1});
  }
  for(let i=0;i<count;i++) {
    const angle=i*2.3999632297+random()*.5,r=Math.sqrt((i+.5)/count)*.75;
    const nx=Math.cos(angle)*r,ny=Math.sin(angle)*r;
    clusters.push({x:256+nx*rx,y:cy+ny*ry,rx:rx*(.25+random()*.11),ry:ry*(.27+random()*.10),z:Math.sqrt(1-r*r)+(ny*.14)});
  }
  return {x:256,y:cy,rx,ry,clusters:clusters.sort((a,b)=>a.z-b.z)};
}
export function renderFoliage(canvas,options={}) {
  const {kind='tree',seed=4721,size=512,leafColor='#79a83e',trunkColor='#86644a',width=100,height=100,density=65,brush=50,thickness=50,straightness=75,waveStrength=0,waveFrequency=1.5,volume=70,texture=75,lightDirection='left'}=options;
  if(canvas.width!==size)canvas.width=size;if(canvas.height!==size)canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);
  const random=seededRandom(seed),light=lightDirection==='right'?[.53,-.67,.52]:lightDirection==='top'?[0,-.8,.6]:[-.53,-.67,.52];
  const config={kind,leaf:rgb(leafColor),trunkColor:rgb(trunkColor),light,volume:volume/100,texture:texture/100,brush:brush/100,density:density/100,thickness:thickness/100,straightness:straightness/100,waveStrength:waveStrength/100,waveFrequency,pine:kind==='pine'};
  const canopy=canopyRules(kind,width/100,height/100,density/100,random);
  const geometry=canopy.clusters.map((cluster,index)=>generateLeafCluster(cluster,config,seededRandom((Number(seed)^Math.imul(index+1,0x45d9f3b))>>>0)));
  const trunkGeometry=generateTrunkGeometry(config,canopy,random);
  // Fit the leaves, curved trunk and branches together with a transparent margin.
  let {minX,maxX,minY,maxY}=trunkGeometry.bounds;
  for(const group of geometry)for(const blade of group.leaves) {
    const cos=Math.cos(blade.angle),sin=Math.sin(blade.angle),w=blade.halfWidth+Math.abs(blade.bend)+1;
    for(const lx of [0,blade.length])for(const ly of [-w,w]) {
      const x=blade.x+cos*lx-sin*ly,y=blade.y+sin*lx+cos*ly;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  const fit=Math.min(.93,480/(maxX-minX),480/(maxY-minY)),tx=clamp(17.92,16-fit*minX,496-fit*maxX),ty=clamp(17.92,16-fit*minY,496-fit*maxY);
  ctx.save();ctx.scale(size/512,size/512);ctx.translate(tx,ty);ctx.scale(fit,fit);
  drawTrunk(ctx,config,trunkGeometry);
  let leafCount=0;
  for(const [index,cluster] of canopy.clusters.entries()) {
    const nx=clamp((cluster.x-canopy.x)/canopy.rx,-1,1),ny=clamp((cluster.y-canopy.y)/canopy.ry,-1,1),nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    cluster.globalLight=.22+.72*Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]);
    if(kind==='pine')cluster.globalLight=clamp(cluster.globalLight+(cluster.z%1)*.15,.18,.95);
    leafCount+=drawCluster(ctx,cluster,config,geometry[index]);
  }
  ctx.restore();
  return {seed:Number(seed),kind,size,clusters:canopy.clusters.length,leaves:leafCount};
}
