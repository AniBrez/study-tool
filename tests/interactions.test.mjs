import {validateWorkspace} from '../dist/model.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import katex from '../dist/vendor/katex.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.STUDY_TEST_JSDOM || 'jsdom');

const html = readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
const dom = new JSDOM(html,{url:'https://study-tool.test/',pretendToBeVisual:true});
const w=dom.window;
for(const name of ['window','document','localStorage','history','location','FormData','Event','MouseEvent','Blob']) globalThis[name]=w[name];
globalThis.requestAnimationFrame = fn => {fn();return 1;};
globalThis.katex=katex;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
await import('../dist/app.mjs');
const doc=w.document;
const q=selector => {const el=doc.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
const click=selector=>q(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const fill=(selector,value)=>{const el=q(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
const submit=selector=>q(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const state=()=>JSON.parse(localStorage.getItem('study-tool.workspace.v1'));
const pointer=(target,type,x,y)=>{
  const event=new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});
  Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);
};

test('complete topic, flowchart, flashcard, persistence, and recovery workflow',async t=>{
  await t.test('home matches the reference structure and topic opens in Display',()=>{
    assert.equal(q('#topics-heading').textContent,'Topics');
    assert.equal(doc.querySelectorAll('.topic-row').length,2);
    click('[data-action=topic][data-id=statistical-learning]');
    assert.equal(q('.mode-switch').textContent,'Edit');
    assert.equal(doc.querySelectorAll('.flow-node').length,5);
    assert.equal(doc.querySelector('.toolbox'),null);
  });
  await t.test('theorems flip to proof and back; definitions and remarks do not',()=>{
    click('.flow-node[data-id=sl-bound]');
    assert.ok(q('.flash-content .katex'));
    assert.equal(q('.flash-heading h2').textContent,'Finite-class risk bound');
    click('[data-action=flip]');assert.equal(q('.flash-heading h2').textContent,'Proof');
    click('[data-action=flip]');assert.equal(q('.flash-heading h2').textContent,'Finite-class risk bound');
    click('[data-action=close-dialog]');
    for(const id of ['sl-risk','sl-remark']){
      click(`.flow-node[data-id=${id}]`);assert.equal(doc.querySelector('[data-action=flip]'),null);click('[data-action=close-dialog]');
    }
    click('.flow-node[data-id=sl-title]');assert.equal(q('#modal').open,false);
  });
  await t.test('edit includes all six toolbox types; cancel leaves no new card',()=>{
    click('[data-action=mode]');assert.equal(doc.querySelectorAll('.tool').length,6);
    click('.tool[data-type=lemma]');assert.equal(q('#card-title').value,'Lemma');
    click('.editor-actions [data-action=close-dialog]');assert.equal(doc.querySelectorAll('.flow-node').length,5);
  });
  let newId;
  await t.test('a new lemma keeps separate LaTeX statement and proof and saves both',()=>{
    click('.tool[data-type=lemma]');
    fill('#card-title','Test $x^2$');fill('#card-source',String.raw`\textbf{Statement.} $x^2\geq0$.`);
    click('[data-action=editor-side][data-side=proof]');
    fill('#card-source',String.raw`For $x\in\R$, $x^2=|x|^2\geq0$.`);
    click('[data-action=editor-preview]');assert.ok(q('.editor-render .katex'));assert.equal(q('[data-editor-errors]').textContent,'');
    click('[data-action=editor-side][data-side=statement]');assert.match(q('.editor-render').textContent,/Statement/);
    submit('#card-form');assert.equal(q('#modal').open,false);
    const n=state().topics[1].nodes.find(n=>n.title==='Test $x^2$');assert.ok(n);newId=n.id;
    assert.match(n.statement,/Statement/);assert.match(n.proof,/For/);
    assert.equal(doc.querySelectorAll('.flow-node').length,6);
  });
  await t.test('dragging snaps and saves the position; locking prevents movement',()=>{
    const el=q(`.flow-node[data-id="${newId}"]`);
    const before=state().topics[1].nodes.find(n=>n.id===newId);
    pointer(el,'pointerdown',200,220);pointer(w,'pointermove',245,270);pointer(w,'pointerup',245,270);
    const after=state().topics[1].nodes.find(n=>n.id===newId);
    assert.ok(after.x>before.x);assert.equal(after.x%10,0);assert.equal(after.y%10,0);
    const lock=q('#lock-layout');lock.checked=true;lock.dispatchEvent(new w.Event('change',{bubbles:true}));
    pointer(el,'pointerdown',200,220);pointer(w,'pointermove',300,350);pointer(w,'pointerup',300,350);
    assert.deepEqual(state().topics[1].nodes.find(n=>n.id===newId),after);
    lock.checked=false;lock.dispatchEvent(new w.Event('change',{bubbles:true}));
  });
  await t.test('cards connect with plain lines, and removing a line can be undone',async()=>{
    await new Promise(r=>setTimeout(r,170));
    const count=state().topics[1].edges.length;
    click('[data-action=connect]');click('.flow-node[data-id=sl-risk]');click(`.flow-node[data-id="${newId}"]`);
    assert.equal(state().topics[1].edges.length,count+1);
    assert.equal(doc.querySelectorAll('.edge-line').length,count+1);
    assert.equal(doc.querySelector('.edges [marker-start], .edges [marker-end]'),null);
    for(const line of doc.querySelectorAll('.edge-line')) assert.equal(line.getAttribute('marker-end'),null);
    click('[data-action=mode]');
    assert.equal(doc.querySelectorAll('.edge-line').length,count+1);
    assert.equal(doc.querySelector('.edges [marker-start], .edges [marker-end]'),null);
    click('[data-action=mode]');
    const edge=state().topics[1].edges.at(-1);
    click(`.edge-hit[data-id="${edge.id}"]`);click('[data-action=delete-edge]');assert.equal(state().topics[1].edges.length,count);
    click('[data-action=undo]');assert.equal(state().topics[1].edges.length,count+1);
  });
  await t.test('card deletion requires confirmation, cleans connections, and is undoable',()=>{
    click(`.flow-node[data-id="${newId}"]`);click('[data-action=delete-card]');
    assert.ok(state().topics[1].nodes.some(n=>n.id===newId));
    click('[data-action=confirm]');assert.ok(!state().topics[1].nodes.some(n=>n.id===newId));
    assert.ok(!state().topics[1].edges.some(e=>e.from===newId||e.to===newId));
    click('[data-action=undo]');assert.ok(state().topics[1].nodes.some(n=>n.id===newId));
  });
  let topicId;
  await t.test('new topic starts empty in Edit; rename and deletion work from home',()=>{
    click('.brand');click('[data-action=manage]');fill('#new-topic-title','Dynamical Systems');submit('#add-topic-form');
    assert.equal(q('.flow-heading h1').textContent,'Dynamical Systems');assert.equal(doc.querySelectorAll('.flow-node').length,0);
    assert.ok(doc.querySelector('.toolbox'));topicId=state().topics.at(-1).id;
    click('.brand');click(`[data-action=rename-topic][data-id="${topicId}"]`);
    fill('#rename-title','Dynamical Systems II');submit('#rename-topic-form');
    assert.equal(state().topics.at(-1).title,'Dynamical Systems II');
    click(`[data-action=delete-topic][data-id="${topicId}"]`);click('.dialog-actions [data-action=close-dialog]');
    assert.ok(state().topics.some(t=>t.id===topicId));
    click(`[data-action=delete-topic][data-id="${topicId}"]`);click('[data-action=confirm]');
    assert.ok(!state().topics.some(t=>t.id===topicId));
    click('.home-history [data-action=undo]');assert.ok(state().topics.some(t=>t.id===topicId));
  });
  await t.test('the syntax guide returns to a draft without losing its source',()=>{
    click('[data-action=topic][data-id=statistical-learning]');click('[data-action=mode]');click('.tool[data-type=theorem]');
    fill('#card-source','An unsaved draft $a=b$.');click('[data-action=latex-guide]');click('[data-action=return-editor]');
    assert.equal(q('#card-source').value,'An unsaved draft $a=b$.');click('[data-action=close-dialog]');
  });
  await t.test('import is validated before replacement, and export contains all topics',async()=>{
    let exported;
    const originalClick=w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click=function(){};
    const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
    URL.createObjectURL=blob=>{exported=blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
    click('.site-footer [data-action=export]');assert.ok(exported);
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;w.HTMLAnchorElement.prototype.click=originalClick;
    const input=q('#import-file');
    Object.defineProperty(input,'files',{configurable:true,value:[{name:'bad.json',size:2,text:async()=>'{]'}]});
    input.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));
    assert.match(q('#modal').textContent,/Could not import/);click('[data-action=close-dialog]');
    const imported={version:1,topics:[{id:'imported',title:'Imported topic',nodes:[],edges:[]}]};
    Object.defineProperty(input,'files',{configurable:true,value:[{name:'backup.json',size:100,text:async()=>JSON.stringify(imported)}]});
    input.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));
    assert.match(q('#modal').textContent,/Import workspace/);assert.notEqual(state().topics.length,1);
    click('[data-action=confirm]');assert.deepEqual(state(),validateWorkspace(imported));
    doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));assert.ok(state().topics.length>1);
  });
  await t.test('reloading initializes the saved workspace',async()=>{
    const previous=state();await import('../dist/app.mjs?reload-test');
    assert.equal(doc.querySelectorAll('.topic-row').length,previous.topics.length);
    assert.equal(q('#save-status').textContent,'Saved in this browser');
  });
  dom.window.close();
});
