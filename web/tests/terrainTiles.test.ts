import { describe, expect, it, vi } from "vitest";
import {
  createTerrainTiles,
  terrainTilePayloadBytes,
  type TerrainTileData,
  type TerrainTileRequest,
} from "../../packages/photoreal-renderer/src/campaign/terrainTiles";

const request = (key: string): TerrainTileRequest => ({ key, minX: 0, minY: 0, size: 2, cell: 1 });
function data(): TerrainTileData {
  return {
    mesh: {
      vertices: new Float32Array(90),
      surfaceColor: new Float32Array(36),
      tint: new Float32Array(9),
      indices: new Uint32Array(24),
      triangles: 8,
    },
    domain: { ox: 0, oy: 0, columns: 3, rows: 3, cell: 1, units: "kilometers" },
    shoreDistance: new Float32Array(9),
  };
}
const settle = async () => {
  for (let n = 0; n < 6; n++) await Promise.resolve();
};

function delayed(maxTiles = 2, maxPayloadBytes?: number) {
  const replies = new Map<
    string,
    { resolve: (value: TerrainTileData) => void; reject: (error: Error) => void }
  >();
  const build = vi.fn(
    (r: TerrainTileRequest) =>
      new Promise<TerrainTileData>((resolve, reject) => replies.set(r.key, { resolve, reject })),
  );
  const install = vi.fn();
  const tiles = createTerrainTiles({ build, install, maxTiles, maxPayloadBytes });
  return { tiles, build, install, replies };
}

describe("bounded terrain scheduling", () => {
  it("retains useful work during pan, installs only on a frame, and stays idle after loading", async () => {
    const { tiles, build, install, replies } = delayed();
    tiles.setDesired([request("a"), request("b")]);
    tiles.tick();
    await settle();
    tiles.setDesired([request("b"), request("a")]);
    for (let n = 0; n < 10; n++) tiles.tick();
    expect(build).toHaveBeenCalledTimes(1);
    replies.get("a")!.resolve(data());
    await settle();
    expect(install).not.toHaveBeenCalled();
    tiles.tick();
    await settle();
    expect(install.mock.calls.map(([tile]) => tile.request.key)).toEqual(["a"]);
    replies.get("b")!.resolve(data());
    await settle();
    expect(install).toHaveBeenCalledTimes(1);
    tiles.tick();
    await settle();
    for (let n = 0; n < 10; n++) {
      tiles.setDesired([request("b"), request("a")]);
      tiles.tick();
    }
    await settle();
    expect(build).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenCalledTimes(2);
  });

  it("drops departed replies and advances to the new view without cancelling the live build", async () => {
    const { tiles, build, install, replies } = delayed();
    tiles.setDesired([request("a")]);
    tiles.tick();
    await settle();
    tiles.setDesired([request("c")]);
    tiles.tick();
    expect(build).toHaveBeenCalledTimes(1);
    replies.get("a")!.resolve(data());
    await settle();
    tiles.tick();
    await settle();
    expect(install).not.toHaveBeenCalled();
    expect(tiles.snapshot().peakPayloadBytes).toBe(terrainTilePayloadBytes(data()));
    expect(build.mock.calls.map(([r]) => r.key)).toEqual(["a", "c"]);
    replies.get("c")!.resolve(data());
    await settle();
    tiles.tick();
    expect(tiles.snapshot().residentKeys).toEqual(["c"]);
  });

  it("reuses cached return visits and evicts the oldest unwanted tile atomically", async () => {
    const { tiles, build, install, replies } = delayed();
    for (const key of ["a", "b"]) {
      tiles.setDesired([request(key)]);
      tiles.tick();
      await settle();
      replies.get(key)!.resolve(data());
      await settle();
      tiles.tick();
    }
    tiles.setDesired([request("a")]);
    tiles.tick();
    await settle();
    expect(build).toHaveBeenCalledTimes(2);
    tiles.setDesired([request("c")]);
    tiles.tick();
    await settle();
    replies.get("c")!.resolve(data());
    await settle();
    expect(tiles.snapshot().residentKeys).toEqual(["b", "a"]);
    tiles.tick();
    expect(install.mock.calls.at(-1)![1]).toEqual(["b"]);
    expect(tiles.snapshot().residentKeys).toEqual(["a", "c"]);
  });

  it("advances past errors without retrying failed keys on repeated view updates", async () => {
    const { tiles, replies, build } = delayed();
    tiles.setDesired([request("bad"), request("good")]);
    tiles.tick();
    await settle();
    replies.get("bad")!.reject(new Error("worker failed"));
    await settle();
    tiles.tick();
    await settle();
    replies.get("good")!.resolve(data());
    await settle();
    tiles.tick();
    for (let n = 0; n < 5; n++) {
      tiles.setDesired([request("bad"), request("good")]);
      tiles.tick();
    }
    expect(build).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.stringify(tiles.snapshot().failed))[0]).toEqual({
      key: "bad",
      error: "worker failed",
    });
    expect(tiles.snapshot().residentKeys).toEqual(["good"]);
  });

  it("budgets resident payloads, reports transfer peak, and rejects oversized payloads", async () => {
    const bytes = terrainTilePayloadBytes(data());
    const { tiles, replies, install } = delayed(2, bytes);
    for (const key of ["a", "b"]) {
      tiles.setDesired([request(key)]);
      tiles.tick();
      await settle();
      replies.get(key)!.resolve(data());
      await settle();
      expect(tiles.snapshot().pendingPayloadBytes).toBe(bytes);
      tiles.tick();
      expect(tiles.snapshot().residentPayloadBytes).toBe(bytes);
    }
    expect(tiles.snapshot().peakPayloadBytes).toBe(2 * bytes);
    expect(install.mock.calls.at(-1)![1]).toEqual(["a"]);
    tiles.setDesired([request("huge")]);
    tiles.tick();
    await settle();
    const huge = data();
    huge.shoreDistance = new Float32Array(bytes);
    replies.get("huge")!.resolve(huge);
    await settle();
    tiles.tick();
    expect(tiles.snapshot().failed[0].key).toBe("huge");
    expect(tiles.snapshot().residentKeys).toEqual(["b"]);
  });

  it("does not thrash when the visible working set exceeds the byte or count budget", async () => {
    const build = vi.fn(async () => data());
    const tiles = createTerrainTiles({
      build,
      install: vi.fn(),
      maxTiles: 2,
      maxPayloadBytes: terrainTilePayloadBytes(data()),
    });
    tiles.setDesired([request("a"), request("b"), request("c")]);
    for (let n = 0; n < 20; n++) {
      tiles.tick();
      await settle();
    }
    expect(build).toHaveBeenCalledTimes(2);
    expect(tiles.snapshot().residentKeys).toEqual(["a"]);
    expect(tiles.snapshot().budgetBlockedKeys).toEqual(["b"]);
    tiles.setDesired([request("b")]);
    for (let n = 0; n < 3; n++) {
      tiles.tick();
      await settle();
    }
    expect(tiles.snapshot().residentKeys).toEqual(["b"]);
    expect(tiles.snapshot().budgetBlockedKeys).toEqual([]);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it("ignores a live reply after disposal and never installs again", async () => {
    const { tiles, replies, install } = delayed();
    tiles.setDesired([request("a")]);
    tiles.tick();
    await settle();
    tiles.dispose();
    replies.get("a")!.resolve(data());
    await settle();
    tiles.setDesired([request("b")]);
    tiles.tick();
    expect(install).not.toHaveBeenCalled();
    expect(tiles.snapshot().residentKeys).toEqual([]);
    expect(tiles.snapshot().pendingKey).toBeNull();
  });

  it("isolates synchronous builder and install failures without evicting the old surface", async () => {
    const build = vi.fn((r: TerrainTileRequest) => {
      if (r.key === "build-fail") throw new Error("synchronous failure");
      return Promise.resolve(data());
    });
    const install = vi.fn((tile) => {
      if (tile.request.key === "install-fail") throw new Error("upload allocation failed");
    });
    const tiles = createTerrainTiles({ build, install, maxTiles: 1 });
    for (const key of ["old", "build-fail", "install-fail"]) {
      tiles.setDesired([request(key)]);
      tiles.tick();
      await settle();
      tiles.tick();
      await settle();
    }
    expect(tiles.snapshot().residentKeys).toEqual(["old"]);
    expect(tiles.snapshot().failed.map((r) => r.key)).toEqual(["build-fail", "install-fail"]);
    expect(install.mock.calls.at(-1)![0].request.key).toBe("install-fail");
    for (let n = 0; n < 10; n++) tiles.tick();
    expect(build).toHaveBeenCalledTimes(3);
  });

  it("counts shared backing buffers once rather than multiplying view lengths", () => {
    const tile = data();
    const shared = new Float32Array(100);
    tile.mesh.vertices = shared.subarray(0, 90);
    tile.mesh.surfaceColor = shared.subarray(0, 36);
    tile.mesh.tint = shared.subarray(0, 9);
    tile.shoreDistance = shared.subarray(0, 9);
    expect(terrainTilePayloadBytes(tile)).toBe(shared.byteLength + tile.mesh.indices.byteLength);
  });
});
