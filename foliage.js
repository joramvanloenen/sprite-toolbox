// Seeded, rule-based silhouettes with spherical lighting and layered brushwork.
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
function blobPath(ctx,cx,cy,rx,ry,random,lobes=6) {
  const pts=[],phase=random()*Math.PI*2;
  for(let i=0;i<32;i++) {const a=i*Math.PI*2/32,r=1+Math.sin(a*lobes+phase)*.065+(random()-.5)*.08;pts.push([cx+Math.cos(a)*rx*r,cy+Math.sin(a)*ry*r]);}
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];ctx.beginPath();ctx.moveTo(...mid(pts.at(-1),pts[0]));
  for(let i=0;i<pts.length;i++)ctx.quadraticCurveTo(...pts[i],...mid(pts[i],pts[(i+1)%pts.length]));ctx.closePath();
}
function brushMark(ctx,x,y,size,angle,color,random,opacity=1) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=css(color,opacity);
  // Tapered, slightly uneven strokes rather than circular confetti.
  ctx.beginPath();ctx.moveTo(-size*.92,-size*.1);ctx.quadraticCurveTo(-size*.45,-size*.59,size*.3,-size*.43);ctx.lineTo(size*(.75+random()*.3),size*.06);ctx.quadraticCurveTo(size*.2,size*.6,-size*.6,size*.36);ctx.closePath();ctx.fill();ctx.restore();
}
function drawCluster(ctx,cluster,config,random) {
  const {x,y,rx,ry,globalLight=.55}=cluster,{leaf,light,volume,texture,brush,pine}=config;
  const contrast=.45+volume*.85;
  const top=shade(leaf,clamp(globalLight+.25,0,1),contrast),mid=shade(leaf,globalLight,contrast),bottom=shade(leaf,clamp(globalLight-.28,0,1),contrast);
  const gradient=ctx.createRadialGradient(x+light[0]*rx*.4,y+light[1]*ry*.45,rx*.02,x+rx*.12,y+ry*.2,Math.max(rx,ry)*1.15);
  gradient.addColorStop(0,css(top));gradient.addColorStop(.45,css(mid));gradient.addColorStop(1,css(bottom));
  ctx.save();blobPath(ctx,x,y,rx,ry,random,pine?8:6);ctx.fillStyle=gradient;ctx.fill();ctx.clip();
  const brushScale=2.7+brush*6.3;
  const count=Math.round((rx*ry)/(brushScale*brushScale)*(.55+texture*.6));
  for(let i=0;i<count;i++) {
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*.99,nx=Math.cos(angle)*r,ny=Math.sin(angle)*r,nz=Math.sqrt(1-r*r);
    const diffuse=Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]);
    const illumination=clamp(diffuse*.66+globalLight*.42-.08,0,1),variation=(random()-.5)*(.10+texture*.18);
    const color=shade(leaf,illumination+variation,contrast,(random()-.5)*.06);
    const size=brushScale*(.55+random()*.8)*(pine?.72:1);
    const strokeAngle=pine?-.2+nx*.75:Math.atan2(ny*.65,nx*.75)+Math.PI/2+(random()-.5)*.9;
    brushMark(ctx,x+nx*rx,y+ny*ry,size,strokeAngle,color,random,.25+texture*.65);
  }
  // A few broken light strokes describe the rounded face of each cluster.
  if(texture>.1) {
    for(let i=0;i<Math.round(7+texture*9);i++) {
      const nx=light[0]*(.25+random()*.45)+(random()-.5)*.4,ny=light[1]*(.2+random()*.45)+(random()-.5)*.4;
      brushMark(ctx,x+nx*rx,y+ny*ry,brushScale*(.7+random()*.6),-.4+random()*.6,shade(leaf,.8+globalLight*.15,contrast),random,.35+texture*.3);
    }
  }
  ctx.restore();
}
function taperedBranch(ctx,points,width,color,light) {
  const [start,control,end]=points,dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  ctx.beginPath();ctx.moveTo(start[0]+nx*width,start[1]+ny*width);ctx.quadraticCurveTo(control[0]+nx*width*.6,control[1]+ny*width*.6,end[0],end[1]);ctx.quadraticCurveTo(control[0]-nx*width*.6,control[1]-ny*width*.6,start[0]-nx*width,start[1]-ny*width);ctx.closePath();
  const gradient=ctx.createLinearGradient(start[0]-width,start[1],start[0]+width,start[1]);const left=light[0]<0;
  gradient.addColorStop(0,css(mix(color,left?[217,187,133]:[37,34,33],left?.25:.47)));gradient.addColorStop(.45,css(color));gradient.addColorStop(1,css(mix(color,left?[37,34,33]:[217,187,133],left?.47:.25)));ctx.fillStyle=gradient;ctx.fill();
}
function trunk(ctx,config,canopy,random) {
  const {trunkColor,thickness,kind,light}=config;
  const base=kind==='bush'?448:470,top=kind==='pine'?118:canopy.y-35;
  const bend=(random()-.5)*26,halfWidth=6+thickness*13;
  const left=light[0]<0,grad=ctx.createLinearGradient(248-halfWidth,0,260+halfWidth,0);
  grad.addColorStop(0,css(mix(trunkColor,left?[225,189,134]:[38,34,34],left?.37:.6)));grad.addColorStop(.45,css(trunkColor));grad.addColorStop(1,css(mix(trunkColor,left?[38,34,34]:[225,189,134],left?.6:.37)));
  ctx.beginPath();ctx.moveTo(254-halfWidth-9,base);ctx.quadraticCurveTo(254-halfWidth,base-24,255-halfWidth,base-65);ctx.quadraticCurveTo(253+bend-halfWidth*.5,top+75,255+bend,top);ctx.quadraticCurveTo(261+bend+halfWidth*.4,top+75,257+halfWidth,base-65);ctx.quadraticCurveTo(257+halfWidth,base-25,264+halfWidth+10,base);ctx.quadraticCurveTo(259,base+4,254-halfWidth-9,base);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.save();ctx.clip();ctx.lineWidth=1.7;ctx.lineCap='round';
  for(let i=0;i<16;i++) {
    const x=250+(random()-.5)*halfWidth*1.7,y=top+70+random()*(base-top-80);ctx.strokeStyle=css(mix(trunkColor,[37,31,29],.6),.35+random()*.3);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(random()-.5)*10,y+12,x+(random()-.5)*4,y+25+random()*20);ctx.stroke();
  }ctx.restore();
  const branches=kind==='pine'?11:kind==='bush'?7:9;
  for(let i=0;i<branches;i++) {
    const side=i%2?-1:1,originY=base-70-i*(kind==='pine'?22:15),tipY=canopy.y+(random()-.5)*canopy.ry*.9;
    const tipX=256+side*(canopy.rx*(.32+random()*.38));
    taperedBranch(ctx,[[256+(random()-.5)*5,originY],[256+side*canopy.rx*.15,originY-45],[tipX,kind==='pine'?originY-25:tipY]],halfWidth*(.33+random()*.23),trunkColor,light);
  }
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
  const {kind='tree',seed=4721,size=512,leafColor='#79a83e',trunkColor='#86644a',width=100,height=100,density=65,brush=50,thickness=50,volume=70,texture=75,lightDirection='left'}=options;
  if(canvas.width!==size)canvas.width=size;if(canvas.height!==size)canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size*.035,size*.035);ctx.scale(size/512*.93,size/512*.93);
  const random=seededRandom(seed),light=lightDirection==='right'?[.53,-.67,.52]:lightDirection==='top'?[0,-.8,.6]:[-.53,-.67,.52];
  const config={kind,leaf:rgb(leafColor),trunkColor:rgb(trunkColor),light,volume:volume/100,texture:texture/100,brush:brush/100,thickness:thickness/100,pine:kind==='pine'};
  const canopy=canopyRules(kind,width/100,height/100,density/100,random);
  trunk(ctx,config,canopy,random);
  for(const cluster of canopy.clusters) {
    const nx=clamp((cluster.x-canopy.x)/canopy.rx,-1,1),ny=clamp((cluster.y-canopy.y)/canopy.ry,-1,1),nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    cluster.globalLight=.22+.72*Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]);
    if(kind==='pine')cluster.globalLight=clamp(cluster.globalLight+(cluster.z%1)*.15,.18,.95);
    drawCluster(ctx,cluster,config,random);
  }
  ctx.restore();
  return {seed:Number(seed),kind,size,clusters:canopy.clusters.length};
}
