/** Absolute time keeps world travel continuous when the authored clip wraps. */
export function travelInstances(instances, seconds, speedMps, duration) {
  const phase = (seconds / duration) % 1;
  return instances.map((instance) => ({
    ...instance,
    phase,
    x: instance.x + Math.cos(instance.facing) * speedMps * seconds,
    y: instance.y + Math.sin(instance.facing) * speedMps * seconds,
  }));
}
