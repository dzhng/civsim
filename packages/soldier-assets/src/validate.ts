import { REQUIRED_HUMAN_CLIPS, type ClipId, type SoldierKitManifest } from './schema';

export interface RigBone {
  name: string;
  parent: number;
  bind: { T: number[]; R: number[]; S: number[] };
  inverseBind: ArrayLike<number>;
}

export interface RigClip {
  name: string;
  duration: number;
  tracks: Record<number, { T?: unknown; R?: unknown; S?: unknown }>;
}

export interface ImportedRig {
  bones: RigBone[];
  clips: RigClip[];
}

export interface ValidateRigOptions {
  /** Clip names the rig must provide. Defaults to the required human clips. */
  requiredClips?: Array<ClipId | string>;
  /** Skinning layout ceiling: a rig with more bones cannot bake into the VAT. */
  maxBones?: number;
}

export type ValidationLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  path: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

function issue(level: ValidationLevel, code: string, path: string, message: string): ValidationIssue {
  return { level, code, path, message };
}

export function validateSoldierKit(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  const kit = input as Partial<SoldierKitManifest> | null;
  const add = (level: ValidationLevel, code: string, path: string, message: string) => {
    issues.push(issue(level, code, path, message));
  };

  if (!kit || typeof kit !== 'object') {
    add('error', 'manifest.type', 'manifest', 'manifest must be an object');
    return finish(issues);
  }
  if (kit.schema !== 1) add('error', 'manifest.schema', 'schema', 'schema must be 1');
  if (!kit.provenance) add('error', 'manifest.provenance', 'provenance', 'provenance is required');
  if (!kit.skeletons || typeof kit.skeletons !== 'object') add('error', 'skeletons.missing', 'skeletons', 'at least one skeleton is required');
  if (!kit.clips || typeof kit.clips !== 'object') add('error', 'clips.missing', 'clips', 'clips are required');
  if (!kit.archetypes || typeof kit.archetypes !== 'object') add('error', 'archetypes.missing', 'archetypes', 'class archetypes are required');
  if (!kit.vat?.path) add('error', 'vat.path', 'vat.path', 'baked VAT path is required');

  const skeletons = kit.skeletons ?? {};
  for (const [id, skeleton] of Object.entries(skeletons)) {
    if (!Array.isArray(skeleton.boneOrder)) add('error', 'skeleton.boneOrder', `skeletons.${id}.boneOrder`, 'boneOrder must be an array');
    if (skeleton.bones !== skeleton.boneOrder?.length) {
      add('error', 'skeleton.boneCount', `skeletons.${id}.bones`, 'bones must match boneOrder length');
    }
    if (skeleton.rootBone && skeleton.boneOrder && !skeleton.boneOrder.includes(skeleton.rootBone)) {
      add('error', 'skeleton.rootBone', `skeletons.${id}.rootBone`, 'rootBone must exist in boneOrder');
    }
  }

  const clips = kit.clips ?? {};
  for (const name of REQUIRED_HUMAN_CLIPS) {
    if (!clips[name]) add('error', 'clip.required', `clips.${name}`, `required human clip "${name}" is missing`);
  }
  for (const [name, clip] of Object.entries(clips)) {
    if (clip.frames <= 0) add('error', 'clip.frames', `clips.${name}.frames`, 'clip frame count must be positive');
    if (clip.start < 0) add('error', 'clip.start', `clips.${name}.start`, 'clip start must be non-negative');
  }

  const archetypes = kit.archetypes ?? {};
  for (const [id, archetype] of Object.entries(archetypes)) {
    if (!archetype.name) add('error', 'archetype.name', `archetypes.${id}.name`, 'archetype name is required');
    if (!skeletons[archetype.skeleton]) {
      add('error', 'archetype.skeleton', `archetypes.${id}.skeleton`, `unknown skeleton "${archetype.skeleton}"`);
    }
    if (archetype.mount && !skeletons[archetype.mount]) {
      add('error', 'archetype.mount', `archetypes.${id}.mount`, `unknown mounted skeleton "${archetype.mount}"`);
    }
    if (!Array.isArray(archetype.pieces) || archetype.pieces.length === 0) {
      add('warning', 'archetype.pieces', `archetypes.${id}.pieces`, 'archetype should name at least one mesh piece');
    }
  }

  if (!kit.materials?.channels?.includes('factionMask')) {
    add('error', 'materials.factionMask', 'materials.channels', 'factionMask channel is required');
  }
  if (kit.vat?.layout && !kit.vat.layout.includes('joint matrix')) {
    add('warning', 'vat.layout', 'vat.layout', 'VAT layout should describe joint matrix packing');
  }

  return finish(issues);
}

// Validate a rig parsed from a real .glb (the front door for imported art)
// against what the VAT bake + skinning layout require: a sane skeleton, present
// inverse-binds, animated channels, and full required-clip coverage.
export function validateRig(input: unknown, options: ValidateRigOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationLevel, code: string, path: string, message: string) => {
    issues.push(issue(level, code, path, message));
  };
  const rig = input as Partial<ImportedRig> | null;
  if (!rig || typeof rig !== 'object' || !Array.isArray(rig.bones) || !Array.isArray(rig.clips)) {
    add('error', 'rig.type', 'rig', 'rig must have bones[] and clips[]');
    return finish(issues);
  }
  const maxBones = options.maxBones ?? 256;
  if (rig.bones.length === 0) add('error', 'rig.bones', 'bones', 'rig has no bones');
  if (rig.bones.length > maxBones) {
    add('error', 'rig.boneCount', 'bones', `rig has ${rig.bones.length} bones, exceeds skinning layout max ${maxBones}`);
  }
  rig.bones.forEach((bone, i) => {
    if (bone.parent >= i) add('error', 'rig.boneOrder', `bones.${i}`, `bone "${bone.name}" must come after its parent`);
    if (!bone.inverseBind || bone.inverseBind.length !== 16) {
      add('error', 'rig.inverseBind', `bones.${i}.inverseBind`, `bone "${bone.name}" is missing a 16-float inverse-bind matrix`);
    }
    if (!bone.bind || !Array.isArray(bone.bind.R) || bone.bind.R.length !== 4) {
      add('error', 'rig.bind', `bones.${i}.bind`, `bone "${bone.name}" is missing a bind pose (T/R/S)`);
    }
  });

  const clipNames = new Set(rig.clips.map((c) => c.name));
  const required = options.requiredClips ?? REQUIRED_HUMAN_CLIPS;
  for (const name of required) {
    if (!clipNames.has(name)) add('error', 'rig.clip.required', `clips.${name}`, `required clip "${name}" is missing`);
  }
  rig.clips.forEach((clip, i) => {
    const path = `clips.${clip.name || i}`;
    if (!(clip.duration > 0)) add('warning', 'rig.clip.duration', `${path}.duration`, `clip "${clip.name}" has zero duration`);
    const tracks = clip.tracks && typeof clip.tracks === 'object' ? Object.values(clip.tracks) : [];
    const animated = tracks.some((t) => t && (t.T || t.R || t.S));
    if (!animated) add('warning', 'rig.clip.tracks', `${path}.tracks`, `clip "${clip.name}" animates no bone channel`);
  });

  return finish(issues);
}

function finish(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((x) => x.level === 'error');
  const warnings = issues.filter((x) => x.level === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

export function badArtistPackFixture(): SoldierKitManifest {
  return {
    schema: 1,
    provenance: '',
    skeletons: {
      human: { bones: 2, boneOrder: ['hips'], rootBone: 'root', source: 'bad-sample' },
    },
    fps: 12,
    frameMap: {},
    clips: { idle: { name: 'idle', start: 0, frames: 1, loop: true } },
    archetypes: {
      0: { name: 'broken', skeleton: 'missing', pieces: [], material: 'none' },
    },
    materials: { channels: ['albedo'], factionTint: '', compression: '' },
    vat: { format: '', path: '', layout: '', sha256: '' },
  };
}

