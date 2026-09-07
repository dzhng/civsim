import type { ClipMetadata } from "./schema";

export interface RigBone {
  name: string;
  parent: number;
  bind: { T: number[]; R: number[]; S: number[] };
  inverseBind: ArrayLike<number>;
}

export interface RigChannel {
  times: number[];
  values: number[];
  interpolation?: "LINEAR" | "STEP";
}

export interface RigClip extends ClipMetadata {
  name: string;
  duration: number;
  loop?: boolean;
  tracks: Record<number, { T?: RigChannel; R?: RigChannel; S?: RigChannel }>;
}

export interface ImportedRig {
  bones: RigBone[];
  clips: RigClip[];
}
