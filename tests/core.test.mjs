import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import katex from '../dist/vendor/katex.mjs';
import { seedWorkspace, validateWorkspace, clone, canFlip, addEdge, removeNode, makeNode, edgePath } from '../dist/model.mjs';
import { renderLatex } from '../dist/latex.mjs';
globalThis.katex = katex;

test('all example statements, proofs, and titles compile without errors', () => {
  const data=validateWorkspace(seedWorkspace());
  assert.equal(data.topics.length,2);
  for(const t of data.topics) for(const n of t.nodes) for(const field of ['title','statement','proof']) {
    const result=renderLatex(n[field]);
    assert.deepEqual(result.errors,[],`${n.id}.${field}`);
  }
});
test('theorems, lemmas and corollaries have a proof side', () => {
  for (const type of ['definition','title','remark']) assert.equal(canFlip({type}),false);
  for (const type of ['theorem','lemma','corollary']) assert.equal(canFlip({type}),true);
});
test('graph deletion cleans up dependencies and duplicate/self links are refused', () => {
  const t=seedWorkspace().topics[1];
  assert.equal(addEdge(t,'sl-risk','sl-risk'),false);
  assert.equal(addEdge(t,'sl-risk','sl-bound'),false);
  assert.equal(addEdge(t,'sl-title','sl-bound'),true);
  removeNode(t,'sl-bound');
  assert.ok(t.edges.every(e=>e.from!=='sl-bound'&&e.to!=='sl-bound'));
  assert.doesNotThrow(()=>validateWorkspace({version:1,topics:[t]}));
});
test('imports reject invalid schemas, unsafe identifiers, broken edges, and duplicate IDs', () => {
  assert.throws(()=>validateWorkspace({version:2,topics:[]}));
  for (const mutate of [
    x=>x.topics[0].nodes[0].id='"><script>',
    x=>x.topics[0].nodes[0].type='script',
    x=>x.topics[0].nodes[0].x=NaN,
    x=>x.topics[0].edges[0].to='missing',
    x=>x.topics.push(clone(x.topics[0])),
    x=>x.topics[0].nodes.push(clone(x.topics[0].nodes[0]))
  ]) {const x=seedWorkspace();mutate(x);assert.throws(()=>validateWorkspace(x));}
});
test('export/import round trip keeps source, proof, coordinates, and arrows', () => {
  const original=seedWorkspace();
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(original))),original);
});
test('LaTeX renderer supports text, nested formatting, lists, align, escapes, and macros', () => {
  const result=renderLatex(String.raw`\textbf{A \emph{claim}}: $\norm{x}\leq 1$, \$5 and 20\%.
\begin{align}a&=b+c\\d&=e\end{align}
\begin{itemize}\item First\item Second\begin{enumerate}\item Nested\end{enumerate}\end{itemize}`);
  assert.deepEqual(result.errors,[]);
  assert.match(result.html,/<strong>A <em>claim<\/em><\/strong>/);
  assert.match(result.html,/<ul><li>/);assert.match(result.html,/<ol><li>/);
  assert.match(result.html,/katex/);assert.match(result.html,/\$5 and 20%/);
});
test('invalid LaTeX is reported and HTML cannot execute', () => {
  const invalid=renderLatex(String.raw`$\frac{1}{$`);assert.ok(invalid.errors.length);
  const raw=renderLatex('<img src=x onerror=alert(1)><script>alert(1)</script>');
  assert.ok(!raw.html.includes('<img'));assert.ok(!raw.html.includes('<script>'));
  const link=renderLatex(String.raw`$\href{javascript:alert(1)}{click}$`);
  assert.ok(!link.html.includes('href="javascript:'));
  assert.ok(renderLatex('$missing delimiter').errors.length);
});
test('new cards snap to the grid and graph paths contain finite coordinates', () => {
  const a=makeNode('lemma',127,253), b=makeNode('theorem',620,470);
  assert.equal(a.x,120);assert.equal(a.y,260);
  assert.ok(!/NaN|Infinity/.test(edgePath(a,b)));
});
test('local asset references resolve and runtime has no remote dependency', () => {
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) assert.ok(existsSync(new URL('../dist/'+match[1].slice(2),import.meta.url)),match[1]);
  assert.ok(!/https?:\/\//.test(html));
});
