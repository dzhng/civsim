import { campaignLandscapeAllocation } from "../../../game-renderer/src/terrain/campaignLandscape";
import type { CampaignLandscapeSnapshot } from "../../../game-renderer/src/terrain/campaignSource";
import { createRenderedSurface } from "../../../game-renderer/src/terrain/surface";
import type { PhotorealCampaignWorld } from "./campaignWorld";
import { TerrainAllocationBudget } from "./tiledTerrain";
import { createCampaignTerrainWorker } from "./terrainWorker";
import { createTerrainTiles } from "./terrainTiles";
import { campaignOverviewRequest, terrainViewRequests, TERRAIN_DETAIL_LIMIT } from "./terrainView";

/** Boot data belongs to one worker and transfers to its eventual campaign world. */
export async function prepareCampaignTerrain(source: CampaignLandscapeSnapshot) {
  const sourceBytes =
    source.height.byteLength + source.biome.byteLength + source.renderMask.classes.byteLength;
  const overview = campaignOverviewRequest(source.renderMask.rect);
  const allocation = new TerrainAllocationBudget();
  allocation.reserve(campaignLandscapeAllocation(overview.size / 2, overview.cell).typedArrayBytes);
  const worker = createCampaignTerrainWorker(source);
  try {
    const coarse = await worker.build(overview);
    allocation.reserve(coarse.generationBytes!);
    return {
      worker,
      coarse,
      allocation,
      sourceBytes,
      surface: createRenderedSurface(coarse.mesh, coarse.domain, "overview"),
    };
  } catch (error) {
    worker.dispose();
    throw error;
  }
}

/** Bounded scheduling is shared by production and the traversal fixture. */
export class CampaignTerrainResidency {
  private readonly scheduler;
  private builds = 0;
  private workerRoundTripMs = 0;
  private wanted: ReturnType<typeof terrainViewRequests> = [];

  constructor(
    private readonly world: PhotorealCampaignWorld,
    private readonly boot: Awaited<ReturnType<typeof prepareCampaignTerrain>>,
  ) {
    this.scheduler = createTerrainTiles({
      maxTiles: TERRAIN_DETAIL_LIMIT,
      build: async (request) => {
        const allocated = world.stats().terrain.allocationBytes;
        boot.allocation.reserve(
          allocated + campaignLandscapeAllocation(request.size / 2, request.cell).typedArrayBytes,
        );
        this.builds++;
        const started = performance.now();
        const result = await boot.worker.build(request, 128 * 1024 * 1024 - allocated);
        boot.allocation.reserve(world.stats().terrain.allocationBytes + result.generationBytes!);
        this.workerRoundTripMs = performance.now() - started;
        return result;
      },
      install: (tile, evicted) => world.installTerrain(tile, evicted),
    });
  }

  update(view: Parameters<typeof terrainViewRequests>[0]) {
    this.wanted = terrainViewRequests(view, this.boot.coarse.domain);
    this.scheduler.setDesired(this.wanted);
    this.scheduler.tick();
  }

  stats() {
    const tiles = this.scheduler.snapshot();
    return {
      ...tiles,
      builds: this.builds,
      workerCount: 1,
      workerRoundTripMs: this.workerRoundTripMs,
      ready: this.wanted.every((request) => tiles.residentKeys.includes(request.key)),
      peakTotalTerrainBytes: this.boot.allocation.peakBytes,
      sourceBytes: this.boot.sourceBytes * 2,
    };
  }

  dispose() {
    this.scheduler.dispose();
    this.boot.worker.dispose();
  }
}
