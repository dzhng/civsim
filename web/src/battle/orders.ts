/** A front edge painted from its left corner to its right corner. */
export interface FormationLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Group-order geometry: clustering, formation-preserving moves, and the
// compressed-star merge for far-flung selections. Pure functions — the
// verify harness exercises them through the same path the mouse does.

export interface UnitSnap {
  u: number;
  x: number;
  y: number;
  /** Rough footprint radius (for cluster spacing at the destination). */
  r: number;
}

export interface UnitDest {
  u: number;
  x: number;
  y: number;
}

/** Chain-link clustering: units within `gap` of each other share a cluster. */
function clusterUnits(units: UnitSnap[], gap = 100): UnitSnap[][] {
  const n = units.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y);
      if (d < gap + units[i].r + units[j].r) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, UnitSnap[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(units[i]);
  }
  return [...groups.values()];
}

/**
 * Destinations for a group move to (tx, ty): each cluster keeps its internal
 * formation; far-apart clusters COMBINE at the destination as a compressed
 * star — relative bearings preserved, gaps shrunk to a margin. The largest
 * cluster (the main body) lands on the click.
 */
export function groupMoveDests(units: UnitSnap[], tx: number, ty: number): UnitDest[] {
  const clusters = clusterUnits(units);
  // Selection centroid (for bearings).
  let cx = 0,
    cy = 0;
  for (const s of units) {
    cx += s.x;
    cy += s.y;
  }
  cx /= units.length;
  cy /= units.length;

  const metas = clusters.map((c) => {
    let mx = 0,
      my = 0;
    for (const s of c) {
      mx += s.x;
      my += s.y;
    }
    mx /= c.length;
    my /= c.length;
    let radius = 18;
    for (const s of c) radius = Math.max(radius, Math.hypot(s.x - mx, s.y - my) + s.r);
    return { c, mx, my, radius, size: c.length };
  });
  // Main body: the biggest cluster (ties: nearest the centroid).
  metas.sort(
    (a, b) =>
      b.size - a.size || Math.hypot(a.mx - cx, a.my - cy) - Math.hypot(b.mx - cx, b.my - cy),
  );
  const main = metas[0];

  const out: UnitDest[] = [];
  for (const m of metas) {
    let nx = tx,
      ny = ty;
    if (m !== main) {
      // Compressed star: same bearing from the main body, distance shrunk
      // to just clear of it.
      const bx = m.mx - main.mx;
      const by = m.my - main.my;
      const bl = Math.hypot(bx, by) || 1;
      const s = main.radius + m.radius + 24;
      nx = tx + (bx / bl) * s;
      ny = ty + (by / bl) * s;
    }
    for (const u of m.c) {
      out.push({ u: u.u, x: nx + (u.x - m.mx), y: ny + (u.y - m.my) });
    }
  }
  return out;
}
