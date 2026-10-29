import {validateWorkspace} from '../dist/model.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import katex from '../dist/vendor/katex.mjs';

test('lasso, zoom/pan, group drag, connections, cancellation, locks and single-step undo work together',async t=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'https://lasso.test/',pretendToBeVisual:true}),w=dom.window,doc=w.document;
  t.after(()=>w.close());
  for(const key of ['window','document','localStorage','history','location','FormData','Event','MouseEvent','Blob'])globalThis[key]=w[key];
  globalThis.requestAnimationFrame=fn=>{fn();return 1;};globalThis.katex=katex;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const nodes=[['a',100,100],['b',400,100],['c',850,100],['d',100,500]].map(([id,x,y])=>({id,x,y,type:'theorem',title:id,statement:'$x=y$',proof:'A proof.'}));
  const initial=validateWorkspace({version:1,topics:[{id:'test',title:'Test',nodes,edges:[{id:'ab',from:'a',to:'b'},{id:'bc',from:'b',to:'c'}]}]});
  localStorage.setItem('study-tool.workspace.v1',JSON.stringify(initial));
  await import('../dist/app.mjs');
  const q=s=>{const el=doc.querySelector(s);assert.ok(el,s);return el;};
  const click=(s,options={})=>q(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true,...options}));
  const state=()=>JSON.parse(localStorage.getItem('study-tool.workspace.v1'));
  const selected=()=>[...doc.querySelectorAll('.is-selected')].map(el=>el.dataset.id).sort();
  const point=(x,y)=>{
    const [,tx,ty,z]=q('.flow-world').style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    return [+tx+x*z,+ty+y*z];
  };
  const pointer=(el,type,p,extra={})=>{const e=new w.MouseEvent(type,{bubbles:true,clientX:p[0],clientY:p[1],button:0,...extra});Object.defineProperty(e,'pointerId',{value:extra.pointerId||1});el.dispatchEvent(e);};
  const loop=(extra={})=>{
    pointer(q('.flow-viewport'),'pointerdown',point(50,50),extra);
    for(const p of [[700,50],[700,260],[50,260],[50,50]])pointer(w,'pointermove',point(...p),extra);
    pointer(w,'pointerup',point(50,50),extra);
  };
  const key=(key,extra={})=>doc.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}));
  click('[data-action=topic]');click('[data-action=mode]');click('[data-action=lasso]');
  loop();assert.deepEqual(selected(),['a','b']);assert.deepEqual(state(),initial,'Selecting does not write or change data.');
  const edgeBefore=q('.edge-line').getAttribute('d');
  pointer(q('.flow-node[data-id=a]'),'pointerdown',point(200,150));
  pointer(w,'pointermove',point(330,220));pointer(w,'pointerup',point(330,220));
  let next=state().topics[0];
  assert.deepEqual(next.nodes.slice(0,2).map(n=>[n.x,n.y]),[[240,180],[540,180]]);
  assert.deepEqual(next.nodes.slice(2),initial.topics[0].nodes.slice(2));
  assert.deepEqual(next.edges,initial.topics[0].edges);assert.notEqual(q('.edge-line').getAttribute('d'),edgeBefore);
  assert.equal(doc.querySelector('[marker-end]'),null);
  click('[data-action=undo]');assert.deepEqual(state(),initial);
  click('[data-action=redo]');assert.deepEqual(state().topics[0].nodes.slice(0,2).map(n=>[n.x,n.y]),[[240,180],[540,180]]);
  click('[data-action=undo]');loop();click('[data-action=select-connected]');assert.deepEqual(selected(),['a','b','c']);
  await new Promise(r=>setTimeout(r,170));
  click('.flow-node[data-id=d]',{shiftKey:true});assert.deepEqual(selected(),['a','b','c','d']);
  click('.flow-node[data-id=d]',{shiftKey:true});assert.deepEqual(selected(),['a','b','c']);assert.equal(q('#modal').open,false);
  const beforeCancel=state();pointer(q('.flow-node[data-id=a]'),'pointerdown',point(200,150));
  pointer(w,'pointermove',point(400,300));key('Escape');assert.deepEqual(state(),beforeCancel);assert.equal(q('.flow-node[data-id=a]').style.left,'100px');
  // Pointer cancellation must ignore another pointer, and restore all members of this group.
  pointer(q('.flow-node[data-id=b]'),'pointerdown',point(500,150));pointer(w,'pointermove',point(600,200));
  pointer(w,'pointercancel',point(600,200),{pointerId:2});assert.ok(Math.abs(parseFloat(q('.flow-node[data-id=a]').style.left)-200)<.0001);
  pointer(w,'pointercancel',point(600,200));assert.equal(q('.flow-node[data-id=a]').style.left,'100px');assert.deepEqual(state(),beforeCancel);
  q('#lock-layout').checked=true;q('#lock-layout').dispatchEvent(new w.Event('change',{bubbles:true}));
  pointer(q('.flow-node[data-id=a]'),'pointerdown',point(200,150));pointer(w,'pointermove',point(400,250));pointer(w,'pointerup',point(400,250));assert.deepEqual(state(),beforeCancel);
  q('#lock-layout').checked=false;q('#lock-layout').dispatchEvent(new w.Event('change',{bubbles:true}));
  click('[data-action=clear-selection]');click('[data-action=zoom-out]');click('[data-action=zoom-out]');
  pointer(q('.flow-viewport'),'pointerdown',[20,400],{altKey:true});pointer(w,'pointermove',[110,440],{altKey:true});pointer(w,'pointerup',[110,440],{altKey:true});
  loop();assert.deepEqual(selected(),['a','b'],'Lasso coordinates follow both pan and zoom.');
  // A second Shift-loop adds to the selection instead of replacing it.
  pointer(q('.flow-viewport'),'pointerdown',point(50,450),{shiftKey:true});
  for(const p of [[350,450],[350,650],[50,650],[50,450]])pointer(w,'pointermove',point(...p),{shiftKey:true});
  pointer(w,'pointerup',point(50,450),{shiftKey:true});assert.deepEqual(selected(),['a','b','d']);
  key('Escape');assert.deepEqual(selected(),[]);assert.equal(q('[data-action=lasso]').getAttribute('aria-pressed'),'false');
  await new Promise(r=>setTimeout(r,170));click('.flow-node[data-id=a]');assert.equal(q('#modal').open,true,'Normal card editing still works after selection ends.');
});
