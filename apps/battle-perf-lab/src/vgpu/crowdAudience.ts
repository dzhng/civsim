import type { Gpu, FramePass } from "vgpu";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../packages/crowd-runtime/src/visibility";
import type { ImpostorView } from "../impostorData";
import { createCrowdAudienceHistory } from "../crowdAudienceHistory";
import type { VgpuEnvironment } from "./environment";
import { createVgpuCrowd } from "./crowd";
import { createVgpuImpostors } from "./impostor";

/** Owns this library's mesh/pose and full-catalog atlas resources. Borrowed camera,
 * environment and submission context retain their owners. Upload input must remain
 * stable until its promise settles; concurrent uploads reject. */
export async function createVgpuCrowdAudience(
  gpu: Gpu,
  assets: Record<number, AppearanceBundle>,
  atlases: Record<number, ImpostorAtlasData>,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  samples: 1 | 4 = 4,
) {
  const history = createCrowdAudienceHistory(assets, atlases);
  let mesh: Awaited<ReturnType<typeof createVgpuCrowd>> | undefined;
  const far = new Map<number, Awaited<ReturnType<typeof createVgpuImpostors>>>();
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
    mesh = await createVgpuCrowd(gpu, assets, camera, environment, samples);
    for (const id of history.ids)
      far.set(id, await createVgpuImpostors(gpu, atlases[id], environment, camera, samples));
    const meshOwner = mesh;
    return {
      async upload(
        instances: readonly CrowdInstance[],
        views: readonly CrowdProjectionView[],
        view: ImpostorView,
      ) {
        const publication = history.begin(instances, views);
        uploading = true;
        let failure: { error: unknown } | undefined;
        try {
          await meshOwner.upload(instances, publication.plan);
          history.check();
          for (const [id, layer] of far) layer.update(publication.groups.get(id)!, view);
          history.commit(publication);
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
      },
      refreshCamera(view: ImpostorView) {
        history.refreshImpostors((groups) => {
          for (const [id, layer] of far) layer.update(groups.get(id)!, view);
        });
      },
      precompute() {
        history.check(true);
        meshOwner.precompute();
      },
      draw(
        pass: FramePass,
        audience: "main" | "shadow" = "main",
        cameraGroup: ReturnType<Gpu["device"]["createBuffer"]> = camera,
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
