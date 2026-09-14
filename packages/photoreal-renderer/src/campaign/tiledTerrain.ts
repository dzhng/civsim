import * as THREE from "three/webgpu";
import { createGroundMesh } from "../battle/terrainLayer";
import type { LandscapeFrameUniforms } from "../landscape/shaderNodes";
import {
  createRenderedSurface,
  createSurfaceView,
  type RenderedSurface,
} from "../../../game-renderer/src/terrain/surface";
import {
  detailBoundary,
  maskCoarseSurface,
  morphTileSurface,
} from "../../../game-renderer/src/terrain/surfaceTiles";
import type { TerrainTile } from "./terrainTiles";

export type TerrainTileSurface = Pick<TerrainTile, "request" | "domain" | "mesh">;

type Entry = { source: RenderedSurface; ground: THREE.Mesh };

/** One presented terrain revision owns both GPU coverage and CPU queries.
 * Scheduler admission happens before render; neighbor edge updates join that swap. */
export class PhotorealTiledTerrain {
  private readonly entries = new Map<string, Entry>();
  private readonly coarseGround: THREE.Mesh;
  private revision = 0;
  private uploadedBytes = 0;
  private admissionCpuMs = 0;
  surface: ReturnType<typeof createSurfaceView>;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: LandscapeFrameUniforms,
    private readonly coarse: RenderedSurface,
    private readonly decorate?: (ground: THREE.Mesh, surface: RenderedSurface) => void,
  ) {
    this.coarseGround = this.ground(coarse);
    scene.add(this.coarseGround);
    this.surface = createSurfaceView(coarse);
  }

  private ground(surface: RenderedSurface) {
    const ground = createGroundMesh(this.frame, surface.mesh, { detailScale: 2 });
    ground.castShadow = true;
    this.decorate?.(ground, surface);
    return ground;
  }

  install(tile: TerrainTileSurface, evictedKeys: readonly string[]) {
    const started = performance.now();
    const revision = this.revision + 1;
    const sources = new Map(
      [...this.entries]
        .filter(([key]) => !evictedKeys.includes(key))
        .map(([key, entry]) => [key, entry.source]),
    );
    sources.set(
      tile.request.key,
      createRenderedSurface(tile.mesh, tile.domain, `${tile.request.key}:${revision}`),
    );
    const domains = [...sources.values()].map((s) => s.domain);
    const boundary = detailBoundary(domains);
    const masked = maskCoarseSurface(this.coarse, domains);
    const coarse = createRenderedSurface(masked.mesh, this.coarse.domain, `coarse:${revision}`);
    const presented = new Map(
      [...sources].map(([key, source]) => [
        key,
        createRenderedSurface(
          morphTileSurface(source, this.coarse, boundary),
          source.domain,
          `${key}:${revision}`,
        ),
      ]),
    );
    // Allocate the new resource before changing any visible geometry. The rest
    // of this synchronous admission only replaces owned arrays and references.
    const added = this.ground(presented.get(tile.request.key)!);
    this.uploadedBytes = geometryBytes(added.geometry);
    for (const key of evictedKeys) {
      const entry = this.entries.get(key);
      if (entry) disposeGround(entry.ground);
      this.entries.delete(key);
    }
    updateIndices(this.coarseGround.geometry, coarse.mesh.indices);
    this.uploadedBytes += coarse.mesh.indices.byteLength;
    for (const [key, surface] of presented) {
      const previous = this.entries.get(key);
      if (previous) {
        this.uploadedBytes += updateGround(previous.ground.geometry, surface);
      } else {
        this.scene.add(added);
        this.entries.set(key, { source: sources.get(key)!, ground: added });
      }
    }
    this.surface = createSurfaceView(coarse, [...presented.values()]);
    this.revision = revision;
    this.admissionCpuMs = performance.now() - started;
  }

  stats() {
    return {
      revision: this.revision,
      residentTiles: this.entries.size,
      geometryBytes:
        geometryBytes(this.coarseGround.geometry) +
        [...this.entries.values()].reduce((sum, e) => sum + geometryBytes(e.ground.geometry), 0),
      lastAdmissionUploadBytes: this.uploadedBytes,
      lastAdmissionCpuMs: this.admissionCpuMs,
    };
  }

  dispose() {
    for (const entry of this.entries.values()) disposeGround(entry.ground);
    this.entries.clear();
    disposeGround(this.coarseGround);
  }
}

function disposeGround(ground: THREE.Mesh) {
  ground.removeFromParent();
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
}

function geometryBytes(geometry: THREE.BufferGeometry) {
  const arrays = new Set<ArrayBufferLike>();
  for (const attribute of Object.values(geometry.attributes)) {
    const a = attribute as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    arrays.add(
      a instanceof THREE.InterleavedBufferAttribute ? a.data.array.buffer : a.array.buffer,
    );
  }
  if (geometry.index) arrays.add(geometry.index.array.buffer);
  return [...arrays].reduce((sum, array) => sum + array.byteLength, 0);
}

function updateIndices(geometry: THREE.BufferGeometry, indices: Uint32Array) {
  const attribute = geometry.index!;
  // createGroundMesh reverses source winding for Three's front-face convention.
  for (let i = 0; i < indices.length; i += 3) {
    attribute.array[i] = indices[i];
    attribute.array[i + 1] = indices[i + 2];
    attribute.array[i + 2] = indices[i + 1];
  }
  attribute.needsUpdate = true;
}

function updateGround(geometry: THREE.BufferGeometry, surface: RenderedSurface) {
  const positions = geometry.getAttribute("position") as THREE.InterleavedBufferAttribute;
  let bytes = updateArray(positions.data, surface.mesh.vertices);
  bytes += updateArray(
    geometry.getAttribute("gSurfaceColor") as THREE.BufferAttribute,
    surface.mesh.surfaceColor,
  );
  bytes += updateArray(geometry.getAttribute("gTint") as THREE.BufferAttribute, surface.mesh.tint);
  return bytes;
}

/** One upload span per changed buffer bounds queue submission overhead. Sending
 * unchanged values between changed edges is cheaper than thousands of tiny writes. */
function updateArray(
  attribute: THREE.BufferAttribute | THREE.InterleavedBuffer,
  next: Float32Array,
) {
  const previous = attribute.array;
  let first = 0,
    last = next.length - 1;
  while (first < next.length && previous[first] === next[first]) first++;
  if (first === next.length) return 0;
  while (previous[last] === next[last]) last--;
  attribute.addUpdateRange(first, last - first + 1);
  attribute.array = next;
  attribute.needsUpdate = true;
  return (last - first + 1) * 4;
}
