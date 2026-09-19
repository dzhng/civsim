import type { BattleWaterInput } from "../../../packages/battle-renderer/src/waterData";
/** Control-only resource accounting across immutable-owner replacement and a
 * synchronous allocation failure. The borrowed device must remain renderable. */
export async function checkWaterLifetime(
  device: GPUDevice,
  create: (inputs: readonly BattleWaterInput[]) => Promise<{ dispose(): void }>,
  input: BattleWaterInput,
) {
  const live = new Set<GPUBuffer>();
  const original = device.createBuffer;
  let peak = 0,
    failAfter = -1;
  device.createBuffer = function (descriptor) {
    if (failAfter === 0) throw Error("water allocation probe");
    if (failAfter > 0) failAfter--;
    const buffer = original.call(device, descriptor);
    live.add(buffer);
    peak = Math.max(peak, live.size);
    const destroy = buffer.destroy;
    buffer.destroy = function () {
      destroy.call(buffer);
      live.delete(buffer);
    };
    return buffer;
  };
  let current: Awaited<ReturnType<typeof create>> | undefined;
  try {
    current = await create([]);
    current.dispose();
    current = undefined;
    current = await create([input, input]);
    current.dispose();
    current.dispose();
    current = undefined;
    const afterReplacement = live.size;
    const failures = [];
    for (let allocation = 1; allocation <= 4; allocation++) {
      failAfter = allocation - 1;
      let rejected = false;
      try {
        current = await create([input]);
      } catch (error) {
        rejected = String(error).includes("water allocation probe");
      }
      current?.dispose();
      current = undefined;
      failures.push({ allocation, rejected, liveBuffers: live.size });
      if (!rejected || live.size)
        throw Error(
          `Water admission at allocation ${allocation}: rejected=${rejected}, live=${live.size}`,
        );
    }
    if (afterReplacement || peak !== 8)
      throw Error(
        `Water replacement admission: live=${afterReplacement}, realized=${peak}, expected=8`,
      );
    return {
      peakOwnedBuffers: peak,
      liveBuffersAfterReplacement: afterReplacement,
      liveBuffersAfterFailure: live.size,
      allocationFailureRejected: failures.every((f) => f.rejected),
      failures,
    };
  } finally {
    current?.dispose();
    device.createBuffer = original;
  }
}
