import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import katex from '../dist/vendor/katex.mjs';
import {seedWorkspace,validateWorkspace,EDGE_STYLES} from '../dist/model.mjs';

test('lattice, connection styles, corollary proofs and shared definitions work together in the interface',async t=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:'https://workspace.test/',pretendToBeVisual:true}),w=dom.window,doc=w.document;
  t.after(()=>w.close());
  for(const key of ['window','document','localStorage','history','location','FormData','Event','MouseEvent','Blob'])globalThis[key]=w[key];
  globalThis.requestAnimationFrame=fn=>{fn();return 1;};globalThis.katex=katex;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  localStorage.setItem('study-tool.workspace.v1',JSON.stringify(seedWorkspace()));
  await import('../dist/app.mjs');
  const q=s=>{const el=doc.querySelector(s);assert.ok(el,s);return el;};
  const click=s=>q(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true})),state=()=>JSON.parse(localStorage.getItem('study-tool.workspace.v1'));
  const fill=(s,value)=>{q(s).value=value;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
  const submit=s=>q(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const change=(s,value)=>{const el=q(s);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const worldPoint=(x,y)=>{
    const [,tx,ty,z]=q('.flow-world').style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    return [+tx+x*z,+ty+y*z];
  };
  const pointer=(target,type,p)=>{const e=new w.MouseEvent(type,{bubbles:true,clientX:p[0],clientY:p[1],button:0});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);};
  click('[data-action=topic][data-id=functional-analysis]');click('[data-action=mode]');
  await t.test('visible points use canvas coordinates and cards snap during the drag, with free placement available',()=>{
    assert.equal(q('#point-lattice').getAttribute('width'),'20');
    assert.equal(q('.grid-dots').getAttribute('visibility'),null);
    const before=state().topics[0].nodes.find(n=>n.id==='fa-banach');
    pointer(q('.flow-node[data-id=fa-banach]'),'pointerdown',worldPoint(275,230));
    pointer(w,'pointermove',worldPoint(288,243));
    assert.equal(q('.flow-node[data-id=fa-banach]').style.left,'180px');assert.equal(q('.flow-node[data-id=fa-banach]').style.top,'180px');
    assert.deepEqual(state().topics[0].nodes.find(n=>n.id==='fa-banach'),before,'No position save occurs before releasing.');
    pointer(w,'pointerup',worldPoint(288,243));assert.equal(state().topics[0].nodes.find(n=>n.id==='fa-banach').x,180);
    change('#snap-grid',false);assert.equal(state().settings.grid.snap,false);
    pointer(q('.flow-node[data-id=fa-banach]'),'pointerdown',worldPoint(280,240));pointer(w,'pointermove',worldPoint(293,257));pointer(w,'pointerup',worldPoint(293,257));
    const free=state().topics[0].nodes.find(n=>n.id==='fa-banach');assert.ok(Math.abs(free.x-193)<1e-6);assert.ok(Math.abs(free.y-197)<1e-6);
    change('#snap-grid',true);
  });
  await t.test('settings retain the existing shortcuts, preview custom macros/operators, and never reposition cards',()=>{
    const positions=state().topics.map(t=>t.nodes.map(n=>[n.x,n.y]));
    click('[data-action=settings]');assert.match(q('#latex-preamble').value,/\\def\\R\{\\mathbb\{R\}\}/);assert.match(q('#latex-preamble').value,/\\def\\P/);
    const script=q('#latex-preamble').value.replace(String.raw`\def\R{\mathbb{R}}`,String.raw`\def\R{\mathbb{Q}}`)+String.raw`
\newcommand{\dual}[1]{#1^{*}}
\DeclareMathOperator{\mysupp}{supp}
\DeclareMathOperator*{\argmin}{arg\,min}
`;
    fill('#latex-preamble',script);fill('#latex-test',String.raw`$\R,\P,\dual{X},\mysupp f$ $$\argmin_{x\in\R} f(x)$$`);click('[data-action=preview-settings]');
    assert.equal(q('[data-settings-errors]').textContent,'');assert.equal(q('[data-settings-test-errors]').textContent,'');assert.ok(q('[data-settings-preview] .katex'));
    fill('#grid-spacing','40');q('[name=gridVisible]').checked=false;submit('#settings-form');assert.equal(q('#modal').open,false);
    assert.equal(state().settings.latexPreamble,script);assert.equal(state().settings.grid.spacing,40);
    assert.deepEqual(state().topics.map(t=>t.nodes.map(n=>[n.x,n.y])),positions);
    assert.equal(q('#point-lattice').getAttribute('width'),'40');assert.equal(q('.grid-dots').getAttribute('visibility'),'hidden');
  });
  await t.test('invalid definitions remain editable and cannot replace saved settings',()=>{
    const before=state();click('[data-action=settings]');
    const good=q('#latex-preamble').value;fill('#latex-preamble',good+String.raw`\input{bad}`);submit('#settings-form');
    assert.equal(q('#modal').open,true);assert.match(q('[data-settings-errors]').textContent,/definitions script/);assert.deepEqual(state(),before);
    click('[data-action=reset-definitions]');assert.notEqual(q('#latex-preamble').value,good);click('.dialog-actions [data-action=close-dialog]');assert.deepEqual(state(),before,'Cancel leaves saved settings untouched.');
  });
  let corollary;
  await t.test('a green corollary saves distinct statement and proof with shared definitions available on both sides',()=>{
    click('.tool[data-type=corollary]');fill('#card-title',String.raw`Duality in $\R$`);fill('#card-source',String.raw`For $X$, use $\dual{X}$ and $\mysupp f$.`);
    click('[data-action=editor-side][data-side=proof]');fill('#card-source',String.raw`Choose $x\in\R$. Then $\dual{X}$ has the claimed property.`);click('[data-action=editor-preview]');
    assert.equal(q('[data-editor-errors]').textContent,'');assert.ok(q('.editor-render .katex'));submit('#card-form');
    corollary=state().topics[0].nodes.find(n=>n.type==='corollary');assert.ok(corollary);assert.match(corollary.proof,/claimed property/);
    assert.equal(q(`.flow-node[data-id="${corollary.id}"]`).style.getPropertyValue('--card-color'),'#9bce8c');
    click('[data-action=mode]');click(`.flow-node[data-id="${corollary.id}"]`);assert.match(q('.flash-kind').textContent,/Corollary/);assert.ok(q('.flash-heading h2 .katex'));assert.equal(doc.querySelector('.latex-errors'),null);
    click('[data-action=flip]');assert.equal(q('.flash-heading h2').textContent,'Proof');assert.match(q('.flash-content').textContent,/claimed property/);assert.equal(doc.querySelector('.latex-errors'),null);click('[data-action=close-dialog]');click('[data-action=mode]');
  });
  await t.test('all seven connection choices render their heads, persist, and support one-step undo',()=>{
    const id=state().topics[0].edges[0].id;click(`.edge-hit[data-id="${id}"]`);
    for(const style of Object.keys(EDGE_STYLES)){
      change('#connection-style',style);const edge=q(`.edge[data-id="${id}"]`);
      assert.equal(edge.dataset.style,style);assert.equal(state().topics[0].edges.find(e=>e.id===id).style,style);
      const path=edge.querySelector(style.startsWith('implication')?'.edge-heads':'.edge-line');
      assert.equal(path.getAttribute('marker-start'),null);
      assert.equal(path.getAttribute('marker-end'),null);
      assert.equal(path.getAttribute('marker-mid'),style==='line'?null:`url(#${style}-head-selected)`);
      if(style!=='line') {
        const marker=q(`#${style}-head-selected`);
        assert.equal(marker.getAttribute('refX'),'0');
        assert.equal(marker.getAttribute('orient'),'auto');
        assert.equal(marker.querySelector('path').getAttribute('stroke'),'#c30ce7');
        assert.equal(edge.querySelector('.edge-line').getAttribute('d'),path.getAttribute('d'));
      }
      assert.equal(!!edge.querySelector('.edge-gap'),style.startsWith('implication'));
    }
    click('[data-action=undo]');assert.equal(state().topics[0].edges.find(e=>e.id===id).style,'implication-backward');
    click('[data-action=redo]');assert.equal(state().topics[0].edges.find(e=>e.id===id).style,'implication-both');
    click('[data-action=connect]');change('#connection-style','arrow-backward');click(`.flow-node[data-id="${corollary.id}"]`);click('.flow-node[data-id=fa-ubp]');
    const created=state().topics[0].edges.at(-1);assert.equal(created.from,corollary.id);assert.equal(created.style,'arrow-backward');
    click('[data-action=mode]');assert.equal(q(`.edge[data-id="${created.id}"] .edge-line`).getAttribute('marker-mid'),'url(#arrow-backward-head)');
    assert.equal(doc.querySelector('.edge-hit'),null,'Display mode keeps connection styles without editing hit targets.');
    assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(state()))),state());
  });
  await t.test('midpoint arrowheads follow card movement, undo and display changes without changing saved styles',()=>{
    click('[data-action=mode]');
    const before=state(),edge=before.topics[0].edges.at(-1);
    const selector=`.edge[data-id="${edge.id}"] .edge-line`;
    const original=q(selector).getAttribute('d');
    const node=before.topics[0].nodes.find(n=>n.id===edge.to);
    pointer(q(`.flow-node[data-id="${node.id}"]`),'pointerdown',worldPoint(node.x+70,node.y+50));
    pointer(w,'pointermove',worldPoint(node.x+190,node.y+130));
    pointer(w,'pointerup',worldPoint(node.x+190,node.y+130));
    const moved=q(selector).getAttribute('d');
    assert.notEqual(moved,original);
    assert.equal(q(selector).getAttribute('marker-mid'),'url(#arrow-backward-head)');
    assert.deepEqual(state().topics[0].edges,before.topics[0].edges);
    click('[data-action=undo]');assert.deepEqual(state(),before);assert.equal(q(selector).getAttribute('d'),original);
    click('[data-action=redo]');assert.equal(q(selector).getAttribute('d'),moved);
    click('[data-action=mode]');assert.equal(q(selector).getAttribute('marker-mid'),'url(#arrow-backward-head)');
    assert.equal(doc.querySelector('.edges [marker-start], .edges [marker-end]'),null);
  });
});
