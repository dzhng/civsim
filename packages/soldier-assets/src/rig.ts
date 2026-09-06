import type { ClipMarkers } from "./schema";

export interface RigBone {
  name: string;
  parent: number;
  bind: { T: number[]; R: number[]; S: number[] };
  inverseBind: ArrayLike<number>;
}

export interface RigClip {
  name: string;
  duration: number;
  loop?: boolean;
  markers?: ClipMarkers;
  tracks: Record<number, { T?: unknown; R?: unknown; S?: unknown }>;
}

export interface ImportedRig {
  bones: RigBone[];
  clips: RigClip[];
}
