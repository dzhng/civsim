// @vitest-environment node
import { expect, it } from "vitest";
import { Scene, PerspectiveCamera } from "three/webgpu";
import {
  GpuTelemetry,
  type TimestampBackend,
} from "../../packages/photoreal-renderer/src/gpuTelemetry";
import {
  enableSourceTimestampRanges,
  recordSourceTimestampRange,
  disposeSourceTimestampRanges,
  sourceTimestampRange,
  pruneSourceTimestampRanges,
} from "../../packages/photoreal-renderer/src/sourceTimestampRanges";

function fixture() {
  enableSourceTimestampRanges();
  const device = new Proxy(
    {},
    {
      get() {
        throw Error("range ledger must not call GPU");
      },
    },
  );
  const scene = new Scene(),
    camera = new PerspectiveCamera();
  const telemetry = new GpuTelemetry(() => 7, scene);
  const pools = {
    render: { timestamps: new Map<string, number>() },
    compute: { timestamps: new Map<string, number>() },
  };
  const backend: TimestampBackend = {
    device,
    hasTimestamp: true,
    timestampQueryPool: pools,
    hasTimestampQuery: (id) => pools[id.startsWith("c:") ? "compute" : "render"].timestamps.has(id),
    getTimestamp: (id) => pools[id.startsWith("c:") ? "compute" : "render"].timestamps.get(id)!,
  };
  telemetry.beginSubmission(camera);
  telemetry.beginCompute("c:1:f7");
  telemetry.finishCompute("c:1:f7");
  telemetry.beginRender("r:2:f7", scene, camera);
  telemetry.finishRender("r:2:f7");
  telemetry.endSubmission();
  const add = (kind: "render" | "compute", id: string, begin: bigint, end: bigint) => {
    pools[kind].timestamps.set(id, Number(end - begin) / 1e6);
    recordSourceTimestampRange(device, kind, id, begin, end);
  };
  return { device, telemetry, pools, backend, add };
}
it("joins exact independently resolved pool UIDs and unions overlapping stages without adding their unions", () => {
  const f = fixture();
  f.add("render", "r:2:f7", 2_000_000n, 5_000_000n);
  f.add("compute", "c:1:f6", 10_000_000n, 50_000_000n);
  f.telemetry.resolve(f.backend);
  expect(f.telemetry.eventsSince(0).events).toHaveLength(0);
  f.add("compute", "c:1:f7", 1_000_000n, 3_000_000n);
  f.telemetry.resolve(f.backend);
  const event = f.telemetry.eventsSince(0).events[0];
  expect(event).toMatchObject({
    status: "complete",
    measuredPassGpuMs: 5,
    observedGpuSpanMs: 4,
    observedGpuUnionMs: 4,
  });
  expect(event.stages.map((s) => s.observedGpuUnionMs)).toEqual([2, 3]);
  expect(() => JSON.stringify(f.telemetry.snapshot())).not.toThrow();
  expect(sourceTimestampRange(f.device, "render", "r:2:f7")).toBeNull();
  disposeSourceTimestampRanges(f.device);
});
it.each(["missing", "invalid", "overflow"] as const)(
  "does not publish complete range metrics for %s pairs",
  (mode) => {
    const f = fixture();
    f.add("render", "r:2:f7", 2_000_000n, 5_000_000n);
    if (mode === "missing") f.pools.compute.timestamps.set("c:1:f7", 2);
    else
      f.add(
        "compute",
        "c:1:f7",
        mode === "invalid" ? 0n : 1_000_000n,
        mode === "invalid" ? 0n : 3_000_000n,
      );
    if (mode === "overflow")
      for (let i = 0; i < 4097; i++)
        recordSourceTimestampRange(f.device, "compute", `c:extra${i}:f7`, 1n, 2n);
    f.telemetry.resolve(f.backend);
    expect(f.telemetry.eventsSince(0).events[0]).toMatchObject({
      status: "incomplete",
      observedGpuSpanMs: null,
      observedGpuUnionMs: null,
    });
    disposeSourceTimestampRanges(f.device);
  },
);
it("pruning retains requested unresolved UIDs without calling any device API", () => {
  const f = fixture();
  f.add("compute", "c:1:f7", 1n, 2n);
  f.add("render", "r:2:f7", 2n, 3n);
  pruneSourceTimestampRanges(f.device, new Set(["compute:c:1:f7"]));
  expect(sourceTimestampRange(f.device, "compute", "c:1:f7")).toEqual({ beginNs: 1n, endNs: 2n });
  expect(sourceTimestampRange(f.device, "render", "r:2:f7")).toBeNull();
  disposeSourceTimestampRanges(f.device);
});

it("ignores delayed pool callbacks after source device disposal", () => {
  const f = fixture();
  disposeSourceTimestampRanges(f.device);
  recordSourceTimestampRange(f.device, "render", "r:2:f7", 1n, 2n);
  expect(sourceTimestampRange(f.device, "render", "r:2:f7")).toBeNull();
});
