import { hash2 } from "../../../renderer-core/src/math";

/** World-anchored candidates: bounds select a window, never reseed its contents.
 * One candidate per lattice cell keeps work finite without retries. */
export function* terrainScatterCandidates(
  bounds: readonly [number, number, number, number],
  spacing: number,
  seed: number,
): Generator<{ x: number; y: number; seed: number }> {
  const [x0, y0, x1, y1] = bounds;
  for (let iy = Math.floor(y0 / spacing); iy < Math.ceil(y1 / spacing); iy++) {
    for (let ix = Math.floor(x0 / spacing); ix < Math.ceil(x1 / spacing); ix++) {
      const identity = seed ^ Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
      const x = (ix + 0.1 + hash2(identity, 1) * 0.8) * spacing;
      const y = (iy + 0.1 + hash2(identity, 2) * 0.8) * spacing;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) yield { x, y, seed: identity };
    }
  }
}
