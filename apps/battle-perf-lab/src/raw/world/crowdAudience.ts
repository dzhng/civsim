import type { AppearanceBundle } from "../../../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../../packages/crowd-runtime/src/visibility";
import { createCrowdAudienceHistory } from "../../../../../packages/battle-renderer/src/crowdAudienceHistory";
import { createCrowdAudienceDiagnostics } from "../../../../../packages/battle-renderer/src/crowdAudienceDiagnostics";
import type { GpuDeviceCaps } from "../../../../../packages/renderer-core/src/capabilities";
import type { ImpostorView } from "../../../../../packages/battle-renderer/src/impostorData";
import type { RawEnvironment } from "./environment";
import { createRawCrowd } from "./crowd";
import { createRawImpostors } from "./impostor";

/** Owns mesh/atlas GPU resources and the previous presentation's LOD history.
 * Assets, device, environment, cameras and pass attachments remain borrowed. */
export async function createRawCrowdAudience(
  device: GPUDevice,
  caps: GpuDeviceCaps,
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData>,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  sampleCount: 1 | 4 = 4,
) {
  const history = createCrowdAudienceHistory(assets, atlases);
  let mesh: Awaited<ReturnType<typeof createRawCrowd>> | undefined;
  const far = new Map<number, Awaited<ReturnType<typeof createRawImpostors>>>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    history.dispose();
    for (const layer of far.values()) layer.dispose();
    far.clear();
    mesh?.dispose();
  };
  try {
    mesh = await createRawCrowd(device, caps, assets, cameraLayout, environment, { sampleCount });
    for (const id of history.ids)
      far.set(
        id,
        await createRawImpostors(device, atlases[id], cameraLayout, environment, sampleCount),
      );
    const meshOwner = mesh;
    const upload = (
      instances: readonly CrowdInstance[],
      views: readonly CrowdProjectionView[],
      view: ImpostorView,
    ) => {
      const publication = history.begin(instances, views);
      try {
        meshOwner.upload(publication.instances, publication.plan);
        for (const [id, layer] of far) layer.update(publication.groups.get(id)!, view);
        history.commit(publication, view);
      } catch (error) {
        history.abort(publication);
        throw error;
      }
    };
    return {
      upload,
      ...createCrowdAudienceDiagnostics(history, assets),
      reproject(views: readonly CrowdProjectionView[], view: ImpostorView) {
        history.check(true);
        if (history.matchesViews(views)) return false;
        upload(history.instances(), views, view);
        return true;
      },
      refreshCamera(view: ImpostorView) {
        history.refreshImpostors(view, (groups) => {
          for (const [id, layer] of far) layer.update(groups.get(id)!, view);
        });
      },
      precompute(encoder: GPUCommandEncoder) {
        history.check(true);
        meshOwner.precompute(encoder);
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, audience: "main" | "shadow" = "main") {
        history.check(true);
        meshOwner.draw(pass, camera, audience);
        if (audience === "main") for (const layer of far.values()) layer.draw(pass, camera);
      },
      stats() {
        history.check();
        return {
          ...history.stats(),
          mesh: meshOwner.stats(),
          impostors: Object.fromEntries([...far].map(([id, layer]) => [id, layer.stats()])),
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
