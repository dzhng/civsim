import { campaignLandscapeSource } from "@packages/game-renderer/src/terrain/campaignSource";

/** Frozen semantic framing for landscape comparisons; production camera math stays shared. */
export const LANDSCAPE_REGIONS = {
  alps: { center: [-450, 990] as [number, number], radius: 360, zoom: 2.5 },
  italy: { center: [-325, 640] as [number, number], radius: 360, zoom: 2.5 },
  fixture: { center: [0, 0] as [number, number], radius: 80, zoom: 4 },
};

export function coastalRidgeFixture() {
  const w = 41,
    h = 41,
    cell = 8,
    minX = -164,
    maxY = 164;
  const height = new Float32Array(w * h),
    biome = new Uint8Array(w * h * 4),
    land = new Uint8Array(w * h);
  const renderLandAt = (x: number, y: number, margin = 0) =>
    x > -35 + Math.sin(y / 25) * 8 + margin;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i,
        x = minX + (i + 0.5) * cell,
        y = maxY - (j + 0.5) * cell;
      land[k] = renderLandAt(x, y) ? 1 : 0;
      height[k] = land[k] * (3 + 12 * Math.exp(-(((x - 12 - Math.sin(y / 38) * 10) / 24) ** 2)));
      biome.set([160, 180, 80, land[k] ? 255 : 0], k * 4);
    }
  const width = 328;
  const classes = Uint8Array.from({ length: width * width }, (_, k) =>
    renderLandAt((k % width) - 163.5, 163.5 - Math.floor(k / width)) ? 1 : 0,
  );
  return {
    ...campaignLandscapeSource({
      w,
      h,
      cell,
      minX,
      maxY,
      height,
      biome,
      renderMask: { width, height: width, classes, rect: { min: [-164, -164], max: [164, 164] } },
    }),
    w,
    h,
    cell,
    minX,
    maxY,
    height,
    biome,
    land,
    maxH: 15,
    heightAt: () => 0,
  };
}
