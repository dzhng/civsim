export interface SoldierMeshData {
  vertexStrideFloats: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  bones: Float32Array;
  vertices: Float32Array;
  indices: Uint16Array;
}

export const SOLDIER_MATERIAL_IDENTITY = 'soldier-assets-placeholder-pbr-v1';

export const SOLDIER_MATERIAL_CHANNELS = {
  albedo: 'cColor.rgb',
  normal: 'cNormal, VAT-skinned into world space',
  orm: 'occlusion/roughness/metalness, canonical order from skinnedPipeline',
  factionMask: 'high-blue cColor accent channel',
} as const;

export const SOLDIER_PBR_VALUES = {
  // Broad tint stays low so bodies read as material; accent geometry carries faction.
  accent: { broadMix: 0.0, maskedMix: 0.98, tierBroadMix: [0.0, 0.10, 0.18] },
  roughness: {
    bronze: 0.46,
    iron: 0.38,
    linen: 0.90,
    leather: 0.74,
    skin: 0.66,
    default: 0.84,
  },
  metalness: {
    bronze: 0.82,
    iron: 0.92,
  },
  // Slice 14c grounding/contact AO. An analytic ambient-occlusion term darkens
  // the soldier's lower body where the ground occludes skylight — the cheap
  // "standing on the ground, not pasted" cue. It rides the material aoNode, so
  // it dims only indirect (sky/IBL) light, NEVER the sun's direct term (that is
  // 11's cast shadow — distinct owner). `band` is the local mesh height (world
  // units above the feet) over which the darkening fades to none; `strength` is
  // the darkest occlusion at the contact line (ao = 1 - strength at z=0).
  contactAo: { band: 0.42, strength: 0.55 },
} as const;

export const SOLDIER_MATERIAL_MASKS = {
  bronze: { r: [0.58, 0.78], g: [0.34, 0.52], maxB: [0.28, 0.46] },
  iron: { greySpreadScale: 6.5, brightness: [0.44, 0.66] },
  linen: { r: [0.58, 0.76], g: [0.48, 0.66], b: [0.32, 0.48] },
  leather: { r: [0.24, 0.42], g: [0.16, 0.32], maxB: [0.24, 0.42] },
  skin: { r: [0.62, 0.78], g: [0.42, 0.58], b: [0.24, 0.42] },
  factionMask: { blueDelta: [0.18, 0.55] },
} as const;

type Rgba = [number, number, number, number];
type Armor = 'heavy' | 'medium' | 'light' | 'cloth' | 'rag';
type Helmet = 'crested' | 'bronze' | 'cap' | 'hood' | 'bare';
type Shield = 'tall' | 'round' | 'small' | 'none';
type Weapon =
  | 'sword'
  | 'spear'
  | 'greatsword'
  | 'pike'
  | 'pike_upright'
  | 'pike_sidearm'
  | 'bow'
  | 'javelin'
  | 'lance'
  | 'lance_sidearm'
  | 'artillery'
  | 'none';

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
  { weapon: 'lance_sidearm', shield: 'round', armor: 'heavy', helmet: 'crested', mounted: true },
  { weapon: 'pike_upright', shield: 'small', armor: 'heavy', helmet: 'crested', mounted: false },
  { weapon: 'pike_upright', shield: 'small', armor: 'medium', helmet: 'bronze', mounted: false },
  { weapon: 'pike_sidearm', shield: 'small', armor: 'heavy', helmet: 'crested', mounted: false },
  { weapon: 'pike_sidearm', shield: 'small', armor: 'medium', helmet: 'bronze', mounted: false },
];

export const REAL_UNIT_CLASS_COUNT = 15;
export const SHOCK_CAV_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT;
export const HEAVY_PHALANX_REST_CLASS = REAL_UNIT_CLASS_COUNT + 1;
export const MEDIUM_PHALANX_REST_CLASS = REAL_UNIT_CLASS_COUNT + 2;
export const HEAVY_PHALANX_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT + 3;
export const MEDIUM_PHALANX_SIDEARM_CLASS = REAL_UNIT_CLASS_COUNT + 4;
export const PLACEHOLDER_RENDER_CLASS_COUNT = PLACEHOLDER_LOOKS.length;

export interface SoldierMaterialMasks {
  bronze: number;
  iron: number;
  linen: number;
  leather: number;
  skin: number;
  factionMask: number;
}

export function soldierMaterialMasksFromColor(r: number, g: number, b: number): SoldierMaterialMasks {
  const m = SOLDIER_MATERIAL_MASKS;
  const bronze = smoothstep01(m.bronze.r[0], m.bronze.r[1], r) *
    smoothstep01(m.bronze.g[0], m.bronze.g[1], g) *
    (1.0 - smoothstep01(m.bronze.maxB[0], m.bronze.maxB[1], b));
  const ironGrey = 1.0 - clamp01(Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) * m.iron.greySpreadScale);
  const iron = ironGrey * smoothstep01(m.iron.brightness[0], m.iron.brightness[1], (r + g + b) / 3);
  const linen = smoothstep01(m.linen.r[0], m.linen.r[1], r) *
    smoothstep01(m.linen.g[0], m.linen.g[1], g) *
    smoothstep01(m.linen.b[0], m.linen.b[1], b) *
    (1.0 - bronze);
  const leather = smoothstep01(m.leather.r[0], m.leather.r[1], r) *
    smoothstep01(m.leather.g[0], m.leather.g[1], g) *
    (1.0 - smoothstep01(m.leather.maxB[0], m.leather.maxB[1], b));
  const skin = smoothstep01(m.skin.r[0], m.skin.r[1], r) *
    smoothstep01(m.skin.g[0], m.skin.g[1], g) *
    smoothstep01(m.skin.b[0], m.skin.b[1], b) *
    (1.0 - bronze);
  const factionMask = smoothstep01(m.factionMask.blueDelta[0], m.factionMask.blueDelta[1], Math.max(b - Math.max(r, g), 0.0));
  return { bronze, iron, linen, leather, skin, factionMask };
}

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

export function createPlaceholderSoldierMeshes(accentRgb: [number, number, number] = [0.06, 0.1, 0.98]): SoldierMeshData[] {
  return PLACEHOLDER_LOOKS.map((_, classId) => createPlaceholderSoldierMesh(accentRgb, classId));
}

/** L0 full / L1 reduced (drops weapon, helmet crest) / L2 coarse (body+head+legs).
 *  Tiers skin to the same bones, so one VAT drives every tier. */
export function createPlaceholderSoldierMeshTiers(accentRgb: [number, number, number] = [0.06, 0.1, 0.98]): SoldierMeshData[][] {
  return PLACEHOLDER_LOOKS.map((_, classId) => [0, 1, 2].map((lod) => createPlaceholderSoldierMesh(accentRgb, classId, lod)));
}

export function createPlaceholderSoldierMesh(
  accentRgb: [number, number, number] = [0.06, 0.1, 0.98],
  classId = 0,
  lod = 0,
): SoldierMeshData {
  const v: number[] = [];
  const indices: number[] = [];
  const look = PLACEHOLDER_LOOKS[Math.max(0, Math.min(PLACEHOLDER_LOOKS.length - 1, Math.floor(classId)))] ?? PLACEHOLDER_LOOKS[0];
  const linen: Rgba = armorColor(look.armor);
  const bronze: Rgba = [0.76, 0.48, 0.18, 1];
  const iron: Rgba = [0.62, 0.63, 0.62, 1];
  const leather: Rgba = look.armor === 'rag' ? [0.32, 0.22, 0.13, 1] : [0.35, 0.23, 0.13, 1];
  const horse: Rgba = [0.38, 0.27, 0.17, 1];
  const accent: Rgba = [accentRgb[0], accentRgb[1], accentRgb[2], 1];
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
    if (lod < 1) addBox(v, indices, [0, -0.02, 1.17], [0.46, 0.34, 0.12], 0, accent);
  }
  addBox(v, indices, [0, 0.02, 1.33 + riderLift], [0.48, 0.28, 0.52], 1, linen);
  addBox(v, indices, [0, 0.02, 0.98 + riderLift], [0.48, 0.28, 0.18], 1, accent);
  addBox(v, indices, [0, 0.02, 1.82 + riderLift], [0.30, 0.24, 0.30], 2, helmetColor(look.helmet, bronze, linen));
  // L2 keeps only body, head, legs (the readable silhouette); L0/L1 add arms.
  if (lod < 2) {
    addBox(v, indices, [-0.46, 0.02, 1.38 + riderLift], [0.18, 0.18, 0.72], 3, leather);
    addBox(v, indices, [0.46, 0.02, 1.38 + riderLift], [0.18, 0.18, 0.72], 4, leather);
  }
  addBox(v, indices, [-0.17, 0, 0.58 + riderLift * 0.34], [0.18, 0.18, look.mounted ? 0.50 : 0.78], 5, leather);
  addBox(v, indices, [0.17, 0, 0.58 + riderLift * 0.34], [0.18, 0.18, look.mounted ? 0.50 : 0.78], 6, leather);
  addShield(v, indices, look.shield, accent, riderLift);
  // L1+ drop the fine equipment that does not carry the distance faction read.
  if (lod < 1) {
    addHelmet(v, indices, look, accent, bronze, riderLift);
    addWeapon(v, indices, look.weapon, look.mounted, leather, bronze, iron, riderLift);
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

function addWeapon(out: number[], indices: number[], weapon: Weapon, mounted: boolean, wood: Rgba, bronze: Rgba, iron: Rgba, lift: number) {
  const z = 1.36 + lift;
  const addUprightPole = (x: number, baseZ: number, height: number) => {
    addBox(out, indices, [x, 0.01, baseZ + height * 0.5], [0.060, 0.060, height], 1, wood);
    addBox(out, indices, [x, 0.01, baseZ + height + 0.08], [0.090, 0.090, 0.16], 1, bronze);
  };
  const addSword = () => {
    addBox(out, indices, [0.43, 0.28, z], [0.065, 0.62, 0.065], 4, iron);
    addBox(out, indices, [0.43, -0.04, z - 0.03], [0.18, 0.050, 0.050], 4, wood);
  };
  switch (weapon) {
    case 'pike':
      addBox(out, indices, [0.42, 0.78, z + 0.02], [0.055, 1.85, 0.055], 4, wood);
      addBox(out, indices, [0.42, 1.74, z + 0.02], [0.085, 0.15, 0.085], 4, bronze);
      break;
    case 'pike_upright':
      addUprightPole(0.36, 0.36 + lift * 0.34, 2.70);
      break;
    case 'pike_sidearm':
      addUprightPole(-0.34, 0.36 + lift * 0.34, 2.70);
      addSword();
      break;
    case 'lance':
      addBox(out, indices, [0.43, 0.90, z + 0.02], [0.055, 1.72, 0.055], 4, wood);
      addBox(out, indices, [0.43, 1.78, z + 0.02], [0.085, 0.14, 0.085], 4, bronze);
      break;
    case 'lance_sidearm':
      addUprightPole(-0.34, 0.82, 2.25);
      addSword();
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
      addBox(out, indices, [0.43, 0.30, z + 0.04], [0.070, 0.96, 0.070], 4, iron);
      addBox(out, indices, [0.43, -0.18, z - 0.03], [0.20, 0.055, 0.055], 4, wood);
      break;
    case 'sword':
      addSword();
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

export function soldierMaterialIdentity(kit?: { materials?: { channels?: string[] }; archetypes?: Record<string, { name: string; material: string }> }) {
  const archetypes = kit?.archetypes ?? {};
  return {
    identity: SOLDIER_MATERIAL_IDENTITY,
    channels: kit?.materials?.channels ?? Object.keys(SOLDIER_MATERIAL_CHANNELS),
    mapping: SOLDIER_MATERIAL_CHANNELS,
    masks: SOLDIER_MATERIAL_MASKS,
    pbr: SOLDIER_PBR_VALUES,
    classes: Object.fromEntries(
      Object.entries(archetypes).map(([id, archetype]) => [
        id,
        { name: archetype.name, material: archetype.material },
      ]),
    ),
  };
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

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
