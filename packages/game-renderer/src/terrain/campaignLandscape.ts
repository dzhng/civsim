import type { CampaignTerrainField } from "../campaign/entityFrame";
import type { CampaignSceneryInstance } from "../campaign/sceneryPass";
import type { PhotorealBattleGroundMesh } from "../battle/groundPass";
import { hash2, smoothstep } from "../../../renderer-core/src/math";

/** Bounded regional spike: the campaign owns geography; this samples continuous
 * relief into the same surface data consumed by the battle material. Kilometres
 * remain kilometres throughout geometry, camera, and scenery placement. */
export function buildCampaignLandscape(
  source: CampaignTerrainField,
  center: [number, number],
  radius = 360,
  cell = 2,
) {
  const size = Math.ceil((radius * 2) / cell) + 1;
  const ox = center[0] - radius;
  const oy = center[1] - radius;
  const count = size * size;
  const heights = new Float32Array(count);
  const water = new Float32Array(count);
  const land = new Uint8Array(count);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++)
      land[j * size + i] = source.renderLandAt(ox + i * cell, oy + j * cell) ? 1 : 0;
  const inland = distanceTo(land, size, 0, cell);
  const offshore = distanceTo(land, size, 1, cell);
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
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i,
        x = ox + i * cell,
        y = oy + j * cell;
      const wet = 1 - land[k];
      water[k] = wet * (0.15 + 0.85 * smoothstep(0, 18, offshore[k]));
      const envelope = Math.max(0, sample(source.height, 1, 0, x, y) - 2.2);
      const wx = x + (noise(x / 75, y / 75) - 0.5) * 30;
      const wy = y + (noise(x / 75 + 13, y / 75 + 7) - 0.5) * 30;
      // Domain-warped ridges preserve a shared range envelope. Fine branches
      // fade at the foot; there are no independent mountain-mesh footprints.
      const ridge = (scale: number) => 1 - Math.abs(2 * noise(wx / scale, wy / scale) - 1);
      const folds = 0.24 + 0.52 * ridge(60) ** 2 + 0.18 * ridge(28) ** 2 + 0.06 * ridge(13);
      const foothill = 0.5 + noise(x / 18, y / 18) * 1.1;
      heights[k] = (foothill + envelope * 2.5 * folds) * (1 - wet) * smoothstep(0, 6, inland[k]);
    }
  }
  const heightAt = (x: number, y: number) => {
    const gx = Math.max(0, Math.min(size - 1.00001, (x - ox) / cell));
    const gy = Math.max(0, Math.min(size - 1.00001, (y - oy) / cell));
    const i = Math.floor(gx),
      j = Math.floor(gy),
      fx = gx - i,
      fy = gy - j;
    const a = heights[j * size + i],
      b = heights[j * size + i + 1];
    const c = heights[(j + 1) * size + i],
      d = heights[(j + 1) * size + i + 1];
    return fx + fy <= 1
      ? a + (b - a) * fx + (c - a) * fy
      : d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
  };
  const vertices = new Float32Array(count * 10);
  const surfaceColor = new Float32Array(count * 3);
  const tint = new Float32Array(count);
  const indices = new Uint32Array((size - 1) ** 2 * 6);
  const scenery: CampaignSceneryInstance[] = [];
  let at = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i,
        x = ox + i * cell,
        y = oy + j * cell;
      const dx = (heightAt(x + cell, y) - heightAt(x - cell, y)) / (2 * cell);
      const dy = (heightAt(x, y + cell) - heightAt(x, y - cell)) / (2 * cell);
      const length = Math.hypot(dx, dy, 1);
      const moisture = sample(source.biome, 4, 0, x, y) / 255;
      const meadow = noise(x / 24 + 5, y / 24 - 11);
      const green = smoothstep(0.15, 0.65, moisture) * (0.45 + 0.55 * meadow);
      const sand = 1 - smoothstep(0, 8, inland[k]);
      const color = [mix(0.65, 0.46, green), mix(0.61, 0.55, green), mix(0.3, 0.23, green)];
      for (let c = 0; c < 3; c++) color[c] = mix(color[c], [0.72, 0.65, 0.45][c], sand);
      vertices.set(
        [x, y, heights[k], -dx / length, -dy / length, 1 / length, ...color, water[k]],
        k * 10,
      );
      surfaceColor.set(color, k * 3);
      if (i < size - 1 && j < size - 1) {
        indices.set([k, k + size, k + 1, k + 1, k + size, k + size + 1], at);
        at += 6;
      }
      const forest = sample(source.biome, 4, 1, x, y) / 255;
      const groves = smoothstep(0.38, 0.7, noise(x / 29 + 8, y / 29 + 3));
      const suitable =
        (0.012 + forest * 0.055) * groves * (1 - smoothstep(0.25, 0.75, Math.hypot(dx, dy)));
      if (water[k] < 0.01 && sand < 0.4 && hash2(i * 7, j * 13) < suitable) {
        const tx = x + (hash2(i + 3, j) - 0.5) * cell;
        const ty = y + (hash2(i, j + 5) - 0.5) * cell;
        if (!source.renderLandAt(tx, ty, 1)) continue;
        scenery.push({
          x: tx,
          y: ty,
          z: heightAt(tx, ty),
          kind: "broadleaf",
          size: 7 + hash2(i, j) * 3,
          height: 5 + hash2(j, i) * 2.5,
          yaw: hash2(i + 1, j) * Math.PI * 2,
          shade: 0.5,
        });
      }
    }
  }
  const mesh: Omit<PhotorealBattleGroundMesh, "earthDistance"> = {
    vertices,
    surfaceColor,
    tint,
    indices,
    triangles: indices.length / 3,
  };
  return { mesh, scenery, heightAt, size, cell };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function noise(x: number, y: number): number {
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

function distanceTo(mask: Uint8Array, size: number, target: number, cell: number): Float32Array {
  const distance = Float32Array.from(mask, (value) => (value === target ? 0 : size * cell));
  for (const direction of [1, -1]) {
    for (let row = 0; row < size; row++) {
      const y = direction === 1 ? row : size - 1 - row;
      for (let col = 0; col < size; col++) {
        const x = direction === 1 ? col : size - 1 - col;
        const k = y * size + x;
        for (const [dx, dy] of [
          [-direction, 0],
          [0, -direction],
          [-direction, -direction],
          [direction, -direction],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size)
            distance[k] = Math.min(
              distance[k],
              distance[ny * size + nx] + cell * Math.hypot(dx, dy),
            );
        }
      }
    }
  }
  return distance;
}
