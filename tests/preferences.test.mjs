import {test} from 'node:test';
import assert from 'node:assert/strict';
import katex from '../dist/vendor/katex.mjs';
import {seedWorkspace,validateWorkspace,makeNode,canFlip,EDGE_STYLES} from '../dist/model.mjs';
import {DEFAULT_PREAMBLE,defaultSettings} from '../dist/preferences.mjs';
import {compilePreamble} from '../dist/preamble.mjs';
import {renderLatex} from '../dist/latex.mjs';
import {groupTranslation} from '../dist/selection.mjs';
globalThis.katex=katex;

test('legacy workspaces retain all topics, card sources and exact positions while plain lines gain explicit defaults',()=>{
  const old={version:1,topics:seedWorkspace().topics};
  for(const t of old.topics)for(const e of t.edges)delete e.style;
  const original=structuredClone(old),next=validateWorkspace(old);
  assert.deepEqual(old,original,'Validation never mutates the input.');
  assert.equal(next.version,2);assert.deepEqual(next.settings,defaultSettings());
  for(let i=0;i<old.topics.length;i++){
    assert.deepEqual(next.topics[i].nodes,old.topics[i].nodes);
    assert.deepEqual(next.topics[i].edges,old.topics[i].edges.map(e=>({...e,style:'line'})));
  }
});
test('new-format exports retain corollary proofs, every connection style and the complete editable script',()=>{
  const data=seedWorkspace(),t=data.topics[0];
  const c=makeNode('corollary',330,270);c.statement=String.raw`$\newSymbol{x}=x^2$`;c.proof='A corollary proof.';t.nodes.push(c);
  const keys=Object.keys(EDGE_STYLES);
  t.edges=keys.map((style,i)=>({id:`style-${i}`,from:t.nodes[i%t.nodes.length].id,to:t.nodes[(i+1)%t.nodes.length].id,style}));
  // Give every pair a unique identity in this fixture.
  t.edges=t.edges.filter((e,i,a)=>a.findIndex(x=>x.from===e.from&&x.to===e.to)===i);
  data.settings.latexPreamble+=String.raw`\newcommand{\newSymbol}[1]{#1^2}`;
  data.settings.grid={visible:false,snap:false,spacing:32};
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(data))),data);assert.equal(canFlip(c),true);
  assert.equal(validateWorkspace(data).topics[0].nodes.at(-1).proof,c.proof);
});
test('invalid settings, connection styles and future schemas cannot be silently accepted',()=>{
  for(const mutate of [d=>d.version=3,d=>d.settings.grid.spacing=0,d=>d.settings.grid.spacing=20.5,d=>d.settings.grid.snap='yes',d=>d.settings.latexPreamble='x'.repeat(32001),d=>d.topics[0].edges[0].style='url(javascript:bad)',d=>d.topics[0].nodes[0].type='__proto__']){
    const d=seedWorkspace();mutate(d);assert.throws(()=>validateWorkspace(d));
  }
});
test('live lattice snapping aligns the dragged card and preserves off-grid group spacing even at boundaries',()=>{
  const originals=[{id:'a',x:175,y:170},{id:'b',x:635,y:380}];
  const delta=groupTranslation(originals,17,13,{enabled:true,spacing:20,anchor:originals[1]});
  assert.deepEqual(delta,{dx:25,dy:20});
  assert.equal((originals[1].x+delta.dx)%20,0);assert.equal((originals[1].y+delta.dy)%20,0);
  assert.equal((originals[1].x+delta.dx)-(originals[0].x+delta.dx),460);
  assert.deepEqual(groupTranslation(originals,17.4,13.1,{enabled:false,spacing:20,anchor:originals[1]}),{dx:17.4,dy:13.1});
  const edge=groupTranslation([{x:7,y:7},{x:5977,y:5977}],900,900,{enabled:true,spacing:20,anchor:{x:7,y:7}});
  assert.deepEqual(edge,{dx:13,dy:13});
  assert.deepEqual([makeNode('corollary',127,253,{snap:false}).x,makeNode('corollary',127,253,{snap:false}).y],[127,253]);
  assert.equal(makeNode('corollary',6000,6000,{spacing:32}).x,5984,'A new card remains on the last actual lattice point at the canvas boundary.');
});
test('starter shortcuts, nested commands, required arguments and starred operators compile from a shared script',()=>{
  const preamble=DEFAULT_PREAMBLE+String.raw`
\newcommand{\dual}[1]{#1^{*}}
\newcommand{\pair}[2]{\langle#1,#2\rangle}
\DeclareMathOperator{\esssupp}{ess\,supp}
\DeclareMathOperator*{\argmin}{arg\,min}
\renewcommand{\R}{\mathbb{Q}}
`;
  assert.deepEqual(compilePreamble(preamble).errors,[]);
  const result=renderLatex(String.raw`$\R,\P,\dual{X},\pair{x}{y},\esssupp f$ $$\argmin_{x\in\R} f(x)$$`,{preamble});
  assert.deepEqual(result.errors,[]);assert.match(result.html,/katex-display/);assert.match(result.html,/>Q</);
  const examples=DEFAULT_PREAMBLE.replace(/^% (\\.*)$/gm,'$1');assert.deepEqual(compilePreamble(examples).errors,[]);
});
test('shared definitions are editable and isolated from commands declared inside another card',()=>{
  const preamble=String.raw`\def\R{\mathbb{Q}}\def\P{\mathbb{V}}`;
  const before=renderLatex('$\\R,\\P$',{preamble});
  renderLatex(String.raw`$\gdef\R{\mathbb{Z}}\gdef\leaked{x}\R$`,{preamble});
  assert.deepEqual(renderLatex('$\\R,\\P$',{preamble}),before);
  assert.ok(renderLatex('$\\leaked$',{preamble}).errors.length);
  assert.notEqual(renderLatex('$\\R$').html,renderLatex('$\\R$',{preamble}).html);
});
test('bad preambles are reported, recursive expansion is bounded and macros cannot enable trusted HTML',()=>{
  for(const source of [String.raw`\newcommand{\broken}[1]{#1`,String.raw`\input{secrets}`,String.raw`\usepackage{amsmath}`,String.raw`x+y`,String.raw`\def\broken#2{x}`])assert.ok(compilePreamble(source).errors.length,source);
  assert.ok(renderLatex('$\\loop$',{preamble:String.raw`\def\loop{\loop}`}).errors.length);
  const result=renderLatex('$\\unsafe{x}$',{preamble:String.raw`\newcommand{\unsafe}[1]{\href{javascript:bad}{#1}}`});
  assert.ok(!result.html.includes('<a href='));
});
