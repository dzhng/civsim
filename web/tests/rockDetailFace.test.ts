// @vitest-environment node
// The two things the adopted rock face can be held to from the CPU: what the
// checked-in asset's raw heights measure, and that one world-owned texture
// reaches every terrain consumer's shading graph. Neither is evidence about the
// rendered face — only a GPU capture settles that.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { PNG } from "pngjs";
import {
  createGroundMesh,
  createVistaMesh,
} from "@packages/photoreal-renderer/src/landscape/terrainLayer";
import { createLandscapeGroundMaterial } from "@packages/photoreal-renderer/src/landscape/terrainMaterial";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import {
  CAMPAIGN_TERRAIN_PROFILE,
  TERRAIN_MATERIAL,
} from "@packages/game-renderer/src/terrain/materialProfile";

const ASSET = fileURLToPath(
  new URL("../../packages/game-renderer/assets/rock-detail-height.png", import.meta.url),
);

/** The grade the bake aims at. The response reads the sampled height as a 0..1
 *  weight centred on 0.5 — it mixes the rock palette across it, offsets dry
 *  roughness by it — so a tile that drifts
 *  off this centre or spread lands those mixes outside their authored range. */
const HEIGHT_MEAN = 0.5;
const HEIGHT_SD = 0.14;
/** Height thresholds invert the shared dark-crevice band. */
const FRACTURE_BAND = [
  1 - TERRAIN_MATERIAL.rock.fractureBand[1],
  1 - TERRAIN_MATERIAL.rock.fractureBand[0],
] as const;

async function tile() {
  const png = PNG.sync.read(await readFile(ASSET));
  const values = new Float64Array(png.width * png.height);
  for (let i = 0; i < values.length; i++) values[i] = png.data[i * 4] / 255;
  return { width: png.width, rows: png.height, values };
}

test("the rock detail asset's raw heights hold the grade the shared response reads", async () => {
  const { width, rows, values: v } = await tile();
  // The triplanar fetch scales both axes by one frequency, so the tile has to
  // be square or the face features stretch along one projection.
  expect(width).toBe(rows);

  // Raw 8-bit level-0 statistics, approximately. These constrain where the
  // downstream mixes sit in their range. They do NOT establish normal strength
  // (a gradient, not a moment), filtering or mip behaviour, or appearance.
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  expect(mean).toBeCloseTo(HEIGHT_MEAN, 2);
  expect(sd).toBeCloseTo(HEIGHT_SD, 2);

  // Crevice coverage at full detail visibility: the mean fracture weight the
  // rock palette mix receives before slope and strength scale it. A re-bake
  // that flattened the tile or drove it dark would read as no crevices or an
  // all-crevice face; this pins it to a minority of the surface instead.
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const fracture =
    v.reduce((s, x) => s + (1 - smoothstep(FRACTURE_BAND[0], FRACTURE_BAND[1], x)), 0) / v.length;
  expect(fracture).toBeGreaterThan(0.15);
  expect(fracture).toBeLessThan(0.4);

  // The map tiles under RepeatWrapping, so the wrap-around neighbour step —
  // averaged over the boundary row and column — has to stay near an interior
  // step, or every tile edge draws a grid line across the mountain. This is
  // average continuity of the stored level-0 texels; seam behaviour under
  // filtering and at each mip is a GPU question.
  const step = (a: (i: number) => number, b: (i: number) => number) => {
    let sum = 0;
    for (let i = 0; i < width; i++) sum += Math.abs(a(i) - b(i));
    return sum / width;
  };
  const row = (y: number) => (x: number) => v[y * width + x];
  const col = (x: number) => (y: number) => v[y * width + x];
  expect(step(row(0), row(rows - 1))).toBeLessThan(step(row(0), row(1)) * 1.25);
  expect(step(col(0), col(width - 1))).toBeLessThan(step(col(0), col(1)) * 1.25);
});

/** Whether a material's shading graph reads `map` itself — the caller's
 *  instance, not a copy of it. */
function readsTexture(material: THREE.MeshStandardNodeMaterial, map: THREE.Texture) {
  const seen = new Set<object>();
  let found = false;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const candidate = node as { isTextureNode?: boolean; value?: unknown; getChildren?: unknown };
    if (candidate.isTextureNode && candidate.value === map) found = true;
    if (typeof candidate.getChildren === "function")
      for (const child of (candidate.getChildren as () => Iterable<unknown>)()) walk(child);
  };
  for (const node of [material.colorNode, material.normalNode, material.roughnessNode]) walk(node);
  return found;
}

test("one provisioned rock map reaches campaign, battle ground and battle vista graphs", () => {
  const map = new THREE.Texture();
  const detailScale = CAMPAIGN_TERRAIN_PROFILE.detailScale;
  const flatQuad = {
    vertices: new Float32Array([
      -1, -1, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, 1, -1, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, -1, 1, 0, 0, 0, 1,
      0.5, 0.5, 0.5, 0, 1, 1, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0,
    ]),
    tint: new Float32Array(4),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    triangles: 2,
  };
  // Every consumer is built at the same detail scale, the one profile input the
  // rock response reads, so the three differ only by which constructor made them.
  const campaign = createLandscapeGroundMaterial(
    createLandscapeFrameUniforms(),
    CAMPAIGN_TERRAIN_PROFILE,
    { rockDetailMap: map },
  );
  const ground = createGroundMesh(createLandscapeFrameUniforms(), flatQuad, {
    detailScale,
    rockDetailMap: map,
  });
  const vista = createVistaMesh(
    createLandscapeFrameUniforms(),
    {
      name: "vista",
      w: 9,
      h: 9,
      cell: 8,
      ox: -32,
      oy: -32,
      innerHalfW: 16,
      innerHalfH: 16,
      outerHalfW: 32,
      outerHalfH: 32,
      height: new Float32Array(81).fill(120),
      shoreDistance: new Float32Array(81).fill(-1000),
    },
    "green-grass",
    { detailScale, rockDetailMap: map },
  );
  expect(vista, "the band must produce geometry for this to mean anything").not.toBeNull();

  // Wiring evidence only: the provisioned texture instance reaches all three
  // built graphs. Walking TSL nodes cannot show compiled fetch counts, that no
  // other field coexists with this one, or who owns and disposes the texture.
  // Whether the consumers render the same face is a GPU A/B.
  expect(readsTexture(campaign, map)).toBe(true);
  expect(readsTexture(ground.material as THREE.MeshStandardNodeMaterial, map)).toBe(true);
  expect(readsTexture(vista!.material as THREE.MeshStandardNodeMaterial, map)).toBe(true);
});
