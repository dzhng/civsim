import type { LandscapeMesh, SurfaceDomain } from "../../../game-renderer/src/terrain/surface";

/** Keys identify immutable world regions and sampling levels for this scheduler's lifetime. */
export interface TerrainTileRequest {
  key: string;
  minX: number;
  minY: number;
  size: number;
  cell: number;
}

export interface TerrainTileData {
  mesh: LandscapeMesh;
  domain: SurfaceDomain;
  shoreDistance: Float32Array;
}

export interface TerrainTile extends TerrainTileData {
  request: TerrainTileRequest;
  /** Typed-array backing storage only; excludes JS objects and GPU allocations. */
  payloadBytes: number;
}

export function terrainTilePayloadBytes(data: TerrainTileData): number {
  const buffers = new Set([
    data.mesh.vertices.buffer,
    data.mesh.surfaceColor.buffer,
    data.mesh.tint.buffer,
    data.mesh.indices.buffer,
    data.shoreDistance.buffer,
  ]);
  if (data.mesh.cellTriangles) buffers.add(data.mesh.cellTriangles.buffer);
  if (data.mesh.waterCoverage) buffers.add(data.mesh.waterCoverage.buffer);
  return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}

/** Async CPU work never mutates the rendered world. tick() owns atomic admission. */
export function createTerrainTiles(options: {
  build: (request: TerrainTileRequest) => Promise<TerrainTileData>;
  /** Must synchronously install all new geometry/anchors and evictions, or throw before mutation. */
  install: (tile: TerrainTile, evictedKeys: readonly string[]) => void;
  maxTiles?: number;
  maxPayloadBytes?: number;
}) {
  const maxTiles = options.maxTiles ?? 64;
  const maxBytes = options.maxPayloadBytes ?? 32 * 1024 * 1024;
  if (
    !Number.isInteger(maxTiles) ||
    maxTiles < 1 ||
    maxTiles > 64 ||
    !Number.isFinite(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > 128 * 1024 * 1024
  )
    throw new Error("Terrain tile limits must fit the feature budget");
  const resident = new Map<string, TerrainTile>();
  const failures = new Map<string, unknown>();
  const budgetBlocked = new Set<string>();
  let desired: TerrainTileRequest[] = [];
  let inFlight: TerrainTileRequest | null = null;
  let ready: TerrainTile | null = null;
  let disposed = false;
  let peakPayloadBytes = 0;

  function setDesired(requests: readonly TerrainTileRequest[]) {
    if (disposed) return;
    // Excess visible requests keep the coarse surface; never cycle an oversized working set.
    const next = [...new Map(requests.map((r) => [r.key, { ...r }])).values()].slice(0, maxTiles);
    const previous = new Set(desired.map((r) => r.key));
    if (next.length !== desired.length || next.some((r) => !previous.has(r.key)))
      budgetBlocked.clear();
    desired = next;
    for (const request of desired) {
      const tile = resident.get(request.key);
      if (tile) {
        resident.delete(request.key);
        resident.set(request.key, tile);
      }
    }
  }

  function tick() {
    if (disposed) return;
    if (ready) {
      const tile = ready;
      ready = null;
      if (desired.some((r) => r.key === tile.request.key)) {
        let bytes = [...resident.values()].reduce((n, r) => n + r.payloadBytes, 0);
        const evicted: string[] = [];
        const wanted = new Set(desired.map((r) => r.key));
        // Only replace tiles outside the requested working set. Oversize working sets
        // retain coarse coverage rather than alternating the same visible tiles forever.
        for (const [key, cached] of resident) {
          if (resident.size - evicted.length < maxTiles && bytes + tile.payloadBytes <= maxBytes)
            break;
          if (!wanted.has(key)) {
            evicted.push(key);
            bytes -= cached.payloadBytes;
          }
        }
        if (resident.size - evicted.length >= maxTiles || bytes + tile.payloadBytes > maxBytes) {
          budgetBlocked.add(tile.request.key);
        } else {
          try {
            options.install(tile, evicted);
            for (const key of evicted) resident.delete(key);
            resident.set(tile.request.key, tile);
          } catch (error) {
            failures.set(tile.request.key, error);
          }
        }
      }
    }
    if (inFlight) return;
    const request = desired.find(
      (r) => !resident.has(r.key) && !failures.has(r.key) && !budgetBlocked.has(r.key),
    );
    if (!request) return;
    inFlight = request;
    // Promise wrapping also isolates a synchronously throwing builder.
    Promise.resolve()
      .then(() => options.build(request))
      .then(
        (data) => {
          if (disposed) return;
          const payloadBytes = terrainTilePayloadBytes(data);
          peakPayloadBytes = Math.max(
            peakPayloadBytes,
            payloadBytes + [...resident.values()].reduce((n, r) => n + r.payloadBytes, 0),
          );
          if (desired.some((r) => r.key === request.key)) {
            if (payloadBytes > maxBytes) {
              failures.set(request.key, new Error("Terrain tile exceeds payload budget"));
            } else {
              ready = { ...data, request, payloadBytes };
            }
          }
        },
        (error: unknown) => {
          if (!disposed) failures.set(request.key, error);
        },
      )
      .finally(() => {
        inFlight = null;
      });
  }

  return {
    setDesired,
    tick,
    snapshot: () => ({
      residentKeys: [...resident.keys()],
      residentPayloadBytes: [...resident.values()].reduce((n, r) => n + r.payloadBytes, 0),
      pendingKey: inFlight?.key ?? ready?.request.key ?? null,
      pendingPayloadBytes: ready?.payloadBytes ?? 0,
      peakPayloadBytes,
      budgetBlockedKeys: [...budgetBlocked],
      failed: [...failures].map(([key, error]) => ({
        key,
        error: error instanceof Error ? error.message : String(error),
      })),
    }),
    /** The world owns disposal of its installed GPU resources. Late CPU replies are ignored. */
    dispose() {
      disposed = true;
      desired = [];
      ready = null;
      resident.clear();
      failures.clear();
      budgetBlocked.clear();
    },
  };
}
