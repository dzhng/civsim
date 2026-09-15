import { describe, expect, it, vi } from "vitest";
import {
  RenderMask,
  snapshotCampaignLandscape,
  campaignLandscapeSource,
} from "../../packages/game-renderer/src/terrain/campaignSource";
import * as landscape from "../../packages/game-renderer/src/terrain/campaignLandscape";
import { buildCampaignLandscape } from "../../packages/game-renderer/src/terrain/campaignLandscape";
import {
  campaignTerrainWorkerHandler,
  createCampaignTerrainWorker,
} from "../../packages/photoreal-renderer/src/campaign/terrainWorker";

function source() {
  const rgba = Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => {
    const x = Math.floor(i / 4) % 8;
    return (x < 3 ? [38, 60, 84, 255] : [196, 178, 138, 255])[i % 4];
  });
  return {
    w: 4,
    h: 4,
    minX: -8,
    maxY: 8,
    cell: 4,
    height: new Float32Array(16).fill(6),
    biome: new Uint8Array(64).fill(150),
    renderMask: new RenderMask(rgba, 8, 8, { min: [-8, -8], max: [8, 8] }),
  };
}
const request = { key: "region", minX: -8, minY: -8, size: 16, cell: 2 };

function transport() {
  const messages: unknown[] = [];
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    onmessageerror: null as (() => void) | null,
    terminate: vi.fn(),
    postMessage(
      message: Parameters<ReturnType<typeof campaignTerrainWorkerHandler>>[0],
      transfer: Transferable[] = [],
    ) {
      const clone = structuredClone(message, { transfer });
      messages.push(clone);
      queueMicrotask(() => handle(clone));
    },
  };
  const handle = campaignTerrainWorkerHandler((reply, transfer) => {
    if ("data" in reply) {
      const arrays = [reply.data.mesh.cellTriangles!, reply.data.mesh.waterCoverage!];
      for (const array of arrays) expect(transfer).toContain(array.buffer);
      const data = structuredClone(reply, { transfer });
      for (const array of arrays) expect(array.byteLength).toBe(0);
      queueMicrotask(() => port.onmessage?.({ data } as MessageEvent));
      return;
    }
    const data = structuredClone(reply, { transfer });
    queueMicrotask(() => port.onmessage?.({ data } as MessageEvent));
  });
  return { port, messages };
}

describe("campaign terrain worker transport", () => {
  it("preserves full-resolution coastline queries after clone, including margins and raster bounds", () => {
    const original = source();
    const snapshot = snapshotCampaignLandscape(original);
    const reconstructed = campaignLandscapeSource(structuredClone(snapshot));
    for (let y = -9; y < 10; y += 0.5)
      for (let x = -9; x < 10; x += 0.5)
        for (const margin of [0, 1]) {
          expect(reconstructed.renderLandAt(x, y, margin)).toBe(
            original.renderMask.landAt(x, y, margin),
          );
        }
    snapshot.height[0] = 77;
    snapshot.renderMask.classes.fill(0);
    expect(original.height[0]).toBe(6);
    expect(original.renderMask.landAt(5, 0)).toBe(true);
  });

  it("sends source once, transfers outputs, and reproduces direct mesh and shore bytes", async () => {
    const original = source();
    const expected = buildCampaignLandscape(
      campaignLandscapeSource(snapshotCampaignLandscape(original)),
      [0, 0],
      8,
      2,
    );
    const { port, messages } = transport();
    const snapshot = snapshotCampaignLandscape(original);
    const worker = createCampaignTerrainWorker(snapshot, port as unknown as Worker);
    expect(snapshot.height.byteLength).toBe(0);
    expect(original.height.byteLength).toBe(64);
    for (let i = 0; i < 2; i++) {
      const result = await worker.build({ ...request, key: String(i) });
      for (const field of ["vertices", "indices", "cellTriangles", "waterCoverage"] as const) {
        expect(Array.from(new Uint8Array(result.mesh[field]!.buffer))).toEqual(
          Array.from(new Uint8Array(expected.surface.mesh[field]!.buffer)),
        );
      }
      expect(result.mesh.tint).toBeUndefined();
      expect(result.mesh.surfaceColor).toBeUndefined();
      expect(result.mesh.triangles).toBe(expected.surface.mesh.triangles);
      expect(result.domain).toEqual(expected.surface.domain);
      expect(Array.from(result.mesh.shoreDistance!)).toEqual(
        Array.from(expected.surface.mesh.shoreDistance!),
      );
    }
    expect(messages).toHaveLength(3);
    expect(messages.slice(1)).toEqual(
      [0, 1].map((i) => ({
        type: "build",
        request: { ...request, key: String(i) },
        maxBytes: 128 * 1024 * 1024,
      })),
    );
    worker.dispose();
    expect(port.terminate).toHaveBeenCalledOnce();
  });

  it("reports invalid builds without retry and can build another tile afterward", async () => {
    const { port, messages } = transport();
    const worker = createCampaignTerrainWorker(
      snapshotCampaignLandscape(source()),
      port as unknown as Worker,
    );
    await expect(worker.build({ ...request, cell: 0 })).rejects.toThrow("positive grid spacing");
    expect(messages).toHaveLength(2);
    await expect(worker.build(request)).resolves.toHaveProperty("mesh");
    worker.dispose();
  });

  it("rejects excessive geometry and halo allocations before entering the generator", () => {
    const build = vi.spyOn(landscape, "buildCampaignLandscape");
    const reply = vi.fn();
    const handle = campaignTerrainWorkerHandler(reply);
    handle({ type: "init", source: snapshotCampaignLandscape(source()) });
    // A tiny cell expands both output grid and coast halo well beyond the allowance.
    handle({ type: "build", maxBytes: 128 * 1024 * 1024, request: { ...request, cell: 0.0001 } });
    expect(build).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toEqual({
      key: request.key,
      error: "Terrain tile generation exceeds its typed-array allowance",
    });
    build.mockRestore();
  });

  it("enforces a caller's remaining generation allowance including shoreline output", async () => {
    const { port } = transport();
    const worker = createCampaignTerrainWorker(
      snapshotCampaignLandscape(source()),
      port as unknown as Worker,
    );
    const regular = landscape.campaignLandscapeAllocation(8, 2).typedArrayBytes;
    await expect(worker.build(request, regular + 1)).rejects.toThrow(/Shoreline geometry/);
    const result = await worker.build(request);
    expect(result.generationBytes).toBeGreaterThan(regular);
    expect(result.mesh.shoreDistance!.length).toBe(result.mesh.vertices.length / 10);
    worker.dispose();
  });

  it("rejects concurrent work and terminates outstanding work on disposal", async () => {
    const { port } = transport();
    const worker = createCampaignTerrainWorker(
      snapshotCampaignLandscape(source()),
      port as unknown as Worker,
    );
    const pending = worker.build(request);
    const concurrent = worker.build(request);
    worker.dispose();
    await expect(concurrent).rejects.toThrow("already has a build");
    await expect(pending).rejects.toThrow("disposed");
    await expect(worker.build(request)).rejects.toThrow("disposed");
  });

  it("makes transport errors terminal and rejects the live tile", async () => {
    const { port } = transport();
    const worker = createCampaignTerrainWorker(
      snapshotCampaignLandscape(source()),
      port as unknown as Worker,
    );
    const pending = worker.build(request);
    port.onerror?.({ message: "worker crashed" } as ErrorEvent);
    await expect(pending).rejects.toThrow("worker crashed");
    await expect(worker.build(request)).rejects.toThrow("worker crashed");
    expect(port.terminate).toHaveBeenCalledOnce();
  });
});
