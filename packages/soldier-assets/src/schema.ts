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
