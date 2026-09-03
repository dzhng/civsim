export interface CampaignMapStyle {
  seaTintMix?: number;
  terrainMix?: number;
  terrain?: CampaignMapTerrainTextures;
}

interface CampaignMapTerrainTextures {
  width: number;
  height: number;
  biome: Uint8Array;
  light: Uint8Array;
}

export interface CampaignMapSurfaceMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

/** The map pass's own drawn-coast contract: the campaign-bg raster (what the
 * raster terrain layer paints), the biome texture (whose alpha contour is the
 * canonical-terrain waterline), and the terrainMix this pass composites them
 * with. territoryPass clips the faction wash through the SAME textures and mix
 * (via the shared seaAmount / drawnWaterAmount classifiers), so the wash ends
 * exactly where the visibly drawn sea begins. */
export interface CampaignDrawnCoast {
  bg: GPUTextureView;
  biome: GPUTextureView;
  terrainMix: number;
}

export function flatMapSurface(rect: {
  min: [number, number];
  max: [number, number];
}): CampaignMapSurfaceMesh {
  const [x0, y0] = rect.min;
  const [x1, y1] = rect.max;
  return {
    vertices: new Float32Array([
      x0,
      y0,
      0,
      0,
      1,
      x1,
      y0,
      0,
      1,
      1,
      x0,
      y1,
      0,
      0,
      0,
      x1,
      y1,
      0,
      1,
      0,
    ]),
    indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  };
}

export function createRgbaTexture(
  device: GPUDevice,
  label: string,
  width: number,
  height: number,
  rgba: Uint8Array,
) {
  const texture = device.createTexture({
    label,
    size: [width, height, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const rowBytes = width * 4;
  const bytesPerRow = align256(rowBytes);
  const source = bytesPerRow === rowBytes ? rgba : padRgbaRows(rgba, width, height, bytesPerRow);
  device.queue.writeTexture(
    { texture },
    source,
    { bytesPerRow, rowsPerImage: height },
    { width, height },
  );
  return texture;
}

export function createLightTexture(
  device: GPUDevice,
  label: string,
  width: number,
  height: number,
  light: Uint8Array,
) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = light[i] ?? 128;
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return createRgbaTexture(device, label, width, height, rgba);
}

function align256(value: number) {
  return Math.ceil(value / 256) * 256;
}

function padRgbaRows(rgba: Uint8Array, width: number, height: number, bytesPerRow: number) {
  const rowBytes = width * 4;
  const padded = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    padded.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * bytesPerRow);
  }
  return padded;
}
