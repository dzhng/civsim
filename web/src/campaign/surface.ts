import type { CampaignMapSurfaceMesh } from '../../../packages/game-renderer/src/campaign/mapPass';
import type { TerrainField } from './terrain';

export interface CampaignSurface {
  mesh: CampaignMapSurfaceMesh;
  heightAt(x: number, y: number): number;
  landAt(x: number, y: number, radiusKm?: number): boolean;
}

export function campaignSurface(field: TerrainField): CampaignSurface {
  return {
    mesh: campaignMapSurfaceMesh(field),
    heightAt: (x, y) => field.heightAt(x, y),
    landAt: (x, y, radiusKm = 0) => field.landAt(x, y, radiusKm),
  };
}

function campaignMapSurfaceMesh(field: TerrainField): CampaignMapSurfaceMesh {
  const vertexCount = field.w * field.h;
  const vertices = new Float32Array(vertexCount * 5);
  for (let gy = 0; gy < field.h; gy++) {
    for (let gx = 0; gx < field.w; gx++) {
      const i = gy * field.w + gx;
      const o = i * 5;
      vertices[o] = field.minX + (gx + 0.5) * field.cell;
      vertices[o + 1] = field.maxY - (gy + 0.5) * field.cell;
      vertices[o + 2] = field.height[i];
      vertices[o + 3] = (gx + 0.5) / field.w;
      vertices[o + 4] = (gy + 0.5) / field.h;
    }
  }
  const indices = new Uint32Array(Math.max(0, (field.w - 1) * (field.h - 1) * 6));
  let o = 0;
  for (let gy = 0; gy < field.h - 1; gy++) {
    for (let gx = 0; gx < field.w - 1; gx++) {
      const i = gy * field.w + gx;
      indices[o++] = i;
      indices[o++] = i + field.w;
      indices[o++] = i + 1;
      indices[o++] = i + 1;
      indices[o++] = i + field.w;
      indices[o++] = i + field.w + 1;
    }
  }
  return { vertices, indices };
}
