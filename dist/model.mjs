import { defaultSettings, validateSettings } from './preferences.mjs';
export const SCHEMA_VERSION = 2;
export const TYPES = Object.freeze({
  definition: { label: 'Definition', color: '#4b91ed', proof: false },
  theorem: { label: 'Theorem', color: '#c30ce7', proof: true },
  lemma: { label: 'Lemma', color: '#c30ce7', proof: true },
  corollary: { label: 'Corollary', color: '#9bce8c', proof: true },
  title: { label: 'Title', color: '#111111', proof: false },
  remark: { label: 'Remark', color: '#111111', proof: false }
});
export const NODE_WIDTH = 216;
export const NODE_HEIGHT = 114;
export const TITLE_WIDTH = 260;
export const TITLE_HEIGHT = 46;
export const uid = (prefix = 'id') => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
export const clone = value => JSON.parse(JSON.stringify(value));
export const bounds = node => ({ width: node.type === 'title' ? TITLE_WIDTH : NODE_WIDTH, height: node.type === 'title' ? TITLE_HEIGHT : NODE_HEIGHT });
export const canFlip = node => !!TYPES[node.type]?.proof;
export const EDGE_STYLES = Object.freeze({
  line:'Line —',
  'arrow-forward':'Arrow →', 'arrow-backward':'Arrow ←', 'arrow-both':'Arrow ↔',
  'implication-forward':'Implication ⇒', 'implication-backward':'Implication ⇐', 'implication-both':'Equivalence ⇔'
});
export const snapCoordinate = (value, spacing = 20) => Math.max(0,Math.min(Math.floor(6000 / spacing),Math.round(value / spacing))) * spacing;

export function makeNode(type, x, y, {snap = true, spacing = 20} = {}) {
  if (!Object.hasOwn(TYPES,type)) throw new Error('Choose a valid card type.');
  return { id: uid('card'), type, title: TYPES[type].label, statement: '', proof: '', x: snap ? snapCoordinate(x,spacing) : Math.max(0,Math.min(6000,x)), y: snap ? snapCoordinate(y,spacing) : Math.max(0,Math.min(6000,y)) };
}

export function addEdge(topic, from, to, style = 'line') {
  if (!Object.hasOwn(EDGE_STYLES,style)) throw new Error('Choose a valid connection style.');
  if (from === to || !topic.nodes.some(n => n.id === from) || !topic.nodes.some(n => n.id === to)) return false;
  if (topic.edges.some(e => e.from === from && e.to === to)) return false;
  topic.edges.push({ id: uid('link'), from, to, style });
  return true;
}

export function removeNode(topic, id) {
  topic.nodes = topic.nodes.filter(n => n.id !== id);
  topic.edges = topic.edges.filter(e => e.from !== id && e.to !== id);
}

// Split the cubic at t = 1/2 without changing its route. Its symmetric control
// points make this vertex the halfway point along the line, including curves.
function midpointCurve(sx, sy, cx, cy, dx, dy, ex, ey) {
  const ax = (sx + cx) / 2, ay = (sy + cy) / 2;
  const bx = (cx + dx) / 2, by = (cy + dy) / 2;
  const zx = (dx + ex) / 2, zy = (dy + ey) / 2;
  const lx = (ax + bx) / 2, ly = (ay + by) / 2;
  const rx = (bx + zx) / 2, ry = (by + zy) / 2;
  return `M ${sx} ${sy} C ${ax} ${ay}, ${lx} ${ly}, ${(lx + rx) / 2} ${(ly + ry) / 2} C ${rx} ${ry}, ${zx} ${zy}, ${ex} ${ey}`;
}

export function edgePath(from, to, {startInset = 0, endInset = 0} = {}) {
  const a = bounds(from), b = bounds(to);
  const ax = from.x + a.width / 2, ay = from.y + a.height / 2;
  const bx = to.x + b.width / 2, by = to.y + b.height / 2;
  const dx = bx - ax, dy = by - ay;
  const vertical = Math.abs(dy) / ((a.height + b.height) / 2) >= Math.abs(dx) / ((a.width + b.width) / 2);
  let sx, sy, ex, ey;
  if (vertical) {
    const sign = dy >= 0 ? 1 : -1;
    sx = ax; sy = ay + sign * (a.height / 2 + 1 + startInset);
    ex = bx; ey = by - sign * (b.height / 2 + 1 + endInset);
    const bend = Math.abs(ey - sy) * .5;
    return midpointCurve(sx, sy, sx, sy + sign * bend, ex, ey - sign * bend, ex, ey);
  }
  const sign = dx >= 0 ? 1 : -1;
  sx = ax + sign * (a.width / 2 + 1 + startInset); sy = ay;
  ex = bx - sign * (b.width / 2 + 1 + endInset); ey = by;
  const bend = Math.abs(ex - sx) * .5;
  return midpointCurve(sx, sy, sx + sign * bend, sy, ex - sign * bend, ey, ex, ey);
}

function text(value, label, max = 100000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} is missing or too long.`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new Error('The file contains an invalid identifier.');
  return value;
}
export function validateWorkspace(raw) {
  if (!raw || ![1,SCHEMA_VERSION].includes(raw.version) || !Array.isArray(raw.topics) || raw.topics.length > 200) throw new Error('Choose a Study Tool JSON export (version 1 or 2).');
  const settings = raw.version === 1 ? defaultSettings() : validateSettings(raw.settings);
  const topicIds = new Set();
  const topics = raw.topics.map(t => {
    const topicId = id(t.id);
    if (topicIds.has(topicId)) throw new Error('The file contains duplicate topics.');
    topicIds.add(topicId);
    const title = text(t.title, 'Topic title', 300).trim();
    if (!title) throw new Error('A topic needs a title.');
    if (!Array.isArray(t.nodes) || t.nodes.length > 500 || !Array.isArray(t.edges) || t.edges.length > 2000) throw new Error('A topic contains too many cards or links.');
    const nodeIds = new Set();
    const nodes = t.nodes.map(n => {
      const nodeId = id(n.id);
      if (nodeIds.has(nodeId) || !Object.hasOwn(TYPES,n.type)) throw new Error('The file contains duplicate cards or an unknown card type.');
      nodeIds.add(nodeId);
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.y < 0 || n.x > 6000 || n.y > 6000) throw new Error('A card position is invalid.');
      return { id: nodeId, type: n.type, title: text(n.title, 'Card title', 500), statement: text(n.statement, 'Statement'), proof: canFlip(n) ? text(n.proof, 'Proof') : '', x: n.x, y: n.y };
    });
    const edgeIds = new Set(), pairs = new Set();
    const edges = t.edges.map(e => {
      const edgeId = id(e.id), pair = `${e.from}:${e.to}`;
      if (edgeIds.has(edgeId) || pairs.has(pair) || e.from === e.to || !nodeIds.has(e.from) || !nodeIds.has(e.to)) throw new Error('The file contains an invalid link.');
      edgeIds.add(edgeId); pairs.add(pair);
      const style = e.style ?? 'line';
      if (!Object.hasOwn(EDGE_STYLES,style)) throw new Error('The file contains an unknown connection style.');
      return { id: edgeId, from: e.from, to: e.to, style };
    });
    return { id: topicId, title, nodes, edges };
  });
  return { version: SCHEMA_VERSION, settings, topics };
}

export function seedWorkspace() {
  return validateWorkspace({ version: 1, topics: [
    {
      id: 'functional-analysis', title: 'Functional Analysis', nodes: [
        { id: 'fa-title', type: 'title', title: 'Bounded linear operators', statement: '', proof: '', x: 408, y: 48 },
        { id: 'fa-banach', type: 'definition', title: 'Banach space', statement: String.raw`A normed vector space $(X,\|\cdot\|)$ is a \emph{Banach space} if every Cauchy sequence in $X$ converges to an element of $X$.\par Completeness lets us pass from approximation to existence.`, proof: '', x: 175, y: 170 },
        { id: 'fa-bounded', type: 'definition', title: 'Bounded linear operator', statement: String.raw`A linear map $T:X\to Y$ is \emph{bounded} if there exists $C\geq 0$ such that
\[\|Tx\|_Y\leq C\|x\|_X\qquad (x\in X).\]
Its operator norm is $\|T\|=\sup_{\|x\|_X\leq 1}\|Tx\|_Y$.`, proof: '', x: 635, y: 170 },
        { id: 'fa-continuity', type: 'lemma', title: 'Boundedness and continuity', statement: String.raw`Let $X,Y$ be normed spaces and $T:X\to Y$ linear. Then $T$ is bounded if and only if it is continuous. In fact, continuity at $0$ is sufficient.`, proof: String.raw`If $T$ is bounded, then
\[\|Tx-Ty\|_Y\leq\|T\|\,\|x-y\|_X,\]
so $T$ is Lipschitz continuous.\par Conversely, continuity at $0$ gives $\delta>0$ such that $\|z\|_X<\delta$ implies $\|Tz\|_Y<1$. For $x\ne0$, apply this to $z=\delta x/(2\|x\|_X)$ to obtain $\|Tx\|_Y\leq 2\|x\|_X/\delta$.\hfill$\square$`, x: 635, y: 380 },
        { id: 'fa-ubp', type: 'theorem', title: 'Uniform boundedness', statement: String.raw`Let $X$ be a Banach space, $Y$ a normed space, and $\mathcal T\subseteq\mathcal L(X,Y)$. If
\[\sup_{T\in\mathcal T}\|Tx\|_Y<\infty\qquad\text{for every }x\in X,\]
then $\sup_{T\in\mathcal T}\|T\|<\infty$.`, proof: String.raw`Set $E_n=\{x\in X:\sup_{T\in\mathcal T}\|Tx\|_Y\leq n\}$. Each $E_n$ is closed and $X=\bigcup_{n\geq1}E_n$.\par By the Baire category theorem, some $E_N$ contains a ball $B(x_0,r)$. For $\|h\|_X<r$, both $x_0+h$ and $x_0$ belong to $E_N$, so
\[\|Th\|_Y\leq\|T(x_0+h)\|_Y+\|Tx_0\|_Y\leq2N.\]
Taking $h=ru/2$ for $\|u\|_X\leq1$ yields $\|T\|\leq4N/r$, uniformly over $T\in\mathcal T$.\hfill$\square$`, x: 405, y: 600 }
      ], edges: [
        {id:'fa-link1',from:'fa-bounded',to:'fa-continuity'},
        {id:'fa-link2',from:'fa-banach',to:'fa-ubp'},
        {id:'fa-link3',from:'fa-continuity',to:'fa-ubp'}
      ]
    },
    {
      id: 'statistical-learning', title: 'Statistical Learning', nodes: [
        { id: 'sl-title', type: 'title', title: 'From data to generalisation', statement: '', proof: '', x: 408, y: 48 },
        { id: 'sl-risk', type: 'definition', title: 'Empirical risk', statement: String.raw`Let $Z_1,\ldots,Z_n$ be i.i.d. observations with law $P$, and let $\ell(h,Z)\in[0,1]$ be a loss.\par The \emph{risk} and \emph{empirical risk} of $h$ are
\[R(h)=\mathbb E[\ell(h,Z)],\qquad \widehat R_n(h)=\frac1n\sum_{i=1}^n\ell(h,Z_i).\]`, proof: '', x: 405, y: 170 },
        { id: 'sl-hoeffding', type: 'lemma', title: 'Hoeffding’s inequality', statement: String.raw`Let $X_1,\ldots,X_n$ be independent random variables taking values in $[0,1]$. For every $\varepsilon>0$,
\[\mathbb P\!\left(\left|\frac1n\sum_{i=1}^n(X_i-\mathbb E X_i)\right|\geq\varepsilon\right)\leq2e^{-2n\varepsilon^2}.\]`, proof: String.raw`Hoeffding’s exponential moment bound gives
\[\mathbb E e^{\lambda(X_i-\mathbb E X_i)}\leq e^{\lambda^2/8}.\]
By independence and Markov’s inequality,
\[\mathbb P\!\left(\sum_i(X_i-\mathbb E X_i)\geq n\varepsilon\right)\leq e^{-\lambda n\varepsilon+n\lambda^2/8}.\]
Choose $\lambda=4\varepsilon$ to obtain $e^{-2n\varepsilon^2}$. Apply the same argument to $-X_i$ and add the two tail bounds.\hfill$\square$`, x: 175, y: 390 },
        { id: 'sl-bound', type: 'theorem', title: 'Finite-class risk bound', statement: String.raw`Suppose $\mathcal H$ is a nonempty finite hypothesis class and the loss takes values in $[0,1]$. For $0<\delta<1$, with probability at least $1-\delta$,
\[\sup_{h\in\mathcal H}|R(h)-\widehat R_n(h)|\leq\sqrt{\frac{\log(2|\mathcal H|/\delta)}{2n}}.\]`, proof: String.raw`For a fixed $h$, apply Hoeffding’s inequality to $X_i=\ell(h,Z_i)$:
\[\mathbb P(|R(h)-\widehat R_n(h)|>\varepsilon)\leq2e^{-2n\varepsilon^2}.\]
The union bound over $\mathcal H$ gives
\[\mathbb P\!\left(\sup_{h\in\mathcal H}|R(h)-\widehat R_n(h)|>\varepsilon\right)\leq2|\mathcal H|e^{-2n\varepsilon^2}.\]
Set the right-hand side equal to $\delta$ and solve for $\varepsilon$.\hfill$\square$`, x: 635, y: 390 },
        { id: 'sl-remark', type: 'remark', title: 'Why uniformity matters', statement: String.raw`The bound holds \emph{simultaneously} for every $h\in\mathcal H$. Therefore it also applies to a hypothesis chosen after seeing the data, such as an empirical risk minimiser.\par A bound for one fixed $h$ alone would not justify that step.`, proof: '', x: 405, y: 610 }
      ], edges: [
        {id:'sl-link1',from:'sl-risk',to:'sl-hoeffding'},
        {id:'sl-link2',from:'sl-risk',to:'sl-bound'},
        {id:'sl-link3',from:'sl-hoeffding',to:'sl-bound'},
        {id:'sl-link4',from:'sl-bound',to:'sl-remark'}
      ]
    }
  ]});
}
