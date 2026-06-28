export type ClipId =
  | 'idle'
  | 'march'
  | 'run'
  | 'attack_a'
  | 'hit_a'
  | 'death_a'
  | 'at_ease'
  | 'walk'
  | 'canter';

export interface SoldierSkeleton {
  bones: number;
  boneOrder: string[];
  rootBone: string;
  source: string;
}

export interface SoldierClip {
  name: ClipId | string;
  start: number;
  frames: number;
  loop: boolean;
  fps?: number;
}

export interface SoldierArchetype {
  name: string;
  skeleton: string;
  mount?: string;
  pieces: string[];
  material: string;
}

export interface SoldierVatManifest {
  format: string;
  path: string;
  layout: string;
  sha256: string;
}

export interface SoldierKitManifest {
  schema: 1;
  provenance: string;
  skeletons: Record<string, SoldierSkeleton>;
  fps: number;
  frameMap: Record<string, ClipId | string>;
  clips: Record<string, SoldierClip>;
  archetypes: Record<string, SoldierArchetype>;
  materials: {
    channels: string[];
    factionTint: string;
    compression: string;
  };
  vat: SoldierVatManifest;
  /** Optional per-class baked VAT paths (classId → url). Classes absent here
   *  fall back to the shared `vat` placeholder. */
  classVats?: Record<string, string>;
}

export interface VatClip {
  name: string;
  start: number;
  frames: number;
}

export interface VatBake {
  schema: 1;
  skeleton: string;
  fps: number;
  width: number;
  height: number;
  bones: number;
  clips: VatClip[];
  layout: string;
  sha256: string;
  data: number[];
}

export const REQUIRED_HUMAN_CLIPS: ClipId[] = [
  'idle',
  'march',
  'run',
  'attack_a',
  'hit_a',
  'death_a',
  'at_ease',
];

export const REQUIRED_HORSE_CLIPS: ClipId[] = ['idle', 'walk', 'canter'];

