// Vendored from ez-tree (github.com/dgreenheck/ez-tree, MIT — see README.md):
// the recursive branch-skeleton + leaf-placement generator from src/lib/tree.js,
// reduced to pure geometry. Upstream's THREE.Group/material/texture/wind/trellis
// layers are dropped; positions stay in the generator's Y-up frame and the
// civsim adapter owns the conversion to MeshData. Kept seed-faithful: RNG call
// order matches upstream so a given (options, seed) grows the same tree.
import { Euler, Quat, Vec3 } from './math';
import type { TreeOptions } from './options';
import { RNG } from './rng';

export interface TreeGeometryPart {
  verts: number[];
  normals: number[];
  indices: number[];
}

export interface TreeGeometry {
  branches: TreeGeometryPart;
  leaves: TreeGeometryPart;
}

interface BranchSpec {
  origin: Vec3;
  orientation: Euler;
  length: number;
  radius: number;
  level: number;
  sectionCount: number;
  segmentCount: number;
}

interface SectionInfo {
  origin: Vec3;
  orientation: Euler;
  radius: number;
}

const UP = new Vec3(0, 1, 0);
const X_AXIS = new Vec3(1, 0, 0);
const DEG_TO_RAD = Math.PI / 180;

export function generateTreeGeometry(options: TreeOptions): TreeGeometry {
  return new TreeGenerator(options).generate();
}

class TreeGenerator {
  private rng: RNG;
  private branchQueue: BranchSpec[] = [];
  private branches: TreeGeometryPart = { verts: [], normals: [], indices: [] };
  private leaves: TreeGeometryPart = { verts: [], normals: [], indices: [] };

  constructor(private options: TreeOptions) {
    this.rng = new RNG(options.seed);
  }

  generate(): TreeGeometry {
    this.branchQueue.push({
      origin: new Vec3(),
      orientation: new Euler(),
      length: this.options.branch.length[0],
      radius: this.options.branch.radius[0],
      level: 0,
      sectionCount: this.options.branch.sections[0],
      segmentCount: this.options.branch.segments[0],
    });
    while (this.branchQueue.length > 0) {
      this.generateBranch(this.branchQueue.shift()!);
    }
    return { branches: this.branches, leaves: this.leaves };
  }

  private generateBranch(branch: BranchSpec): void {
    const indexOffset = this.branches.verts.length / 3;
    const sectionOrientation = branch.orientation.clone();
    const sectionOrigin = branch.origin.clone();
    const sectionLength = branch.length / branch.sectionCount;

    // Section poses are kept for child-branch and leaf placement afterwards.
    const sections: SectionInfo[] = [];

    for (let i = 0; i <= branch.sectionCount; i++) {
      let sectionRadius = branch.radius;
      if (i === branch.sectionCount && branch.level === this.options.branch.levels) {
        // Final section of the final level pinches to a point.
        sectionRadius = 0.001;
      } else if (this.options.type === 'deciduous') {
        sectionRadius *= 1 - this.options.branch.taper[branch.level] * (i / branch.sectionCount);
      } else {
        // Evergreens have no terminal branch, so they taper fully to the tip.
        sectionRadius *= 1 - i / branch.sectionCount;
      }

      // Ring of segment vertices for this section.
      let first: { vertex: Vec3; normal: Vec3 } | null = null;
      for (let j = 0; j < branch.segmentCount; j++) {
        const angle = (2.0 * Math.PI * j) / branch.segmentCount;
        const vertex = new Vec3(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(sectionRadius)
          .applyEuler(sectionOrientation)
          .add(sectionOrigin);
        const normal = new Vec3(Math.cos(angle), 0, Math.sin(angle))
          .applyEuler(sectionOrientation)
          .normalize();
        this.branches.verts.push(vertex.x, vertex.y, vertex.z);
        this.branches.normals.push(normal.x, normal.y, normal.z);
        if (j === 0) first = { vertex, normal };
      }
      // Duplicated seam vertex (upstream closes the texture seam here; kept so
      // the index topology matches upstream exactly).
      this.branches.verts.push(first!.vertex.x, first!.vertex.y, first!.vertex.z);
      this.branches.normals.push(first!.normal.x, first!.normal.y, first!.normal.z);

      sections.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: sectionRadius,
      });

      sectionOrigin.add(new Vec3(0, sectionLength, 0).applyEuler(sectionOrientation));

      // Random wander per section; thinner sections wander more.
      const gnarliness =
        Math.max(1, 1 / Math.sqrt(sectionRadius)) *
        this.options.branch.gnarliness[branch.level];
      sectionOrientation.x += this.rng.random(gnarliness, -gnarliness);
      sectionOrientation.z += this.rng.random(gnarliness, -gnarliness);

      const qSection = new Quat().setFromEuler(sectionOrientation);
      const qTwist = new Quat().setFromAxisAngle(UP, this.options.branch.twist[branch.level]);
      qSection.multiply(qTwist);

      // Rotate the section's growth direction toward force.direction (positive
      // strength) or away from it (negative), around the (sectionUp × target)
      // axis so an already-aligned section receives zero rotation.
      const sectionUp = new Vec3(0, 1, 0).applyQuaternion(qSection);
      const force = this.options.branch.force;
      const target = new Vec3(force.direction.x, force.direction.y, force.direction.z).normalize();
      const axis = new Vec3().crossVectors(sectionUp, target);
      const sinFull = axis.length();
      if (sinFull > 1e-6) {
        axis.divideScalar(sinFull);
        const fullAngle = Math.atan2(sinFull, sectionUp.dot(target));
        const step = force.strength / sectionRadius;
        const clamped = Math.max(-fullAngle, Math.min(fullAngle, step));
        qSection.premultiply(new Quat().setFromAxisAngle(axis, clamped));
      }

      sectionOrientation.setFromQuaternion(qSection);
    }

    this.generateBranchIndices(indexOffset, branch);

    // Deciduous trees grow a terminal branch out of the parent's tip.
    if (this.options.type === 'deciduous') {
      const lastSection = sections[sections.length - 1];
      if (branch.level < this.options.branch.levels) {
        this.branchQueue.push({
          origin: lastSection.origin,
          orientation: lastSection.orientation,
          length: this.options.branch.length[branch.level + 1],
          radius: lastSection.radius,
          level: branch.level + 1,
          // The terminal branch continues the parent's geometry, so it keeps
          // the parent's section/segment counts.
          sectionCount: branch.sectionCount,
          segmentCount: branch.segmentCount,
        });
      } else {
        this.generateLeaf(lastSection.origin, lastSection.orientation);
      }
    }

    if (branch.level === this.options.branch.levels) {
      this.generateLeaves(sections);
    } else if (branch.level < this.options.branch.levels) {
      this.generateChildBranches(
        this.options.branch.children[branch.level],
        branch.level + 1,
        sections,
      );
    }
  }

  private generateChildBranches(count: number, level: number, sections: SectionInfo[]): void {
    const radialOffset = this.rng.random();
    const startMin = this.options.branch.start[level];
    const heightStep = (1.0 - startMin) / count;
    const angleSlots = this.shuffledIndices(count);

    for (let i = 0; i < count; i++) {
      // Stratified sampling along the parent's length: jitter within slot
      // [i, i+1] so children spread evenly but not perfectly periodically.
      const childBranchStart = startMin + (i + this.rng.random()) * heightStep;
      const { origin: childBranchOrigin, orientation: parentOrientation, radius: sectionRadius } =
        this.sampleSection(sections, childBranchStart);

      const childBranchRadius = this.options.branch.radius[level] * sectionRadius;

      // Stratified radial angle: each child gets a 2π/count slot, jittered
      // ±½ slot. angleSlots randomly permutes slot assignment so height slot
      // and angle slot are uncorrelated — otherwise evergreens (where branch
      // length depends on height) spiral their longest branches to one side.
      const radialJitter = this.rng.random(0.5, -0.5);
      const radialAngle = 2.0 * Math.PI * (radialOffset + (angleSlots[i] + radialJitter) / count);
      const childBranchOrientation = this.childOrientation(
        parentOrientation,
        this.options.branch.angle[level] * DEG_TO_RAD,
        radialAngle,
      );

      const childBranchLength =
        this.options.branch.length[level] *
        (this.options.type === 'evergreen' ? 1.0 - childBranchStart : 1.0);

      this.branchQueue.push({
        origin: childBranchOrigin,
        orientation: childBranchOrientation,
        length: childBranchLength,
        radius: childBranchRadius,
        level,
        sectionCount: this.options.branch.sections[level],
        segmentCount: this.options.branch.segments[level],
      });
    }
  }

  private generateLeaves(sections: SectionInfo[]): void {
    const radialOffset = this.rng.random();
    const count = this.options.leaves.count;
    const startMin = this.options.leaves.start;
    const heightStep = (1.0 - startMin) / count;
    const angleSlots = this.shuffledIndices(count);

    for (let i = 0; i < count; i++) {
      const leafStart = startMin + (i + this.rng.random()) * heightStep;
      const { origin: leafOrigin, orientation: parentOrientation } = this.sampleSection(
        sections,
        leafStart,
      );
      const radialJitter = this.rng.random(0.5, -0.5);
      const radialAngle = 2.0 * Math.PI * (radialOffset + (angleSlots[i] + radialJitter) / count);
      const leafOrientation = this.childOrientation(
        parentOrientation,
        this.options.leaves.angle * DEG_TO_RAD,
        radialAngle,
      );
      this.generateLeaf(leafOrigin, leafOrientation);
    }
  }

  /**
   * Interpolated pose partway (0..1) along a branch, from the section poses on
   * either side.
   */
  private sampleSection(
    sections: SectionInfo[],
    t: number,
  ): { origin: Vec3; orientation: Euler; radius: number } {
    const sectionIndex = Math.floor(t * (sections.length - 1));
    const sectionA = sections[sectionIndex];
    const sectionB =
      sectionIndex === sections.length - 1 ? sectionA : sections[sectionIndex + 1];
    const alpha =
      (t - sectionIndex / (sections.length - 1)) / (1 / (sections.length - 1));

    const origin = new Vec3().lerpVectors(sectionA.origin, sectionB.origin, alpha);
    const radius = (1 - alpha) * sectionA.radius + alpha * sectionB.radius;
    const qA = new Quat().setFromEuler(sectionA.orientation);
    const qB = new Quat().setFromEuler(sectionB.orientation);
    const orientation = new Euler().setFromQuaternion(qB.slerp(qA, alpha));
    return { origin, orientation, radius };
  }

  /** Child pose: pitch away from the parent axis, then spin around it. */
  private childOrientation(parent: Euler, pitchAngle: number, radialAngle: number): Euler {
    const q1 = new Quat().setFromAxisAngle(X_AXIS, pitchAngle);
    const q2 = new Quat().setFromAxisAngle(UP, radialAngle);
    const q3 = new Quat().setFromEuler(parent);
    return new Euler().setFromQuaternion(q3.multiply(q2.multiply(q1)));
  }

  private generateLeaf(origin: Vec3, orientation: Euler): void {
    let i = this.leaves.verts.length / 3;
    const leafSize =
      this.options.leaves.size *
      (1 +
        this.rng.random(this.options.leaves.sizeVariance, -this.options.leaves.sizeVariance));
    const W = leafSize;
    const L = leafSize;

    const createLeaf = (rotation: number): void => {
      const v = [
        new Vec3(-W / 2, L, 0),
        new Vec3(-W / 2, 0, 0),
        new Vec3(W / 2, 0, 0),
        new Vec3(W / 2, L, 0),
      ].map((p) => p.applyEuler(new Euler(0, rotation, 0)).applyEuler(orientation).add(origin));

      for (const p of v) {
        this.leaves.verts.push(p.x, p.y, p.z);
      }

      const n = new Vec3(0, 0, 1).applyEuler(orientation);
      // Averaging the leaf's facing with the direction out from its origin
      // rounds the normals so the canopy shades as one curved mass while each
      // quad keeps its own tilt.
      for (const p of v) {
        const rounded = this.options.leaves.roundedNormals
          ? new Vec3().copy(n).add(p).sub(origin).normalize()
          : n;
        this.leaves.normals.push(rounded.x, rounded.y, rounded.z);
      }

      this.leaves.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
      i += 4;
    };

    createLeaf(0);
    if (this.options.leaves.billboard === 'double') {
      createLeaf(Math.PI / 2);
    }
  }

  /**
   * Fisher-Yates shuffle of [0..count-1] using the tree's RNG so results stay
   * seed-reproducible.
   */
  private shuffledIndices(count: number): number[] {
    const arr = Array.from({ length: count }, (_, k) => k);
    for (let k = count - 1; k > 0; k--) {
      const r = Math.floor(this.rng.random() * (k + 1));
      [arr[k], arr[r]] = [arr[r], arr[k]];
    }
    return arr;
  }

  /** Quad indices between consecutive section rings (open tube, no end caps). */
  private generateBranchIndices(indexOffset: number, branch: BranchSpec): void {
    const N = branch.segmentCount + 1;
    for (let i = 0; i < branch.sectionCount; i++) {
      for (let j = 0; j < branch.segmentCount; j++) {
        const v1 = indexOffset + i * N + j;
        const v2 = indexOffset + i * N + (j + 1);
        const v3 = v1 + N;
        const v4 = v2 + N;
        this.branches.indices.push(v1, v3, v2, v2, v3, v4);
      }
    }
  }
}
