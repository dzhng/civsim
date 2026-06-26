// Low-poly per-class soldier geometry, shared by the battle renderer (one
// thin-instanced mesh per class, animated) and the campaign map (a few figures
// merged into each army marker). Local axes: +y = forward, +z = up. A weapon
// length, a shield, and whether the trooper is mounted are enough to read
// every class apart in silhouette — the same distinctions the atlas sprites
// draw. Pure geometry: positions, indices, computed normals; no scene deps.

import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

export interface ClassLook {
  weapon: 'sword' | 'spear' | 'greatsword' | 'pike' | 'bow' | 'javelin' | 'lance' | 'none';
  shield: 'tall' | 'round' | 'small' | 'none';
  armor: 'heavy' | 'medium' | 'light' | 'cloth' | 'rag';
  helmet: 'crested' | 'bronze' | 'cap' | 'hood' | 'bare';
  crest: boolean;
  mounted: boolean;
}

export const CLASS_LOOK: ClassLook[] = [
  { weapon: 'sword', shield: 'tall', armor: 'heavy', helmet: 'crested', crest: true, mounted: false }, // 0 heavy sword
  { weapon: 'spear', shield: 'round', armor: 'light', helmet: 'cap', crest: false, mounted: false }, // 1 light spear
  { weapon: 'greatsword', shield: 'none', armor: 'medium', helmet: 'bronze', crest: false, mounted: false }, // 2 longswords
  { weapon: 'pike', shield: 'small', armor: 'heavy', helmet: 'crested', crest: true, mounted: false }, // 3 phalanx
  { weapon: 'bow', shield: 'none', armor: 'cloth', helmet: 'hood', crest: false, mounted: false }, // 4 archers
  { weapon: 'javelin', shield: 'small', armor: 'light', helmet: 'bare', crest: false, mounted: false }, // 5 skirmishers
  { weapon: 'lance', shield: 'round', armor: 'heavy', helmet: 'crested', crest: true, mounted: true }, // 6 shock cav
  { weapon: 'bow', shield: 'none', armor: 'light', helmet: 'cap', crest: false, mounted: true }, // 7 horse archers
  { weapon: 'none', shield: 'none', armor: 'cloth', helmet: 'cap', crest: false, mounted: false }, // 8 artillery crew
  { weapon: 'sword', shield: 'none', armor: 'rag', helmet: 'bare', crest: false, mounted: false }, // 9 peasant (a knife, no shield)
  { weapon: 'sword', shield: 'round', armor: 'light', helmet: 'cap', crest: false, mounted: false }, // 10 light sword
  { weapon: 'spear', shield: 'tall', armor: 'heavy', helmet: 'crested', crest: true, mounted: false }, // 11 heavy spear
  { weapon: 'sword', shield: 'round', armor: 'medium', helmet: 'bronze', crest: true, mounted: false }, // 12 medium infantry
  { weapon: 'spear', shield: 'round', armor: 'medium', helmet: 'bronze', crest: true, mounted: false }, // 13 medium spear
  // RENDER-ONLY pseudo-class: shock cav after it switches from lance to sabre
  // in the grind. The sim never spawns this — the renderer routes a shock-cav
  // soldier here when `cur_weapon` is its sidearm, so the same horse+rider keeps
  // the lance upright in the off hand while fighting with a sword.
  { weapon: 'sword', shield: 'round', armor: 'heavy', helmet: 'crested', crest: true, mounted: true }, // shock cav, sabre drawn
];

export const CLASS_MODEL_LOOK: number[] = CLASS_LOOK.slice(0, -1).map((_, i) => i);
export const UNIT_CLASS_LOOK_COUNT = CLASS_MODEL_LOOK.length;
export const MODEL_LOOK_COUNT = CLASS_LOOK.length;

export function modelLookForClass(cls: number): number {
  return CLASS_MODEL_LOOK[cls] ?? CLASS_MODEL_LOOK[0];
}

export function modelLookForUnit(cls: number, unitTypeId?: number): number {
  void unitTypeId;
  return modelLookForClass(cls);
}

export function lookForModel(model: number): ClassLook {
  return CLASS_LOOK[model] ?? CLASS_LOOK[modelLookForClass(0)];
}

/** Render-only pseudo-class (the last CLASS_LOOK entry): a shock-cav rider with his
 *  sword drawn and lance carried upright. The renderer swaps a grinding lancer
 *  to this look; nothing in the sim knows about it. */
export const SHOCK_CAV_SIDEARM_LOOK = UNIT_CLASS_LOOK_COUNT;

/** Per-class soldier (or rider on a horse) as one box mesh. `rest` is a
 *  continuous 0..1 pose blend: at 1 the pole arms (pike, spear, javelin, lance)
 *  stand vertical — the at-ease pose a unit holds when no enemy is in reach —
 *  and blades/bows drop low; at 0 they level forward to fight. Intermediate
 *  values lerp each weapon box's corners, so the renderer can build a small
 *  ladder of poses and sweep a pike smoothly up or down. Passing a boolean
 *  (the old rest/fight callers) coerces to 0/1 and reproduces the endpoints. */
export function classGeometry(cls: number, rest: number | boolean = 0): VertexData {
  const L = CLASS_LOOK[cls] ?? CLASS_LOOK[0];
  const r = rest === true ? 1 : rest === false ? 0 : Math.min(1, Math.max(0, rest));
  const pos: number[] = [];
  const idx: number[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const b = pos.length / 3;
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    for (const v of c) pos.push(v[0], v[1], v[2]);
    for (const [a, bb, cc, d] of [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4],
    ]) idx.push(b + a, b + bb, b + cc, b + a, b + cc, b + d);
  };
  // Lerp a box between its fighting corners (f*) and its rest corners (e*),
  // by the pose blend r. Each weapon's two poses are written as the two corner
  // sextuples; the renderer's ladder rebuilds this mesh at each r step.
  const lx = (a: number, b: number) => a + (b - a) * r;
  const lerpBox = (
    fx0: number, fy0: number, fz0: number, fx1: number, fy1: number, fz1: number,
    ex0: number, ey0: number, ez0: number, ex1: number, ey1: number, ez1: number,
  ) => box(
    lx(fx0, ex0), lx(fy0, ey0), lx(fz0, ez0),
    lx(fx1, ex1), lx(fy1, ey1), lx(fz1, ez1),
  );

  // Rider sits higher when mounted; the horse goes under him. The legged figure
  // is built bottom-up: legs (or, mounted, a horse + draped thighs), then a
  // torso a touch wider at the shoulders than the hips, head, crest. A man is
  // legs + a body, not a single post — the gap between the legs is what reads.
  const foot = L.mounted ? 0.95 : 0.0;
  if (L.mounted) {
    // Horse facing +y: four legs, a barrel, an arched neck + head, a tail.
    box(-0.17, -0.62, 0.42, 0.17, 0.5, 0.98); // barrel
    box(-0.16, 0.3, 0.0, -0.06, 0.46, 0.48); // front-left leg
    box(0.06, 0.3, 0.0, 0.16, 0.46, 0.48); // front-right leg
    box(-0.16, -0.55, 0.0, -0.06, -0.39, 0.48); // hind-left leg
    box(0.06, -0.55, 0.0, 0.16, -0.39, 0.48); // hind-right leg
    box(-0.1, 0.42, 0.82, 0.1, 0.64, 1.24); // neck
    box(-0.09, 0.55, 1.1, 0.09, 0.96, 1.4); // head
    box(-0.04, -0.66, 0.32, 0.04, -0.52, 0.86); // tail
    box(-0.2, -0.06, foot - 0.06, -0.09, 0.2, foot + 0.2); // left thigh on the flank
    box(0.09, -0.06, foot - 0.06, 0.2, 0.2, foot + 0.2); // right thigh
  } else {
    box(-0.14, -0.09, foot, -0.02, 0.09, foot + 0.5); // left leg
    box(0.02, -0.09, foot, 0.14, 0.09, foot + 0.5); // right leg
  }
  const torsoBot = L.mounted ? foot + 0.1 : foot + 0.46;
  const shZ = foot + (L.mounted ? 0.92 : 1.05); // shoulder height
  box(-0.17, -0.11, torsoBot, 0.17, 0.13, shZ); // chest, wider than the hips
  box(-0.1, -0.09, shZ, 0.1, 0.11, shZ + 0.34); // head
  if (L.crest) box(-0.03, -0.05, shZ + 0.34, 0.03, 0.14, shZ + 0.5); // helmet crest

  // Arm stubs at the shoulders so the shield and weapon hang off a body, not
  // thin air: the shield arm on the left (-x), the weapon arm on the right (+x).
  box(-0.23, -0.05, shZ - 0.34, -0.15, 0.07, shZ - 0.02); // left arm
  if (L.weapon !== 'none') box(0.15, -0.05, shZ - 0.34, 0.23, 0.07, shZ - 0.02); // right arm

  // Shield on the left, a broad plate facing forward (+y): wide in x, tall in z,
  // thin in y — a face turned at the enemy, not a plank seen edge-on.
  if (L.shield !== 'none') {
    const [w, h] = { tall: [0.34, 0.8], round: [0.28, 0.56], small: [0.2, 0.42] }[L.shield];
    box(-0.32, 0.1, foot + 0.32, -0.32 + w, 0.17, foot + 0.32 + h);
  }

  // Weapon on the right (+x). At ease every arm relaxes: pole arms stand
  // vertical (+z, butt by the foot — a forest of raised shafts), blades drop
  // to the side or rest their point on the ground, bows hang low. In the
  // fighting pose each comes up: poles level forward (+y), blades and bows up.
  const wx = 0.2;
  // The rest pose for a pole arm: a grounded vertical shaft of height h, given
  // as the (fight-box, rest-box) corner pair so the lerp sweeps the shaft from
  // forward-level to upright. The shaft pivots about the grip near the foot, so
  // the lerp reads as a raise/lower rather than a slide.
  const pole = (
    fy0: number, fz0: number, fy1: number, fz1: number, // fighting box (level)
    h: number,                                          // rest height (upright)
  ) => lerpBox(
    wx - 0.02, fy0, foot + fz0, wx + 0.02, fy1, foot + fz1,
    wx - 0.04, -0.04, foot, wx + 0.04, 0.04, foot + h,
  );
  switch (L.weapon) {
    case 'pike': pole(-0.2, 0.7, 3.0, 0.78, 3.4); break;
    case 'lance': pole(-0.1, 0.55, 2.0, 0.62, 2.3); break;
    case 'spear': pole(-0.2, 0.6, 1.4, 0.66, 1.9); break;
    case 'javelin': pole(-0.1, 0.7, 0.9, 0.74, 1.4); break;
    // Blade dropped to the side at ease, raised to guard in the fight.
    case 'sword': lerpBox(wx - 0.02, 0.0, foot + 0.5, wx + 0.03, 0.06, foot + 1.2,
                          wx - 0.02, 0.0, foot + 0.1, wx + 0.03, 0.06, foot + 0.8); break;
    // Greatsword grounded (resting on its point) at ease, hefted high to fight.
    case 'greatsword': lerpBox(wx - 0.03, 0.0, foot + 0.4, wx + 0.04, 0.08, foot + 1.7,
                               wx - 0.03, 0.0, foot + 0.0, wx + 0.04, 0.08, foot + 1.2); break;
    // Bow: a tall vertical stave held forward (raised to draw in the fight,
    // lowered at ease), plus a nocked arrow pointing forward at hand height so
    // the silhouette reads as an archer, not a man with a stick.
    case 'bow':
      lerpBox(wx + 0.02, -0.03, foot + 0.2, wx + 0.08, 0.03, foot + 1.62,
              wx + 0.02, -0.03, foot + 0.05, wx + 0.08, 0.03, foot + 1.15); // stave
      lerpBox(wx - 0.01, 0.0, foot + 0.92, wx + 0.03, 0.52, foot + 0.98,
              wx - 0.01, -0.04, foot + 0.7, wx + 0.03, 0.06, foot + 0.76); // nocked arrow
      break;
    case 'none': break;
  }

  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  vd.normals = normals;
  return vd;
}

// ===========================================================================
// Detailed soldier: an articulated, vertex-coloured figure that reads as a real
// man — skin, bronze helmet, a linen tunic, leather, a wooden shield — instead
// of a single team-coloured block. Two units of the same class are told apart
// by a per-FACTION accent colour painted onto the crest/plume, the shield
// emblem ring, and a shoulder sash, plus the unit's banner. Built from one
// POSE-parameterised function so the renderer can bake a small ladder of poses
// (idle, at-ease, the two march beats, two run beats, attack wind/strike, a
// hit recoil, a death crumple) per (class, faction) and route each soldier to
// the rung his sim frame asks for — the same trick the block model uses for the
// pike raise, extended to limbs. The block `classGeometry` above is untouched:
// it stays the campaign army-marker model and the battle's `?debug=blocks`
// vibe/debug model.
// ===========================================================================

type V3 = [number, number, number];

// Realistic base materials. The faction accent (passed in) is the ONLY thing
// that changes between two same-class units, so the bulk stays earthy/metallic.
const SKIN: V3 = [0.79, 0.60, 0.47];
const BRONZE: V3 = [0.72, 0.57, 0.28];
const BRONZE_DK: V3 = [0.52, 0.40, 0.18];
const IRON: V3 = [0.61, 0.64, 0.69];
const LINEN: V3 = [0.83, 0.77, 0.64];
const LEATHER: V3 = [0.41, 0.29, 0.17];
const LEATHER_DK: V3 = [0.29, 0.20, 0.12];
const WOOD: V3 = [0.47, 0.33, 0.19];
const HORSE_HIDE: V3 = [0.37, 0.27, 0.18];
const HORSE_MANE: V3 = [0.18, 0.13, 0.09];
const SHIELD_WOOD: V3 = [0.55, 0.40, 0.23];

/** A pose: every animatable degree of freedom the baker can dial. All default
 *  to a neutral alert stance; the renderer fills a handful of named rungs. */
export interface Pose {
  rest: number;    // 0 fighting .. 1 at-ease (pole arms vertical, blades low)
  legPhase: number; // -1..1 stride sign; + swings the LEFT leg forward
  stride: number;  // 0 stand .. ~1 march .. ~1.6 run (leg-swing amplitude)
  lean: number;    // forward torso lean (radians) — run/charge
  windup: number;  // 0 .. 1 weapon drawn back before a strike
  attack: number;  // 0 .. 1 weapon-arm strike + body lunge
  recoil: number;  // 0 .. 1 hit reaction (torso & head rock back)
  crumple: number; // 0 .. 1 death collapse (folds down before the matrix tips)
}

export const NEUTRAL_POSE: Pose = {
  rest: 0, legPhase: 0, stride: 0, lean: 0, windup: 0, attack: 0, recoil: 0, crumple: 0,
};

// Rotate a point about an x-parallel axis through (·,py,pz) — limbs swing
// fore/aft in the soldier's sagittal (y-z) plane, the dominant walk motion.
function rotX(p: V3, ang: number, py: number, pz: number): V3 {
  if (ang === 0) return p;
  const c = Math.cos(ang), s = Math.sin(ang);
  const y = p[1] - py, z = p[2] - pz;
  return [p[0], py + y * c - z * s, pz + y * s + z * c];
}

// A coloured box, optionally rotated about an x-axis pivot (for swinging limbs).
// Per-vertex UVs are a planar projection of the box corner (metres → texels), so
// the shared grain texture (cloth weave / metal / wood) tiles continuously over
// the whole figure without a hand-authored atlas.
const UV_TILE = 1.6; // texels per metre of the grain texture
const HEX_FACES = [
  [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [1, 5, 6, 2], [0, 3, 7, 4],
];
// A general hexahedron from 8 explicit corners (bottom ring 0..3 at z0, top ring
// 4..7 at z1, matching the box winding). Tapered/skewed corners let the figure
// round off — a cuirass that narrows to the waist, a domed helmet, a bowed
// shield — without leaving the safe, culling-correct box topology.
function dhex(
  pos: number[], idx: number[], col: number[], uv: number[],
  corners: V3[], c: V3, alpha: number, rot?: { ang: number; py: number; pz: number },
) {
  const b = pos.length / 3;
  for (const v of corners) {
    const p = rot ? rotX(v, rot.ang, rot.py, rot.pz) : v;
    pos.push(p[0], p[1], p[2]);
    col.push(c[0], c[1], c[2], alpha);
    uv.push((p[0] + p[1]) * UV_TILE, p[2] * UV_TILE);
  }
  for (const [a, bb, cc, d] of HEX_FACES) idx.push(b + a, b + bb, b + cc, b + a, b + cc, b + d);
}
function dbox(
  pos: number[], idx: number[], col: number[], uv: number[],
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  c: V3, alpha: number, rot?: { ang: number; py: number; pz: number },
) {
  dhex(pos, idx, col, uv, [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ], c, alpha, rot);
}

/** Articulated, faction-accented figure for class `cls` in the given `pose`,
 *  painted with `faction` ([r,g,b], 0..1) on its crest/shield/sash. Same local
 *  axes and rough scale as `classGeometry` so the renderer's per-soldier matrix
 *  (facing rotate + radius scale + ground placement) is unchanged. */
export function classGeometryDetailed(
  cls: number, pose: Partial<Pose> = {}, faction: V3 = [0.55, 0.55, 0.6],
  opts: { livery?: boolean } = {},
): VertexData {
  const L = CLASS_LOOK[cls] ?? CLASS_LOOK[0];
  const P: Pose = { ...NEUTRAL_POSE, ...pose };
  const pos: number[] = [], idx: number[] = [], col: number[] = [], uv: number[] = [];
  // Two paint modes. BAKED (battle): faction parts carry the faction colour,
  // every vertex opaque (the StandardMaterial reads colour, ignores alpha).
  // LIVERY (campaign): material parts carry their own colour with alpha 0
  // (neutral), faction parts carry white with alpha 1 — the campaign shader
  // reads alpha as "take the owner's livery hue", giving the same realistic
  // figure with a per-faction accent on the strategic map.
  const livery = opts.livery ?? false;
  const matAlpha = livery ? 0 : 1;
  const box = (
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    c: V3, rot?: { ang: number; py: number; pz: number },
  ) => dbox(pos, idx, col, uv, x0, y0, z0, x1, y1, z1, c, matAlpha, rot);
  // A tapered slab: independent x/y half-extents at the bottom (rxb,ryb at z0)
  // and top (rxt,ryt at z1), centred on (cx,cy). A box is the rxb==rxt case; the
  // taper is what rounds the cuirass into the waist and the helmet into a dome.
  const frus = (
    cx: number, cy: number, z0: number, z1: number,
    rxb: number, ryb: number, rxt: number, ryt: number, c: V3,
    rot?: { ang: number; py: number; pz: number },
  ) => dhex(pos, idx, col, uv, [
    [cx - rxb, cy - ryb, z0], [cx + rxb, cy - ryb, z0], [cx + rxb, cy + ryb, z0], [cx - rxb, cy + ryb, z0],
    [cx - rxt, cy - ryt, z1], [cx + rxt, cy - ryt, z1], [cx + rxt, cy + ryt, z1], [cx - rxt, cy + ryt, z1],
  ], c, matAlpha, rot);
  // A FACTION-livery part (crest, shield blazon, sash, saddlecloth).
  const fbox = (
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    rot?: { ang: number; py: number; pz: number },
  ) => dbox(pos, idx, col, uv, x0, y0, z0, x1, y1, z1, livery ? [1, 1, 1] : faction, 1, rot);
  // Faction-livery frustum (a swept crest, a pauldron blazon).
  const ffrus = (
    cx: number, cy: number, z0: number, z1: number,
    rxb: number, ryb: number, rxt: number, ryt: number,
    rot?: { ang: number; py: number; pz: number },
  ) => dhex(pos, idx, col, uv, [
    [cx - rxb, cy - ryb, z0], [cx + rxb, cy - ryb, z0], [cx + rxb, cy + ryb, z0], [cx - rxb, cy + ryb, z0],
    [cx - rxt, cy - ryt, z1], [cx + rxt, cy - ryt, z1], [cx + rxt, cy + ryt, z1], [cx - rxt, cy + ryt, z1],
  ], livery ? [1, 1, 1] : faction, 1, rot);

  const base = L.mounted ? 0.95 : 0.0; // mounted rider sits a horse-height up
  const lunge = P.attack * 0.18 - P.windup * 0.08 - P.recoil * 0.16; // body shift along +y
  const lean = P.lean + P.attack * 0.28 - P.windup * 0.18 - P.recoil * 0.45 + P.crumple * 0.75;

  // ---- Horse (mounted classes) ------------------------------------------
  if (L.mounted) {
    box(-0.18, -0.64, 0.42, 0.18, 0.52, 1.0, HORSE_HIDE); // barrel
    const gait = P.stride * 0.42 * P.legPhase;
    const hleg = (x0: number, y0: number, x1: number, y1: number, a: number) =>
      box(x0, y0, 0.0, x1, y1, 0.5, HORSE_HIDE, { ang: a, py: (y0 + y1) * 0.5, pz: 0.5 });
    hleg(-0.17, 0.30, -0.06, 0.46, gait); // front-left leg
    hleg(0.06, 0.30, 0.17, 0.46, -gait); // front-right leg
    hleg(-0.17, -0.56, -0.06, -0.40, -gait); // hind-left leg
    hleg(0.06, -0.56, 0.17, -0.40, gait); // hind-right leg
    box(-0.10, 0.42, 0.82, 0.10, 0.66, 1.26, HORSE_HIDE); // neck
    box(-0.09, 0.55, 1.12, 0.09, 0.98, 1.42, HORSE_HIDE); // head
    box(-0.06, 0.60, 1.30, 0.06, 0.74, 1.5, HORSE_MANE); // forelock/ears
    box(-0.03, 0.42, 1.20, 0.03, 0.66, 1.46, HORSE_MANE); // mane
    box(-0.04, -0.68, 0.30, 0.04, -0.52, 0.9, HORSE_MANE); // tail
    fbox(-0.16, -0.20, 0.74, 0.16, 0.30, 0.86); // caparison/saddlecloth (faction)
  }

  // ---- Legs -------------------------------------------------------------
  // Foot soldiers stride; riders' thighs splay over the flanks (no swing).
  const hipZ = base + (L.mounted ? 0.12 : 0.92);
  const swing = P.stride * 0.5; // radians of thigh swing at full stride
  if (L.mounted) {
    box(-0.21, -0.04, hipZ - 0.18, -0.09, 0.24, hipZ + 0.10, LEATHER); // left thigh
    box(0.09, -0.04, hipZ - 0.18, 0.21, 0.24, hipZ + 0.10, LEATHER); // right thigh
    box(-0.22, 0.10, base + 0.0, -0.12, 0.26, base + 0.46, LEATHER_DK); // left shin/boot
    box(0.12, 0.10, base + 0.0, 0.22, 0.26, base + 0.46, LEATHER_DK); // right shin/boot
  } else {
    // Each leg: a thigh swung about the hip, a shin swung about the knee, a
    // boot. Left leg leads when legPhase > 0; right leg opposite.
    const leg = (sx: number, dir: number) => {
      const a = dir * swing * P.legPhase;
      const kneeBend = -Math.abs(a) * 0.6 - P.crumple * 0.8; // knees flex on stride/death
      const knee = rotX([sx, 0, hipZ - 0.40], a, 0, hipZ); // knee point after thigh swing
      // Thigh under the tunic skirt (cloth), bare shin, leather boot.
      box(sx - 0.052, -0.065, hipZ - 0.40, sx + 0.052, 0.065, hipZ, LINEN, { ang: a, py: 0, pz: hipZ }); // thigh
      box(knee[0] - 0.046, knee[1] - 0.06, knee[2] - 0.42, knee[0] + 0.046, knee[1] + 0.06, knee[2],
        SKIN, { ang: a + kneeBend, py: knee[1], pz: knee[2] }); // shin
      if (L.armor === 'heavy' || L.armor === 'medium') {
        box(knee[0] - 0.05, knee[1] - 0.075, knee[2] - 0.40, knee[0] + 0.05, knee[1] - 0.035, knee[2] - 0.06,
          L.armor === 'heavy' ? IRON : LEATHER, { ang: a + kneeBend, py: knee[1], pz: knee[2] });
      }
      const shin = rotX([sx, knee[1], knee[2] - 0.42], a + kneeBend, knee[1], knee[2]);
      box(shin[0] - 0.052, shin[1] - 0.04, shin[2] - 0.02, shin[0] + 0.052, shin[1] + 0.17, shin[2] + 0.07, LEATHER_DK); // boot
    };
    leg(-0.075, 1);
    leg(0.075, -1);
  }

  // Everything above the hips leans as one rigid upper body (about the hips).
  const lp = base + (L.mounted ? 0.18 : 0.92); // lean pivot z
  const torsoBot = lp, shZ = lp + (L.mounted ? 0.46 : 0.48);
  const tilt = { ang: -lean, py: lunge, pz: lp };

  // ---- Torso: class armour changes the silhouette, not just the colour -----
  // Heavy troops get a broad bronze cuirass and long pteruges; medium infantry
  // wears a leather/bronze thorax; light and missile troops keep softer linen.
  const waistZ = torsoBot + 0.16, chestZ = shZ - 0.04;
  const armor = {
    heavy: { body: BRONZE, yoke: BRONZE_DK, skirt: LEATHER, waist: 0.16, chest: 0.19, skirtN: 5, skirtLen: 0.30 },
    medium: { body: LEATHER, yoke: BRONZE, skirt: LEATHER_DK, waist: 0.15, chest: 0.175, skirtN: 4, skirtLen: 0.23 },
    light: { body: LINEN, yoke: LEATHER, skirt: LINEN, waist: 0.135, chest: 0.16, skirtN: 3, skirtLen: 0.18 },
    cloth: { body: LINEN, yoke: LINEN, skirt: LINEN, waist: 0.125, chest: 0.145, skirtN: 2, skirtLen: 0.12 },
    rag: { body: LEATHER_DK, yoke: LEATHER, skirt: LEATHER_DK, waist: 0.12, chest: 0.135, skirtN: 1, skirtLen: 0.10 },
  }[L.armor];
  frus(0, 0.01, waistZ - 0.18, waistZ, armor.waist * 0.9, 0.11, armor.waist, 0.115, LINEN, tilt);
  frus(0, 0.01, waistZ, chestZ, armor.waist, 0.118, armor.chest, 0.125, armor.body, tilt);
  frus(0, 0.01, chestZ, shZ + 0.03, armor.chest, 0.125, armor.chest * 0.82, 0.112, armor.yoke, tilt);
  for (let i = -armor.skirtN; i <= armor.skirtN; i++) {
    const px = i * 0.045;
    box(px - 0.02, 0.10, waistZ - armor.skirtLen, px + 0.02, 0.135, waistZ - 0.12, armor.skirt, tilt);
    if (L.armor !== 'rag') {
      box(px - 0.02, -0.135, waistZ - armor.skirtLen * 0.9, px + 0.02, -0.10, waistZ - 0.12, armor.skirt, tilt);
    }
  }
  // Faction sash across the front: enough team colour to read, but not a whole
  // billboard torso. Broken into short slabs so it suggests a diagonal strap.
  fbox(-0.17, 0.122, chestZ - 0.08, -0.04, 0.158, chestZ - 0.02, tilt);
  fbox(-0.06, 0.123, waistZ + 0.09, 0.07, 0.159, waistZ + 0.15, tilt);
  fbox(0.05, 0.124, waistZ + 0.01, 0.18, 0.160, waistZ + 0.07, tilt);

  // ---- Head + helmet ----------------------------------------------------
  // Skull as a slightly tapered block; helmet as a two-tier dome (a bowl that
  // rounds to a smaller crown) with a brow band, nasal, cheek guards and a neck
  // flange — the cube head was the loudest "blocky" tell at any distance.
  const headZ = shZ + 0.04;
  frus(0, -0.005, headZ, headZ + 0.20, 0.072, 0.078, 0.066, 0.07, SKIN, tilt); // face/skull
  if (L.helmet === 'hood') {
    frus(0, -0.005, headZ + 0.08, headZ + 0.27, 0.09, 0.096, 0.052, 0.058, LINEN, tilt);
    box(-0.075, 0.045, headZ - 0.01, 0.075, 0.095, headZ + 0.14, LINEN, tilt);
  } else if (L.helmet === 'cap') {
    frus(0, -0.005, headZ + 0.12, headZ + 0.24, 0.082, 0.086, 0.052, 0.054, LEATHER, tilt);
    box(-0.078, -0.09, headZ + 0.09, 0.078, -0.055, headZ + 0.13, LEATHER_DK, tilt);
  } else if (L.helmet !== 'bare') {
    frus(0, -0.005, headZ + 0.11, headZ + 0.21, 0.088, 0.092, 0.078, 0.082, BRONZE, tilt);
    frus(0, -0.005, headZ + 0.21, headZ + 0.28, 0.078, 0.082, 0.03, 0.032, BRONZE, tilt);
    box(-0.086, -0.10, headZ + 0.085, 0.086, -0.06, headZ + 0.135, BRONZE_DK, tilt);
    box(-0.018, -0.105, headZ + 0.02, 0.018, -0.075, headZ + 0.10, BRONZE_DK, tilt);
    if (L.helmet === 'crested') {
      box(-0.092, -0.085, headZ + 0.02, -0.066, 0.05, headZ + 0.135, BRONZE_DK, tilt);
      box(0.066, -0.085, headZ + 0.02, 0.092, 0.05, headZ + 0.135, BRONZE_DK, tilt);
      box(-0.082, 0.05, headZ + 0.0, 0.082, 0.088, headZ + 0.14, BRONZE_DK, tilt);
    }
  }
  if (L.crest) {
    // Swept fore-aft plume in the faction colour — a stack of frusta arcing back
    // off the crown, the loudest team tell on the field.
    ffrus(0, -0.02, headZ + 0.27, headZ + 0.40, 0.022, 0.05, 0.018, 0.09, tilt);
    ffrus(0, 0.06, headZ + 0.30, headZ + 0.42, 0.018, 0.08, 0.012, 0.10, tilt);
  }

  // ---- Arms: a shield arm (left, -x) and a weapon arm (right, +x) -------
  const shoulderZ = shZ - 0.04;
  // Shield arm: bent across the body holding the shield up.
  box(-0.235, -0.05, shoulderZ - 0.30, -0.15, 0.07, shoulderZ + 0.02, SKIN, tilt); // upper+fore shield arm
  // Weapon arm swings to counter the legs at a walk and drives forward on a
  // strike. Pivot at the shoulder; angle blends walk counter-swing + attack.
  const armA = -P.stride * 0.35 * P.legPhase + P.windup * 0.75 - P.attack * 1.2
    + P.recoil * 0.85 + P.rest * 0.2;
  if (L.weapon !== 'none') {
    // The swing (armA) and the body lean (tilt.ang) are both x-rotations, so the
    // angles add; the swing is applied here, about the shoulder, because that
    // pivot differs from the body's hip pivot used by tilt.
    const sx = 0.20;
    box(sx - 0.05, -0.05, shoulderZ - 0.34, sx + 0.055, 0.07, shoulderZ + 0.02, SKIN,
      { ang: armA + tilt.ang, py: shoulderZ, pz: shoulderZ });
  }
  // Rounded bronze pauldrons capping each shoulder joint (ride the torso lean).
  frus(-0.195, 0.01, shoulderZ - 0.05, shoulderZ + 0.07, 0.055, 0.075, 0.03, 0.045, BRONZE, tilt);
  if (L.weapon !== 'none') frus(0.195, 0.01, shoulderZ - 0.05, shoulderZ + 0.07, 0.055, 0.075, 0.03, 0.045, BRONZE, tilt);

  // ---- Shield (left, facing +y): wooden face, iron rim, faction emblem ---
  if (L.shield !== 'none') {
    const [w, h] = { tall: [0.36, 0.82], round: [0.30, 0.58], small: [0.22, 0.44] }[L.shield];
    const x0 = -0.34, z0 = base + 0.30;
    box(x0, 0.13, z0, x0 + w, 0.18, z0 + h, SHIELD_WOOD, tilt); // board face
    box(x0, 0.12, z0, x0 + 0.03, 0.19, z0 + h, IRON, tilt); // left rim
    box(x0 + w - 0.03, 0.12, z0, x0 + w, 0.19, z0 + h, IRON, tilt); // right rim
    box(x0, 0.12, z0, x0 + w, 0.19, z0 + 0.03, IRON, tilt); // bottom rim
    box(x0, 0.12, z0 + h - 0.03, x0 + w, 0.19, z0 + h, IRON, tilt); // top rim
    // Raised iron boss at the centre, with a faction stud and a painted band —
    // depth and a team tell in one. The boss is a small dome poking forward (+y).
    const bx = x0 + w * 0.5, bz = z0 + h * 0.5;
    fbox(x0 + 0.03, 0.19, bz - 0.04, x0 + w - 0.03, 0.205, bz + 0.04, tilt); // painted band
    // Boss poking FORWARD (+y) off the face: a stepped iron dome with a faction
    // stud at the tip — depth on an otherwise flat board.
    box(bx - 0.07, 0.18, bz - 0.07, bx + 0.07, 0.22, bz + 0.07, IRON, tilt); // boss base
    box(bx - 0.045, 0.22, bz - 0.045, bx + 0.045, 0.255, bz + 0.045, IRON, tilt); // boss step
    fbox(bx - 0.025, 0.255, bz - 0.025, bx + 0.025, 0.275, bz + 0.025, tilt); // faction stud
  }

  // ---- Weapon (right, +x) ----------------------------------------------
  // Reuses the block model's rest→fight pole sweep, plus an attack thrust that
  // shoves the weapon forward along +y. Pole arms ride the weapon hand.
  const wx = 0.21;
  const r = P.rest;
  const thrust = P.attack * 0.65 - P.windup * 0.15;
  const lx = (a: number, b: number) => a + (b - a) * r;
  const wbox = (
    fy0: number, fz0: number, fy1: number, fz1: number,
    ey0: number, ez0: number, ey1: number, ez1: number, c: V3,
  ) => box(
    wx - 0.025, lx(fy0, ey0) + thrust, base + lx(fz0, ez0),
    wx + 0.03, lx(fy1, ey1) + thrust, base + lx(fz1, ez1), c, tilt,
  );
  const pole = (fy0: number, fz0: number, fy1: number, fz1: number, h: number, c: V3) =>
    wbox(fy0, fz0, fy1, fz1, -0.04, 0, 0.04, h, c);
  switch (L.weapon) {
    case 'pike':
      pole(-0.2, 0.7, 3.0, 0.78, 3.4, WOOD);
      wbox(3.0, 0.70, 3.18, 0.82, 0.03, 3.30, 0.10, 3.48, IRON);
      break;
    case 'lance':
      pole(-0.1, 0.55, 2.0, 0.62, 2.3, WOOD);
      wbox(2.0, 0.54, 2.18, 0.66, 0.03, 2.20, 0.10, 2.38, IRON);
      break;
    case 'spear': pole(-0.2, 0.6, 1.4, 0.66, 1.9, WOOD);
      box(wx - 0.03, lx(1.4, 0.04) + thrust, base + lx(0.62, 1.85), wx + 0.035, lx(1.55, 0.12) + thrust, base + lx(0.7, 1.95), IRON, tilt); break;
    case 'javelin':
      pole(-0.1, 0.7, 0.9, 0.74, 1.4, WOOD);
      wbox(0.9, 0.68, 1.04, 0.78, 0.03, 1.28, 0.10, 1.46, IRON);
      break;
    case 'sword':
      wbox(0.0, 0.5, 0.06, 1.2, 0.0, 0.1, 0.06, 0.8, IRON);
      wbox(-0.03, lx(0.46, 0.06), 0.09, lx(0.54, 0.14), 0, 0, 0, 0, LEATHER); break; // crossguard-ish hilt
    case 'greatsword': wbox(0.0, 0.4, 0.08, 1.7, 0.0, 0.0, 0.08, 1.2, IRON); break;
    case 'bow':
      wbox(-0.03, 0.2, 0.03, 1.62, -0.03, 0.05, 0.03, 1.15, WOOD); // stave
      wbox(0.0, 0.92, 0.52, 0.98, -0.04, 0.7, 0.06, 0.76, WOOD); break; // nocked arrow
    case 'none': break;
  }

  // Shock cavalry with its sabre drawn still carries the lance; it is just
  // stowed upright in the off hand. The actual lance class above is the only
  // cavalry look that points the lance down/couched for use.
  if (cls === SHOCK_CAV_SIDEARM_LOOK) {
    const sx = -0.24;
    box(sx - 0.025, -0.03, base + 0.10, sx + 0.03, 0.035, base + 2.55, WOOD);
    box(sx - 0.035, -0.04, base + 2.50, sx + 0.04, 0.045, base + 2.74, IRON);
    box(sx - 0.055, -0.06, shoulderZ - 0.20, sx + 0.045, 0.065, shoulderZ - 0.08, SKIN);
  }

  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  vd.normals = normals;
  vd.colors = col;
  vd.uvs = uv;
  return vd;
}
