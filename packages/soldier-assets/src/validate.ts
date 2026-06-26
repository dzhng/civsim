import { REQUIRED_HUMAN_CLIPS, type SoldierKitManifest } from './schema';

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

