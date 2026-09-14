// @vitest-environment node
import { expect, it } from "vitest";
import { PerspectiveCamera, Scene } from "three/webgpu";
import {
  GpuTelemetry,
  type TimestampBackend,
} from "../../packages/photoreal-renderer/src/gpuTelemetry";

function fixture() {
  let frame = 7;
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const telemetry = new GpuTelemetry(() => frame, scene);
  const pools = {
    render: { timestamps: new Map<string, number>() },
    compute: { timestamps: new Map<string, number>() },
  };
  const backend: TimestampBackend = {
    hasTimestamp: true,
    timestampQueryPool: pools,
    hasTimestampQuery: (uid) =>
      pools[uid.startsWith("c:") ? "compute" : "render"].timestamps.has(uid),
    getTimestamp: (uid) => pools[uid.startsWith("c:") ? "compute" : "render"].timestamps.get(uid)!,
  };
  return { scene, camera, telemetry, backend, pools, nextFrame: () => ++frame };
}

it("waits for every exact UID instead of summing latest render and stale compute", () => {
  const { telemetry, camera, scene, pools, backend } = fixture();
  telemetry.beginSubmission(camera);
  telemetry.beginCompute("c:1:9:f7");
  telemetry.finishCompute("c:1:9:f7");
  telemetry.beginRender("r:1:2:f7", scene, camera);
  telemetry.finishRender("r:1:2:f7");
  telemetry.endSubmission();
  pools.render.timestamps.set("r:1:2:f7", 4);
  pools.compute.timestamps.set("c:1:9:f6", 30);
  telemetry.resolve(backend);
  expect(telemetry.snapshot().submissions[0]).toMatchObject({
    status: "pending",
    measuredPassGpuMs: null,
    missingQueries: 1,
  });
  pools.compute.timestamps.set("c:1:9:f7", 2);
  telemetry.resolve(backend);
  expect(telemetry.snapshot().submissions[0]).toMatchObject({
    status: "complete",
    renderMs: 4,
    computeMs: 2,
    measuredPassGpuMs: 6,
  });
});

it("prunes copied and unrelated results while protecting an unfinished query", () => {
  const { telemetry, camera, scene, pools, backend } = fixture();
  telemetry.beginSubmission(camera);
  telemetry.beginRender("r:1:2:f7", scene, camera);
  pools.render.timestamps.set("r:1:2:f7", 3);
  pools.render.timestamps.set("r:1:2:f1", 99);
  telemetry.resolve(backend);
  expect([...pools.render.timestamps]).toEqual([["r:1:2:f7", 3]]);
  telemetry.finishRender("r:1:2:f7");
  telemetry.endSubmission();
  telemetry.resolve(backend);
  expect(telemetry.snapshot().submissions[0].measuredPassGpuMs).toBe(3);
  expect([...pools.render.timestamps]).toEqual([]);
});

it("bounds unresolved retention and makes expired submissions visible", () => {
  const { telemetry, camera, scene, pools, backend, nextFrame } = fixture();
  for (let i = 0; i < 150; i++) {
    const frame = nextFrame();
    telemetry.beginSubmission(camera);
    telemetry.beginRender(`r:1:2:f${frame}`, scene, camera);
    telemetry.finishRender(`r:1:2:f${frame}`);
    telemetry.endSubmission();
  }
  // A late result for an expired frame must not resurrect it or grow the pool.
  pools.render.timestamps.set("r:1:2:f8", 5);
  telemetry.resolve(backend);
  const snapshot = telemetry.snapshot();
  expect(snapshot.submissions.length).toBeLessThan(100);
  expect(snapshot.droppedSubmissions + snapshot.submissions.length).toBe(150);
  expect(snapshot.lastDroppedSubmissionId).toBe(snapshot.submissions[0].submissionId - 1);
  expect(snapshot.submissions.every((entry) => entry.measuredPassGpuMs === null)).toBe(true);
  expect([...pools.render.timestamps]).toEqual([]);
});

it("rejects compute UIDs routed to the render pool and mixed Three frames", () => {
  const { telemetry, camera, scene, pools, backend, nextFrame } = fixture();
  telemetry.beginSubmission(camera);
  telemetry.beginCompute("r:1:2:f7");
  telemetry.finishCompute("r:1:2:f7");
  telemetry.endSubmission();
  pools.render.timestamps.set("r:1:2:f7", 10);
  telemetry.resolve(backend);
  expect(telemetry.snapshot().submissions[0]).toMatchObject({
    status: "incomplete",
    reason: "query-kind-mismatch",
    measuredPassGpuMs: null,
  });
  telemetry.beginSubmission(camera);
  nextFrame();
  telemetry.beginRender("r:1:2:f8", scene, camera);
  telemetry.finishRender("r:1:2:f8");
  telemetry.endSubmission();
  pools.render.timestamps.set("r:1:2:f8", 3);
  telemetry.resolve(backend);
  expect(telemetry.snapshot().submissions[1]).toMatchObject({
    status: "incomplete",
    reason: "frame-identity-mismatch",
    measuredPassGpuMs: null,
  });
});

it("does not present a truncated pass list as complete GPU work", () => {
  const { telemetry, camera, scene, pools, backend } = fixture();
  telemetry.beginSubmission(camera, "battle-draw");
  const identity = telemetry.latestSubmissionIdentity();
  for (let i = 0; i < 1000; i++) {
    const uid = `r:${i}:2:f7`;
    telemetry.beginRender(uid, scene, camera);
    telemetry.finishRender(uid);
    pools.render.timestamps.set(uid, 1);
  }
  telemetry.endSubmission();
  telemetry.resolve(backend);
  const sample = telemetry.snapshot().submissions[0];
  expect(sample).toMatchObject({
    ...identity,
    status: "incomplete",
    reason: "pass-retention-limit",
    measuredPassGpuMs: null,
  });
  expect(sample.passes.length).toBeLessThan(100);
  expect([...pools.render.timestamps]).toEqual([]);
});
