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
  crest: boolean;
  mounted: boolean;
}

export const CLASS_LOOK: ClassLook[] = [
  { weapon: 'sword', shield: 'tall', crest: true, mounted: false }, // 0 heavy sword
  { weapon: 'spear', shield: 'round', crest: false, mounted: false }, // 1 light spear
  { weapon: 'greatsword', shield: 'none', crest: false, mounted: false }, // 2 longswords
  { weapon: 'pike', shield: 'small', crest: true, mounted: false }, // 3 phalanx
  { weapon: 'bow', shield: 'none', crest: false, mounted: false }, // 4 archers
  { weapon: 'javelin', shield: 'small', crest: false, mounted: false }, // 5 skirmishers
  { weapon: 'lance', shield: 'round', crest: true, mounted: true }, // 6 shock cav
  { weapon: 'bow', shield: 'none', crest: false, mounted: true }, // 7 horse archers
  { weapon: 'none', shield: 'none', crest: false, mounted: false }, // 8 artillery crew
  { weapon: 'sword', shield: 'none', crest: false, mounted: false }, // 9 peasant (a knife, no shield)
  { weapon: 'sword', shield: 'round', crest: false, mounted: false }, // 10 light sword (sword + light shield)
  { weapon: 'spear', shield: 'tall', crest: true, mounted: false }, // 11 heavy spear (spear + big shield)
];

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
