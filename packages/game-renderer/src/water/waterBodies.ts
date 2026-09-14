/** Eight-connected water bodies on an immutable source raster. Row runs keep
 * large seas compact without losing a one-cell channel or filling an island. */
export function buildWaterBodies(
  samples: Uint8Array,
  width: number,
  height: number,
  isWet: (value: number) => boolean,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    samples.length !== width * height
  )
    throw new Error("Water bodies require a complete raster");
  const rows = new Uint32Array(height + 1);
  let count = 0;
  for (let y = 0; y < height; y++) {
    rows[y] = count;
    let previous = false;
    for (let x = 0; x < width; x++) {
      const wet = isWet(samples[y * width + x]);
      if (wet && !previous) count++;
      previous = wet;
    }
  }
  rows[height] = count;
  // Triples are inclusive start, exclusive end, and canonical body ID.
  const runs = new Uint32Array(count * 3),
    parents = new Uint32Array(count);
  const root = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  };
  for (let y = 0; y < height; y++) {
    let run = rows[y],
      x = 0;
    while (x < width) {
      while (x < width && !isWet(samples[y * width + x])) x++;
      const start = x;
      while (x < width && isWet(samples[y * width + x])) x++;
      if (start === x) break;
      runs[run * 3] = start;
      runs[run * 3 + 1] = x;
      parents[run] = run;
      run++;
    }
    if (y === 0) continue;
    let previous = rows[y - 1];
    for (let current = rows[y]; current < rows[y + 1]; current++) {
      const start = runs[current * 3],
        end = runs[current * 3 + 1];
      while (previous < rows[y] && runs[previous * 3 + 1] < start) previous++;
      for (let p = previous; p < rows[y] && runs[p * 3] <= end; p++) {
        const a = root(current),
          b = root(p);
        parents[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  for (let i = 0; i < count; i++) runs[i * 3 + 2] = root(i);
  return {
    rows,
    runs,
    retainedBytes: rows.byteLength + runs.byteLength,
    peakTypedBytes: rows.byteLength + runs.byteLength + parents.byteLength,
    bodyAt: waterBodyQuery(rows, runs, width, height),
  };
}

// Keep the retained query's closure separate from component-building scratch.
function waterBodyQuery(rows: Uint32Array, runs: Uint32Array, width: number, height: number) {
  /** -1 is dry or outside; IDs belong to the full source, never a tile. */
  return (x: number, y: number): number => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height)
      return -1;
    let lo = rows[y],
      hi = rows[y + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (x < runs[mid * 3]) hi = mid;
      else if (x >= runs[mid * 3 + 1]) lo = mid + 1;
      else return runs[mid * 3 + 2];
    }
    return -1;
  };
}
