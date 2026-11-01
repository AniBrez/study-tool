import { TYPES, EDGE_STYLES, uid, clone, bounds, canFlip, makeNode, addEdge, removeNode, edgePath, validateWorkspace, seedWorkspace } from './model.mjs';
import { renderLatex, escapeHTML as esc } from './latex.mjs';
import { lassoSelection, connectedSelection, groupTranslation } from './selection.mjs';
import { DEFAULT_PREAMBLE, validateSettings } from './preferences.mjs';
import { compilePreamble } from './preamble.mjs';

const STORAGE_KEY = 'study-tool.workspace.v1';
const main = document.querySelector('#main');
const modal = document.querySelector('#modal');
const saveStatus = document.querySelector('#save-status');
const desktop = window.studyDesktop || null;
const pendingWrites = new Set();
let saveGeneration = 0;
let desktopInfo = null;
let updateState = null;
let hasUnsavedDraft = () => false;
let storageWarning = '';
let workspace;
desktop?.onBeforeClose(async () => {
  if (main.querySelector('.flow-viewport')) endPointer(true);
  await Promise.allSettled([...pendingWrites]);
  await desktop.confirmClose({draftPending:hasUnsavedDraft()}).catch(() => {});
});
try {
  if (desktop) {
    desktopInfo = await desktop.loadWorkspace();
    workspace = validateWorkspace(desktopInfo.workspace);
    storageWarning = desktopInfo.notice || '';
  } else {
    const stored = localStorage.getItem(STORAGE_KEY);
    workspace = stored ? validateWorkspace(JSON.parse(stored)) : seedWorkspace();
  }
} catch (error) {
  if (desktop) {
    main.innerHTML = '<p style="padding:40px">Your workspace could not be opened. Close and reopen Study Tool. Your saved files have not been reset.</p>';
    throw error;
  }
  workspace = seedWorkspace();
  storageWarning = 'Saved data could not be read. Existing storage stays untouched until you make a change.';
}
const ui = { topicId: null, edit: false, manage: false, connect: false, source: null, selectedEdge: null, edgeStyle:'line', lasso: false, selected: new Set(), locked: false, views: new Map(), card: null, modalAction: null, lastFocus: null, undo: [], redo: [], drag: null, suppressClickUntil: 0 };
hasUnsavedDraft = () => {
  if (modal.open && modal.classList.contains('settings-dialog')) return JSON.stringify(settingsFormValue()) !== JSON.stringify(workspace.settings);
  const c=ui.card,n=cardNode();
  return !!(c?.editing && n && ['title','statement','proof'].some(field=>c.draft[field]!==n[field]));
};
const topic = () => workspace.topics.find(t => t.id === ui.topicId);
const camera = () => {
  if (!ui.views.has(ui.topicId)) ui.views.set(ui.topicId, { x: 0, y: 0, zoom: 1 });
  return ui.views.get(ui.topicId);
};
const compiledLatex = (text, options = {}) => renderLatex(text, {preamble:workspace.settings.latexPreamble,...options});
const latex = (text, inline = false) => compiledLatex(text, { inline }).html;
const announce = text => { document.querySelector('#announcement').textContent = text; };

function showSaveStatus() {
  saveStatus.textContent = storageWarning || (desktop ? (pendingWrites.size ? 'Saving to this computer…' : 'Saved to this computer') : 'Saved in this browser');
  saveStatus.classList.toggle('save-warning', !!storageWarning);
}
function persist() {
  if (desktop) {
    const generation = ++saveGeneration;
    const pending = desktop.saveWorkspace(clone(workspace));
    pendingWrites.add(pending);
    showSaveStatus();
    pending.then(() => {if (generation === saveGeneration) storageWarning = '';}, error => {
      if (generation === saveGeneration) storageWarning = 'Could not save your latest changes. Export a copy before closing. ' + error.message;
    }).finally(() => {pendingWrites.delete(pending);showSaveStatus();});
    return pending;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); storageWarning = ''; }
  catch { storageWarning = 'Browser saving is unavailable. Export your work before leaving this page.'; }
  showSaveStatus();
}
function remember(before = clone(workspace)) {
  ui.undo.push(before);
  if (ui.undo.length > 35) ui.undo.shift();
  ui.redo = [];
}
function commit(change) {
  remember(); change(); persist();
}
function undo(redo = false) {
  endPointer(true);
  const from = redo ? ui.redo : ui.undo, to = redo ? ui.undo : ui.redo;
  if (!from.length) return;
  to.push(clone(workspace)); workspace = from.pop();
  if (!topic()) ui.topicId = null;
  ui.source = null; ui.selectedEdge = null; ui.selected.clear();
  persist(); render(); announce(redo ? 'Change redone.' : 'Change undone.');
}

function render() {
  endPointer(true);
  const t = topic();
  ui.selected = new Set([...ui.selected].filter(id => t?.nodes.some(n => n.id === id)));
  const breadcrumb = document.querySelector('#breadcrumb-topic');
  breadcrumb.hidden = !t;
  breadcrumb.innerHTML = t ? `<span class="mapsto" aria-hidden="true"></span><span class="topic-name">${latex(t.title, true)}</span>` : '';
  document.title = t ? `${t.title} — Study Tool` : 'Study Tool';
  if (!t) renderHome(); else renderFlow();
  showSaveStatus();
  const nextHash = t ? `#topic/${encodeURIComponent(t.id)}` : '';
  if (location.hash !== nextHash) history.replaceState(null, '', `${location.pathname}${location.search}${nextHash}`);
}

function renderHome() {
  main.innerHTML = `<section class="home" aria-label="Your topics">
    <section class="topics-panel" aria-labelledby="topics-heading">
      <div class="panel-heading"><h1 id="topics-heading">Topics</h1><button class="manage-topics" data-action="manage" aria-label="${ui.manage ? 'Finish managing topics' : 'Add, rename, or delete topics'}" aria-pressed="${ui.manage}" title="Add or remove topics">±</button></div>
      ${workspace.topics.length ? `<ul class="topic-list">${workspace.topics.map(t => `<li class="topic-row"><span class="topic-star" aria-hidden="true">★</span><button class="topic-open" data-action="topic" data-id="${esc(t.id)}">${latex(t.title, true)}</button>${ui.manage ? `<button class="row-action" data-action="rename-topic" data-id="${esc(t.id)}" aria-label="Rename ${esc(t.title)}">Rename</button><button class="row-action" data-action="delete-topic" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">−</button>` : ''}</li>`).join('')}</ul>` : `<div class="empty-topics">Your next subject begins here.<br><button data-action="manage">Add a topic</button></div>`}
      ${ui.manage ? `<form class="topic-form" id="add-topic-form"><label for="new-topic-title">New topic<input id="new-topic-title" name="title" maxlength="300" placeholder="e.g. Dynamical Systems" required autocomplete="off"></label><button type="submit">Add topic</button></form>` : ''}
    </section>
    <p class="home-note">Choose a topic to open its flowchart. Use ± to manage your topics.</p>
    ${workspace.topics.some(t => ['functional-analysis','statistical-learning'].includes(t.id)) ? '<p class="home-note">The starting topics are editable examples.</p>' : ''}
    ${ui.manage && (ui.undo.length || ui.redo.length) ? `<div class="home-history"><button data-action="undo" ${ui.undo.length ? '' : 'disabled'}>Undo</button><button data-action="redo" ${ui.redo.length ? '' : 'disabled'}>Redo</button></div>` : ''}
  </section>`;
  if (ui.manage) requestAnimationFrame(() => document.querySelector('#new-topic-title')?.focus());
}

function toolbarHTML() {
  const selected = topic()?.edges.find(e => e.id === ui.selectedEdge);
  const style = selected?.style || ui.edgeStyle;
  return `<div class="editor-controls"><div class="editor-toolbar" role="toolbar" aria-label="Flowchart editing tools">
    <button data-action="connect" aria-pressed="${ui.connect}" title="Select one card, then another card">${ui.connect ? 'Cancel link' : 'Connect'}</button>
    <button data-action="lasso" aria-pressed="${ui.lasso}" title="Draw a loop around cards to move them together">Lasso</button>
    ${ui.selected.size ? `<span class="selection-tools"><span role="status">${ui.selected.size} selected</span><button data-action="select-connected" title="Include every card connected to this selection">Select connected</button><button data-action="clear-selection">Clear</button></span>` : ''}
    <button data-action="undo" class="undo-button" aria-label="Undo" title="Undo (Ctrl or ⌘ Z)" ${ui.undo.length ? '' : 'disabled'}>↶</button>
    <button data-action="redo" class="undo-button" aria-label="Redo" title="Redo (Ctrl or ⌘ Shift Z)" ${ui.redo.length ? '' : 'disabled'}>↷</button>
    <span class="spacer"></span>
    <label class="lock-label"><input type="checkbox" id="snap-grid" ${workspace.settings.grid.snap ? 'checked' : ''}> Snap to grid</label>
    <label class="lock-label"><input type="checkbox" id="lock-layout" ${ui.locked ? 'checked' : ''}> Lock positions</label>
  </div>${ui.connect || selected ? `<div class="connection-editor"><label for="connection-style">${selected ? 'Selected connection' : 'New connection'}<select id="connection-style" aria-label="Connection style">${Object.entries(EDGE_STYLES).map(([value,label])=>`<option value="${value}" ${value === style ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${selected ? `<span class="connection-endpoints">First: ${latex(topic().nodes.find(n=>n.id===selected.from).title,true)} <span aria-hidden="true">·</span> Second: ${latex(topic().nodes.find(n=>n.id===selected.to).title,true)}</span><button data-action="delete-edge">Remove link</button>` : '<span class="dialog-note">Forward points from the first card to the second.</span>'}</div>` : ''}</div>`;
}

function canvasSVG() {
  const {spacing,visible} = workspace.settings.grid;
  const heads = {
    'arrow-forward':'M -8 -4 L 0 0 L -8 4',
    'arrow-backward':'M 8 -4 L 0 0 L 8 4',
    'arrow-both':'M -2 -4 L -10 0 L -2 4 M 2 -4 L 10 0 L 2 4',
    'implication-forward':'M -10 -5 L 0 0 L -10 5',
    'implication-backward':'M 10 -5 L 0 0 L 10 5',
    'implication-both':'M -2 -5 L -12 0 L -2 5 M 2 -5 L 12 0 L 2 5'
  };
  const markers = ['', '-selected'].map(suffix => Object.entries(heads).map(([style,path]) => `<marker id="${style}-head${suffix}" viewBox="-14 -7 28 14" refX="0" refY="0" markerWidth="28" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto"><path d="${path}" fill="none" stroke="${suffix ? '#c30ce7' : '#111'}" stroke-width="1.6" stroke-linejoin="miter"/></marker>`).join('')).join('');
  return `<svg class="connections" aria-label="Panel connections"><defs>${markers}<pattern id="point-lattice" x="${-spacing/2}" y="${-spacing/2}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><circle cx="${spacing/2}" cy="${spacing/2}" r="1.1" fill="#c7c7c7"/></pattern></defs><rect class="grid-dots" width="6300" height="6300" fill="url(#point-lattice)" ${visible ? '' : 'visibility="hidden"'}/><g class="edges"></g></svg>`;
}

function renderFlow() {
  const t = topic();
  main.innerHTML = `<section class="workspace ${ui.edit ? 'is-editing' : ''} ${ui.connect ? 'is-connecting' : ''} ${ui.lasso ? 'is-lasso' : ''} ${ui.locked ? 'is-locked' : ''}" aria-label="${esc(t.title)} flowchart">
    ${ui.edit ? `<aside class="toolbox" aria-labelledby="toolbox-heading"><div class="panel-heading"><h2 id="toolbox-heading">Toolbox</h2></div><div class="tools">${Object.entries(TYPES).map(([type, info]) => `<button class="tool ${type}" style="--card-color:${info.color}" draggable="true" data-action="new-card" data-type="${type}" aria-label="Add ${info.label.toLowerCase()}" title="Drag into the flowchart or click to add"><span>${info.label}</span></button>`).join('')}</div><p class="toolbox-hint">Drag a card onto the page,<br>or click to add it.</p></aside>` : ''}
    <section class="flow-panel" aria-labelledby="flow-heading"><div class="flow-heading"><h1 id="flow-heading">${latex(t.title, true)}</h1><button class="mode-switch" data-action="mode">${ui.edit ? 'Display' : 'Edit'}</button></div>
      ${ui.edit ? toolbarHTML() : ''}
      <div class="flow-viewport" tabindex="0" aria-label="Flowchart canvas. Drag the background to pan. Use the zoom buttons below.">
        <div class="flow-world">${canvasSVG()}<div class="nodes"></div></div>
        <svg class="selection-overlay" aria-hidden="true"><polygon class="lasso-loop" points=""/></svg>
        ${!t.nodes.length ? `<div class="flow-empty"><span>${ui.edit ? 'Build your first flowchart' : 'This page is ready for your ideas.'}</span><p>${ui.edit ? 'Choose a card from the toolbox, add its content, then connect it to the next idea.' : 'Switch to Edit to add definitions, theorems, lemmas, corollaries, and remarks.'}</p>${!ui.edit ? '<button data-action="mode">Edit this topic</button>' : ''}</div>` : ''}
      </div>
      <div class="canvas-bottom"><p class="canvas-instruction" role="status">${canvasInstruction()}</p><div class="view-controls" aria-label="Canvas view"><button data-action="zoom-out" aria-label="Zoom out">−</button><span class="zoom-value" aria-live="polite">100%</span><button data-action="zoom-in" aria-label="Zoom in">+</button><button data-action="fit" title="Centre the whole flowchart">Fit</button></div></div>
    </section>
  </section>`;
  renderNodes(); renderEdges(); applyCamera();
}
function canvasInstruction() {
  if (ui.connect) return ui.source ? 'Now click the other card.' : 'Click one card, then another to connect them.';
  if (ui.lasso) return ui.locked ? 'Draw around cards to select them. Unlock positions to move the group.' : 'Draw a loop around cards. Drag a selected card to move the group. Shift adds to the selection; Alt-drag pans.';
  if (ui.selected.size) return ui.locked ? `${ui.selected.size} selected. Positions are locked.` : `${ui.selected.size} selected. Drag a selected card to move together. Shift-click adds or removes cards; Esc clears.`;
  return ui.edit ? (ui.locked ? 'Positions are locked. Click a card to edit its contents.' : `Drag cards to arrange${workspace.settings.grid.snap ? ' and snap to the dots' : ''}. Click to edit. Drag the page to pan.`) : 'Click a card to read. Flip theorems, lemmas and corollaries to see their proof.';
}
function renderNodes() {
  const root = main.querySelector('.nodes'); if (!root) return;
  root.innerHTML = topic().nodes.map(n => `<button class="flow-node ${n.type} ${ui.source === n.id ? 'connection-source' : ''}" style="--card-color:${TYPES[n.type].color};left:${n.x}px;top:${n.y}px" data-action="card" data-id="${esc(n.id)}" aria-label="${TYPES[n.type].label}: ${esc(n.title)}" title="${ui.edit ? 'Click to edit; drag to move' : 'Open '+TYPES[n.type].label.toLowerCase()}"><span class="node-title">${latex(n.title, true)}</span></button>`).join('');
  syncSelection();
}
function syncSelection() {
  for (const el of main.querySelectorAll('.flow-node')) {
    const selected = ui.selected.has(el.dataset.id);
    el.classList.toggle('is-selected', selected);
    if (ui.edit) el.setAttribute('aria-pressed', String(selected)); else el.removeAttribute('aria-pressed');
  }
}
function renderEdges() {
  const root = main.querySelector('.edges'); if (!root || !topic()) return;
  const t = topic();
  root.innerHTML = t.edges.map(e => {
    const from = t.nodes.find(n => n.id === e.from), to = t.nodes.find(n => n.id === e.to);
    if (!from || !to) return '';
    const path = edgePath(from, to), style = e.style || 'line';
    const double = style.startsWith('implication-'), head = style !== 'line';
    const marker = `${style}-head${ui.selectedEdge === e.id ? '-selected' : ''}`;
    const attributes = head ? `marker-mid="url(#${marker})"` : '';
    return `<g class="edge ${double ? 'implication' : ''} ${ui.selectedEdge === e.id ? 'selected' : ''}" data-id="${esc(e.id)}" data-style="${style}"><path class="edge-line" d="${path}" ${double ? '' : attributes}/>${double ? `<path class="edge-gap" d="${path}"/><path class="edge-heads" d="${path}" ${attributes}/>` : ''}${ui.edit ? `<path class="edge-hit" d="${path}" tabindex="0" role="button" data-action="select-edge" data-id="${esc(e.id)}" aria-label="Edit ${esc(EDGE_STYLES[style])} connection between ${esc(from.title)} and ${esc(to.title)}"><title>${esc(from.title)} · ${esc(EDGE_STYLES[style])} · ${esc(to.title)}</title></path>` : ''}</g>`;
  }).join('');
}
function refreshToolbar() {
  const bar = main.querySelector('.editor-controls');
  if (bar) bar.outerHTML = toolbarHTML();
  const workspaceEl = main.querySelector('.workspace');
  workspaceEl?.classList.toggle('is-connecting', ui.connect);
  workspaceEl?.classList.toggle('is-locked', ui.locked);
  workspaceEl?.classList.toggle('is-lasso', ui.lasso);
  const instruction = main.querySelector('.canvas-instruction');
  if (instruction) instruction.textContent = canvasInstruction();
}
function viewportSize() {
  const el = main.querySelector('.flow-viewport');
  return { width: el?.clientWidth || 1000, height: el?.clientHeight || 650 };
}
function applyCamera() {
  const world = main.querySelector('.flow-world'); if (!world) return;
  const v = camera(); world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  main.querySelector('.zoom-value').textContent = `${Math.round(v.zoom * 100)}%`;
}
function fit() {
  const t = topic(); if (!t) return;
  const { width, height } = viewportSize();
  if (!t.nodes.length) { Object.assign(camera(), {x:0,y:0,zoom:1}); applyCamera(); return; }
  const minX = Math.min(...t.nodes.map(n => n.x)), minY = Math.min(...t.nodes.map(n => n.y));
  const maxX = Math.max(...t.nodes.map(n => n.x + bounds(n).width)), maxY = Math.max(...t.nodes.map(n => n.y + bounds(n).height));
  const zoom = Math.max(.15, Math.min(1, (width - 70) / (maxX - minX), (height - 65) / (maxY - minY)));
  Object.assign(camera(), {zoom, x:(width - (maxX-minX)*zoom)/2 - minX*zoom, y:(height - (maxY-minY)*zoom)/2 - minY*zoom});
  applyCamera();
}
function zoomBy(factor, point) {
  if (!topic()) return;
  const v = camera(), size = viewportSize();
  const p = point || {x:size.width/2,y:size.height/2};
  const next = Math.max(.15, Math.min(2.5, v.zoom*factor));
  v.x = p.x - (p.x-v.x)*next/v.zoom; v.y = p.y - (p.y-v.y)*next/v.zoom; v.zoom = next;
  applyCamera();
}
function openTopic(id, edit = false) {
  endPointer(true);
  if (!workspace.topics.some(t => t.id === id)) return;
  ui.topicId = id; ui.edit = edit; ui.source = null; ui.connect = false; ui.selectedEdge = null; ui.lasso = false; ui.selected.clear();
  render(); requestAnimationFrame(fit);
}

function showDialog(html, className = '') {
  endPointer(true);
  if (!modal.open) ui.lastFocus = document.activeElement;
  modal.className = className; modal.innerHTML = html;
  const heading = modal.querySelector('h2');
  if (heading) {heading.id='modal-heading';modal.setAttribute('aria-labelledby','modal-heading');}
  if (!modal.open) {
    if (modal.showModal) modal.showModal(); else modal.setAttribute('open', '');
  }
  requestAnimationFrame(() => {
    const input = modal.querySelector('[data-initial-focus]');
    (input || modal.querySelector('button'))?.focus();
    if (input?.tagName === 'INPUT') input.select();
  });
}
function closeDialog() {
  if (modal.close) modal.close(); else modal.removeAttribute('open');
  ui.card = null; ui.modalAction = null;
  if (ui.lastFocus?.isConnected) ui.lastFocus.focus();
}
function simpleDialog(title, body, actions = '<button data-action="close-dialog">Close</button>', className = '') {
  showDialog(`<div class="dialog-header"><h2>${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close">×</button></div><div class="dialog-body">${body}</div><div class="dialog-actions">${actions}</div>`, className);
}
function confirmDialog({title, message, label = 'Delete', onConfirm}) {
  ui.card = null; ui.modalAction = onConfirm;
  simpleDialog(title, `<p class="confirm-title">${message}</p>`, `<button data-action="close-dialog" data-initial-focus>Cancel</button><button class="primary" data-action="confirm">${label}</button>`, 'confirm-dialog');
}

function openCard(node, {isNew = false} = {}) {
  if (node.type === 'title' && !ui.edit) return;
  ui.card = {nodeId:node.id,topicId:ui.topicId,pending:isNew ? node : null,editing:ui.edit,isNew,side:'statement',preview:false,draft:{title:node.title,statement:node.statement,proof:node.proof}};
  renderCardDialog();
}
function cardNode() {
  if (!ui.card) return null;
  return ui.card.pending || workspace.topics.find(t => t.id === ui.card.topicId)?.nodes.find(n => n.id === ui.card.nodeId);
}
function renderCardDialog() {
  const c = ui.card, n = cardNode(); if (!c || !n) return;
  const info = TYPES[n.type];
  if (c.editing) {
    const compiled = compiledLatex(c.draft[c.side]);
    showDialog(`<div class="flash-header"><div class="flash-heading"><div class="flash-kind">${c.isNew ? 'New' : 'Edit'} ${info.label.toLowerCase()}</div><h2>${n.type === 'title' ? 'Section title' : 'Card contents'}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Cancel editing">×</button></div>
      <form id="card-form" class="flash-editor"><label class="field-label" for="card-title">${n.type === 'title' ? 'Title' : 'Brief title'}<input id="card-title" data-field="title" value="${esc(c.draft.title)}" maxlength="500" required data-initial-focus autocomplete="off"></label>
      ${n.type !== 'title' ? `<div class="editor-tabs" role="tablist" aria-label="Card side"><button type="button" role="tab" data-action="editor-side" data-side="statement" aria-selected="${c.side === 'statement'}">${n.type === 'remark' ? 'Remark' : n.type === 'definition' ? 'Definition' : 'Statement'}</button>${canFlip(n) ? `<button type="button" role="tab" data-action="editor-side" data-side="proof" aria-selected="${c.side === 'proof'}">Proof</button>` : ''}<button type="button" class="editor-preview-switch" data-action="editor-preview">${c.preview ? 'LaTeX source' : 'Compile preview'}</button></div>
      ${c.preview ? `<div class="editor-render latex-content" role="tabpanel" aria-label="Compiled ${c.side}">${compiled.html || '<span class="dialog-note">This side is empty.</span>'}</div>` : `<textarea id="card-source" class="source-field" data-field="source" aria-label="${c.side === 'proof' ? 'Proof' : 'Statement'} LaTeX source" spellcheck="false" maxlength="100000" placeholder="Write text and LaTeX here. Use $...$ for inline maths, or \\[...\\] for an equation.">${esc(c.draft[c.side])}</textarea>`}
      <div class="latex-errors" data-editor-errors role="status">${compiled.errors.map(esc).join('<br>')}</div><p class="editor-hint">Text and LaTeX: <code>$x^2$</code> inline, <code>\\[...\\]</code> displayed.<br><code>\\textbf{...}</code>, <code>\\emph{...}</code>, and lists are supported. <button type="button" class="text-guide" data-action="latex-guide">Syntax guide</button></p>` : ''}
      <div class="editor-actions">${!c.isNew ? '<button type="button" class="danger" data-action="delete-card">Delete card</button>' : ''}<button type="button" data-action="close-dialog">Cancel</button><button type="submit" class="primary">Save ${n.type === 'title' ? 'title' : 'card'}</button></div></form>`, 'flash-dialog');
  } else {
    const proofSide = c.side === 'proof';
    const content = proofSide ? n.proof : n.statement;
    const compiled = compiledLatex(content);
    showDialog(`<div class="flash-header"><div class="flash-heading"><div class="flash-kind">${info.label}${canFlip(n) ? ` · ${proofSide ? '2 / 2' : '1 / 2'}` : ''}</div><h2>${proofSide ? 'Proof' : latex(n.title, true)}</h2>${proofSide ? `<div class="flash-subtitle">${latex(n.title, true)}</div>` : ''}</div><div class="flash-buttons">${canFlip(n) ? `<button class="flip-button" data-action="flip" aria-label="Flip to ${proofSide ? 'statement' : 'proof'}" title="Flip to ${proofSide ? 'statement' : 'proof'} (← / →)">↔</button>` : ''}<button class="icon-button" data-action="close-dialog" aria-label="Close card">×</button></div></div>
      <div class="flash-content latex-content" tabindex="0">${compiled.html || `<span class="dialog-note">No ${proofSide ? 'proof' : 'description'} yet. Use Edit card to add one.</span>`}${compiled.errors.length ? `<div class="latex-errors">${compiled.errors.map(esc).join('<br>')}</div>` : ''}</div>
      <div class="flash-footer"><span>${canFlip(n) ? '↔ flips the card · Esc closes' : 'Click outside the card or press Esc to close'}</span><button data-action="edit-card">Edit card</button></div>`, 'flash-dialog');
  }
  modal.style.setProperty('--card-color', info.color);
}
function createCard(type, point) {
  if (!topic() || !ui.edit) return;
  if (topic().nodes.length >= 500) {simpleDialog('Card limit','<p>This topic already contains 500 cards. Create another topic to continue.</p>');return;}
  const size = viewportSize(), v = camera();
  const b = bounds({type});
  const x = Math.min(6000,Math.max(0,(point?.x ?? (size.width/2-v.x)/v.zoom)-b.width/2));
  const y = Math.min(6000,Math.max(0,(point?.y ?? (size.height/2-v.y)/v.zoom)-b.height/2));
  openCard(makeNode(type,x,y,workspace.settings.grid),{isNew:true});
}
function saveCard() {
  const c = ui.card, n = cardNode(); if (!c || !n) return;
  const t = workspace.topics.find(t => t.id === c.topicId);
  const title = c.draft.title.trim(); if (!title || !t) return;
  commit(() => {
    if (c.isNew) t.nodes.push(n);
    Object.assign(n,{title,statement:n.type === 'title' ? '' : c.draft.statement,proof:canFlip(n) ? c.draft.proof : ''});
  });
  closeDialog(); render(); announce('Card saved.');
}

function showGuide(syntaxOnly = false) {
  const latexExample = String.raw`Let $f:X\to\mathbb{R}$ be continuous.

\textbf{Claim.} For every $\varepsilon>0$,
\[
  \|f_n-f\|_\infty\longrightarrow 0.
\]

\begin{itemize}
  \item State your assumptions.
  \item Explain the main idea.
\end{itemize}`;
  const body = `${!syntaxOnly ? `<p>Choose a topic on the home page. The ± button adds, renames, and deletes topics; deletion asks for confirmation.</p><h3 class="guide-heading">Build a flowchart</h3><p>Choose <em>Edit</em>. Drag a toolbox card onto the page, or click its name to add it in the centre. Enter a brief title and your LaTeX, then save. Drag cards to arrange them; their positions save when released. Cards snap to the visible lattice while you move them. Settings lets you show or hide the points, change their spacing and switch snapping on or off.</p><p>Choose <em>Lasso</em> and draw a loop around the centres of several cards. Drag any selected card to move the group; links follow automatically. Shift-click adds or removes a card, and Shift while drawing adds another loop to the selection. <em>Select connected</em> includes all cards joined to your selection. Press Esc or choose Clear to deselect. Each group move saves and undoes in one step. Alt-drag the background to pan while using the lasso.</p><p>Choose <em>Connect</em>, then click the two cards you want to join. Choose a connection style: a plain line, an ordinary arrow, or a double-line implication arrow. Each arrow can point forward, backward, or both ways. Arrowheads sit in the middle of each connection; two-way heads appear together there. Click an existing connection in Edit to change its style or remove it. Lock positions when you want to edit text without moving cards.</p><h3 class="guide-heading">Study the page</h3><p>Choose <em>Display</em>. Click any definition, theorem, lemma, corollary, or remark to open it. The ↔ button flips theorems, lemmas and corollaries between statement and proof. Definitions and remarks have one side. Click outside a card or press <span class="keyboard-key">Esc</span> to close it.</p><p>Drag the background to pan. Use + / − to zoom and <em>Fit</em> to centre the whole chart. Ctrl/⌘ + mouse wheel also zooms. In Edit, Ctrl/⌘ + Z undoes a change; add Shift to redo.</p>` : ''}
    <h3 class="guide-heading">LaTeX input</h3><p>Mix ordinary text with LaTeX mathematics. Write inline mathematics as <code>$...$</code> or <code>\\(...\\)</code>, and displayed equations as <code>\\[...\\]</code> or <code>$$...$$</code>. Equation and align environments are supported, along with common text formatting and lists. Titles also accept inline mathematics.</p><pre class="guide-code">${esc(latexExample)}</pre><p class="dialog-note">Use “Compile preview” to check a card. Errors are shown beside the source. This editor renders LaTeX mathematics and the text commands shown here; full document preambles, packages, citations, and arbitrary custom text commands are not supported. Mathematical macros such as \\newcommand work inside a math block. Open Settings to edit the shared definitions script, including the starter shortcuts \\R, \\P, \\norm{x} and \\abs{x}. You can add commands with arguments and math operators using \\DeclareMathOperator, then compile a test before saving.</p>
    ${!syntaxOnly ? `<h3 class="guide-heading">Keep your work</h3><p>${desktop ? 'Topics, card contents, positions, and connecting lines save automatically to a workspace.json file on this computer. The last 40 versions are kept in a backups folder. Use Files in the footer to locate them. The app waits for file saves before closing.' : 'Topics, card contents, and connections save automatically in this browser.'} Use <em>Export</em> to save a separate JSON copy, and <em>Import</em> to bring in a workspace from the website or another device. Import asks before replacing your current topics.</p>` : ''}`;
  if (syntaxOnly && ui.card) {
    const c = ui.card;
    simpleDialog('LaTeX syntax',body,'<button data-action="return-editor">Back to card</button>');
    ui.card = c;
  } else simpleDialog('Study Tool · Guide',body);
}

async function exportWorkspace() {
  if (desktop) {
    try {
      const result = await desktop.exportWorkspace(clone(workspace));
      if (!result.canceled) announce('Workspace exported.');
    } catch(error) {simpleDialog('Could not export',`<p>${esc(error.message)}</p>`);}
    return;
  }
  const json = JSON.stringify(workspace,null,2);
  const url = URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `study-tool-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1500);
  announce('Workspace exported.');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const { action, id, type, side } = button.dataset;
  switch(action) {
    case 'home': endPointer(true); ui.topicId = null; ui.connect = false; ui.source = null; ui.lasso = false; ui.selected.clear(); render(); break;
    case 'topic': openTopic(id); break;
    case 'manage': ui.manage = !ui.manage; render(); break;
    case 'rename-topic': {
      const t = workspace.topics.find(t => t.id === id); if (!t) break;
      simpleDialog('Rename topic',`<form id="rename-topic-form" data-id="${esc(id)}"><label class="field-label" for="rename-title">Topic title<input id="rename-title" name="title" value="${esc(t.title)}" maxlength="300" required data-initial-focus></label></form>`,`<button data-action="close-dialog">Cancel</button><button type="submit" form="rename-topic-form" class="primary">Save title</button>`); break;
    }
    case 'delete-topic': {
      const t = workspace.topics.find(t => t.id === id); if (!t) break;
      confirmDialog({title:'Delete topic?',message:`Delete <em>${esc(t.title)}</em> and all of its cards and links? You can undo this change while this page stays open.`,label:'Delete topic',onConfirm:() => {commit(() => {workspace.topics = workspace.topics.filter(t => t.id !== id);}); ui.views.delete(id); render();}}); break;
    }
    case 'mode': endPointer(true); ui.edit = !ui.edit; ui.connect = false; ui.source = null; ui.selectedEdge = null; ui.lasso = false; ui.selected.clear(); render(); requestAnimationFrame(fit); break;
    case 'new-card': createCard(type); break;
    case 'card': {
      if (Date.now() < ui.suppressClickUntil) break;
      const n = topic()?.nodes.find(n => n.id === id); if (!n) break;
      if (ui.edit && !ui.connect && (event.shiftKey || ui.lasso || ui.selected.size > 1)) {
        if (event.shiftKey) {if (ui.selected.has(id)) ui.selected.delete(id); else ui.selected.add(id);}
        else if (!ui.selected.has(id)) {ui.selected.clear(); ui.selected.add(id);}
        syncSelection(); refreshToolbar(); break;
      }
      if (ui.connect && ui.edit) {
        if (!ui.source) {ui.source = id; renderNodes(); refreshToolbar();}
        else if (ui.source === id) {ui.source = null; renderNodes(); refreshToolbar();}
        else {
          const from = ui.source;
          if (topic().edges.length >= 2000) {announce('This topic has reached its 2,000-link limit.');break;}
          if (!topic().edges.some(e => e.from === from && e.to === id)) commit(() => addEdge(topic(),from,id,ui.edgeStyle));
          ui.selectedEdge = topic().edges.find(e=>e.from===from && e.to===id)?.id || null;
          ui.source = null; ui.connect = false; renderNodes(); renderEdges(); refreshToolbar(); announce('Cards connected.');
        }
      } else openCard(n);
      break;
    }
    case 'connect': ui.connect = !ui.connect; ui.source = null; ui.selectedEdge = null; ui.lasso = false; ui.selected.clear(); renderNodes(); renderEdges(); refreshToolbar(); break;
    case 'lasso': endPointer(true); ui.lasso = !ui.lasso; ui.connect = false; ui.source = null; ui.selectedEdge = null; renderNodes(); renderEdges(); refreshToolbar(); break;
    case 'select-connected': if (topic()) {ui.selected = new Set(connectedSelection(topic(), ui.selected)); syncSelection(); refreshToolbar(); announce(`${ui.selected.size} connected cards selected.`);} break;
    case 'clear-selection': ui.selected.clear(); syncSelection(); refreshToolbar(); break;
    case 'select-edge': ui.selectedEdge = id; ui.connect = false; ui.source = null; ui.lasso = false; ui.selected.clear(); renderEdges(); renderNodes(); refreshToolbar(); break;
    case 'delete-edge': if (ui.selectedEdge && topic()) {commit(() => {topic().edges = topic().edges.filter(e => e.id !== ui.selectedEdge);});ui.selectedEdge = null;renderEdges();refreshToolbar();} break;
    case 'undo': undo(); break;
    case 'redo': undo(true); break;
    case 'fit': fit(); break;
    case 'zoom-in': zoomBy(1.2); break;
    case 'zoom-out': zoomBy(1/1.2); break;
    case 'close-dialog': closeDialog(); break;
    case 'confirm': {const callback = ui.modalAction; closeDialog(); callback?.(); break;}
    case 'flip': if (ui.card && canFlip(cardNode())) {ui.card.side = ui.card.side === 'proof' ? 'statement' : 'proof';renderCardDialog();modal.querySelector('.flash-content')?.classList.add('is-flipping');} break;
    case 'edit-card': if (ui.card) {ui.card.editing = true;ui.card.side = 'statement';renderCardDialog();} break;
    case 'editor-side': if (ui.card) {ui.card.side = side;renderCardDialog();} break;
    case 'editor-preview': if (ui.card) {ui.card.preview = !ui.card.preview;renderCardDialog();} break;
    case 'delete-card': {
      const n = cardNode(), t = workspace.topics.find(t => t.id === ui.card?.topicId); if (!n || !t) break;
      confirmDialog({title:'Delete card?',message:`Delete <em>${esc(n.title)}</em> and its connecting lines?`,label:'Delete card',onConfirm:() => {commit(() => removeNode(t,n.id));render();}}); break;
    }
    case 'export': exportWorkspace(); break;
    case 'import': requestImport(); break;
    case 'show-files': desktop?.showFiles().catch(error => simpleDialog('Could not open saved files', `<p>${esc(error.message)}</p>`)); break;
    case 'storage-details': showStorageDetails(); break;
    case 'settings': if (!modal.open) showSettings(); break;
    case 'preview-settings': previewSettings(); break;
    case 'reset-definitions': modal.querySelector('#latex-preamble').value = DEFAULT_PREAMBLE; previewSettings(); break;
    case 'updates': showUpdates(); break;
    case 'check-updates': runUpdateAction('checkUpdates'); break;
    case 'download-update': runUpdateAction('downloadUpdate'); break;
    case 'open-update-download': runUpdateAction('openUpdateDownload'); break;
    case 'install-update': runUpdateAction('installUpdate'); break;
    case 'help': showGuide(); break;
    case 'latex-guide': showGuide(true); break;
    case 'return-editor': renderCardDialog(); break;
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'settings-form') {event.preventDefault();saveSettings();return;}
  if (event.target.id === 'update-settings-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    runUpdateAction('configureUpdates', {baseUrl:form.get('baseUrl').trim(), autoCheck:form.get('autoCheck') === 'on'});
    return;
  }
  if (event.target.id === 'add-topic-form') {
    event.preventDefault(); const title = new FormData(event.target).get('title')?.trim(); if (!title) return;
    if (workspace.topics.length >= 200) {simpleDialog('Topic limit','<p>This workspace already has 200 topics. Export your work and remove a topic to make space.</p>');return;}
    const id = uid('topic'); commit(() => workspace.topics.push({id,title,nodes:[],edges:[]})); openTopic(id,true); announce('Topic added.');
  }
  if (event.target.id === 'rename-topic-form') {
    event.preventDefault(); const title = new FormData(event.target).get('title')?.trim(), t = workspace.topics.find(t => t.id === event.target.dataset.id);
    if (!title || !t) return; commit(() => {t.title = title;}); closeDialog();render();
  }
  if (event.target.id === 'card-form') {event.preventDefault();saveCard();}
});
document.addEventListener('input', event => {
  if (!ui.card) return;
  if (event.target.dataset.field === 'title') ui.card.draft.title = event.target.value;
  if (event.target.dataset.field === 'source') {
    ui.card.draft[ui.card.side] = event.target.value;
    const errors = compiledLatex(event.target.value).errors;
    const root = modal.querySelector('[data-editor-errors]'); if(root) root.innerHTML = errors.map(esc).join('<br>');
  }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'connection-style') {
    const style = event.target.value;if (!Object.hasOwn(EDGE_STYLES,style)) return;
    const selected = topic()?.edges.find(e=>e.id===ui.selectedEdge);
    if (selected && selected.style !== style) {commit(()=>{selected.style=style;});renderEdges();refreshToolbar();announce('Connection style saved.');}
    else ui.edgeStyle = style;
  }
  if (event.target.id === 'snap-grid') {endPointer(true);commit(()=>{workspace.settings.grid.snap=event.target.checked;});refreshToolbar();}
  if (event.target.id === 'lock-layout') {endPointer(true);ui.locked = event.target.checked;refreshToolbar();}
  if (event.target.id !== 'import-file') return;
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 10*1024*1024) throw new Error('Choose a JSON file smaller than 10 MB.');
    const next = validateWorkspace(JSON.parse(await file.text()));
    confirmImport(next,file.name);
  } catch(error) {simpleDialog('Could not import',`<p>${esc(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Study Tool export.' : error.message)}</p>`);}
});

// Native drag-and-drop from the toolbox; a click supplies the same action on touch screens.
document.addEventListener('dragstart', event => {
  const tool = event.target.closest('.tool'); if (!tool || !event.dataTransfer) return;
  event.dataTransfer.setData('application/x-study-card', tool.dataset.type);
  event.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragover', event => {
  if (ui.edit && event.target.closest('.flow-viewport') && [...(event.dataTransfer?.types || [])].includes('application/x-study-card')) {event.preventDefault();event.dataTransfer.dropEffect = 'copy';}
});
document.addEventListener('drop', event => {
  const viewport = event.target.closest('.flow-viewport'); if (!viewport || !ui.edit) return;
  const type = event.dataTransfer?.getData('application/x-study-card'); if (!TYPES[type]) return;
  event.preventDefault(); const r = viewport.getBoundingClientRect(), v = camera();
  createCard(type,{x:(event.clientX-r.left-v.x)/v.zoom,y:(event.clientY-r.top-v.y)/v.zoom});
});

function canvasPoint(event, viewport) {
  const rect = viewport.getBoundingClientRect(), v = camera();
  return {x:(event.clientX - rect.left - v.x) / v.zoom, y:(event.clientY - rect.top - v.y) / v.zoom};
}
// The canvas uses its own camera. Keep keyboard focus visible using that camera,
// rather than letting native overflow scrolling shift it behind the camera's back.
main.addEventListener('focusin', event => {
  const target = event.target.closest?.('.flow-node, .edge-hit');
  const viewport = target?.closest('.flow-viewport');
  if (!viewport || ui.drag || modal.open || !topic()) return;
  const r = target.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
  if ((!r.width && !r.height) || !frame.width || !frame.height) return;
  const dx = r.left < frame.left + 10 ? frame.left + 10 - r.left : r.right > frame.right - 10 ? frame.right - 10 - r.right : 0;
  const dy = r.top < frame.top + 10 ? frame.top + 10 - r.top : r.bottom > frame.bottom - 10 ? frame.bottom - 10 - r.bottom : 0;
  if (dx || dy) {camera().x += dx;camera().y += dy;applyCamera();}
});
function drawLasso(d) {
  const v = camera();
  main.querySelector('.lasso-loop')?.setAttribute('points', d.points.map(p => `${p.x * v.zoom + v.x},${p.y * v.zoom + v.y}`).join(' '));
  const inside = lassoSelection(topic().nodes, d.points);
  ui.selected = new Set([...(d.additive ? d.previous : []), ...inside]);
  syncSelection();
}
function moveGroup(d, dx, dy, snap = workspace.settings.grid.snap) {
  const delta = groupTranslation(d.originals, dx, dy, {enabled:snap,spacing:workspace.settings.grid.spacing,anchor:d.anchor});
  for (const original of d.originals) {
    const node = topic().nodes.find(n => n.id === original.id);
    const el = main.querySelector(`.flow-node[data-id="${original.id}"]`);
    node.x = original.x + delta.dx; node.y = original.y + delta.dy;
    if (el) {el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; el.classList.toggle('dragging', d.moved);}
  }
  d.dx = delta.dx; d.dy = delta.dy;
  renderEdges();
}
document.addEventListener('pointerdown', event => {
  const viewport = event.target.closest('.flow-viewport');
  if (!viewport || event.button !== 0 || modal.open || ui.drag) return;
  const nodeEl = event.target.closest('.flow-node');
  if (nodeEl && !event.altKey) {
    if (!ui.edit || ui.locked || ui.connect || event.shiftKey) return;
    const node = topic().nodes.find(n => n.id === nodeEl.dataset.id);
    const ids = ui.selected.has(node.id) ? ui.selected : new Set([node.id]);
    ui.drag = {kind:'nodes', pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
      originals:topic().nodes.filter(n => ids.has(n.id)).map(n => ({id:n.id,x:n.x,y:n.y})),
      before:clone(workspace), previous:new Set(ui.selected), anchor:{x:node.x,y:node.y}, moved:false, dx:0, dy:0};
  } else if (ui.edit && ui.lasso && !event.altKey) {
    // Connection hit areas do not intercept the lasso in selection mode.
    ui.drag = {kind:'lasso', pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
      viewport, points:[canvasPoint(event, viewport)], previous:new Set(ui.selected), additive:event.shiftKey, moved:false};
    event.preventDefault();
  } else {
    if (event.target.closest('.edge-hit') && !event.altKey) return;
    const v = camera();
    ui.drag = {kind:'pan', pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, x:v.x, y:v.y, moved:false};
  }
  // Keep the original card target stable so an ordinary click still opens it.
  const capture = nodeEl && !event.altKey ? nodeEl : viewport;
  ui.drag.capture = capture;
  capture.setPointerCapture?.(event.pointerId);
});
window.addEventListener('pointermove', event => {
  const d = ui.drag; if (!d || (event.pointerId !== undefined && d.pointerId !== event.pointerId)) return;
  const dx = event.clientX - d.startX, dy = event.clientY - d.startY;
  if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
  if (!d.moved) return;
  if (d.kind === 'nodes') {
    if (!d.selectionStarted) {
      if (!ui.selected.has(d.originals[0].id)) ui.selected = new Set(d.originals.map(n => n.id));
      d.selectionStarted = true; syncSelection();
    }
    moveGroup(d, dx / camera().zoom, dy / camera().zoom);
  } else if (d.kind === 'lasso') {
    const point = canvasPoint(event, d.viewport), last = d.points.at(-1);
    if (Math.hypot(point.x - last.x, point.y - last.y) * camera().zoom >= 2) d.points.push(point);
    if (d.points.length > 4096) d.points = d.points.filter((_p, i) => i % 2 === 0 || i === d.points.length - 1);
    drawLasso(d);
  } else {Object.assign(camera(), {x:d.x + dx, y:d.y + dy}); applyCamera();}
});
function endPointer(cancel = false, event) {
  const d = ui.drag; if (!d || (event?.pointerId !== undefined && event.pointerId !== d.pointerId)) return;
  ui.drag = null;
  if (d.moved || d.kind === 'lasso') ui.suppressClickUntil = Date.now() + 150;
  if (d.kind === 'nodes') {
    if (cancel) {moveGroup(d, 0, 0, false); ui.selected = d.previous;}
    else if (d.moved) {
      moveGroup(d, d.dx, d.dy);
      if (d.dx !== 0 || d.dy !== 0) {remember(d.before); persist(); announce(d.originals.length === 1 ? 'Card position saved.' : `${d.originals.length} card positions saved.`);}
    }
    main.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  } else if (d.kind === 'lasso') {
    if (cancel) ui.selected = d.previous;
    else if (d.moved) {
      if (event) d.points.push(canvasPoint(event, d.viewport));
      drawLasso(d);
      announce(`${ui.selected.size} cards selected. Drag any selected card to move the group.`);
    } else if (!d.additive) ui.selected.clear();
    main.querySelector('.lasso-loop')?.setAttribute('points', '');
  } else if (cancel) {Object.assign(camera(), {x:d.x, y:d.y}); applyCamera();}
  else if (!d.moved && ui.edit) ui.selected.clear();
  if (d.capture?.hasPointerCapture?.(d.pointerId)) d.capture.releasePointerCapture(d.pointerId);
  syncSelection(); refreshToolbar();
}
window.addEventListener('pointerup', event => endPointer(false, event));
window.addEventListener('pointercancel', event => endPointer(true, event));
window.addEventListener('blur', () => endPointer(true));
document.addEventListener('wheel',event => {
  const viewport = event.target.closest('.flow-viewport');
  if (!viewport || ui.drag || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();const r=viewport.getBoundingClientRect();zoomBy(Math.exp(-event.deltaY*.008),{x:event.clientX-r.left,y:event.clientY-r.top});
},{passive:false});

document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && event.target.classList?.contains('source-field')) {
    event.preventDefault();const el=event.target,start=el.selectionStart,end=el.selectionEnd;
    el.setRangeText('  ',start,end,'end');el.dispatchEvent(new Event('input',{bubbles:true}));return;
  }
  if (modal.open) {
    if (ui.card && !ui.card.editing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && canFlip(cardNode())) {event.preventDefault();ui.card.side=ui.card.side==='proof'?'statement':'proof';renderCardDialog();}
    return;
  }
  const typing = event.target.closest?.('input,textarea,select,[contenteditable=true]'); if (typing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {event.preventDefault();undo(event.shiftKey);}
  if (event.key === 'Escape' && ui.drag) {event.preventDefault(); endPointer(true); return;}
  if (event.key === 'Escape' && (ui.lasso || ui.selected.size)) {ui.lasso=false;ui.selected.clear();syncSelection();refreshToolbar();}
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && ui.edit && topic()) {event.preventDefault();ui.selected=new Set(topic().nodes.map(n=>n.id));syncSelection();refreshToolbar();}
  if (event.key === 'Escape' && ui.connect) {ui.connect=false;ui.source=null;renderNodes();refreshToolbar();}
  if ((event.key === 'Delete' || event.key === 'Backspace') && ui.edit && ui.selectedEdge) {event.preventDefault();main.querySelector('[data-action=delete-edge]')?.click();}
  const edge = event.target.closest?.('.edge-hit');
  if (edge && (event.key === 'Enter' || event.key === ' ')) {event.preventDefault();edge.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});
modal.addEventListener('click',event => {
  if (event.target !== modal) return;
  const r=modal.getBoundingClientRect();
  if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeDialog();
});
modal.addEventListener('cancel',event => {event.preventDefault();closeDialog();});
window.addEventListener('resize',() => {if(topic()) fit();});
window.addEventListener('hashchange',() => {
  endPointer(true);
  const id = location.hash.startsWith('#topic/') ? decodeURIComponent(location.hash.slice(7)) : null;
  if (workspace.topics.some(t => t.id === id)) openTopic(id);
  else {ui.topicId=null;render();}
});
window.addEventListener('storage',event => {
  if (desktop) return;
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  storageWarning = 'This workspace changed in another tab. Export unsaved work, then reload to use that version.';showSaveStatus();
});


function confirmImport(next,filename) {
  confirmDialog({title:'Import workspace?',message:`Replace your current topics with <strong>${next.topics.length} topic${next.topics.length === 1 ? '' : 's'}</strong> from <em>${esc(filename)}</em>? Export your current work first if you need a backup. You can undo this import while this session stays open.`,label:'Import topics',onConfirm:() => {endPointer(true);remember();ui.selected.clear();ui.lasso=false;workspace = next;ui.topicId = null;ui.views.clear();persist();render();announce('Workspace imported.');}});
}
async function requestImport() {
  if (!desktop) {document.querySelector('#import-file').click();return;}
  try {
    const result = await desktop.pickImport();
    if (result) confirmImport(validateWorkspace(result.workspace),result.filename);
  } catch(error) {simpleDialog('Could not import',`<p>${esc(error.message)}</p>`);}
}
function showStorageDetails() {
  if (!desktopInfo) return;
  simpleDialog('Saved on this computer',`<p>Your workspace saves automatically to:</p><pre class="guide-code">${esc(desktopInfo.workspacePath)}</pre><p>The last 40 previous versions are kept here:</p><pre class="guide-code">${esc(desktopInfo.backupPath)}</pre><p class="dialog-note">Import a backup to restore it. Keep occasional exports in another folder or on an external drive for an extra copy. Website data transfers using Export on the website, then Import here.</p>`, '<button data-action="show-files">Show saved files</button><button data-action="close-dialog">Close</button>');
}
function settingsFormValue() {
  const form = modal.querySelector('#settings-form');
  if (!form) return workspace.settings;
  const values = new FormData(form);
  return {grid:{visible:values.get('gridVisible') === 'on',snap:values.get('gridSnap') === 'on',spacing:Number(values.get('gridSpacing'))},latexPreamble:String(values.get('latexPreamble') ?? '')};
}
function showSettings() {
  const settings = workspace.settings;
  simpleDialog('Study Tool · Settings', `<form id="settings-form"><fieldset class="settings-section"><legend>Flowchart lattice</legend><div class="grid-settings"><label><input type="checkbox" name="gridVisible" ${settings.grid.visible ? 'checked' : ''}> Show background points</label><label><input type="checkbox" name="gridSnap" ${settings.grid.snap ? 'checked' : ''}> Snap while dragging</label><label for="grid-spacing">Point spacing<input id="grid-spacing" name="gridSpacing" type="number" min="8" max="80" step="1" value="${settings.grid.spacing}" required><span class="dialog-note">canvas units</span></label></div><p class="dialog-note">A card’s top-left corner snaps to a point. When moving a group, the card you drag snaps and the other cards keep their spacing. Changing the lattice leaves existing positions in place until you move a card.</p></fieldset><fieldset class="settings-section"><legend>Shared LaTeX definitions</legend><p>These definitions apply to every topic, card title, statement and proof. They are saved and exported with your flowcharts.</p><label class="field-label" for="latex-preamble">Definitions script<textarea id="latex-preamble" name="latexPreamble" class="source-field preamble-field" spellcheck="false" maxlength="32000">${esc(settings.latexPreamble)}</textarea></label><p class="dialog-note">Use <code>\\newcommand</code>, <code>\\renewcommand</code>, <code>\\providecommand</code>, <code>\\def</code>, and <code>\\DeclareMathOperator</code> (including its starred form). Use #1, #2, … for required arguments. Write definitions without $ delimiters or a document preamble.</p><div class="settings-examples"><code>\\newcommand{\\dual}[1]{#1^{*}}</code><code>\\DeclareMathOperator{\\supp}{supp}</code><code>\\DeclareMathOperator*{\\argmin}{arg\\,min}</code></div><button type="button" class="text-guide" data-action="reset-definitions">Restore the starter script</button><label class="field-label settings-test-label" for="latex-test">Test your definitions<input id="latex-test" value="${esc(String.raw`$\R,\P,\norm{x},\abs{x}$`)}" spellcheck="false" maxlength="8000"></label><button type="button" data-action="preview-settings">Compile test</button><p class="form-error" data-settings-errors role="status"></p><div class="settings-preview latex-content" data-settings-preview></div><p class="form-error" data-settings-test-errors></p></fieldset></form>`, '<button data-action="close-dialog">Cancel</button><button type="submit" form="settings-form" class="primary">Save settings</button>', 'settings-dialog');
  previewSettings();
}
function previewSettings() {
  if (!modal.querySelector('#settings-form')) return;
  const settings = settingsFormValue(), definitions = compilePreamble(settings.latexPreamble);
  modal.querySelector('[data-settings-errors]').textContent = definitions.errors.join('\n');
  const test = renderLatex(modal.querySelector('#latex-test').value,{preamble:settings.latexPreamble});
  modal.querySelector('[data-settings-preview]').innerHTML = definitions.errors.length ? '' : test.html;
  modal.querySelector('[data-settings-test-errors]').textContent = definitions.errors.length ? '' : test.errors.join('\n');
}
function saveSettings() {
  try {
    const next = validateSettings(settingsFormValue());
    const compiled = compilePreamble(next.latexPreamble);
    if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
    if (JSON.stringify(next) !== JSON.stringify(workspace.settings)) commit(()=>{workspace.settings = next;});
    closeDialog();render();announce('Settings saved. Shared definitions now apply throughout your workspace.');
  } catch(error) {modal.querySelector('[data-settings-errors]').textContent = error.message;}
}
function paintUpdateState(state) {
  updateState = state;
  const button = document.querySelector('.site-footer [data-action=updates]');
  if (button) button.textContent = state.phase === 'ready' ? 'Update ready' : 'Updates';
  if (!modal.open || !modal.classList.contains('update-dialog')) return;
  modal.querySelector('[data-update-status]').textContent = state.message;
  modal.querySelector('[data-update-notes]').textContent = state.notes || '';
  modal.querySelector('[data-update-notes]').hidden = !state.notes;
  modal.querySelector('[data-update-signing]').hidden = state.signed;
  const busy = ['checking','downloading'].includes(state.phase);
  modal.querySelector('[data-update-actions]').innerHTML = `<button data-action="check-updates" ${!state.baseUrl || busy || state.phase === 'ready' || state.phase === 'unsupported' ? 'disabled' : ''}>${state.phase === 'checking' ? 'Checking…' : 'Check for updates'}</button>${state.phase === 'available' ? '<button class="primary" data-action="download-update">Download update</button>' : ''}${state.phase === 'manual' ? '<button class="primary" data-action="open-update-download">Download for manual installation</button>' : ''}${state.phase === 'ready' ? '<button class="primary" data-action="install-update">Restart and install</button>' : ''}`;
  modal.querySelector('#save-update-settings').disabled = busy || state.phase === 'ready';
}
async function showUpdates() {
  if (!desktop?.updateState || (modal.open && ui.card)) return;
  try {
    const state = await desktop.updateState();
    if (modal.open && ui.card) return;
    simpleDialog('Study Tool · Updates', `<p>Installed version <strong>${esc(state.version)}</strong></p><p data-update-status role="status"></p><pre data-update-notes class="update-notes" hidden></pre><p class="dialog-note" data-update-signing>This edition uses manual installation. Automatic installation requires a signed release.</p><p class="dialog-note">Your flowcharts stay on this computer. Updating keeps the same workspace and saves a separate backup before downloading an update.</p><div class="update-actions" data-update-actions></div><details class="update-settings" ${state.baseUrl ? '' : 'open'}><summary>Update source</summary><form id="update-settings-form"><label class="field-label" for="update-base-url">Update address<input id="update-base-url" name="baseUrl" type="url" value="${esc(state.baseUrl)}" placeholder="HTTPS repository or update-feed address" maxlength="2048"></label><label class="update-checkbox"><input name="autoCheck" type="checkbox" ${state.autoCheck ? 'checked' : ''}> Check automatically when online</label><p class="dialog-note">Use the public GitHub repository or HTTPS feed supplied with a release. Leave it empty to turn off online checks. Checking sends only a request for release information.</p><button id="save-update-settings" type="submit">Save update settings</button></form></details>`, '<button data-action="export">Export a backup</button><button data-action="close-dialog">Close</button>', 'update-dialog');
    paintUpdateState(state);
  } catch (error) { simpleDialog('Could not open updates', `<p>${esc(error.message)}</p>`); }
}
async function runUpdateAction(method, options) {
  if (!desktop?.[method]) return;
  try {
    if (['downloadUpdate','installUpdate'].includes(method)) await Promise.allSettled([...pendingWrites]);
    const result = await desktop[method](options);
    if (result?.phase) paintUpdateState(result);
  } catch (error) {
    if (modal.open && modal.classList.contains('update-dialog')) modal.querySelector('[data-update-status]').textContent = error.message;
    else announce(error.message);
  }
}
if (desktop) {
  const tools = document.querySelector('.site-footer nav');
  tools.insertAdjacentHTML('beforeend','<span aria-hidden="true">·</span><button data-action="storage-details">Files</button>');
  if (desktop.updateState) {
    tools.insertAdjacentHTML('beforeend','<span aria-hidden="true">·</span><button data-action="updates">Updates</button>');
    desktop.onUpdateState(paintUpdateState);
    desktop.updateState().then(paintUpdateState).catch(() => {});
  }
  desktop.onMenuAction(action => {
    if (action === 'save-card') {modal.querySelector('#card-form, #settings-form')?.requestSubmit();return;}
    if (modal.open && ['import','export'].includes(action)) return;
    if (action === 'undo' || action === 'redo') {
      if (document.activeElement?.closest('input,textarea')) {document.execCommand(action);return;}
      if (!modal.open) undo(action === 'redo');
    } else if (action === 'show-files') desktop.showFiles().catch(() => {});
    else if (action === 'import') requestImport();
    else if (action === 'export') exportWorkspace();
    else if (action === 'help' && !modal.open) showGuide();
    else if (action === 'settings' && !modal.open) showSettings();
    else if (action === 'updates' && !modal.open) showUpdates();
  });
}

const initialId = location.hash.startsWith('#topic/') ? decodeURIComponent(location.hash.slice(7)) : null;
if (workspace.topics.some(t => t.id === initialId)) openTopic(initialId); else render();
