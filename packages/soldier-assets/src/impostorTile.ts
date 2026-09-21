// Which impostor atlas tile faces a view direction.
//
// The atlas is a hemi-octahedral grid: tile (x, y) was baked looking along the
// normalised point (u, v, 1 - |u| - |v|), with (u, v) the cell centre in
// [-1, 1]²; the four corner regions (|u| + |v| > 1) fold back into the
// hemisphere. For an even grid every folded centre lands bit-for-bit on an
// interior centre, so a folded tile is a duplicate of an interior one — either
// index draws the same pixels.
//
// The pick runs once per impostor per frame, so it must not scan every tile.
// The mapping inverts in closed form (u = x / (|x| + |y| + |z|), v likewise),
// which lands on the cell containing the direction; because the projection is
// not equal-angle the nearest CENTRE can sit in a neighbouring cell, so a 3x3
// dot refinement around the hit recovers the nearest-by-dot answer.

export function hemiOctTileDirections(columns: number, rows: number): Float64Array {
  const out = new Float64Array(columns * rows * 3);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const ox = ((x + 0.5) / columns) * 2 - 1;
      const oy = ((y + 0.5) / rows) * 2 - 1;
      let dx = ox;
      let dy = oy;
      let dz = 1 - Math.abs(dx) - Math.abs(dy);
      if (dz < 0) {
        const px = dx;
        dx = (1 - Math.abs(dy)) * Math.sign(px || 1);
        dy = (1 - Math.abs(px)) * Math.sign(dy || 1);
        dz = -dz;
      }
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const o = (y * columns + x) * 3;
      out[o] = dx / len;
      out[o + 1] = dy / len;
      out[o + 2] = dz / len;
    }
  }
  return out;
}

/** Exhaustive nearest-by-dot: the reference, and the fallback below the horizon. */
export function nearestTileByDot(x: number, y: number, z: number, dirs: Float64Array): number {
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0, o = 0; o < dirs.length; i++, o += 3) {
    const d = x * dirs[o] + y * dirs[o + 1] + z * dirs[o + 2];
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return best;
}

/** Nearest tile for a UNIT direction (x, y, z), matching `nearestTileByDot`
 *  up to duplicate tiles. `dirs` is `hemiOctTileDirections(columns, rows)`. */
export function nearestHemiOctTile(
  x: number,
  y: number,
  z: number,
  columns: number,
  rows: number,
  dirs: Float64Array,
): number {
  if (!(z >= 0)) return nearestTileByDot(x, y, z, dirs);
  const s = Math.abs(x) + Math.abs(y) + z;
  if (!(s > 0)) return 0;
  const u = x / s;
  const v = y / s;
  let best = 0;
  let bestDot = -Infinity;
  const scan3x3 = (cu: number, cv: number) => {
    const cx = clampIndex(Math.floor((cu + 1) * 0.5 * columns), columns);
    const cy = clampIndex(Math.floor((cv + 1) * 0.5 * rows), rows);
    for (let ty = Math.max(0, cy - 1); ty <= Math.min(rows - 1, cy + 1); ty++) {
      for (let tx = Math.max(0, cx - 1); tx <= Math.min(columns - 1, cx + 1); tx++) {
        const i = ty * columns + tx;
        const o = i * 3;
        const d = x * dirs[o] + y * dirs[o + 1] + z * dirs[o + 2];
        if (d > bestDot) {
          bestDot = d;
          best = i;
        }
      }
    }
  };
  scan3x3(u, v);
  // The corner cell that folds onto (u, v): on a non-square grid its tile is
  // a near-duplicate rather than an exact one, and can be the nearest centre.
  scan3x3((u < 0 ? -1 : 1) * (1 - Math.abs(v)), (v < 0 ? -1 : 1) * (1 - Math.abs(u)));
  return best;
}

function clampIndex(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}
