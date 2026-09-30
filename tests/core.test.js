import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { cleanBackground,guessBackground,isolateObjects,cropSprite,trimBounds,cellRect,spriteRect,bleedTransparent,encodePNG,isPowerOfTwo } from '../core.js';

const image=(w,h,color=[255,255,255,255])=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)data.set(color,i*4);return data;};
const pixel=(data,w,x,y,color)=>data.set(color,(y*w+x)*4);
const rectangle=(data,w,x,y,rw,rh,color)=>{for(let cy=y;cy<y+rh;cy++)for(let cx=x;cx<x+rw;cx++)pixel(data,w,cx,cy,color);};

test('isolates objects, removes the matte and recovers antialiased foreground RGB',()=>{
  const data=image(64,32);rectangle(data,64,4,4,12,14,[255,0,0,255]);rectangle(data,64,40,8,8,10,[0,50,230,255]);
  for(let y=4;y<18;y++)pixel(data,64,3,y,[255,128,128,255]);
  const result=cleanBackground(data,64,32,{color:[255,255,255],tolerance:5,softness:15,defringe:2});
  assert.equal(result[3],0);const edge=(10*64+3)*4;
  assert.equal(result[edge],255);assert.ok(result[edge+1]<3);assert.ok(result[edge+2]<3);assert.ok(Math.abs(result[edge+3]-127)<2);
  const detection=isolateObjects(result,64,32,{minArea:4,mergeGap:0});assert.equal(detection.groups.length,2);
  const sprite=cropSprite(result,64,detection.groups[0],detection.labels);assert.equal(sprite.length,13*14*4);assert.equal(sprite[1],0);assert.equal(sprite[3],127);
});

test('existing transparent and semitransparent PNG pixels survive disabled keying',()=>{
  const data=image(8,8,[0,0,0,0]);pixel(data,8,2,3,[30,140,240,74]);
  const cleaned=cleanBackground(data,8,8,{remove:false});assert.deepEqual(cleaned,data);
  assert.deepEqual(trimBounds(cleaned,8,8),{x:2,y:3,width:1,height:1,ids:[]});
  assert.equal(guessBackground(data,8,8).hasTransparentBorder,true);
});

test('preserves enclosed colors when border connectivity is selected',()=>{
  const data=image(20,20);rectangle(data,20,3,3,14,14,[0,0,0,255]);rectangle(data,20,7,7,6,6,[255,255,255,255]);
  const protectedResult=cleanBackground(data,20,20,{protectEnclosed:true,defringe:0});assert.equal(protectedResult[3],0);assert.equal(protectedResult[(10*20+10)*4+3],255);
  const all=cleanBackground(data,20,20,{protectEnclosed:false,defringe:0});assert.equal(all[(10*20+10)*4+3],0);
});

test('joins nearby parts, ignores tiny debris and preserves faint alpha edges',()=>{
  const data=image(40,24,[0,0,0,0]);rectangle(data,40,4,4,8,8,[10,220,40,255]);rectangle(data,40,14,6,2,2,[10,220,40,255]);pixel(data,40,3,6,[10,220,40,3]);pixel(data,40,32,20,[1,2,3,255]);
  const result=isolateObjects(data,40,24,{minArea:4,mergeGap:2});assert.equal(result.groups.length,1);assert.equal(result.groups[0].ids.length,2);assert.equal(result.groups[0].x,3);
  const cropped=cropSprite(data,40,result.groups[0],result.labels);assert.equal(cropped[(2*13)*4+3],3);
});

test('source grid groups disconnected details in the same cell',()=>{
  const data=image(32,16,[0,0,0,0]);rectangle(data,32,2,2,3,3,[1,2,3,255]);rectangle(data,32,10,10,3,3,[1,2,3,255]);rectangle(data,32,21,3,4,4,[1,2,3,255]);
  const result=isolateObjects(data,32,16,{mode:'grid',columns:2,rows:1,minArea:2});assert.equal(result.groups.length,2);assert.equal(result.groups[0].width,11);assert.equal(result.groups[0].height,11);assert.equal(result.groups[1].sourceSlot,1);
});

test('crops only the requested object when component bounds overlap',()=>{
  const data=image(20,20,[0,0,0,0]);rectangle(data,20,3,3,14,2,[0,255,0,255]);rectangle(data,20,3,3,2,14,[0,255,0,255]);rectangle(data,20,7,8,3,3,[255,0,0,255]);
  const {groups,labels}=isolateObjects(data,20,20,{minArea:1,mergeGap:0});assert.equal(groups.length,2);
  const cropped=cropSprite(data,20,groups[0],labels);assert.equal(cropped[((8-3)*14+7-3)*4+3],0);
});

test('integer cells cover power-of-two sheets without gaps even with uneven division',()=>{
  assert.equal(isPowerOfTwo(1024),true);assert.equal(isPowerOfTwo(1000),false);
  for(const size of [256,512,1024,2048,4096]){let area=0;for(let i=0;i<21;i++){const c=cellRect(i,size,3,7);area+=c.width*c.height;assert.ok(c.x+c.width<=size);assert.ok(c.y+c.height<=size);}assert.equal(area,size*size);}
  const cell=cellRect(5,1024,4,4),sprite={width:100,height:50,scale:100,offsetX:0,offsetY:0};
  const r=spriteRect(sprite,cell,4);assert.equal(r.width,248);assert.equal(r.height,124);assert.equal(r.clipped,false);
  sprite.scale=200;assert.equal(spriteRect(sprite,cell,4).clipped,true);
});

test('RGB bleed retains alpha and never carries color across a cell boundary',()=>{
  const data=image(8,4,[0,0,0,0]);pixel(data,8,3,2,[255,0,0,255]);pixel(data,8,4,2,[0,0,255,255]);const alpha=Array.from(data).filter((_,i)=>i%4===3);
  bleedTransparent(data,8,4,2,[{x:0,y:0,width:4,height:4},{x:4,y:0,width:4,height:4}]);
  assert.deepEqual(Array.from(data).filter((_,i)=>i%4===3),alpha);assert.deepEqual([...data.slice((1*8+3)*4,(1*8+3)*4+4)],[255,0,0,0]);assert.deepEqual([...data.slice((1*8+4)*4,(1*8+4)*4+4)],[0,0,255,0]);
});

test('PNG export encodes true RGBA and retains transparent RGB bleed',async()=>{
  const data=image(2,2,[22,44,66,0]);pixel(data,2,1,1,[50,100,150,128]);const blob=await encodePNG(data,2,2),bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
  assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(view.getUint32(16),2);assert.equal(view.getUint32(20),2);assert.equal(bytes[25],6);
  let offset=8,idats=[];while(offset<bytes.length){const length=view.getUint32(offset),type=new TextDecoder().decode(bytes.slice(offset+4,offset+8));if(type==='IDAT')idats.push(bytes.slice(offset+8,offset+8+length));offset+=length+12;}
  const scan=inflateSync(Buffer.concat(idats));assert.equal(scan[0],0);assert.equal(scan[9],0);assert.deepEqual([...scan.slice(1,9)],[22,44,66,0,22,44,66,0]);assert.deepEqual([...scan.slice(14,18)],[50,100,150,128]);
});
