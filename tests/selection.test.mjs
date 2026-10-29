import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lassoSelection, connectedSelection, groupTranslation} from '../dist/selection.mjs';

test('freehand selection follows the loop and uses title-card dimensions',()=>{
  const nodes=[{id:'a',type:'definition',x:0,y:0},{id:'b',type:'title',x:0,y:200},{id:'c',type:'lemma',x:500,y:0}];
  const loop=[{x:-10,y:-10},{x:250,y:-10},{x:250,y:125},{x:140,y:140},{x:140,y:240},{x:-10,y:240}];
  assert.deepEqual(lassoSelection(nodes,loop),['a','b']);
  assert.deepEqual(lassoSelection(nodes,loop.toReversed()),['a','b']);
  assert.deepEqual(lassoSelection(nodes,loop.slice(0,2)),[]);
});
test('connected selection traverses cycles, incoming and outgoing plain lines without crossing disconnected components',()=>{
  const topic={nodes:['a','b','c','d','e'].map(id=>({id})),edges:[{from:'b',to:'a'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'d',to:'e'}]};
  assert.deepEqual(new Set(connectedSelection(topic,['a'])),new Set(['a','b','c']));
  assert.deepEqual(new Set(connectedSelection(topic,['a','e'])),new Set(['a','b','c','d','e']));
});
test('group clamping and snapping preserve relative offsets at every canvas boundary',()=>{
  const originals=[{x:27,y:80},{x:5923,y:5904}];
  assert.deepEqual(groupTranslation(originals,-400,-500,true),{dx:-27,dy:-80});
  assert.deepEqual(groupTranslation(originals,800,800,true),{dx:77,dy:96});
  assert.deepEqual(groupTranslation(originals,14,26,true),{dx:10,dy:30});
});
