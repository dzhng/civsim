import {
  buildCampaignLandscape,
  campaignLandscapeAllocation,
} from "../../../game-renderer/src/terrain/campaignLandscape";
import {
  campaignLandscapeSource,
  type CampaignLandscapeSnapshot,
} from "../../../game-renderer/src/terrain/campaignSource";
import type { TerrainTileData, TerrainTileRequest } from "./terrainTiles";

type Request =
  | { type: "init"; source: CampaignLandscapeSnapshot }
  | { type: "build"; request: TerrainTileRequest };
type Reply = { key: string; data: TerrainTileData } | { key: string; error: string };

/** Dedicated worker transport; one client owns one source and one in-flight build. */
export function createCampaignTerrainWorker(
  source: CampaignLandscapeSnapshot,
  worker = new Worker(new URL("./terrainWorkerEntry.ts", import.meta.url), { type: "module" }),
) {
  let pending: {
    key: string;
    resolve: (data: TerrainTileData) => void;
    reject: (error: Error) => void;
  } | null = null;
  let terminal: Error | null = null;
  const fail = (error: Error) => {
    terminal = error;
    pending?.reject(error);
    pending = null;
    worker.terminate();
  };
  worker.onmessage = (event: MessageEvent<Reply>) => {
    if (!pending || terminal) return;
    if (event.data.key !== pending.key) {
      fail(new Error("Terrain worker returned an unexpected tile"));
      return;
    }
    const current = pending;
    pending = null;
    if ("error" in event.data) current.reject(new Error(event.data.error));
    else current.resolve(event.data.data);
  };
  worker.onerror = (event) => fail(new Error(event.message || "Terrain worker failed"));
  worker.onmessageerror = () => fail(new Error("Terrain worker reply could not be decoded"));
  try {
    worker.postMessage(
      { type: "init", source } satisfies Request,
      buffers(source.height, source.biome, source.renderMask.land),
    );
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
  }
  return {
    build(request: TerrainTileRequest): Promise<TerrainTileData> {
      if (terminal) return Promise.reject(terminal);
      if (pending) return Promise.reject(new Error("Terrain worker already has a build in flight"));
      return new Promise((resolve, reject) => {
        pending = { key: request.key, resolve, reject };
        try {
          worker.postMessage({ type: "build", request } satisfies Request);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose() {
      fail(new Error("Terrain worker disposed"));
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    },
  };
}

/** Worker-side handler is DOM-free and uses the same landscape source lookup. */
export function campaignTerrainWorkerHandler(
  reply: (message: Reply, transfer: ArrayBuffer[]) => void,
) {
  let source: ReturnType<typeof campaignLandscapeSource> | null = null;
  return (message: Request) => {
    if (message.type === "init") {
      if (source) throw new Error("Terrain worker source already initialized");
      source = campaignLandscapeSource(message.source);
      return;
    }
    const request = message.request;
    try {
      if (!source) throw new Error("Terrain worker source is not initialized");
      if (
        ![request.minX, request.minY, request.size, request.cell].every(Number.isFinite) ||
        request.size <= 0 ||
        request.cell <= 0
      )
        throw new Error("Terrain tile requires a finite region and positive grid spacing");
      if (
        campaignLandscapeAllocation(request.size / 2, request.cell).typedArrayBytes >
        128 * 1024 * 1024
      )
        throw new Error("Terrain tile generation exceeds the 128 MiB typed-array budget");
      const result = buildCampaignLandscape(
        source,
        [request.minX + request.size / 2, request.minY + request.size / 2],
        request.size / 2,
        request.cell,
      );
      const data: TerrainTileData = {
        mesh: result.surface.mesh,
        domain: result.surface.domain,
        scenery: result.scenery,
        shoreDistance: result.shoreDistance,
      };
      reply(
        { key: request.key, data },
        buffers(
          data.mesh.vertices,
          data.mesh.surfaceColor,
          data.mesh.tint,
          data.mesh.indices,
          data.shoreDistance,
        ),
      );
    } catch (error) {
      reply(
        { key: request.key, error: error instanceof Error ? error.message : String(error) },
        [],
      );
    }
  };
}

function buffers(...arrays: (Float32Array | Uint32Array | Uint8Array)[]): ArrayBuffer[] {
  return [...new Set(arrays.map((array) => array.buffer as ArrayBuffer))];
}
