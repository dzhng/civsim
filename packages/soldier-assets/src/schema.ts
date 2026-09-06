/** Marker values are normalized clip phases, inclusive of both endpoints. */
export interface ClipMarkers {
  release?: number;
}

export function assertClipMarkers(markers: ClipMarkers | undefined): void {
  if (markers === undefined) return;
  if (
    !markers ||
    typeof markers !== "object" ||
    Array.isArray(markers) ||
    (Object.hasOwn(markers, "release") &&
      (!Number.isFinite(markers.release) || markers.release! < 0 || markers.release! > 1))
  ) {
    throw new Error("clip release marker must be a finite normalized phase from zero to one");
  }
}

export interface VatClip {
  name: string;
  start: number;
  frames: number;
  duration: number;
  loop: boolean;
  markers?: ClipMarkers;
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
