import type { AppearanceBundle } from '../../../../packages/soldier-assets/src/appearanceBundle';
import type { ImpostorAtlasData } from '../../../../packages/soldier-assets/src/impostorAtlas';
import type { CrowdInstance } from '../../../../packages/crowd-runtime/src/instanceData';
import {
  createCrowdLodBuffers,
  planCrowdLods,
  type CrowdProjectionView,
} from '../../../../packages/crowd-runtime/src/visibility';
import type { GpuDeviceCaps } from '../../../../packages/renderer-core/src/capabilities';
import type { ImpostorView } from '../impostorData';
import type { RawEnvironment } from './environment';
import { createRawCrowd } from './crowd';
import { createRawImpostors } from './impostor';
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
  const ids = Object.keys(assets).map(Number);
  for (const id of ids)
    if (!atlases[id]) throw Error(`Missing prepared impostor atlas for appearance ${id}`);
  let mesh: Awaited<ReturnType<typeof createRawCrowd>> | undefined;
  const far = new Map<number, Awaited<ReturnType<typeof createRawImpostors>>>();
  let disposed = false,
    ready = false;
  let previous = createCrowdLodBuffers(0),
    next = createCrowdLodBuffers(0),
    previousCount = 0;
  let mainVisible = 0,
    shadowOnly = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const layer of far.values()) layer.dispose();
    far.clear();
    mesh?.dispose();
    previous = createCrowdLodBuffers(0);
    next = createCrowdLodBuffers(0);
  };
  const check = (needFrame = false) => {
    if (disposed) throw Error('Crowd audience disposed');
    if (needFrame && !ready) throw Error('Crowd audience frame is not ready');
  };
  try {
    mesh = await createRawCrowd(device, caps, assets, cameraLayout, environment, { sampleCount });
    for (const id of ids)
      far.set(
        id,
        await createRawImpostors(device, atlases[id], cameraLayout, environment, sampleCount),
      );
    const meshOwner = mesh;
    return {
      upload(
        instances: readonly CrowdInstance[],
        views: readonly CrowdProjectionView[],
        view: ImpostorView,
      ) {
        check();
        ready = false;
        for (const instance of instances)
          if (!assets[instance.classId]) throw Error(`Missing appearance ${instance.classId}`);
        if (next.levels.length < instances.length)
          next = createCrowdLodBuffers(Math.max(instances.length, next.levels.length * 2));
        const plan = planCrowdLods(
          instances,
          views,
          assets,
          previous.levels.subarray(0, previousCount),
          undefined,
          previous.shadowLevels.subarray(0, previousCount),
          next,
        );
        const groups = new Map(ids.map(id => [id, [] as CrowdInstance[]]));
        for (let i = 0; i < instances.length; i++)
          if (plan.visibility[i] & 1 && plan.levels[i] === 3)
            groups.get(instances[i].classId)!.push(instances[i]);
        meshOwner.upload(instances, plan);
        for (const [id, layer] of far) layer.update(groups.get(id)!, view);
        [previous, next] = [next, previous];
        previousCount = instances.length;
        mainVisible = plan.viewVisible;
        shadowOnly = plan.shadowOnly;
        ready = true;
      },
      precompute(encoder: GPUCommandEncoder) {
        check(true);
        meshOwner.precompute(encoder);
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, audience: 'main' | 'shadow' = 'main') {
        check(true);
        meshOwner.draw(pass, camera, audience);
        if (audience === 'main') for (const layer of far.values()) layer.draw(pass, camera);
      },
      stats() {
        check();
        return {
          instances: previousCount,
          mainVisible,
          shadowOnly,
          ready,
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
