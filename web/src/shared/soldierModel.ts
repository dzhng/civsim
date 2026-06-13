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
  { weapon: 'sword', shield: 'tall', crest: true, mounted: false }, // 0 heavy
  { weapon: 'spear', shield: 'round', crest: false, mounted: false }, // 1 light
  { weapon: 'greatsword', shield: 'none', crest: false, mounted: false }, // 2 longswords
  { weapon: 'pike', shield: 'small', crest: true, mounted: false }, // 3 phalanx
  { weapon: 'bow', shield: 'none', crest: false, mounted: false }, // 4 archers
  { weapon: 'javelin', shield: 'small', crest: false, mounted: false }, // 5 skirmishers
  { weapon: 'lance', shield: 'round', crest: true, mounted: true }, // 6 shock cav
  { weapon: 'bow', shield: 'none', crest: false, mounted: true }, // 7 horse archers
  { weapon: 'none', shield: 'none', crest: false, mounted: false }, // 8 artillery crew
];

/** Per-class soldier (or rider on a horse) as one box mesh. When `rest` is set,
 *  pole arms (pike, spear, javelin, lance) stand vertical — the at-ease pose a
 *  unit holds when no enemy is in reach; otherwise they level forward to fight. */
export function classGeometry(cls: number, rest = false): VertexData {
  const L = CLASS_LOOK[cls] ?? CLASS_LOOK[0];
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

  // Rider sits higher when mounted; the horse goes under him.
  const foot = L.mounted ? 0.95 : 0.0;
  if (L.mounted) {
    box(-0.16, -0.7, 0.0, 0.16, 0.55, 0.92); // horse barrel
    box(-0.13, 0.5, 0.55, 0.13, 0.95, 0.78); // neck
    box(-0.11, 0.9, 0.66, 0.11, 1.18, 0.9); // head
    box(-0.16, -0.62, 0.0, -0.08, -0.5, 0.6); // a back leg hint
    box(0.08, 0.42, 0.0, 0.16, 0.54, 0.6); // a front leg hint
  }
  box(-0.16, -0.1, foot, 0.16, 0.1, foot + 1.0); // torso + legs
  box(-0.1, -0.09, foot + 1.0, 0.1, 0.11, foot + 1.34); // head
  if (L.crest) box(-0.03, -0.05, foot + 1.34, 0.03, 0.14, foot + 1.5); // helmet crest

  // Shield on the left arm (-x), facing forward.
  if (L.shield !== 'none') {
    const sh = { tall: [0.5, 0.78], round: [0.42, 0.55], small: [0.32, 0.4] }[L.shield];
    box(-0.27, 0.02, foot + 0.35, -0.19, 0.06 + sh[0] * 0.0 + 0.0, foot + 0.35 + sh[1]);
  }

  // Weapon on the right (+x). Pole arms level forward (+y) to fight, or — at
  // ease — stand vertical (+z), butt by the foot, a forest of raised shafts.
  const wx = 0.2;
  // A grounded vertical shaft of height h (the rest pose for a pole arm).
  const upright = (h: number) => box(wx - 0.04, -0.04, foot, wx + 0.04, 0.04, foot + h);
  switch (L.weapon) {
    case 'pike': rest ? upright(3.4) : box(wx - 0.02, -0.2, foot + 0.7, wx + 0.02, 3.0, foot + 0.78); break;
    case 'lance': rest ? upright(2.3) : box(wx - 0.02, -0.1, foot + 0.55, wx + 0.02, 2.0, foot + 0.62); break;
    case 'spear': rest ? upright(1.9) : box(wx - 0.02, -0.2, foot + 0.6, wx + 0.02, 1.4, foot + 0.66); break;
    case 'javelin': rest ? upright(1.4) : box(wx - 0.02, -0.1, foot + 0.7, wx + 0.02, 0.9, foot + 0.74); break;
    case 'sword': box(wx - 0.02, 0.0, foot + 0.5, wx + 0.03, 0.06, foot + 1.2); break;
    case 'greatsword': box(wx - 0.03, 0.0, foot + 0.4, wx + 0.04, 0.08, foot + 1.7); break;
    case 'bow': box(wx + 0.04, -0.02, foot + 0.4, wx + 0.1, 0.02, foot + 1.4); break;
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
