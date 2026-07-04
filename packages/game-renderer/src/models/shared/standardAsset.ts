import {
  BATTLE_FACTIONS,
  type BattleFaction,
  type BattleFactionId,
} from '../../battle/factionColors';

export type StandardSizeTier = 'battle-unit' | 'campaign-army' | 'settlement-banner';

export type StandardMaterialId = 0 | 1 | 2 | 3 | 4 | 5;

export interface StandardIndexedMeshData {
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
  strideFloats: typeof STANDARD_VERTEX_STRIDE_FLOATS;
}

export interface StandardMeshData {
  opaque: StandardIndexedMeshData;
  shadow: StandardIndexedMeshData;
  bounds: StandardBounds;
  tier: StandardSizeTier;
}

export interface StandardBounds {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface StandardTierSpec {
  id: StandardSizeTier;
  poleHeight: number;
  poleRadius: number;
  clothTop: number;
  clothWidth: number;
  clothHeight: number;
  swallowtailDepth: number;
  crossbarRadius: number;
  finialRadius: number;
  trimWidth: number;
}

export interface StandardLivery {
  id: BattleFactionId;
  field: readonly [number, number, number];
  trim: readonly [number, number, number];
  emblem: readonly [number, number, number];
}

export interface StandardWaveInput {
  local: readonly [number, number, number];
  weight: number;
  timeSeconds: number;
  phase: number;
  strength: number;
}

export const STANDARD_VERTEX_STRIDE_FLOATS = 10;
export const STANDARD_CLOTH_MATERIAL: StandardMaterialId = 2;
export const STANDARD_TRIM_MATERIAL: StandardMaterialId = 3;
export const STANDARD_EMBLEM_MATERIAL: StandardMaterialId = 4;

export const STANDARD_SIZE_TIERS: Record<StandardSizeTier, StandardTierSpec> = {
  'battle-unit': {
    id: 'battle-unit',
    poleHeight: 3.2,
    poleRadius: 0.035,
    clothTop: 2.72,
    clothWidth: 0.78,
    clothHeight: 1.46,
    swallowtailDepth: 0.24,
    crossbarRadius: 0.034,
    finialRadius: 0.105,
    trimWidth: 0.052,
  },
  'campaign-army': {
    id: 'campaign-army',
    poleHeight: 4.85,
    poleRadius: 0.048,
    clothTop: 4.15,
    clothWidth: 0.98,
    clothHeight: 2.04,
    swallowtailDepth: 0.34,
    crossbarRadius: 0.046,
    finialRadius: 0.145,
    trimWidth: 0.066,
  },
  'settlement-banner': {
    id: 'settlement-banner',
    poleHeight: 6.6,
    poleRadius: 0.058,
    clothTop: 5.6,
    clothWidth: 1.14,
    clothHeight: 2.82,
    swallowtailDepth: 0.42,
    crossbarRadius: 0.056,
    finialRadius: 0.18,
    trimWidth: 0.078,
  },
};

export const STANDARD_SIZE_TIER_IDS = Object.keys(
  STANDARD_SIZE_TIERS,
) as StandardSizeTier[];

export function buildStandardMesh(tier: StandardSizeTier): StandardMeshData {
  return new StandardMeshBuilder(STANDARD_SIZE_TIERS[tier]).finish();
}

export function standardLiveryForFaction(factionId: BattleFactionId): StandardLivery {
  const faction = BATTLE_FACTIONS.find((candidate) => candidate.id === factionId) ?? BATTLE_FACTIONS[0];
  const neutralGold = BATTLE_FACTIONS[2].primary;
  return {
    id: faction.id,
    field: rgbFromBannerCss(faction),
    trim: neutralGold,
    emblem: neutralGold,
  };
}

export function standardSeed(tier: StandardSizeTier, seedKey: BattleFactionId | string | number): number {
  let h = 0x811c9dc5;
  const text = `${tier}:${seedKey}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function standardWindPhase(seed: number): number {
  return hash01(seed, 0x4f1bbcdd) * Math.PI * 2;
}

export function standardWindStrength(tier: StandardSizeTier): number {
  if (tier === 'battle-unit') return 0.085;
  if (tier === 'campaign-army') return 0.11;
  return 0.135;
}

// Toward-the-pole displacement is capped at a quarter amplitude: the wind
// presses the banner forward (away from the pole), so the cloth can never
// swing back far enough to pierce the pole it hangs in front of.
export const STANDARD_WAVE_BACK_LOBE = 0.25;

export function standardWaveDisplacement(input: StandardWaveInput): number {
  if (input.weight <= 0 || input.strength === 0) return 0;
  const [x, , z] = input.local;
  const primary = Math.sin(input.timeSeconds * 2.15 + input.phase + x * 5.2 + z * 1.25);
  const secondary = Math.sin(input.timeSeconds * 3.1 + input.phase * 0.71 + x * 9.4 - z * 0.52);
  const wave = primary * 0.74 + secondary * 0.26;
  const shaped = wave > 0 ? wave * STANDARD_WAVE_BACK_LOBE : wave;
  return input.weight * input.strength * shaped;
}

function rgbFromBannerCss(faction: BattleFaction): readonly [number, number, number] {
  const hex = faction.bannerCss.startsWith('#') ? faction.bannerCss.slice(1) : faction.bannerCss;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return faction.primary;
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

class StandardMeshBuilder {
  private opaqueVertices: number[] = [];
  private opaqueIndices: number[] = [];
  private shadowVertices: number[] = [];
  private shadowIndices: number[] = [];
  private spec: StandardTierSpec;

  constructor(spec: StandardTierSpec) {
    this.spec = spec;
    this.build();
  }

  finish(): StandardMeshData {
    if (this.opaqueIndices.length > 65535 || this.shadowIndices.length > 65535)
      throw new Error(`${this.spec.id} standard exceeds uint16 index range`);
    const bounds = meshBounds(this.opaqueVertices);
    return {
      tier: this.spec.id,
      opaque: {
        vertices: new Float32Array(this.opaqueVertices),
        indices: new Uint16Array(this.opaqueIndices),
        indexCount: this.opaqueIndices.length,
        strideFloats: STANDARD_VERTEX_STRIDE_FLOATS,
      },
      shadow: {
        vertices: new Float32Array(this.shadowVertices),
        indices: new Uint16Array(this.shadowIndices),
        indexCount: this.shadowIndices.length,
        strideFloats: STANDARD_VERTEX_STRIDE_FLOATS,
      },
      bounds,
    };
  }

  // The cloth rect the wave field is defined over; trim and emblem sample the
  // same field so they ride the cloth instead of detaching from it.
  private clothRect: { x0: number; x1: number; top: number; bottom: number; y: number } | null = null;

  private build() {
    const s = this.spec;
    // Centered on the pole like the Rome-2 reference: the cloth hangs from the
    // crossbar just in front of the pole, not off to one side.
    const clothX0 = -s.clothWidth * 0.5;
    const clothX1 = s.clothWidth * 0.5;
    // Gap sized so the capped back-lobe of the wave (see
    // STANDARD_WAVE_BACK_LOBE) cannot reach the pole surface.
    const clothY = -(s.poleRadius + 0.03);
    const clothTop = s.clothTop;
    const clothBottom = clothTop - s.clothHeight;
    // Crossbar overlaps the cloth's sewn top edge — a gap there shows a dark
    // sliver of pole between crossbar and cloth at the pole line.
    const crossbarZ = clothTop - s.crossbarRadius * 0.2;
    this.clothRect = { x0: clothX0, x1: clothX1, top: clothTop, bottom: clothBottom, y: clothY };
    this.cylinderZ([0, 0, s.poleHeight * 0.5], s.poleRadius, s.poleHeight, 12, 0);
    this.cylinderX(
      [0, 0, crossbarZ],
      (clothX1 - clothX0) + s.poleRadius * 7.2,
      s.crossbarRadius,
      12,
      1,
    );
    this.sphere([0, 0, s.poleHeight + s.finialRadius * 0.15], s.finialRadius, 1);
    this.clothGrid(clothX0, clothX1, clothTop, clothBottom, clothY);
    this.trim(clothX0, clothX1, clothTop, clothBottom);
    this.emblem(clothX0, clothX1, clothTop, clothBottom);
    this.shadow();
  }

  /** Wave weight over the cloth: sewn to the crossbar at the top (v=0), swings
   *  more toward the bottom, and most at the free side edges/swallowtail tips. */
  private clothWeight(u: number, v: number) {
    const uu = Math.max(0, Math.min(1, u));
    const vv = Math.max(0, Math.min(1, v));
    return Math.pow(vv, 1.15) * (0.62 + 0.38 * Math.abs(uu * 2 - 1));
  }

  private clothWeightAt(x: number, z: number) {
    const rect = this.clothRect;
    if (!rect) return 0;
    const u = (x - rect.x0) / (rect.x1 - rect.x0);
    const v = (rect.top - z) / (rect.top - rect.bottom);
    return this.clothWeight(u, v);
  }

  private clothGrid(x0: number, x1: number, top: number, bottom: number, y: number) {
    const cols = 14;
    const rows = 18;
    const w = x1 - x0;
    // Small inset so the cloth runs UNDER the trim strips — an inset of a
    // full trim width leaves a background-colored seam inside the border.
    const t = this.spec.trimWidth * 0.28;
    const grid: number[][] = [];
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const rowVerts: number[] = [];
      for (let col = 0; col <= cols; col++) {
        const u = col / cols;
        const innerX = x0 + t + (w - t * 2) * u;
        const bottomAtX = this.bottomEdgeZ(u, bottom + t);
        const z = top - t + (bottomAtX - (top - t)) * v;
        // Weight from the physical-z field — the SAME field trim and emblem
        // sample. Ramping v per-column to the swallowtail edge instead gives
        // the cloth a different weight than its overlays at the same point,
        // and the gold visibly slides off the cloth near the notch.
        const weight = this.clothWeightAt(innerX, z);
        rowVerts.push(this.vertex(this.opaqueVertices, [innerX, y, z], [0, -1, 0], u, v, weight, 2));
      }
      grid.push(rowVerts);
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.quadIndices(this.opaqueIndices, grid[row][col], grid[row][col + 1], grid[row + 1][col + 1], grid[row + 1][col]);
      }
    }
  }

  private trim(x0: number, x1: number, top: number, bottom: number) {
    const t = this.spec.trimWidth;
    const notchX = (x0 + x1) * 0.5;
    const notchZ = bottom + this.spec.swallowtailDepth;
    this.strip([x0, top], [x1, top], t, 3);
    this.strip([x0, top], [x0, bottom], t, 3);
    this.strip([x1, top], [x1, bottom], t, 3);
    this.strip([x0, bottom], [notchX, notchZ], t, 3);
    this.strip([notchX, notchZ], [x1, bottom], t, 3);
  }

  private emblem(x0: number, x1: number, top: number, bottom: number) {
    const w = x1 - x0;
    const h = top - bottom;
    const cx = x0 + w * 0.5;
    this.discPanel([cx, this.emblemY(), top - h * 0.27], w * 0.13, 4, 16);
    const diamondW = w * 0.48;
    const diamondH = h * 0.34;
    const dz = top - h * 0.63;
    this.strip([cx, dz + diamondH * 0.5], [cx + diamondW * 0.5, dz], this.spec.trimWidth * 0.66, 4);
    this.strip([cx + diamondW * 0.5, dz], [cx, dz - diamondH * 0.5], this.spec.trimWidth * 0.66, 4);
    this.strip([cx, dz - diamondH * 0.5], [cx - diamondW * 0.5, dz], this.spec.trimWidth * 0.66, 4);
    this.strip([cx - diamondW * 0.5, dz], [cx, dz + diamondH * 0.5], this.spec.trimWidth * 0.66, 4);
    this.strip([cx, dz + diamondH * 0.28], [cx, dz - diamondH * 0.28], this.spec.trimWidth * 0.54, 4);
  }

  private trimY() {
    return (this.clothRect?.y ?? 0) - 0.006;
  }

  private emblemY() {
    return (this.clothRect?.y ?? 0) - 0.01;
  }

  private bottomEdgeZ(u: number, bottom: number) {
    const notch = 1 - Math.abs(u * 2 - 1);
    return bottom + notch * this.spec.swallowtailDepth;
  }

  private cylinderZ(
    center: [number, number, number],
    radius: number,
    height: number,
    sides: number,
    material: StandardMaterialId,
  ) {
    const z0 = center[2] - height * 0.5;
    const z1 = center[2] + height * 0.5;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: [number, number, number] = [center[0] + Math.cos(a0) * radius, center[1] + Math.sin(a0) * radius, z0];
      const p1: [number, number, number] = [center[0] + Math.cos(a1) * radius, center[1] + Math.sin(a1) * radius, z0];
      const p2: [number, number, number] = [p1[0], p1[1], z1];
      const p3: [number, number, number] = [p0[0], p0[1], z1];
      this.panel([p0, p1, p2, p3], material, 0);
    }
  }

  private cylinderX(
    center: [number, number, number],
    length: number,
    radius: number,
    sides: number,
    material: StandardMaterialId,
  ) {
    const x0 = center[0] - length * 0.5;
    const x1 = center[0] + length * 0.5;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: [number, number, number] = [x0, center[1] + Math.cos(a0) * radius, center[2] + Math.sin(a0) * radius];
      const p1: [number, number, number] = [x1, p0[1], p0[2]];
      const p2: [number, number, number] = [x1, center[1] + Math.cos(a1) * radius, center[2] + Math.sin(a1) * radius];
      const p3: [number, number, number] = [x0, p2[1], p2[2]];
      this.panel([p0, p1, p2, p3], material, 0);
    }
  }

  private sphere(center: [number, number, number], radius: number, material: StandardMaterialId) {
    const rings = 5;
    const sides = 12;
    for (let r = 0; r < rings; r++) {
      const v0 = r / rings;
      const v1 = (r + 1) / rings;
      const phi0 = -Math.PI / 2 + v0 * Math.PI;
      const phi1 = -Math.PI / 2 + v1 * Math.PI;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const p0 = spherePoint(center, radius, phi0, a0);
        const p1 = spherePoint(center, radius, phi0, a1);
        const p2 = spherePoint(center, radius, phi1, a1);
        const p3 = spherePoint(center, radius, phi1, a0);
        this.panel([p0, p1, p2, p3], material, 0);
      }
    }
  }

  /** A flat decorative strip riding the cloth plane (trim borders, emblem
   *  strokes): every vertex samples the cloth's wave-weight field so the strip
   *  billows with the cloth under it instead of hanging rigid in the air.
   *  Subdivided along its length — a 4-vertex quad would stay straight between
   *  displaced ends while the cloth grid bends smoothly beneath it. */
  private strip(a: [number, number], b: [number, number], width: number, material: StandardMaterialId) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * width * 0.5;
    const nz = (dx / len) * width * 0.5;
    const y = material === 4 ? this.emblemY() : this.trimY();
    const segments = Math.max(2, Math.ceil(len / (this.spec.clothHeight * 0.08)));
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const a0: [number, number] = [a[0] + dx * t0, a[1] + dz * t0];
      const a1: [number, number] = [a[0] + dx * t1, a[1] + dz * t1];
      this.clothPanel(
        [
          [a0[0] - nx, y, a0[1] - nz],
          [a0[0] + nx, y, a0[1] + nz],
          [a1[0] + nx, y, a1[1] + nz],
          [a1[0] - nx, y, a1[1] - nz],
        ],
        material,
      );
    }
  }

  private discPanel(
    center: [number, number, number],
    radius: number,
    material: StandardMaterialId,
    sides: number,
  ) {
    const cw = this.clothWeightAt(center[0], center[2]);
    const c = this.vertex(this.opaqueVertices, center, [0, -1, 0], 0.5, 0.5, cw, material);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: [number, number, number] = [center[0] + Math.cos(a0) * radius, center[1], center[2] + Math.sin(a0) * radius];
      const p1: [number, number, number] = [center[0] + Math.cos(a1) * radius, center[1], center[2] + Math.sin(a1) * radius];
      const v0 = this.vertex(this.opaqueVertices, p0, [0, -1, 0], 0.5, 0.5, this.clothWeightAt(p0[0], p0[2]), material);
      const v1 = this.vertex(this.opaqueVertices, p1, [0, -1, 0], 0.5, 0.5, this.clothWeightAt(p1[0], p1[2]), material);
      this.opaqueIndices.push(c, v0, v1);
    }
  }

  /** Like panel(), but with per-vertex cloth weights instead of one shared value. */
  private clothPanel(points: [number, number, number][], material: StandardMaterialId) {
    if (points.length < 3) return;
    const normal = faceNormal(points[0], points[1], points[2]);
    const ids = points.map((point) =>
      this.vertex(this.opaqueVertices, point, normal, 0, 0, this.clothWeightAt(point[0], point[2]), material),
    );
    for (let i = 1; i < ids.length - 1; i++) this.opaqueIndices.push(ids[0], ids[i], ids[i + 1]);
  }

  // Single-sided geometry: the pipeline culls nothing and the shader lights
  // via abs(dot), so a lone face reads correctly from both sides. Duplicating
  // a coplanar back face z-fights with the front and randomly wins the tie.
  private panel(points: [number, number, number][], material: StandardMaterialId, weight: number) {
    if (points.length < 3) return;
    const normal = faceNormal(points[0], points[1], points[2]);
    const ids = points.map((point) =>
      this.vertex(this.opaqueVertices, point, normal, 0, 0, weight, material),
    );
    for (let i = 1; i < ids.length - 1; i++) this.opaqueIndices.push(ids[0], ids[i], ids[i + 1]);
  }

  private shadow() {
    const s = this.spec;
    const sx = s.clothWidth * 0.72;
    const sy = s.clothHeight * 0.17;
    const z = 0.018;
    const center: [number, number, number] = [0.06, -0.12, z];
    const c = this.vertex(this.shadowVertices, center, [0, 0, 1], 0, 0, 0, 5);
    const sides = 20;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: [number, number, number] = [center[0] + Math.cos(a0) * sx, center[1] + Math.sin(a0) * sy, z];
      const p1: [number, number, number] = [center[0] + Math.cos(a1) * sx, center[1] + Math.sin(a1) * sy, z];
      const v0 = this.vertex(this.shadowVertices, p0, [0, 0, 1], 0, 0, 0, 5);
      const v1 = this.vertex(this.shadowVertices, p1, [0, 0, 1], 0, 0, 0, 5);
      this.shadowIndices.push(c, v0, v1);
    }
  }

  private vertex(
    target: number[],
    point: [number, number, number],
    normal: [number, number, number],
    u: number,
    v: number,
    weight: number,
    material: StandardMaterialId,
  ) {
    const index = target.length / STANDARD_VERTEX_STRIDE_FLOATS;
    target.push(...point, ...normal, u, v, weight, material);
    return index;
  }

  private quadIndices(target: number[], a: number, b: number, c: number, d: number) {
    target.push(a, b, c, a, c, d);
  }
}

function faceNormal(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function spherePoint(
  center: [number, number, number],
  radius: number,
  phi: number,
  theta: number,
): [number, number, number] {
  const cp = Math.cos(phi);
  return [
    center[0] + Math.cos(theta) * cp * radius,
    center[1] + Math.sin(theta) * cp * radius,
    center[2] + Math.sin(phi) * radius,
  ];
}

function meshBounds(vertices: number[]): StandardBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += STANDARD_VERTEX_STRIDE_FLOATS) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
  }
  return { min, max };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash01(seed: number, salt: number): number {
  let n = Math.imul(seed ^ salt, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
