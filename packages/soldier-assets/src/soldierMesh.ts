import type { SoldierMeshData } from './mesh';
import type { SoldierMaterial } from './material';

type Rgba = [number, number, number, number];
// Surface roles are authored at construction, independently of the palette.
const SURFACES = {
  cloth: { roughness: 0.90, metallic: 0 },
  leather: { roughness: 0.74, metallic: 0 },
  skin: { roughness: 0.66, metallic: 0 },
  wood: { roughness: 0.84, metallic: 0 },
  bronze: { roughness: 0.46, metallic: 0.82 },
  iron: { roughness: 0.38, metallic: 0.92 },
  hair: { roughness: 0.90, metallic: 0 },
} as const;

export const PLACEHOLDER_MATERIALS: SoldierMaterial[] = Object.entries(SURFACES).map(
  ([name, factors]) => ({ name, baseColor: [1, 1, 1, 1], ...factors }),
);

interface Surface {
  color: Rgba;
  materialId: number;
  factionMask: number;
}

function surface(color: Rgba, name: keyof typeof SURFACES, factionMask = 0): Surface {
  return { color, materialId: Object.keys(SURFACES).indexOf(name), factionMask };
}

import { APPEARANCE_DESCRIPTORS, type Armor, type Helmet, type Shield, type PlaceholderLook } from './appearance.ts';

export const REAL_UNIT_CLASS_COUNT = 15;
export const SHOCK_CAV_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT;
export const HEAVY_PHALANX_REST_CLASS = REAL_UNIT_CLASS_COUNT + 1;
export const MEDIUM_PHALANX_REST_CLASS = REAL_UNIT_CLASS_COUNT + 2;
export const HEAVY_PHALANX_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT + 3;
export const MEDIUM_PHALANX_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT + 4;
export const PLACEHOLDER_RENDER_CLASS_COUNT = APPEARANCE_DESCRIPTORS.length;

function addBox(
  out: number[],
  indices: number[],
  center: [number, number, number],
  size: [number, number, number],
  bone: number,
  paint: Surface,
) {
  const [cx, cy, cz] = center;
  const sx = size[0] * 0.5;
  const sy = size[1] * 0.5;
  const sz = size[2] * 0.5;
  const corners: [number, number, number][] = [
    [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz], [cx + sx, cy + sy, cz - sz], [cx - sx, cy + sy, cz - sz],
    [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz], [cx + sx, cy + sy, cz + sz], [cx - sx, cy + sy, cz + sz],
  ];
  const faces: [number[], [number, number, number]][] = [
    [[0, 1, 2, 3], [0, 0, -1]],
    [[4, 7, 6, 5], [0, 0, 1]],
    [[0, 4, 5, 1], [0, -1, 0]],
    [[1, 5, 6, 2], [1, 0, 0]],
    [[2, 6, 7, 3], [0, 1, 0]],
    [[3, 7, 4, 0], [-1, 0, 0]],
  ];
  for (const [face, normal] of faces) {
    const base = out.length / 13;
    for (const idx of face) {
      out.push(...corners[idx], ...normal, ...paint.color, bone, paint.materialId, paint.factionMask);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function addSegmentBox(
  out: number[],
  indices: number[],
  a: [number, number, number],
  b: [number, number, number],
  thickness: number,
  bone: number,
  paint: Surface,
) {
  const axis = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const sideSeed: [number, number, number] = Math.abs(axis[2]) > 0.8 ? [1, 0, 0] : [0, 0, 1];
  const side = normalize(cross(axis, sideSeed));
  const up = normalize(cross(side, axis));
  const cx = (a[0] + b[0]) * 0.5;
  const cy = (a[1] + b[1]) * 0.5;
  const cz = (a[2] + b[2]) * 0.5;
  const halfLen = distance(a, b) * 0.5;
  const halfThick = thickness * 0.5;
  const corners: [number, number, number][] = [];
  for (const da of [-1, 1]) {
    for (const ds of [-1, 1]) {
      for (const du of [-1, 1]) {
        corners.push([
          cx + axis[0] * halfLen * da + side[0] * halfThick * ds + up[0] * halfThick * du,
          cy + axis[1] * halfLen * da + side[1] * halfThick * ds + up[1] * halfThick * du,
          cz + axis[2] * halfLen * da + side[2] * halfThick * ds + up[2] * halfThick * du,
        ]);
      }
    }
  }
  const faces: [number[], [number, number, number]][] = [
    [[0, 2, 3, 1], [-axis[0], -axis[1], -axis[2]]],
    [[4, 5, 7, 6], axis],
    [[0, 1, 5, 4], [-side[0], -side[1], -side[2]]],
    [[2, 6, 7, 3], side],
    [[0, 4, 6, 2], [-up[0], -up[1], -up[2]]],
    [[1, 3, 7, 5], up],
  ];
  for (const [face, normal] of faces) {
    const base = out.length / 13;
    for (const idx of face) {
      out.push(...corners[idx], ...normal, ...paint.color, bone, paint.materialId, paint.factionMask);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function createPlaceholderSoldierMeshes(armBandSrgb: [number, number, number] = [0.06, 0.1, 0.98]): SoldierMeshData[] {
  return APPEARANCE_DESCRIPTORS.map((_, classId) => createPlaceholderSoldierMesh(armBandSrgb, classId));
}

/** L0 full / L1 reduced silhouette equipment / L2 coarse body+head+legs.
 *  Tiers skin to the same bones, so one VAT drives every tier. */
export function createPlaceholderSoldierMeshTiers(armBandSrgb: [number, number, number] = [0.06, 0.1, 0.98]): SoldierMeshData[][] {
  return APPEARANCE_DESCRIPTORS.map((_, classId) => [0, 1, 2].map((lod) => createPlaceholderSoldierMesh(armBandSrgb, classId, lod)));
}

export function createPlaceholderSoldierMesh(
  armBandSrgb: [number, number, number] = [0.06, 0.1, 0.98],
  classId = 0,
  lod = 0,
): SoldierMeshData {
  const v: number[] = [];
  const indices: number[] = [];
  const look = (APPEARANCE_DESCRIPTORS[Math.max(0, Math.min(APPEARANCE_DESCRIPTORS.length - 1, Math.floor(classId)))] ?? APPEARANCE_DESCRIPTORS[0]).look;
  const body = surface(armorColor(look.armor), look.armor === 'heavy' ? 'bronze' : look.armor === 'medium' ? 'leather' : 'cloth');
  const bronze = surface([0.76, 0.48, 0.18, 1], 'bronze');
  const iron = surface([0.62, 0.63, 0.62, 1], 'iron');
  const leather = surface(look.armor === 'rag' ? [0.32, 0.22, 0.13, 1] : [0.35, 0.23, 0.13, 1], 'leather');
  const horse = surface([0.38, 0.27, 0.17, 1], 'hair');
  const horseBlanket = surface([0.43, 0.34, 0.22, 1], 'cloth');
  const shieldHide = surface([0.50, 0.39, 0.26, 1], 'leather');
  const horsehair = surface([0.19, 0.13, 0.08, 1], 'hair');
  const armBand = surface([...armBandSrgb, 1], 'cloth', 1);
  const riderLift = look.mounted ? 0.42 : 0;
  if (look.mounted) {
    addBox(v, indices, [0, -0.04, 0.86], [0.54, 1.18, 0.38], 0, horse);
    addBox(v, indices, [0, 0.62, 1.08], [0.26, 0.42, 0.48], 0, horse);
    addBox(v, indices, [0, 0.92, 1.22], [0.30, 0.30, 0.28], 0, horse);
    if (lod < 2) addBox(v, indices, [-0.08, 1.06, 1.30], [0.08, 0.12, 0.16], 0, leather);
    if (lod < 2) addBox(v, indices, [0.08, 1.06, 1.30], [0.08, 0.12, 0.16], 0, leather);
    if (lod < 2) addBox(v, indices, [0, -0.74, 0.98], [0.12, 0.42, 0.10], 0, leather);
    addBox(v, indices, [-0.24, -0.40, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [0.24, -0.40, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [-0.24, 0.34, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [0.24, 0.34, 0.48], [0.12, 0.14, 0.72], 0, horse);
    if (lod < 1) addBox(v, indices, [0, -0.02, 1.17], [0.46, 0.34, 0.12], 0, horseBlanket);
  }
  addBox(v, indices, [0, 0.02, 1.33 + riderLift], [0.48, 0.28, 0.52], 1, body);
  addBox(v, indices, [0, 0.02, 0.98 + riderLift], [0.48, 0.28, 0.18], 1, leather);
  addBox(v, indices, [0, 0.02, 1.82 + riderLift], [0.30, 0.24, 0.30], 2, helmetSurface(look.helmet, bronze, body));
  // L2 keeps only body, head, legs (the readable silhouette); L0/L1 add arms.
  if (lod < 2) {
    addBox(v, indices, [-0.34, 0.02, 1.28 + riderLift], [0.18, 0.18, 0.58], 3, leather);
    addBox(v, indices, [0.34, 0.02, 1.28 + riderLift], [0.18, 0.18, 0.58], 4, leather);
    addArmBand(v, indices, armBand, riderLift);
  }
  if (look.mounted) {
    // Rider legs straddle the horse's flanks. They ride the hips bone (0), not
    // the leg bones, so the march/run leg swing never kicks while mounted. Linen,
    // not leather — leather thighs vanish against the near-identical horse coat.
    addBox(v, indices, [-0.31, 0.10, 1.04], [0.14, 0.18, 0.52], 0, surface(body.color, 'cloth'));
    addBox(v, indices, [0.31, 0.10, 1.04], [0.14, 0.18, 0.52], 0, surface(body.color, 'cloth'));
  } else {
    addBox(v, indices, [-0.17, 0, 0.58], [0.18, 0.18, 0.78], 5, leather);
    addBox(v, indices, [0.17, 0, 0.58], [0.18, 0.18, 0.78], 6, leather);
  }
  if (lod < 2) addShield(v, indices, look.shield, shieldHide, bronze, riderLift);
  if (lod < 1) {
    addHelmet(v, indices, look, horsehair, bronze, riderLift);
  }
  if (lod < 2) {
    addWeapon(v, indices, look, lod, surface(leather.color, 'wood'), bronze, iron, riderLift);
  }
  return splitInterleaved(new Float32Array(v), new Uint16Array(indices));
}

function armorColor(armor: Armor): Rgba {
  switch (armor) {
    case 'heavy': return [0.74, 0.63, 0.44, 1];
    case 'medium': return [0.52, 0.42, 0.31, 1];
    case 'light': return [0.70, 0.58, 0.40, 1];
    case 'cloth': return [0.48, 0.42, 0.30, 1];
    case 'rag': return [0.38, 0.28, 0.18, 1];
  }
}

function helmetSurface(helmet: Helmet, bronze: Surface, body: Surface): Surface {
  if (helmet === 'bare') return surface([0.72, 0.50, 0.34, 1], 'skin');
  if (helmet === 'hood') return surface([0.34, 0.31, 0.24, 1], 'cloth');
  if (helmet === 'cap') return surface(body.color, 'cloth');
  return bronze;
}

function addHelmet(out: number[], indices: number[], look: PlaceholderLook, horsehair: Surface, bronze: Surface, lift: number) {
  if (look.helmet === 'bare' || look.helmet === 'hood') return;
  if (look.helmet === 'crested') {
    addBox(out, indices, [0, 0.04, 2.02 + lift], [0.38, 0.08, 0.12], 2, horsehair);
    addBox(out, indices, [0, 0.04, 2.11 + lift], [0.12, 0.30, 0.16], 2, horsehair);
  } else if (look.helmet === 'bronze') {
    addBox(out, indices, [0, 0.02, 2.02 + lift], [0.34, 0.28, 0.10], 2, bronze);
  } else {
    addBox(out, indices, [0, 0.02, 2.00 + lift], [0.32, 0.26, 0.08], 2, bronze);
  }
}

function addArmBand(out: number[], indices: number[], accent: Surface, lift: number) {
  addBox(out, indices, [0.34, 0.02, 1.42 + lift], [0.205, 0.205, 0.070], 4, accent);
}

function addShield(out: number[], indices: number[], shield: Shield, shieldHide: Surface, bronze: Surface, lift: number) {
  if (shield === 'none') return;
  const size: Record<Exclude<Shield, 'none'>, [number, number, number]> = {
    tall: [0.17, 0.13, 0.78],
    round: [0.20, 0.14, 0.54],
    small: [0.15, 0.11, 0.38],
  };
  addBox(out, indices, [-0.41, 0.00, 1.29 + lift], size[shield], 3, shieldHide);
  // Bronze boss on the outer face so the slab reads as a shield, not a plank.
  addBox(out, indices, [-0.41 - size[shield][0] * 0.5, 0.00, 1.29 + lift], [0.05, 0.14, 0.14], 3, bronze);
}

function addWeapon(out: number[], indices: number[], look: PlaceholderLook, lod: number, wood: Surface, bronze: Surface, iron: Surface, lift: number) {
  const weapon = look.weapon;
  const rightHand: [number, number, number] = [0.38, 0.02, 1.02 + lift];
  const leftHand: [number, number, number] = [-0.38, 0.02, 1.04 + lift];
  const poleTipColor = iron;
  const skin = surface([0.72, 0.50, 0.34, 1], 'skin');
  // A fist where the shaft crosses hand height, so the weapon reads as held.
  const addHand = (at: [number, number, number], bone = 4) => {
    addBox(out, indices, at, [0.11, 0.13, 0.11], bone, skin);
  };
  const addPole = (
    start: [number, number, number],
    end: [number, number, number],
    thickness: number,
    bone = 4,
    head = true,
  ) => {
    addSegmentBox(out, indices, start, end, thickness, bone, wood);
    if (head) addBox(out, indices, end, [0.09, 0.09, 0.20], bone, poleTipColor);
  };
  const addSword = (long = false) => {
    const bladeEnd: [number, number, number] = long ? [0.62, 0.34, 2.10 + lift] : [0.58, 0.24, 1.86 + lift];
    addSegmentBox(out, indices, rightHand, bladeEnd, long ? 0.070 : 0.065, 4, iron);
    addSegmentBox(out, indices, [0.27, 0.02, 1.04 + lift], [0.51, 0.02, 1.04 + lift], 0.040, 4, bronze);
    addSegmentBox(out, indices, [0.38, -0.02, 0.88 + lift], [0.38, 0.02, 1.07 + lift], 0.055, 4, wood);
    addHand([0.38, 0.02, 1.00 + lift]);
  };
  const addBow = (detail: boolean) => {
    // The bow bends in the forward (y) plane so the D-shape reads from the
    // side and three-quarter camera, not just dead-on.
    const lower: [number, number, number] = [-0.44, -0.24, 0.72 + lift];
    const grip: [number, number, number] = leftHand;
    const upper: [number, number, number] = [-0.44, -0.24, 1.92 + lift];
    addSegmentBox(out, indices, lower, [-0.40, 0.06, 1.10 + lift], 0.060, 3, wood);
    addSegmentBox(out, indices, [-0.40, 0.06, 1.10 + lift], [-0.40, 0.06, 1.50 + lift], 0.060, 3, wood);
    addSegmentBox(out, indices, [-0.40, 0.06, 1.50 + lift], upper, 0.060, 3, wood);
    if (!detail) return;
    addSegmentBox(out, indices, [grip[0], grip[1] - 0.02, grip[2] - 0.12], [grip[0], grip[1] + 0.02, grip[2] + 0.12], 0.070, 3, wood);
    addSegmentBox(out, indices, lower, upper, 0.030, 3, surface(iron.color, 'cloth'));
    addHand([-0.39, 0.02, 1.04 + lift], 3);
    if (look.mounted) addBox(out, indices, [0.30, -0.08, 1.46 + lift], [0.10, 0.42, 0.10], 1, wood);
  };
  if (lod === 1) {
    switch (weapon) {
      case 'pike':
      case 'pike_upright':
      case 'pike_sidearm':
      case 'lance':
      case 'lance_sidearm':
      case 'spear':
      case 'javelin':
        addPole(rightHand, [0.46, 0.42, (weapon === 'javelin' ? 2.20 : 2.70) + lift], weapon === 'javelin' ? 0.045 : 0.055, 4, false);
        break;
      case 'bow':
        addBow(false);
        break;
      default:
        break;
    }
    return;
  }
  switch (weapon) {
    case 'pike':
      addPole(rightHand, [0.46, 0.72, 3.02 + lift], 0.055);
      addHand([0.39, 0.10, 1.02 + lift]);
      break;
    case 'pike_upright':
      addPole([0.36, 0.02, 0.44 + lift * 0.30], [0.36, 0.02, 3.08 + lift * 0.30], 0.060);
      break;
    case 'pike_sidearm':
      addPole([0.36, 0.02, 0.44 + lift * 0.30], [0.36, 0.02, 3.08 + lift * 0.30], 0.060);
      addSword();
      break;
    case 'lance':
      addPole([0.46, 0.02, 1.28 + lift], [0.66, 0.98, 3.04 + lift], 0.055);
      addHand([0.46, 0.02, 1.28 + lift]);
      break;
    case 'lance_sidearm':
      addPole([0.34, -0.03, 0.92 + lift * 0.25], [0.34, -0.03, 2.92 + lift * 0.25], 0.055);
      addSword();
      break;
    case 'spear':
      if (look.armor === 'light') {
        addPole([0.41, 0.01, 0.90 + lift * 0.15], [0.50, 0.16, 2.50 + lift * 0.15], 0.050);
        addHand([0.42, 0.02, 1.02 + lift * 0.15]);
      } else {
        addPole([0.38, 0.02, 0.88 + lift * 0.15], [0.46, 0.54, 2.62 + lift * 0.15], 0.060);
        addHand([0.39, 0.06, 1.02 + lift * 0.15]);
      }
      break;
    case 'javelin':
      addPole([0.41, 0.02, 0.96 + lift], [0.50, 0.24, 2.14 + lift], 0.045);
      addHand([0.42, 0.03, 1.02 + lift]);
      break;
    case 'greatsword':
      addSword(true);
      break;
    case 'sword':
      addSword();
      break;
    case 'bow':
      addBow(true);
      break;
    case 'artillery':
      addBox(out, indices, [0.58, 0.26, 0.50], [0.94, 0.58, 0.14], 0, wood);
      addBox(out, indices, [0.18, 0.02, 0.40], [0.16, 0.18, 0.48], 0, wood);
      addBox(out, indices, [0.98, 0.02, 0.40], [0.16, 0.18, 0.48], 0, wood);
      addBox(out, indices, [0.04, 0.42, 0.38], [0.18, 0.18, 0.42], 0, iron);
      addBox(out, indices, [1.12, 0.42, 0.38], [0.18, 0.18, 0.42], 0, iron);
      addBox(out, indices, [0.58, 0.82, 0.94], [0.10, 1.10, 0.10], 0, wood);
      addBox(out, indices, [0.58, 1.40, 1.06], [0.22, 0.22, 0.22], 0, iron);
      addBox(out, indices, [0.58, -0.14, 0.74], [0.72, 0.10, 0.10], 0, wood);
      break;
    case 'none':
      break;
  }
}

/** Historical palette entries are sRGB; canonical mesh colors are linear. */
function splitInterleaved(vertices: Float32Array, indices: Uint16Array | Uint32Array): SoldierMeshData {
  const count = vertices.length / 13;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const uvs = new Float32Array(count * 2);
  const tangents = new Float32Array(count * 4);
  const materialIds = new Float32Array(count);
  const factionMasks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 13;
    positions.set(vertices.subarray(o, o + 3), i * 3);
    normals.set(vertices.subarray(o + 3, o + 6), i * 3);
    for (let channel = 0; channel < 3; channel++) {
      const srgb = vertices[o + 6 + channel];
      colors[i * 4 + channel] = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    }
    colors[i * 4 + 3] = vertices[o + 9];
    materialIds[i] = vertices[o + 11];
    factionMasks[i] = vertices[o + 12];
    joints[i * 4] = vertices[o + 10];
    weights[i * 4] = 1;
    // Placeholder content has no normal maps; give its flat faces an
    // orthogonal tangent until authored UV/material content replaces it.
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const length = Math.hypot(nx, ny);
    tangents.set(length > 0 ? [-ny / length, nx / length, 0, 1] : [1, 0, 0, 1], i * 4);
  }
  return { positions, normals, colors, joints, weights, uvs, tangents, materialIds, factionMasks, indices };
}
