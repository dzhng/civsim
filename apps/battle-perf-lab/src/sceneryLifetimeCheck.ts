import type { CampaignSceneryInstance } from "../../../packages/game-renderer/src/campaign/sceneryPass";
/** Control-only cancellation at the real async growth boundary, before replacement commits. */
export async function checkSceneryGrowthLifetime(
  device: GPUDevice,
  create: () => Promise<{
    upload(instances: readonly CampaignSceneryInstance[]): Promise<void>;
    dispose(): void;
  }>,
  instances: readonly CampaignSceneryInstance[],
) {
  const buffers = new Set<GPUBuffer>();
  const original = device.createBuffer;
  device.createBuffer = function (descriptor) {
    const b = original.call(device, descriptor);
    buffers.add(b);
    const destroy = b.destroy;
    b.destroy = function () {
      destroy.call(b);
      buffers.delete(b);
    };
    return b;
  };
  let owner: Awaited<ReturnType<typeof create>> | undefined;
  try {
    owner = await create();
    const many = Array.from({ length: 65 }, () => instances[0]);
    const pending = owner.upload(many);
    owner.dispose();
    let rejected = false;
    try {
      await pending;
    } catch {
      rejected = true;
    }
    const liveBuffersAfterDispose = buffers.size;
    if (!rejected || liveBuffersAfterDispose)
      throw Error(
        `Scenery cancelled growth: rejected=${rejected}, live buffers=${liveBuffersAfterDispose}`,
      );
    return { cancelledGrowthRejected: rejected, liveBuffersAfterDispose };
  } finally {
    owner?.dispose();
    device.createBuffer = original;
  }
}
