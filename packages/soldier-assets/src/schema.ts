export interface VatClip {
  name: string;
  start: number;
  frames: number;
  duration: number;
  loop: boolean;
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
