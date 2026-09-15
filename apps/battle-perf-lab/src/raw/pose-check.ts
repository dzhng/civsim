import { createTypegpuPosePalette } from "../../candidates/typegpu/posePalette";
import { createVgpuPosePalette } from "../vgpu/posePalette";
import { bakeLocalAnimation } from "../../../../packages/soldier-assets/src/localAnimation";
import {
  sampleRigLocalPose,
  localPoseToJointMatrices,
} from "../../../../packages/soldier-assets/src/localPose";
import {
  evaluatePlaybackPose,
  type SoldierPlayback,
  type ClipSample,
} from "../../../../packages/crowd-runtime/src/actionTimeline";
import type { ImportedRig } from "../../../../packages/soldier-assets/src/rig";
import type { AppearancePresentation } from "../../../../packages/soldier-assets/src/presentation";
const backend = new URL(location.href).searchParams.get("backend") ?? "typegpu";
async function run() {
  if (!["typegpu", "vgpu"].includes(backend)) throw new Error("Unknown pose backend");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const original = device.createBuffer;
  const live = new Set<GPUBuffer>();
  device.createBuffer = function (desc) {
    const b = original.call(device, desc),
      destroy = b.destroy;
    live.add(b);
    b.destroy = function () {
      destroy.call(b);
      live.delete(b);
    };
    return b;
  };
  const results: object[] = [];
  let passed = true;
  try {
    for (const name of ["human", "mounted"]) {
      const rig: ImportedRig = await (
        await fetch(`/assets/soldiers/candidates/blender-reference/${name}/skeleton.json`)
      ).json();
      const animation = bakeLocalAnimation(rig);
      const presentation =
        name === "mounted"
          ? ({
              riderUpperBodyJoints: ["rider-spine", "rider-arm", "rider-head"],
            } as AppearancePresentation)
          : null;
      const appearance = { rig, animation, manifest: { presentation } };
      const pose =
        backend === "typegpu"
          ? await createTypegpuPosePalette(device, rig, animation, {
              0: appearance,
              17: appearance,
            })
          : await createVgpuPosePalette(device, rig, animation, { 0: appearance, 17: appearance });
      try {
        const clip = (phase: number): ClipSample => ({
          clip: name === "human" ? "bend" : "gait",
          phase,
        });
        const frozen = (phase: number): SoldierPlayback => ({
          appearanceId: 0,
          base: {
            source: {
              kind: "frozen",
              locals: Object.freeze(Array.from(sampleRigLocalPose(rig, clip(phase).clip, phase))),
            },
            destination: clip(0.91),
            weight: 0.38,
          },
        });
        const growing = [frozen(0.12), frozen(0.35), frozen(0.72)];
        const sequence: {
          label: string;
          frames: (ClipSample | SoldierPlayback)[];
          zeroUpload?: boolean;
        }[] = [
          { label: "clip", frames: [clip(0.371)] },
          {
            label: "transition",
            frames: [
              {
                appearanceId: 0,
                base: {
                  source: { kind: "clip", sample: clip(0.17) },
                  destination: clip(0.83),
                  weight: 0.4,
                },
              },
            ],
          },
          { label: "frozen", frames: [growing[0]] },
          { label: "grow", frames: growing },
          { label: "retained", frames: growing, zeroUpload: true },
          { label: "holes", frames: [growing[2]], zeroUpload: true },
          { label: "replacement", frames: [growing[2], frozen(0.54)] },
          { label: "empty", frames: [] },
          { label: "endpoint", frames: [clip(1)] },
        ];
        for (const weight of [0, 1])
          sequence.push({
            label: `frozen-boundary-${weight}`,
            frames: [{ ...growing[0], base: { ...growing[0].base, weight } }],
          });
        if (name === "mounted") {
          const gait = clip(0.41),
            action = { clip: "rider-action", phase: 0.73 };
          const mounted: SoldierPlayback = {
            appearanceId: 0,
            base: { source: { kind: "clip", sample: gait }, destination: gait, weight: 1 },
            riderUpperBody: {
              source: { kind: "clip", sample: { ...action, phase: 0.1 } },
              destination: action,
              weight: 0.63,
            },
          };
          for (const weight of [0, 1])
            sequence.push({
              label: `masked-boundary-${weight}`,
              frames: [{ ...mounted, riderUpperBody: { ...mounted.riderUpperBody!, weight } }],
            });
          sequence.push(
            { label: "masked-rider", frames: [mounted] },
            {
              label: "frozen-upper-to-base",
              frames: [
                {
                  ...mounted,
                  riderUpperBody: {
                    source: {
                      kind: "frozen",
                      locals: Object.freeze(Array.from(sampleRigLocalPose(rig, action.clip, 0.27))),
                    },
                    destination: { kind: "base" },
                    weight: 0.44,
                  },
                },
              ],
            },
          );
        }
        for (const item of sequence) {
          await pose.upload(
            item.frames.length,
            (i) => item.frames[i],
            (i) => (i % 2 ? 17 : 0),
          );
          const encoder = device.createCommandEncoder();
          pose.precompute(encoder);
          if (backend === "typegpu") device.queue.submit([encoder.finish()]);
          const actual = await pose.read();
          let maxError = 0;
          for (let i = 0; i < item.frames.length; i++) {
            const p = item.frames[i];
            const locals =
              "base" in p
                ? evaluatePlaybackPose(appearance, p)
                : sampleRigLocalPose(rig, p.clip, p.phase);
            const expected = localPoseToJointMatrices(rig, locals);
            for (let j = 0; j < expected.length; j++)
              maxError = Math.max(
                maxError,
                Math.abs(actual[i * expected.length + j] - expected[j]),
              );
          }
          const stats = pose.stats(),
            ok =
              Number.isFinite(maxError) &&
              maxError <= 0.00001 &&
              (!item.zeroUpload || stats.snapshotUploadBytes === 0);
          passed &&= ok;
          results.push({
            rig: name,
            label: item.label,
            count: item.frames.length,
            maxError,
            stats,
            passed: ok,
          });
        }
        const before = pose.stats(),
          beforeBytes = await pose.read();
        const createBuffer = device.createBuffer;
        let fault = true,
          rejectedGrowth = false;
        device.createBuffer = function (desc) {
          if (fault) {
            fault = false;
            return createBuffer.call(device, { ...desc, usage: 0 });
          }
          return createBuffer.call(device, desc);
        };
        try {
          await pose.upload(
            65,
            () => clip(0.37),
            () => 0,
          );
        } catch {
          rejectedGrowth = true;
        } finally {
          device.createBuffer = createBuffer;
        }
        const after = pose.stats(),
          afterBytes = await pose.read();
        const preserved =
          rejectedGrowth &&
          before.instances === after.instances &&
          before.paletteBytes === after.paletteBytes &&
          beforeBytes.every((v, i) => v === afterBytes[i]);
        await pose.upload(
          65,
          () => clip(0.37),
          () => 0,
        );
        const retryEncoder = device.createCommandEncoder();
        pose.precompute(retryEncoder);
        if (backend === "typegpu") device.queue.submit([retryEncoder.finish()]);
        const retry = await pose.read(),
          expectedRetry = localPoseToJointMatrices(
            rig,
            sampleRigLocalPose(rig, clip(0.37).clip, 0.37),
          );
        let retryError = 0;
        for (let i = 0; i < 65; i++)
          for (let j = 0; j < expectedRetry.length; j++)
            retryError = Math.max(
              retryError,
              Math.abs(retry[i * expectedRetry.length + j] - expectedRetry[j]),
            );
        passed &&= preserved && Number.isFinite(retryError) && retryError <= 1e-5;
        results.push({
          rig: name,
          label: "GPU-growth-failure-retry",
          preserved,
          retryCount: 65,
          retryError,
          passed: preserved && retryError <= 1e-5,
        });
        let rejected = false;
        try {
          await pose.upload(
            0x1000000,
            () => clip(0),
            () => 0,
          );
        } catch {
          rejected = true;
        }
        passed &&= rejected;
        pose.dispose();
        pose.dispose();
        let guarded = false;
        try {
          await pose.upload(
            0,
            () => clip(0),
            () => 0,
          );
        } catch {
          guarded = true;
        }
        passed &&= guarded;
        results.push({ rig: name, rejectedOversize: rejected, disposedGuard: guarded });
      } finally {
        pose.dispose();
      }
    }
    await device.queue.onSubmittedWorkDone();
    const liveBuffers = live.size;
    passed &&= liveBuffers === 0 && errors.length === 0;
    return {
      backend,
      passed,
      results,
      liveBuffers,
      errors,
      adapter: adapter.info,
      scope: "Pose compute only; mesh/material/shadow composition pending",
    };
  } finally {
    device.createBuffer = original;
    device.destroy();
  }
}
run()
  .then((result) => Object.assign(window, { __pose: result }))
  .catch((error) =>
    Object.assign(window, {
      __pose: { backend, passed: false, error: String(error), stack: error.stack },
    }),
  );
