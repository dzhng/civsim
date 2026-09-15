import * as THREE from "three/webgpu";
import { createLandscapeGroundMesh } from "../landscape/terrainMaterial";
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

type Entry = { source: RenderedSurface; presented: RenderedSurface; ground: THREE.Mesh };

/** One ceiling for generation, residency, frame swaps and upload staging. */
export class TerrainAllocationBudget {
  peakBytes = 0;

  reserve(bytes: number) {
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > 128 * 1024 * 1024)
      throw new Error(`Terrain allocation of ${bytes} bytes exceeds total 128 MiB budget`);
    this.peakBytes = Math.max(this.peakBytes, bytes);
  }
}

/** Owns the shared material until disposal; tile eviction releases geometry only.
 * One presented terrain revision owns both GPU coverage and CPU queries.
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
    private readonly material: THREE.Material,
    private readonly coarse: RenderedSurface,
    private readonly decorateGeometry?: (
      geometry: THREE.BufferGeometry,
      surface: RenderedSurface,
    ) => void,
    private readonly budget = new TerrainAllocationBudget(),
    private readonly decorationBytesPerVertex = 0,
  ) {
    if (!Number.isFinite(decorationBytesPerVertex) || decorationBytesPerVertex < 0)
      throw new Error("Terrain decoration needs a finite nonnegative vertex stride");
    const buffers = new Set<ArrayBufferLike>();
    addMeshBuffers(buffers, coarse.mesh);
    const decorationBytes = (coarse.mesh.vertices.length / 10) * decorationBytesPerVertex;
    const geometry =
      mutableBytes(coarse.mesh) +
      (coarse.mesh.shoreDistance?.byteLength ?? 0) +
      coarse.mesh.indices.byteLength +
      decorationBytes;
    // Initial geometry also owns reversed indices, GPU storage and upload staging.
    budget.reserve(
      bufferBytes(buffers) + coarse.mesh.indices.byteLength + decorationBytes + geometry * 2,
    );
    this.coarseGround = this.ground(coarse);
    scene.add(this.coarseGround);
    this.surface = createSurfaceView(coarse);
  }

  private ground(surface: RenderedSurface) {
    const ground = createLandscapeGroundMesh(surface.mesh, this.material);
    ground.castShadow = true;
    this.decorateGeometry?.(ground.geometry, surface);
    return ground;
  }

  install(tile: TerrainTileSurface, evictedKeys: readonly string[]) {
    const started = performance.now();
    // Retain the current revision through the swap, but do not duplicate its
    // immutable coarse vertices or GPU buffers. Reserve every new CPU array,
    // the added tile's GPU buffers, and one full upload staging copy.
    const current = this.resources();
    const incoming = new Set(current.cpu);
    addMeshBuffers(incoming, tile.mesh);
    const incomingBytes = bufferBytes(incoming) - bufferBytes(current.cpu);
    const remaining = [...this.entries].filter(([key]) => !evictedKeys.includes(key));
    const changedDomains = [
      tile.domain,
      ...evictedKeys.map((key) => this.entries.get(key)!.source.domain),
    ];
    const affected = new Set(
      remaining
        .filter(([, entry]) =>
          changedDomains.some((domain) =>
            withinMorphBand(entry.source.domain, domain, this.coarse.domain.cell * 2),
          ),
        )
        .map(([key]) => key),
    );
    const updatedBytes = remaining.reduce(
      (sum, [key, entry]) => sum + (affected.has(key) ? mutableBytes(entry.source.mesh) : 0),
      0,
    );
    const morphBytes = mutableBytes(tile.mesh) + updatedBytes;
    const decorationBytes = (tile.mesh.vertices.length / 10) * this.decorationBytesPerVertex;
    const addedGpuBytes =
      mutableBytes(tile.mesh) +
      (tile.mesh.shoreDistance?.byteLength ?? 0) +
      tile.mesh.indices.byteLength +
      decorationBytes;
    const coarseIndexBytes = this.coarse.mesh.indices.byteLength;
    const stagingBytes = coarseIndexBytes + addedGpuBytes + updatedBytes;
    const admissionBound =
      bufferBytes(current.cpu) +
      current.gpuBytes +
      incomingBytes +
      coarseIndexBytes +
      morphBytes +
      tile.mesh.indices.byteLength +
      decorationBytes +
      addedGpuBytes +
      stagingBytes;
    this.budget.reserve(admissionBound);
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
        key !== tile.request.key && !affected.has(key)
          ? this.entries.get(key)!.presented
          : createRenderedSurface(
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
        if (surface !== previous.presented) {
          this.uploadedBytes += updateGround(previous.ground.geometry, surface);
          previous.presented = surface;
        }
      } else {
        this.scene.add(added);
        this.entries.set(key, {
          source: sources.get(key)!,
          presented: surface,
          ground: added,
        });
      }
    }
    this.surface = createSurfaceView(coarse, [...presented.values()]);
    this.revision = revision;
    this.admissionCpuMs = performance.now() - started;
    // Consumers re-seat only regions whose presented triangles may have changed.
    return [
      ...changedDomains,
      ...remaining.filter(([key]) => affected.has(key)).map(([, entry]) => entry.source.domain),
    ];
  }

  private resources() {
    const cpu = new Set<ArrayBufferLike>();
    const addMesh = (mesh: RenderedSurface["mesh"]) => addMeshBuffers(cpu, mesh);
    addMesh(this.coarse.mesh);
    for (const entry of this.entries.values()) {
      addMesh(entry.source.mesh);
    }
    addMesh(this.surface.coarse.mesh);
    for (const surface of this.surface.details) addMesh(surface.mesh);
    // Unchanged geometry may retain an older array than the current query view.
    let gpuBytes = 0;
    for (const ground of [this.coarseGround, ...[...this.entries.values()].map((e) => e.ground)]) {
      for (const buffer of geometryBuffers(ground.geometry)) cpu.add(buffer);
      gpuBytes += geometryBytes(ground.geometry);
    }
    return { cpu, gpuBytes };
  }

  stats() {
    const { cpu, gpuBytes } = this.resources();
    const cpuBytes = bufferBytes(cpu);
    const allocationBytes = cpuBytes + gpuBytes;
    return {
      allocationBytes,
      cpuBytes,
      gpuBytes,
      peakAllocationBytes: Math.max(allocationBytes, this.budget.peakBytes),
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
    this.material.dispose();
  }
}

function disposeGround(ground: THREE.Mesh) {
  ground.removeFromParent();
  ground.geometry.dispose();
}

function geometryBuffers(geometry: THREE.BufferGeometry) {
  const arrays = new Set<ArrayBufferLike>();
  for (const attribute of Object.values(geometry.attributes)) {
    const a = attribute as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    arrays.add(
      a instanceof THREE.InterleavedBufferAttribute ? a.data.array.buffer : a.array.buffer,
    );
  }
  if (geometry.index) arrays.add(geometry.index.array.buffer);
  return arrays;
}

function updateIndices(geometry: THREE.BufferGeometry, indices: Uint32Array) {
  const attribute = geometry.index!;
  // createLandscapeGroundMesh reverses source winding for Three's front-face convention.
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
  if (surface.mesh.surfaceColor)
    bytes += updateArray(
      geometry.getAttribute("gSurfaceColor") as THREE.BufferAttribute,
      surface.mesh.surfaceColor,
    );
  if (surface.mesh.tint)
    bytes += updateArray(
      geometry.getAttribute("gTint") as THREE.BufferAttribute,
      surface.mesh.tint,
    );
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

function geometryBytes(geometry: THREE.BufferGeometry) {
  return [...geometryBuffers(geometry)].reduce((sum, array) => sum + array.byteLength, 0);
}
/** Arrays copied by morphTileSurface; topology and wet coverage stay shared. */
function mutableBytes(mesh: RenderedSurface["mesh"]) {
  return (
    mesh.vertices.byteLength + (mesh.surfaceColor?.byteLength ?? 0) + (mesh.tint?.byteLength ?? 0)
  );
}

function addMeshBuffers(buffers: Set<ArrayBufferLike>, mesh: RenderedSurface["mesh"]) {
  for (const array of [
    mesh.vertices,
    mesh.surfaceColor,
    mesh.tint,
    mesh.indices,
    mesh.cellTriangles,
    mesh.waterCoverage,
    mesh.shoreDistance,
  ])
    if (array) buffers.add(array.buffer);
}

function bufferBytes(buffers: Set<ArrayBufferLike>) {
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

/** Only added/removed tile edges can change the surrounding morph band. */
function withinMorphBand(a: RenderedSurface["domain"], b: RenderedSurface["domain"], band: number) {
  return (
    a.ox <= b.ox + (b.columns - 1) * b.cell + band &&
    a.oy <= b.oy + (b.rows - 1) * b.cell + band &&
    a.ox + (a.columns - 1) * a.cell >= b.ox - band &&
    a.oy + (a.rows - 1) * a.cell >= b.oy - band
  );
}
