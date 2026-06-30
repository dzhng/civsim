import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GRASS_TUFT_BLADES,
  GRASS_TUFT_SEGMENTS,
  buildGrassTuftMesh,
  grassTuftStats,
} from '../../packages/game-renderer/src/models/shared/grassModels.ts';
import type { MeshData } from '../../packages/game-renderer/src/models/shared/meshBuilder.ts';

test('grass tuft mesh is deterministic for identical inputs', () => {
  const a = buildGrassTuftMesh({ seed: 0xabc, blades: 11, palette: 'green-grass' });
  const b = buildGrassTuftMesh({ seed: 0xabc, blades: 11, palette: 'green-grass' });

  assert.deepEqual(Array.from(a.opaque.vertices), Array.from(b.opaque.vertices));
  assert.deepEqual(Array.from(a.opaque.indices), Array.from(b.opaque.indices));
  assert.deepEqual(Array.from(a.shadow.vertices), Array.from(b.shadow.vertices));
});

test('grass tuft blade count maps to stable double-sided panel geometry', () => {
  const blades = 13;
  const mesh = buildGrassTuftMesh({ seed: 99, blades });
  const stats = grassTuftStats(mesh, blades);

  assert.equal(stats.blades, blades);
  assert.equal(stats.segments, GRASS_TUFT_SEGMENTS);
  assert.equal(stats.opaqueVertices, blades * GRASS_TUFT_SEGMENTS * 8);
  assert.equal(stats.opaqueTriangles, blades * GRASS_TUFT_SEGMENTS * 4);
  assert.equal(mesh.opaque.indexCount, blades * GRASS_TUFT_SEGMENTS * 12);
  assert.equal(stats.shadowVertices, 0);
});

test('grass tuft defaults are intentionally small enough for instancing', () => {
  const mesh = buildGrassTuftMesh();
  const stats = grassTuftStats(mesh);

  assert.equal(stats.blades, DEFAULT_GRASS_TUFT_BLADES);
  assert.ok(stats.opaqueVertices < 200, JSON.stringify(stats));
  assert.ok(mesh.opaque.indexCount < 300, JSON.stringify(stats));
});

test('grass tuft geometry is finite and stays inside its authored blade envelope', () => {
  const height = 0.82;
  const bend = 0.31;
  const spread = 0.20;
  const width = 0.065;
  const mesh = buildGrassTuftMesh({ seed: 1234, blades: 21, height, bend, spread, width });
  const bounds = meshBounds(mesh);

  assert.ok(bounds.every(Number.isFinite), JSON.stringify(bounds));
  assert.ok(bounds[4] >= 0, JSON.stringify(bounds));
  assert.ok(bounds[5] <= height * 1.13, JSON.stringify(bounds));
  const xyRadius = Math.max(Math.abs(bounds[0]), Math.abs(bounds[1]), Math.abs(bounds[2]), Math.abs(bounds[3]));
  assert.ok(xyRadius <= spread + height * bend * 1.05 + width, JSON.stringify({ bounds, xyRadius }));
});

test('grass tuft palette carries neutral blade variation without invalid colors', () => {
  const mesh = buildGrassTuftMesh({ seed: 77, blades: 17, palette: 'yellow-grass' });
  const colors = colorRange(mesh);

  assert.ok(colors.min >= 0 && colors.max <= 1, JSON.stringify(colors));
  assert.ok(colors.distinctReds > 4, JSON.stringify(colors));
  assert.ok(colors.distinctGreens > 4, JSON.stringify(colors));
});

function meshBounds(mesh: MeshData): [number, number, number, number, number, number] {
  const v = mesh.opaque.vertices;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < v.length; i += 10) {
    minX = Math.min(minX, v[i]);
    maxX = Math.max(maxX, v[i]);
    minY = Math.min(minY, v[i + 1]);
    maxY = Math.max(maxY, v[i + 1]);
    minZ = Math.min(minZ, v[i + 2]);
    maxZ = Math.max(maxZ, v[i + 2]);
  }
  return [minX, maxX, minY, maxY, minZ, maxZ];
}

function colorRange(mesh: MeshData) {
  const v = mesh.opaque.vertices;
  let min = Infinity;
  let max = -Infinity;
  const reds = new Set<number>();
  const greens = new Set<number>();
  for (let i = 0; i < v.length; i += 10) {
    for (let c = 6; c <= 8; c++) {
      min = Math.min(min, v[i + c]);
      max = Math.max(max, v[i + c]);
    }
    reds.add(Math.round(v[i + 6] * 255));
    greens.add(Math.round(v[i + 7] * 255));
  }
  return { min, max, distinctReds: reds.size, distinctGreens: greens.size };
}
