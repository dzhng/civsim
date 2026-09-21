import { BLOOM_KERNEL_RADII } from "../../../../packages/battle-renderer/src/shaders/post";
import type { NativeGpuEvent } from "../../../../packages/battle-renderer/src/nativeGpuTelemetry";

export function postPassNames(bloom: boolean) {
  return bloom
    ? [
        "highpass",
        ...BLOOM_KERNEL_RADII.flatMap((_, i) => [`horizontal-${i}`, `vertical-${i}`]),
        "composite",
        "grade-agx-output",
      ]
    : ["grade-agx-output"];
}
export function summarizePostSamples(events: NativeGpuEvent[], bloom: boolean) {
  const names = postPassNames(bloom);
  if (
    !events.length ||
    events.some(
      (e) =>
        e.status !== "complete" ||
        e.passes?.length !== names.length ||
        e.passes.some((p) => p.kind !== "render" || p.ms === null),
    )
  )
    throw Error("Incomplete or unexpected post pass measurements");
  return names.map((name, index) => {
    const ms = events.map((e) => e.passes![index].ms!).sort((a, b) => a - b);
    return {
      name,
      samples: ms.length,
      meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
      minMs: ms[0],
      medianMs: ms[Math.floor(ms.length / 2)],
      p95Ms: ms[Math.ceil(ms.length * 0.95) - 1],
      maxMs: ms.at(-1),
    };
  });
}
