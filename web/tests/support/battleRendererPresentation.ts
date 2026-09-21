import { vi } from "vitest";
import { BattleRenderer } from "../../src/battle/renderer";
import { createSceneLifecycle } from "@packages/battle-renderer/src/sceneLifecycle";
import type { BattleSubmissionIdentity } from "../../src/battle/battleRendererApi";
import type { CrowdInstance } from "@packages/crowd-runtime/src/instanceData";

/** Exercise the real facade against an admitted scene and a recording GPU edge. */
export function presentationRenderer() {
  const events: string[] = [];
  const instances: CrowdInstance[][] = [];
  const times: number[] = [];
  const triangles: Float32Array[] = [];
  const debugBlocks: Float32Array[] = [];
  let submissionId = 0;
  let source: BattleSubmissionIdentity["source"] = "battle-draw";
  const owner = {
    setVisibility: () => {},
    seatingHeightAt: () => 0,
    uploadReadouts: () => {
      events.push("readouts");
    },
    uploadCrowd: (crowd: CrowdInstance[], _camera: unknown, time: number) => {
      events.push("crowd");
      instances.push(structuredClone(crowd));
      times.push(time);
    },
    uploadTriangles: (vertices: Float32Array) => {
      events.push("triangles");
      triangles.push(new Float32Array(vertices));
    },
    uploadDebugBlocks: (vertices: Float32Array) => {
      debugBlocks.push(new Float32Array(vertices));
    },
    uploadTacticalLines: () => {
      events.push("lines");
    },
    settleGrass: () => {
      events.push("grass");
    },
    prepare: (view: { time: number }) => {
      events.push("prepare");
      times.push(view.time);
    },
    admittedSeatingIdentity: () => null,
    createCommandEncoder: () => ({
      submit: () => {
        events.push("submit");
      },
    }),
    encode: () => {},
  };
  const telemetry = {
    measuring: false,
    beginSubmission(next: BattleSubmissionIdentity["source"]) {
      source = next;
      this.measuring = true;
    },
    cancelSubmission() {
      this.measuring = false;
    },
    endSubmission() {
      this.measuring = false;
      return { submissionId: ++submissionId, source, backend: "typegpu" as const };
    },
  };
  const renderer = Object.create(BattleRenderer.prototype) as BattleRenderer;
  Object.assign(renderer, {
    ready: Promise.resolve(),
    lifecycle: createSceneLifecycle(() => {}),
    owner,
    device: {
      pushErrorScope: () => {},
      popErrorScope: async () => null,
      queue: { onSubmittedWorkDone: async () => {} },
    },
    context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
    telemetry,
    frameTiming: { presented: vi.fn() },
    canvas: { width: 100, height: 100 },
    size: { width: 100, height: 100 },
    staticData: { soldierUnit: new Uint32Array(), teams: [] },
    soldierAssets: {},
    instances: [],
    invalidation: 0,
    renderedFrameId: 4,
    readinessSubmissions: 0,
    frozenKey: null,
    latestSubmission: null,
  });
  return { renderer, events, instances, times, triangles, debugBlocks };
}
