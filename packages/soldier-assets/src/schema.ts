/** Marker values are normalized clip phases, inclusive of both endpoints. */
export interface ClipMarkers {
  release?: number;
}

export interface ClipMetadata {
  markers?: ClipMarkers;
  /** Authored metres of travel per complete gait cycle; absent on time-driven clips. */
  strideMeters?: number;
}

export function assertClipMetadata(clip: ClipMetadata): void {
  assertClipMarkers(clip.markers);
  if (
    clip.strideMeters !== undefined &&
    (!Number.isFinite(clip.strideMeters) || clip.strideMeters <= 0)
  )
    throw new Error("clip strideMeters must be finite and positive");
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
