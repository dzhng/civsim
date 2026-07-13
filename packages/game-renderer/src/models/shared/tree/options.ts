// Vendored from ez-tree (github.com/dgreenheck/ez-tree, MIT — see README.md),
// trimmed to the geometry parameters: the upstream bark/leaf texture maps,
// tints, materials, and trellis system are dropped because civsim trees are
// vertex-colored MeshData (the adapter owns color).

export type TreeType = 'deciduous' | 'evergreen';

/** 'double' adds a second quad perpendicular to the first per leaf. */
export type LeafBillboard = 'single' | 'double';

/**
 * Per-recursion-level tables. Level 0 is the trunk; entries above
 * `branch.levels` are ignored. Angles are degrees.
 */
export interface BranchOptions {
  /** Number of branch recursion levels. 0 = trunk only. */
  levels: number;
  /** Angle of child branches relative to the parent branch (degrees). */
  angle: Record<number, number>;
  /** Number of children per branch level. */
  children: Record<number, number>;
  /** External force bending growth toward (or away from, negative) a direction. */
  force: { direction: { x: number; y: number; z: number }; strength: number };
  /** Amount of random curl/wander per section at each level. */
  gnarliness: Record<number, number>;
  /** Length of each branch level (generator units). */
  length: Record<number, number>;
  /** Radius of each branch level (level 0 absolute; deeper levels scale the parent). */
  radius: Record<number, number>;
  /** Number of sections along a branch at each level. */
  sections: Record<number, number>;
  /** Number of radial segments around a branch at each level. */
  segments: Record<number, number>;
  /** Normalized position along the parent where children start forming. */
  start: Record<number, number>;
  /** Radius taper toward the branch tip at each level (deciduous only). */
  taper: Record<number, number>;
  /** Twist rotation per section at each level (radians). */
  twist: Record<number, number>;
}

export interface LeavesOptions {
  billboard: LeafBillboard;
  /** Angle of leaves relative to the parent branch (degrees). */
  angle: number;
  /** Number of leaves per final-level branch. */
  count: number;
  /** Normalized position along the branch where leaves start growing. */
  start: number;
  /** Size of the leaf quad (generator units). */
  size: number;
  /** Random per-leaf size variance, as a fraction of `size`. */
  sizeVariance: number;
  /** Bend normals away from the leaf origin so the canopy shades as one rounded mass. */
  roundedNormals: boolean;
}

export interface TreeOptions {
  seed: number;
  type: TreeType;
  branch: BranchOptions;
  leaves: LeavesOptions;
}
