/** Exact battle overlay placement and upload preparation. Renderers retain their own
 * growable arrays; these writers touch only the active records. Colours stay
 * display-referred until the material applies the shared transfer function. */
export interface MarkerInstance {
  x: number;
  y: number;
  facing?: number;
  faction?: 0 | 1 | 2;
  size?: number;
  lod?: number;
}

export interface BattleLinePlacement {
  z: number;
  perVertexZ?: boolean;
  drape?: { heightAt: (x: number, y: number) => number; step: number };
}

/** Resample complete line segments onto the canonical terrain surface. */
export function drapeBattleLineSegments(
  vertices: Float32Array,
  drape: NonNullable<BattleLinePlacement["drape"]>,
): Float32Array {
  const { heightAt, step } = drape;
  const out: number[] = [];
  for (let i = 0; i + 12 <= vertices.length; i += 12) {
    const x0 = vertices[i];
    const y0 = vertices[i + 1];
    const x1 = vertices[i + 6];
    const y1 = vertices[i + 7];
    const pieces = Math.max(1, Math.min(96, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)));
    for (let s = 0; s < pieces; s++) {
      const ta = s / pieces;
      const tb = (s + 1) / pieces;
      const ax = x0 + (x1 - x0) * ta;
      const ay = y0 + (y1 - y0) * ta;
      const bx = x0 + (x1 - x0) * tb;
      const by = y0 + (y1 - y0) * tb;
      out.push(
        ax,
        ay,
        heightAt(ax, ay),
        vertices[i + 2],
        vertices[i + 3],
        vertices[i + 4],
        vertices[i + 5],
      );
      out.push(
        bx,
        by,
        heightAt(bx, by),
        vertices[i + 8],
        vertices[i + 9],
        vertices[i + 10],
        vertices[i + 11],
      );
    }
  }
  return new Float32Array(out);
}

export function prepareBattleLineVertices(vertices: Float32Array, placement: BattleLinePlacement) {
  const drape = placement.perVertexZ ? undefined : placement.drape;
  const source = drape ? drapeBattleLineSegments(vertices, drape) : vertices;
  return { source, stride: drape ? 7 : 6, zOff: placement.perVertexZ || drape ? 1 : 0 };
}

export function writeBattleLineVertices(
  src: Float32Array,
  stride: number,
  zOff: number,
  placement: BattleLinePlacement,
  pos: Float32Array,
  col: Float32Array,
  alp: Float32Array,
): void {
  const count = Math.floor(src.length / stride);
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    pos[i * 3] = src[o];
    pos[i * 3 + 1] = src[o + 1];
    pos[i * 3 + 2] = zOff ? src[o + 2] + placement.z : placement.z;
    col[i * 3] = src[o + 2 + zOff];
    col[i * 3 + 1] = src[o + 3 + zOff];
    col[i * 3 + 2] = src[o + 4 + zOff];
    alp[i] = placement.perVertexZ ? 1 : src[o + 5 + zOff];
  }
}

export function writeBattleTriangleVertices(
  vertices: Float32Array,
  pos: Float32Array,
  col: Float32Array,
): void {
  const count = Math.floor(vertices.length / 6);
  for (let i = 0; i < count; i++) {
    const o = i * 6;
    pos[i * 3] = vertices[o];
    pos[i * 3 + 1] = vertices[o + 1];
    pos[i * 3 + 2] = 0;
    col[i * 4] = vertices[o + 2];
    col[i * 4 + 1] = vertices[o + 3];
    col[i * 4 + 2] = vertices[o + 4];
    col[i * 4 + 3] = vertices[o + 5];
  }
}

export function writeBattleRingInstances(
  rings: Float32Array,
  heightAt: (x: number, y: number) => number,
  lift: number,
  inst: Float32Array,
  tint: Float32Array,
): void {
  const count = Math.floor(rings.length / 7);
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const x = rings[o];
    const y = rings[o + 1];
    inst[i * 4] = x;
    inst[i * 4 + 1] = y;
    inst[i * 4 + 2] = heightAt(x, y) + lift;
    inst[i * 4 + 3] = rings[o + 2];
    tint[i * 4] = rings[o + 3];
    tint[i * 4 + 1] = rings[o + 4];
    tint[i * 4 + 2] = rings[o + 5];
    tint[i * 4 + 3] = rings[o + 6];
  }
}

export function writeBattleMarkerInstances(
  markers: readonly MarkerInstance[],
  inst: Float32Array,
  meta: Float32Array,
): void {
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const o = i * 4;
    inst[o] = m.x;
    inst[o + 1] = m.y;
    inst[o + 2] = m.facing ?? 0;
    inst[o + 3] = m.faction ?? 0;
    meta[o] = m.size ?? 1;
    meta[o + 1] = m.lod ?? 0;
  }
}
