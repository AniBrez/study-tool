import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JSDOM } from 'jsdom';
import katex from '../dist/vendor/katex.mjs';
import { WorkspaceStore } from '../desktop/storage.mjs';

test('desktop UI writes real files and waits for saving before closing',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-tool-ui-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=new WorkspaceStore(dir);const loaded=await store.load();
  const html=(await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8')).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'https://desktop.test/',pretendToBeVisual:true});const w=dom.window;
  t.after(()=>w.close());
  for(const name of ['window','document','localStorage','history','location','FormData','Event','MouseEvent','Blob'])globalThis[name]=w[name];
  globalThis.requestAnimationFrame=fn=>{fn();return 1;};globalThis.katex=katex;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  let beforeClose,menuAction,updateListener,closeOptions,closed=false,fail=false,exported,shown=false;
  let updates={phase:'setup',version:'1.1.0',baseUrl:'',autoCheck:false,signed:false,notes:'',message:'Online updates have not been connected yet.'};
  w.studyDesktop={
    loadWorkspace:async()=>loaded,
    saveWorkspace:value=>fail?Promise.reject(new Error('Disk is full')):store.save(value),
    exportWorkspace:async value=>{exported=value;return {canceled:false};},
    pickImport:async()=>null,
    showFiles:async()=>{shown=true;},
    updateState:async()=>updates,
    onUpdateState:callback=>{updateListener=callback;},
    configureUpdates:async options=>{updates={...updates,...options,phase:'idle',message:'Update address saved.'};return updates;},
    checkUpdates:async()=>{updates={...updates,phase:'manual',availableVersion:'1.2.0',message:'Version 1.2.0 is available for manual installation.'};updateListener(updates);return updates;},
    confirmClose:async options=>{closeOptions=options;await store.flush();closed=true;},
    onBeforeClose:callback=>{beforeClose=callback;},onMenuAction:callback=>{menuAction=callback;}
  };
  await import('../dist/app.mjs');
  const doc=w.document,q=s=>{const el=doc.querySelector(s);assert.ok(el,s);return el;};
  const click=s=>q(s).click();
  const input=(s,value)=>{q(s).value=value;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
  const wait=async()=>{await new Promise(r=>setImmediate(r));await store.flush();await new Promise(r=>setImmediate(r));};
  assert.equal(q('#save-status').textContent,'Saved to this computer');
  menuAction('settings');input('#latex-preamble',q('#latex-preamble').value+String.raw`\DeclareMathOperator{\mysupp}{supp}`);
  await beforeClose();assert.equal(closeOptions.draftPending,true,'Closing with a definitions draft is guarded just like a card draft.');closed=false;
  input('#grid-spacing','32');q('#settings-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
  const reopened=(await new WorkspaceStore(dir).load()).workspace;
  assert.equal(reopened.settings.grid.spacing,32);assert.match(reopened.settings.latexPreamble,/DeclareMathOperator/);
  assert.deepEqual(reopened.topics,loaded.workspace.topics,'Saving shared settings preserves all existing cards and connections.');
  click('[data-action=updates]');await wait();
  assert.match(q('[data-update-status]').textContent,/not been connected/);
  assert.equal(q('[data-action=check-updates]').disabled,true);
  input('#update-base-url','https://updates.test/releases');q('#update-settings-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
  click('[data-action=check-updates]');await wait();assert.ok(q('[data-action=open-update-download]'));
  assert.equal(doc.querySelector('[data-action=install-update]'),null);click('[data-action=close-dialog]');
  click('[data-action=topic][data-id=statistical-learning]');click('[data-action=mode]');click('.tool[data-type=theorem]');
  input('#card-title','Offline theorem');input('#card-source','A statement $x=y$.');
  menuAction('updates');await wait();assert.equal(q('#card-title').value,'Offline theorem','The update menu never replaces an open card draft.');
  click('[data-action=editor-side][data-side=proof]');input('#card-source','A proof $x-y=0$.');
  q('#card-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait();
  const saved=JSON.parse(await fs.readFile(store.file,'utf8'));
  const card=saved.topics[1].nodes.find(n=>n.title==='Offline theorem');assert.ok(card);assert.match(card.proof,/x-y/);
  assert.equal(localStorage.getItem('study-tool.workspace.v1'),null,'Desktop saves use files rather than browser storage.');
  menuAction('export');await wait();assert.ok(exported.topics[1].nodes.some(n=>n.id===card.id));
  click('[data-action=storage-details]');assert.match(q('#modal').textContent,/workspace.json/);click('[data-action=show-files]');await wait();assert.ok(shown);click('[data-action=close-dialog]');
  fail=true;click(`[data-action=card][data-id="${card.id}"]`);input('#card-title','An unsaved latest edit');q('#card-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setImmediate(r));assert.match(q('#save-status').textContent,/Could not save/);
  fail=false;click('[data-action=undo]');await wait();assert.equal(q('#save-status').textContent,'Saved to this computer');
  click(`[data-action=card][data-id="${card.id}"]`);input('#card-title','Saved before closing');q('#card-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await beforeClose();assert.equal(closed,true);
  assert.ok(JSON.parse(await fs.readFile(store.file,'utf8')).topics[1].nodes.some(n=>n.title==='Saved before closing'));
});
