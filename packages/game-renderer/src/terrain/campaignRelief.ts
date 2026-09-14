import type { CampaignTerrainField } from "../campaign/entityFrame";
import { hash2, smoothstep } from "../../../renderer-core/src/math";

type CampaignReliefSource = Pick<
  CampaignTerrainField,
  "w" | "h" | "cell" | "minX" | "maxY" | "height" | "biome"
>;

/** Source interpolation and geographic relief share one owner across geometry
 * and ecological queries. Cell filters sub-grid folds, never source geography. */
export function campaignRelief(source: CampaignReliefSource, cell: number) {
  const sample = (
    values: ArrayLike<number>,
    stride: number,
    channel: number,
    x: number,
    y: number,
  ) => {
    const gx = Math.max(0, Math.min(source.w - 1, (x - source.minX) / source.cell - 0.5));
    const gy = Math.max(0, Math.min(source.h - 1, (source.maxY - y) / source.cell - 0.5));
    const ix = Math.floor(gx),
      iy = Math.floor(gy);
    const jx = Math.min(ix + 1, source.w - 1),
      jy = Math.min(iy + 1, source.h - 1);
    const get = (i: number, j: number) => values[(j * source.w + i) * stride + channel];
    return mix(
      mix(get(ix, iy), get(jx, iy), gx - ix),
      mix(get(ix, jy), get(jx, jy), gx - ix),
      gy - iy,
    );
  };
  const reliefHeight = (x: number, y: number, inland = Infinity) => {
    const envelope = Math.max(0, sample(source.height, 1, 0, x, y) - 2.2);
    const wx = x + (campaignNoise(x / 75, y / 75) - 0.5) * 30;
    const wy = y + (campaignNoise(x / 75 + 13, y / 75 + 7) - 0.5) * 30;
    const ridge = (scale: number) => {
      const n = 2 * campaignNoise(wx / scale, wy / scale) - 1;
      return Math.max(0, 1 - Math.sqrt(n * n + 0.0025));
    };
    const folds =
      0.24 +
      0.52 * ridge(60) ** 2 +
      0.18 * ridge(28) ** 2 +
      0.06 * ridge(13) * (1 - smoothstep(3, 8, cell));
    const foothill = 0.5 + campaignNoise(x / 18, y / 18) * 1.1;
    return (foothill + envelope * 2.5 * folds) * smoothstep(0, 16, inland);
  };
  return { sample, heightAt: reliefHeight };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function campaignNoise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = x - ix,
    ty = y - iy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const gradient = (gx: number, gy: number, dx: number, dy: number) => {
    const angle = hash2(gx, gy) * Math.PI * 2;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };
  return (
    0.5 +
    0.7 *
      mix(
        mix(gradient(ix, iy, tx, ty), gradient(ix + 1, iy, tx - 1, ty), fade(tx)),
        mix(gradient(ix, iy + 1, tx, ty - 1), gradient(ix + 1, iy + 1, tx - 1, ty - 1), fade(tx)),
        fade(ty),
      )
  );
}
