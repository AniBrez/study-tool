import { bounds } from './model.mjs';

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// A card is selected when its centre is inside the loop, in canvas coordinates.
export function lassoSelection(nodes, polygon) {
  if (polygon.length < 3) return [];
  return nodes.filter(n => {
    const size = bounds(n);
    return pointInPolygon({x:n.x + size.width / 2, y:n.y + size.height / 2}, polygon);
  }).map(n => n.id);
}

export function connectedSelection(topic, ids) {
  const selected = new Set(ids), adjacency = new Map(topic.nodes.map(n => [n.id, []]));
  for (const edge of topic.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }
  const pending = [...selected];
  for (let i = 0; i < pending.length; i++) {
    for (const id of adjacency.get(pending[i]) || []) {
      if (!selected.has(id)) { selected.add(id); pending.push(id); }
    }
  }
  return [...selected].filter(id => adjacency.has(id));
}

// Clamp a single shared translation, preserving every offset within the group.
export function groupTranslation(originals, dx, dy, snap = false) {
  if (!originals.length) return {dx:0, dy:0};
  if (snap === true) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
  const minX = Math.min(...originals.map(n => n.x)), maxX = Math.max(...originals.map(n => n.x));
  const minY = Math.min(...originals.map(n => n.y)), maxY = Math.max(...originals.map(n => n.y));
  const axis = (delta, anchor, low, high) => {
    if (snap && typeof snap === 'object' && snap.enabled) {
      const spacing = snap.spacing, first = Math.ceil((anchor + low) / spacing), last = Math.floor((anchor + high) / spacing);
      if (first <= last) return Math.max(first,Math.min(last,Math.round((anchor + delta) / spacing))) * spacing - anchor;
    }
    return Math.max(low,Math.min(high,delta));
  };
  const anchor = snap?.anchor || originals[0];
  return {dx:axis(dx,anchor.x,-minX,6000-maxX),dy:axis(dy,anchor.y,-minY,6000-maxY)};
}
