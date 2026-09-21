export type AllocationSnapshot = {
  liveCount: number;
  createdCount: number;
  currentBytes: number | null;
  peakBytes: number | null;
  unknownCount: number;
};

/** Only scalar counters are retained; destroyed resources do not accumulate. */
export function allocationLifetime(changed: () => void = () => {}) {
  let liveCount = 0,
    createdCount = 0,
    bytes = 0,
    peak = 0,
    unknownCount = 0;
  let everUnknown = false;
  return {
    add(resource: { destroy(): void }, size: number | null) {
      const destroy = resource.destroy;
      let live = true;
      liveCount++;
      createdCount++;
      if (size === null) {
        unknownCount++;
        everUnknown = true;
      } else bytes += size;
      peak = Math.max(peak, bytes);
      resource.destroy = function () {
        destroy.call(resource);
        if (!live) return;
        live = false;
        liveCount--;
        if (size === null) unknownCount--;
        else bytes -= size;
        changed();
      };
      changed();
    },
    snapshot(): AllocationSnapshot {
      return {
        liveCount,
        createdCount,
        currentBytes: unknownCount ? null : bytes,
        peakBytes: everUnknown ? null : peak,
        unknownCount,
      };
    },
  };
}
