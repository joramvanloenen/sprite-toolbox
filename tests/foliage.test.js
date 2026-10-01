import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLeafCluster, generateTrunkGeometry, seededRandom } from '../foliage.js';

const cluster={x:256,y:200,rx:60,ry:55};
const config={brush:.5,density:.65,pine:false};

test('a foliage seed reproduces the leaves and twigs across lighting and texture edits',()=>{
  const before=generateLeafCluster(cluster,{...config,texture:0,light:[-1,-1,1]},seededRandom(4721));
  const after=generateLeafCluster(cluster,{...config,texture:1,light:[1,-1,1]},seededRandom(4721));
  assert.deepEqual(after,before);
  assert.notDeepEqual(generateLeafCluster(cluster,config,seededRandom(4722)),before);
  assert.ok(before.leaves.length>20);assert.ok(before.twigs.length>=3);
  for(const leaf of before.leaves) {
    for(const value of Object.values(leaf))assert.ok(Number.isFinite(value));
    assert.ok(leaf.length>0&&leaf.halfWidth>0&&leaf.halfWidth<leaf.length*.5);
    assert.ok(leaf.nz>=0&&leaf.nz<=1);
  }
});

test('leaf size changes the actual blade dimensions and conifers have narrow needles',()=>{
  const small=generateLeafCluster(cluster,{...config,brush:.15},seededRandom(4721));
  const large=generateLeafCluster(cluster,{...config,brush:1},seededRandom(4721));
  const meanLength=g=>g.leaves.reduce((sum,l)=>sum+l.length,0)/g.leaves.length;
  assert.ok(meanLength(large)>meanLength(small)*2);
  const needles=generateLeafCluster(cluster,{...config,pine:true},seededRandom(4721));
  assert.ok(needles.leaves.every(l=>l.halfWidth/l.length<.15));
});

const canopy={x:256,y:206,rx:156,ry:139};
const trunkConfig={kind:'tree',thickness:.5,straightness:1,waveStrength:0,waveFrequency:1.5};
const trunkFor=options=>generateTrunkGeometry({...trunkConfig,...options},canopy,seededRandom(4721));

test('full straightness makes a straight trunk and natural bends remain reproducible',()=>{
  const straight=trunkFor({});
  assert.ok(straight.points.every(p=>p.x===256));
  const natural=trunkFor({straightness:0}),subtle=trunkFor({straightness:.75});
  assert.deepEqual(trunkFor({straightness:0}),natural);
  assert.ok(natural.points.some(p=>Math.abs(p.x-256)>10));
  const maxBend=g=>Math.max(...g.points.map(p=>Math.abs(p.x-256)));
  assert.ok(maxBend(subtle)<maxBend(natural)/3);
  assert.deepEqual(trunkFor({waveFrequency:3}),straight,'frequency has no effect when waves are off');
});

test('waves have independent strength and frequency and stay rooted',()=>{
  const gentle=trunkFor({waveStrength:.25}),strong=trunkFor({waveStrength:1});
  const maxBend=g=>Math.max(...g.points.map(p=>Math.abs(p.x-256)));
  assert.ok(maxBend(strong)>maxBend(gentle)*3.9);
  const crossings=g=>g.points.slice(2,-1).reduce((sum,p,i)=>sum+(Math.sign(p.x-256)!==Math.sign(g.points[i+1].x-256)),0);
  const slow=trunkFor({waveStrength:1,waveFrequency:.5}),fast=trunkFor({waveStrength:1,waveFrequency:3});
  assert.ok(crossings(fast)>crossings(slow)+3);
  for(const tree of [gentle,strong,slow,fast]) {
    assert.equal(tree.points[0].x,256);
    assert.ok(Math.abs(tree.points.at(-1).x-256)<1e-10);
  }
});

test('branches attach to the curved spine and geometry bounds include the whole trunk',()=>{
  for(const kind of ['tree','pine','bush']) {
    const crown={...canopy,y:kind==='bush'?349:206};
    const g=generateTrunkGeometry({...trunkConfig,kind,straightness:0,waveStrength:1,waveFrequency:3,thickness:1},crown,seededRandom(4721));
    for(const branch of g.branches) {
      const [x,y]=branch.points[0];
      const i=g.points.findIndex(p=>p.y<=y),a=g.points[Math.max(0,i-1)],b=g.points[i];
      const t=(a.y-y)/(a.y-b.y||1);
      assert.ok(Math.abs(x-(a.x+(b.x-a.x)*t))<1e-9,'branch must start on the trunk');
      for(const [px,py] of branch.points) {
        assert.ok(px-branch.width>=g.bounds.minX&&px+branch.width<=g.bounds.maxX);
        assert.ok(py-branch.width>=g.bounds.minY&&py+branch.width<=g.bounds.maxY);
      }
    }
    for(const p of g.points) {
      assert.ok(Object.values(p).every(Number.isFinite)&&p.halfWidth>0);
      assert.ok(p.x-p.halfWidth>=g.bounds.minX&&p.x+p.halfWidth<=g.bounds.maxX);
    }
  }
});
