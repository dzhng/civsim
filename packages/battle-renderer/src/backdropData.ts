export const BACKDROP_INDICES = new Uint16Array([0, 1, 2, 1, 3, 2]);
export type BackdropRect = readonly [number, number, number, number];
export function backdropVertices([x, y, w, h]: BackdropRect) {
  return new Float32Array([x, y, 0, x + w, y, 0, x, y + h, 0, x + w, y + h, 0]);
}
