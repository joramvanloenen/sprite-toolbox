import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLeafCluster, seededRandom } from '../foliage.js';

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
