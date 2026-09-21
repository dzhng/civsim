/** Read-only attribute access supports interleaved or packed renderer data. */
export interface TerrainEdgeAttribute {
  readonly count: number;
  readonly itemSize: number;
  getX(index: number): number;
  getY(index: number): number;
  getComponent(index: number, component: number): number;
}
export interface TerrainEdgeGeometry {
  readonly attributes: Record<string, TerrainEdgeAttribute>;
  readonly index: { readonly array: ArrayLike<number> } | null;
  getAttribute(name: string): TerrainEdgeAttribute;
}

/** Join a terrain ring's inner boundary to the preceding mesh's outer edge.
 * Both polylines contribute their breakpoints, so different grid resolutions
 * meet without cracks or overlapping terrain. The strip carries the actual
 * edge attributes, including shoreline material, instead of hiding holes with
 * a second-sided mountain material. */
export function joinedTerrainEdgeData(
  outer: TerrainEdgeGeometry,
  inner: TerrainEdgeGeometry,
  hole: [number, number, number, number],
) {
  const ip = inner.getAttribute("position");
  const op = outer.getAttribute("position");
  const innerBounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ip.count; i++) {
    innerBounds[0] = Math.min(innerBounds[0], ip.getX(i));
    innerBounds[1] = Math.min(innerBounds[1], ip.getY(i));
    innerBounds[2] = Math.max(innerBounds[2], ip.getX(i));
    innerBounds[3] = Math.max(innerBounds[3], ip.getY(i));
  }
  const names = Object.keys(outer.attributes);
  const added = Object.fromEntries(names.map((name) => [name, [] as number[]]));
  const indices = Array.from(outer.index!.array);
  let count = op.count;
  // Counterclockwise perimeter, with the surface to the left of each edge.
  for (const [axis, boundIndex, reverse] of [
    [1, 1, false],
    [0, 2, false],
    [1, 3, true],
    [0, 0, true],
  ] as const) {
    const a = edge(inner, innerBounds, axis, boundIndex, reverse);
    const b = edge(outer, hole, axis, boundIndex, reverse);
    const stops = [...new Set([...a.map((v) => v.t), ...b.map((v) => v.t)])].sort((x, y) => x - y);
    const start = count;
    for (const t of stops) {
      for (const [geo, vertices] of [
        [inner, a],
        [outer, b],
      ] as const) {
        let hi = vertices.findIndex((v) => v.t >= t);
        if (hi < 0) hi = vertices.length - 1;
        const lo = Math.max(0, hi - 1);
        const mix = hi === lo ? 0 : (t - vertices[lo].t) / (vertices[hi].t - vertices[lo].t);
        for (const name of names) {
          const attr = geo.getAttribute(name);
          for (let component = 0; component < attr.itemSize; component++) {
            const x = attr.getComponent(vertices[lo].index, component);
            const y = attr.getComponent(vertices[hi].index, component);
            added[name].push(x + (y - x) * mix);
          }
        }
        count++;
      }
    }
    for (let i = 0; i < stops.length - 1; i++) {
      const k = start + i * 2;
      // inner0 -> outer0 -> outer1 faces up for a CCW perimeter.
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  const attributes: Record<string, { values: Float32Array; itemSize: number }> = {};
  for (const name of names) {
    const attr = outer.getAttribute(name);
    const values = new Float32Array(count * attr.itemSize);
    for (let i = 0; i < attr.count; i++)
      for (let c = 0; c < attr.itemSize; c++)
        values[i * attr.itemSize + c] = attr.getComponent(i, c);
    values.set(added[name], attr.count * attr.itemSize);
    attributes[name] = { values, itemSize: attr.itemSize };
  }
  return { attributes, indices: new Uint32Array(indices) };
}

function edge(
  geometry: TerrainEdgeGeometry,
  bounds: readonly number[],
  axis: 0 | 1,
  boundIndex: number,
  reverse: boolean,
): { t: number; index: number }[] {
  const p = geometry.getAttribute("position");
  const along = 1 - axis;
  const min = bounds[along],
    max = bounds[along + 2];
  const points: { t: number; index: number }[] = [];
  for (let i = 0; i < p.count; i++) {
    const cross = p.getComponent(i, axis),
      value = p.getComponent(i, along);
    if (cross !== bounds[boundIndex] || value < min || value > max) continue;
    const t = (value - min) / (max - min);
    points.push({ t: reverse ? 1 - t : t, index: i });
  }
  return points.sort((a, b) => a.t - b.t);
}
