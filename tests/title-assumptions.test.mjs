import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import katex from '../dist/vendor/katex.mjs';
import {seedWorkspace, validateWorkspace} from '../dist/model.mjs';

const require = createRequire(import.meta.url);
const {JSDOM} = require(process.env.STUDY_TEST_JSDOM || 'jsdom');
const key = 'study-tool.workspace.v1';

async function openWorkspace(t, workspace, suffix) {
  const html = readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const dom = new JSDOM(html,{url:'https://assumptions.test/',pretendToBeVisual:true});
  const w = dom.window, doc = w.document;
  t.after(()=>w.close());
  for (const name of ['window','document','localStorage','history','location','FormData','Event','MouseEvent','Blob']) globalThis[name] = w[name];
  globalThis.requestAnimationFrame = fn=>{fn();return 1;};
  globalThis.katex = katex;
  w.HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close = function(){this.removeAttribute('open');};
  w.localStorage.setItem(key,JSON.stringify(workspace));
  await import(`../dist/app.mjs?title-assumptions=${suffix}`);
  const q = s=>{const el = doc.querySelector(s);assert.ok(el,s);return el;};
  return {
    w, doc, q,
    click:s=>q(s).click(),
    fill:(s,value)=>{q(s).value=value;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));},
    save:()=>q('#card-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),
    state:()=>JSON.parse(w.localStorage.getItem(key))
  };
}

test('title assumptions support study, editing, cancel, undo, export/import and reopening',async t=>{
  const initial = seedWorkspace();
  initial.topics[0].nodes[0].statement = 'Existing title content $X$.';
  const {doc,q,click,fill,save,state} = await openWorkspace(t,initial,'edit');
  click('[data-action=topic][data-id=functional-analysis]');
  click('.flow-node[data-id=fa-title]');
  assert.equal(q('.flash-kind').textContent,'Section assumptions');
  assert.match(q('.flash-content').textContent,/Existing title content/);
  assert.ok(q('.flash-content .katex'));
  assert.equal(doc.querySelector('[data-action=flip]'),null);
  assert.deepEqual(state(),initial,'Reading existing title content does not change saved data.');

  const assumptions = String.raw`Let $X$ and $Y$ be Banach spaces.
\begin{itemize}\item All operators are linear.\item $\norm{T}\leq 1$.\end{itemize}`;
  click('[data-action=edit-card]');
  assert.equal(q('#card-source').getAttribute('aria-label'),'Assumptions LaTeX source');
  assert.equal(q('[data-action=editor-side][data-side=statement]').textContent,'Assumptions');
  assert.equal(doc.querySelector('[data-action=editor-side][data-side=proof]'),null);
  assert.equal(q('#card-source').value,initial.topics[0].nodes[0].statement);
  fill('#card-title',String.raw`Operators on $X$`);
  fill('#card-source',assumptions);
  click('[data-action=editor-preview]');
  assert.equal(q('[data-editor-errors]').textContent,'');
  assert.ok(q('.editor-render .katex'));
  assert.equal(q('.editor-render ul').children.length,2);
  click('[data-action=latex-guide]');click('[data-action=return-editor]');
  click('[data-action=editor-preview]');
  assert.equal(q('#card-source').value,assumptions,'Syntax help and preview retain the draft.');
  save();
  const saved = state();
  assert.equal(saved.topics[0].nodes[0].statement,assumptions);
  assert.equal(saved.topics[0].nodes[0].title,String.raw`Operators on $X$`);
  assert.deepEqual(saved.topics[0].nodes.slice(1),initial.topics[0].nodes.slice(1));
  assert.deepEqual(saved.topics[0].edges,initial.topics[0].edges);
  assert.deepEqual(saved.topics[1],initial.topics[1]);
  assert.deepEqual([saved.topics[0].nodes[0].x,saved.topics[0].nodes[0].y],[initial.topics[0].nodes[0].x,initial.topics[0].nodes[0].y]);
  click('.flow-node[data-id=fa-title]');
  assert.ok(q('.flash-heading h2 .katex'));
  assert.match(q('.flash-content').textContent,/Banach spaces/);
  assert.equal(q('[data-action=edit-card]').textContent,'Edit assumptions');
  click('[data-action=edit-card]');fill('#card-source','Discard this draft.');
  click('.editor-actions [data-action=close-dialog]');
  assert.deepEqual(state(),saved,'Cancel preserves the title and its assumptions.');

  click('.flow-node[data-id=fa-title]');click('[data-action=edit-card]');fill('#card-source','');save();
  assert.equal(state().topics[0].nodes[0].statement,'');
  click('[data-action=mode]');
  click('[data-action=undo]');assert.deepEqual(state(),saved);
  click('[data-action=redo]');assert.equal(state().topics[0].nodes[0].statement,'');
  click('[data-action=undo]');
  click('.tool[data-type=title]');fill('#card-title','A separate subsection');fill('#card-source','Independent assumptions $Y$.');save();
  const second = state().topics[0].nodes.at(-1);
  assert.equal(second.type,'title');assert.equal(second.statement,'Independent assumptions $Y$.');
  assert.equal(state().topics[0].nodes[0].statement,assumptions);
  click('.tool[data-type=title]');fill('#card-source','An unsaved new title');click('.editor-actions [data-action=close-dialog]');
  assert.equal(state().topics[0].nodes.length,initial.topics[0].nodes.length+1);

  const exported = state();
  const imported = validateWorkspace(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(imported,exported,'JSON export/import preserves both titles and assumptions.');
  const reopened = await openWorkspace(t,imported,'reload');
  reopened.click('[data-action=topic][data-id=functional-analysis]');
  reopened.click('.flow-node[data-id=fa-title]');
  assert.match(reopened.q('.flash-content').textContent,/Banach spaces/);
  reopened.click('[data-action=close-dialog]');reopened.click(`.flow-node[data-id="${second.id}"]`);
  assert.match(reopened.q('.flash-content').textContent,/Independent assumptions/);
  reopened.click('[data-action=close-dialog]');
  reopened.click('.brand');reopened.click('[data-action=topic][data-id=statistical-learning]');
  reopened.click('.flow-node[data-id=sl-title]');
  assert.match(reopened.q('.flash-content').textContent,/No assumptions yet/);
  assert.equal(reopened.doc.querySelector('[data-action=flip]'),null);
});
