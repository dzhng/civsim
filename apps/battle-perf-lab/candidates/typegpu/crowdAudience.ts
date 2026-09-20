import type { TgpuBindGroup, TgpuRenderPass } from "typegpu";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../packages/crowd-runtime/src/visibility";
import type { ImpostorView } from "../../../../packages/battle-renderer/src/impostorData";
import { createCrowdAudienceHistory } from "../../../../packages/battle-renderer/src/crowdAudienceHistory";
import { createCrowdAudienceDiagnostics } from "../../../../packages/battle-renderer/src/crowdAudienceDiagnostics";
import type { TypegpuEnvironment } from "./environment";
import { createTypegpuCrowd } from "./crowd";
import { createTypegpuImpostors } from "./impostor";

/** Owns this library's mesh/pose and full-catalog atlas resources. Borrowed camera,
 * environment and submission context retain their owners. Submitted values are copied
 * at admission; concurrent uploads reject. */
export async function createTypegpuCrowdAudience(
  device: GPUDevice,
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData>,
  camera: TgpuBindGroup,
  environment: TypegpuEnvironment,
  samples: 1 | 4 = 4,
) {
  const history = createCrowdAudienceHistory(assets, atlases);
  let mesh: Awaited<ReturnType<typeof createTypegpuCrowd>> | undefined;
  const far = new Map<number, Awaited<ReturnType<typeof createTypegpuImpostors>>>();
  let disposed = false,
    uploading = false,
    released = false;
  const release = () => {
    if (released) return;
    released = true;
    const errors: unknown[] = [];
    for (const layer of [...far.values(), ...(mesh ? [mesh] : [])]) {
      try {
        layer.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    far.clear();
    if (errors.length) throw new AggregateError(errors, "Crowd audience cleanup failed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    history.dispose();
    // The owned upload promise performs cleanup before settling; no background finalizer.
    if (!uploading) release();
  };
  try {
    mesh = await createTypegpuCrowd(device, assets, camera, environment, samples);
    for (const id of history.ids)
      far.set(id, await createTypegpuImpostors(device, atlases[id], environment, samples));
    const meshOwner = mesh;
    const upload = async (
      instances: readonly CrowdInstance[],
      views: readonly CrowdProjectionView[],
      view: ImpostorView,
    ) => {
      const publication = history.begin(instances, views);
      uploading = true;
      let failure: { error: unknown } | undefined;
      try {
        await meshOwner.upload(publication.instances, publication.plan);
        history.check();
        for (const [id, layer] of far) {
          layer.updateState(publication.groups.get(id)!);
          layer.setView(view);
        }
        history.commit(publication, view);
      } catch (error) {
        history.abort(publication);
        failure = { error };
      } finally {
        uploading = false;
        if (disposed) {
          try {
            release();
          } catch (error) {
            failure = {
              error: failure
                ? new AggregateError([failure.error, error], "Crowd upload and cleanup failed")
                : error,
            };
          }
        }
      }
      if (failure) throw failure.error;
    };
    return {
      upload,
      ...createCrowdAudienceDiagnostics(history, assets),
      async reproject(views: readonly CrowdProjectionView[], view: ImpostorView) {
        history.check(true);
        if (history.matchesViews(views)) return false;
        await upload(history.instances(), views, view);
        return true;
      },
      refreshCamera(view: ImpostorView) {
        // The record is derived per view in the vertex stage, so a camera that only moved
        // rewrites one bounded uniform and leaves every soldier's bytes alone.
        history.refreshImpostors(view, () => {
          for (const layer of far.values()) layer.setView(view);
        });
      },
      precompute(encoder: GPUCommandEncoder) {
        history.check(true);
        meshOwner.precompute(encoder);
      },
      draw(
        pass: TgpuRenderPass,
        audience: "main" | "shadow" = "main",
        cameraGroup: TgpuBindGroup = camera,
      ) {
        history.check(true);
        meshOwner.draw(pass, audience, cameraGroup);
        if (audience === "main") for (const layer of far.values()) layer.draw(pass, cameraGroup);
      },
      stats() {
        return {
          ...history.stats(),
          mesh: meshOwner.stats(),
          impostors: Object.fromEntries([...far].map(([id, layer]) => [id, layer.stats()])),
        };
      },
      dispose,
    };
  } catch (error) {
    try {
      dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Crowd construction and cleanup failed");
    }
    throw error;
  }
}
