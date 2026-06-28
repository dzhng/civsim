export interface SoldierMeshData {
  vertexStrideFloats: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  bones: Float32Array;
  vertices: Float32Array;
  indices: Uint16Array;
}

type Rgba = [number, number, number, number];
type Armor = 'heavy' | 'medium' | 'light' | 'cloth' | 'rag';
type Helmet = 'crested' | 'bronze' | 'cap' | 'hood' | 'bare';
type Shield = 'tall' | 'round' | 'small' | 'none';
type Weapon = 'sword' | 'spear' | 'greatsword' | 'pike' | 'bow' | 'javelin' | 'lance' | 'artillery' | 'none';

interface PlaceholderLook {
  armor: Armor;
  helmet: Helmet;
  shield: Shield;
  weapon: Weapon;
  mounted: boolean;
}

const PLACEHOLDER_LOOKS: PlaceholderLook[] = [
  { weapon: 'sword', shield: 'tall', armor: 'heavy', helmet: 'crested', mounted: false },
  { weapon: 'spear', shield: 'round', armor: 'light', helmet: 'cap', mounted: false },
  { weapon: 'greatsword', shield: 'none', armor: 'medium', helmet: 'bronze', mounted: false },
  { weapon: 'pike', shield: 'small', armor: 'heavy', helmet: 'crested', mounted: false },
  { weapon: 'bow', shield: 'none', armor: 'cloth', helmet: 'hood', mounted: false },
  { weapon: 'javelin', shield: 'small', armor: 'light', helmet: 'bare', mounted: false },
  { weapon: 'lance', shield: 'round', armor: 'heavy', helmet: 'crested', mounted: true },
  { weapon: 'bow', shield: 'none', armor: 'light', helmet: 'cap', mounted: true },
  { weapon: 'artillery', shield: 'none', armor: 'cloth', helmet: 'cap', mounted: false },
  { weapon: 'sword', shield: 'none', armor: 'rag', helmet: 'bare', mounted: false },
  { weapon: 'sword', shield: 'round', armor: 'light', helmet: 'cap', mounted: false },
  { weapon: 'spear', shield: 'tall', armor: 'heavy', helmet: 'crested', mounted: false },
  { weapon: 'sword', shield: 'round', armor: 'medium', helmet: 'bronze', mounted: false },
  { weapon: 'spear', shield: 'round', armor: 'medium', helmet: 'bronze', mounted: false },
  { weapon: 'pike', shield: 'small', armor: 'medium', helmet: 'bronze', mounted: false },
];

function addBox(
  out: number[],
  indices: number[],
  center: [number, number, number],
  size: [number, number, number],
  bone: number,
  color: Rgba,
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
    const base = out.length / 11;
    for (const idx of face) {
      out.push(...corners[idx], ...normal, ...color, bone);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export function createPlaceholderSoldierMeshes(accentRgb: [number, number, number] = [0.20, 0.42, 0.88]): SoldierMeshData[] {
  return PLACEHOLDER_LOOKS.map((_, classId) => createPlaceholderSoldierMesh(accentRgb, classId));
}

export function createPlaceholderSoldierMesh(
  accentRgb: [number, number, number] = [0.20, 0.42, 0.88],
  classId = 0,
): SoldierMeshData {
  const v: number[] = [];
  const indices: number[] = [];
  const look = PLACEHOLDER_LOOKS[Math.max(0, Math.min(PLACEHOLDER_LOOKS.length - 1, Math.floor(classId)))] ?? PLACEHOLDER_LOOKS[0];
  const linen: Rgba = armorColor(look.armor);
  const bronze: Rgba = [0.76, 0.48, 0.18, 1];
  const leather: Rgba = look.armor === 'rag' ? [0.32, 0.22, 0.13, 1] : [0.35, 0.23, 0.13, 1];
  const horse: Rgba = [0.38, 0.27, 0.17, 1];
  const accent: Rgba = [accentRgb[0], accentRgb[1], accentRgb[2], 1];
  const riderLift = look.mounted ? 0.42 : 0;
  if (look.mounted) {
    addBox(v, indices, [0, -0.04, 0.86], [0.54, 1.18, 0.38], 0, horse);
    addBox(v, indices, [0, 0.62, 1.08], [0.26, 0.42, 0.48], 0, horse);
    addBox(v, indices, [0, 0.92, 1.22], [0.30, 0.30, 0.28], 0, horse);
    addBox(v, indices, [-0.08, 1.06, 1.30], [0.08, 0.12, 0.16], 0, leather);
    addBox(v, indices, [0.08, 1.06, 1.30], [0.08, 0.12, 0.16], 0, leather);
    addBox(v, indices, [0, -0.74, 0.98], [0.12, 0.42, 0.10], 0, leather);
    addBox(v, indices, [-0.24, -0.40, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [0.24, -0.40, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [-0.24, 0.34, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [0.24, 0.34, 0.48], [0.12, 0.14, 0.72], 0, horse);
    addBox(v, indices, [0, -0.02, 1.17], [0.46, 0.34, 0.12], 0, accent);
  }
  addBox(v, indices, [0, 0.02, 1.24 + riderLift], [0.48, 0.28, 0.70], 1, linen);
  addBox(v, indices, [0, 0.02, 1.82 + riderLift], [0.30, 0.24, 0.30], 2, helmetColor(look.helmet, bronze, linen));
  addBox(v, indices, [-0.46, 0.02, 1.38 + riderLift], [0.18, 0.18, 0.72], 3, leather);
  addBox(v, indices, [0.46, 0.02, 1.38 + riderLift], [0.18, 0.18, 0.72], 4, leather);
  addBox(v, indices, [-0.17, 0, 0.58 + riderLift * 0.34], [0.18, 0.18, look.mounted ? 0.50 : 0.78], 5, leather);
  addBox(v, indices, [0.17, 0, 0.58 + riderLift * 0.34], [0.18, 0.18, look.mounted ? 0.50 : 0.78], 6, leather);
  addHelmet(v, indices, look, accent, bronze, riderLift);
  addShield(v, indices, look.shield, accent, riderLift);
  addWeapon(v, indices, look.weapon, look.mounted, leather, bronze, riderLift);
  return splitInterleaved(new Float32Array(v), new Uint16Array(indices));
}

function armorColor(armor: Armor): Rgba {
  switch (armor) {
    case 'heavy': return [0.61, 0.57, 0.48, 1];
    case 'medium': return [0.52, 0.42, 0.31, 1];
    case 'light': return [0.64, 0.54, 0.37, 1];
    case 'cloth': return [0.48, 0.42, 0.30, 1];
    case 'rag': return [0.38, 0.28, 0.18, 1];
  }
}

function helmetColor(helmet: Helmet, bronze: Rgba, linen: Rgba): Rgba {
  if (helmet === 'bare') return [0.72, 0.50, 0.34, 1];
  if (helmet === 'hood') return [0.34, 0.31, 0.24, 1];
  if (helmet === 'cap') return linen;
  return bronze;
}

function addHelmet(out: number[], indices: number[], look: PlaceholderLook, accent: Rgba, bronze: Rgba, lift: number) {
  if (look.helmet === 'bare' || look.helmet === 'hood') return;
  if (look.helmet === 'crested') {
    addBox(out, indices, [0, 0.04, 2.02 + lift], [0.38, 0.08, 0.12], 2, accent);
    addBox(out, indices, [0, 0.04, 2.11 + lift], [0.12, 0.30, 0.16], 2, accent);
  } else if (look.helmet === 'bronze') {
    addBox(out, indices, [0, 0.02, 2.02 + lift], [0.34, 0.28, 0.10], 2, bronze);
  } else {
    addBox(out, indices, [0, 0.02, 2.00 + lift], [0.32, 0.26, 0.08], 2, bronze);
  }
}

function addShield(out: number[], indices: number[], shield: Shield, accent: Rgba, lift: number) {
  if (shield === 'none') return;
  const size: Record<Exclude<Shield, 'none'>, [number, number, number]> = {
    tall: [0.14, 0.12, 0.70],
    round: [0.16, 0.12, 0.48],
    small: [0.13, 0.10, 0.36],
  };
  addBox(out, indices, [-0.52, 0.00, 1.36 + lift], size[shield], 3, accent);
}

function addWeapon(out: number[], indices: number[], weapon: Weapon, mounted: boolean, wood: Rgba, bronze: Rgba, lift: number) {
  const z = 1.36 + lift;
  switch (weapon) {
    case 'pike':
      addBox(out, indices, [0.42, 0.78, z + 0.02], [0.055, 1.85, 0.055], 4, wood);
      addBox(out, indices, [0.42, 1.74, z + 0.02], [0.085, 0.15, 0.085], 4, bronze);
      break;
    case 'lance':
      addBox(out, indices, [0.43, 0.90, z + 0.02], [0.055, 1.72, 0.055], 4, wood);
      addBox(out, indices, [0.43, 1.78, z + 0.02], [0.085, 0.14, 0.085], 4, bronze);
      break;
    case 'spear':
      addBox(out, indices, [0.43, 0.56, z + 0.02], [0.055, 1.20, 0.055], 4, wood);
      addBox(out, indices, [0.43, 1.18, z + 0.02], [0.080, 0.13, 0.080], 4, bronze);
      break;
    case 'javelin':
      addBox(out, indices, [0.43, 0.48, z + 0.08], [0.045, 0.95, 0.045], 4, wood);
      addBox(out, indices, [0.43, 0.98, z + 0.10], [0.070, 0.11, 0.070], 4, bronze);
      break;
    case 'greatsword':
      addBox(out, indices, [0.43, 0.30, z + 0.04], [0.070, 0.96, 0.070], 4, bronze);
      addBox(out, indices, [0.43, -0.18, z - 0.03], [0.20, 0.055, 0.055], 4, wood);
      break;
    case 'sword':
      addBox(out, indices, [0.43, 0.28, z], [0.065, 0.62, 0.065], 4, bronze);
      addBox(out, indices, [0.43, -0.04, z - 0.03], [0.18, 0.050, 0.050], 4, wood);
      break;
    case 'bow':
      addBox(out, indices, [0.46, 0.22, z + 0.18], [0.060, 0.74, 0.050], 4, wood);
      addBox(out, indices, [0.46, 0.22, z - 0.18], [0.052, 0.74, 0.045], 4, wood);
      if (mounted) addBox(out, indices, [0.58, -0.05, z + 0.06], [0.08, 0.36, 0.08], 4, bronze);
      break;
    case 'artillery':
      addBox(out, indices, [0.58, 0.26, 0.50], [0.94, 0.58, 0.14], 0, wood);
      addBox(out, indices, [0.18, 0.02, 0.40], [0.16, 0.18, 0.48], 0, wood);
      addBox(out, indices, [0.98, 0.02, 0.40], [0.16, 0.18, 0.48], 0, wood);
      addBox(out, indices, [0.04, 0.42, 0.38], [0.18, 0.18, 0.42], 0, bronze);
      addBox(out, indices, [1.12, 0.42, 0.38], [0.18, 0.18, 0.42], 0, bronze);
      addBox(out, indices, [0.58, 0.82, 0.94], [0.10, 1.10, 0.10], 0, wood);
      addBox(out, indices, [0.58, 1.40, 1.06], [0.22, 0.22, 0.22], 0, bronze);
      addBox(out, indices, [0.58, -0.14, 0.74], [0.72, 0.10, 0.10], 0, wood);
      break;
    case 'none':
      break;
  }
}

function splitInterleaved(vertices: Float32Array, indices: Uint16Array): SoldierMeshData {
  const count = vertices.length / 11;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const bones = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 11;
    positions.set(vertices.subarray(o, o + 3), i * 3);
    normals.set(vertices.subarray(o + 3, o + 6), i * 3);
    colors.set(vertices.subarray(o + 6, o + 10), i * 4);
    bones[i] = vertices[o + 10];
  }
  return { vertexStrideFloats: 11, positions, normals, colors, bones, vertices, indices };
}
