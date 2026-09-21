import { trackBufferLifetime } from "../../../packages/battle-renderer/src/bufferLifetimeCheck";
import { trackTextureLifetime } from "../../../packages/battle-renderer/src/textureLifetimeCheck";
import type { BattleReadoutInstance } from "../../../packages/game-renderer/src/battle/readoutData";
/** Real resource boundaries with injected allocation failure, not a mock renderer. */
export async function checkReadoutResources(
  device: GPUDevice,
  create: () => Promise<{
    upload(x: readonly BattleReadoutInstance[]): Promise<void>;
    dispose(): void;
  }>,
) {
  const buffers = trackBufferLifetime(device),
    textures = trackTextureLifetime(device),
    original = device.createBuffer;
  let initialRejected = false,
    cancelledGrowthRejected = false;
  let owner: Awaited<ReturnType<typeof create>> | undefined;
  try {
    const initialFailures = [];
    for (const boundary of ["first-buffer", "second-buffer", "sampler", "bind-group"] as const) {
      const oldSampler = device.createSampler,
        oldGroup = device.createBindGroup;
      let calls = 0,
        rejected = false;
      device.createBuffer = function (...args) {
        calls++;
        if (calls === (boundary === "first-buffer" ? 1 : boundary === "second-buffer" ? 2 : -1))
          throw Error("Injected readout buffer allocation failure");
        return original.apply(this, args);
      };
      if (boundary === "sampler")
        device.createSampler = function () {
          throw Error("Injected sampler allocation failure");
        };
      if (boundary === "bind-group")
        device.createBindGroup = function () {
          throw Error("Injected bind-group allocation failure");
        };
      try {
        const unexpected = await create();
        unexpected.dispose();
      } catch {
        rejected = true;
      } finally {
        device.createBuffer = original;
        device.createSampler = oldSampler;
        device.createBindGroup = oldGroup;
      }
      const liveBuffers = buffers.liveCount(),
        liveTextures = textures.liveCount();
      initialFailures.push({ boundary, rejected, liveBuffers, liveTextures });
      if (!rejected || liveBuffers || liveTextures)
        throw Error(`Initial readout ${boundary} failure leaked resources or was not admitted`);
    }
    initialRejected = true;
    const initialLiveBuffers = buffers.liveCount(),
      initialLiveTextures = textures.liveCount();
    owner = await create();
    await owner.upload([
      { unitId: 1, x: 0, y: 0, z: 0, worldPerPx: 0.1, chips: [{ text: "old" }] },
    ]);
    const pending = owner.upload(
      Array.from({ length: 140 }, (_, i) => ({
        unitId: i,
        x: 0,
        y: 0,
        z: 0,
        worldPerPx: 0.1,
        chips: [{ text: String(i) }],
      })),
    );
    owner.dispose();
    try {
      await pending;
    } catch {
      cancelledGrowthRejected = true;
    }
    const finalLiveBuffers = buffers.liveCount(),
      finalLiveTextures = textures.liveCount();
    if (!cancelledGrowthRejected || finalLiveBuffers || finalLiveTextures)
      throw Error("Cancelled readout growth leaked resources or committed after disposal");
    return {
      initialFailures,
      initialRejected,
      initialLiveBuffers,
      initialLiveTextures,
      cancelledGrowthRejected,
      finalLiveBuffers,
      finalLiveTextures,
    };
  } finally {
    device.createBuffer = original;
    owner?.dispose();
    buffers.restore();
    textures.restore();
  }
}
