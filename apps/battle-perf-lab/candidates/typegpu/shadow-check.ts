/** Hardware entry for the High receiver's cascade-overlap gate.
 *
 * The receiver path here is the PRODUCTION one, not a re-statement of it: the
 * real `createTypegpuSunShadow('csm')` owns the depth array and the receiver
 * block, `createTypegpuEnvironment` binds them through the actual
 * `sunSamplingLayout` entries, and the fragment calls the environment's own
 * `sampleSunShadow`, which is `sunShadowSampleBodyWgsl('csm')` — the shared
 * sampler's text. Nothing in this file re-implements the shader.
 *
 * Only the depth CONTENT is synthetic. Each array layer is cleared to its own
 * known constant by a render pass, so every cascade's own comparison collapses
 * to a known 0 or 1 and what the fragment returns is the blend weight alone.
 * See shadowOverlapFixture.ts for the probe depths and the hand-derived oracle.
 *
 * Boundaries this cannot cross: a synthetic cleared layer proves nothing about
 * caster fitting, cascade motion, PCF softness or shadow readability.
 */
import { tgpu, d } from "typegpu";
import { createTypegpuSunShadow } from "./shadow";
import { createTypegpuEnvironment, type TypegpuEnvironment } from "./environment";
import { Camera, typegpuCameraLayout } from "./camera";
import { frameCamera } from "../../../../packages/battle-renderer/src/frameCamera";
import { CSM_CASCADES } from "../../../../packages/game-renderer/src/battle/shadowPolicy";
import { readF32Texture } from "../../src/numericalReadback";
import {
  CHECK_NORMAL,
  CHECK_VIEWPORT,
  LINEAR_DEPTH_ERROR,
  MIN_COMPARE_SEPARATION,
  shadowOverlapFixture,
  type ShadowCheckMutation,
} from "./shadowOverlapFixture";

const PROBE_FORMAT = "r32float" as const;

/** The receiver surface this gate rasterizes: one texel per probe, each reading
 * its own world point out of a uniform array and calling the environment's own
 * `sampleSunShadow`. Built here rather than inline so it can be resolved to
 * WGSL without a device — the shader is the thing under test, and a body that
 * no longer resolves should fail before anyone books GPU time. */
export function probeReceiverShader(
  sampleSunShadow: TypegpuEnvironment["sampleSunShadow"],
  count: number,
) {
  const Probes = d.arrayOf(d.vec4f, count);
  const probeLayout = tgpu.bindGroupLayout({
    probes: { uniform: Probes, visibility: ["fragment"] },
  });
  const corners = tgpu.const(d.arrayOf(d.vec2f, 3), [
    d.vec2f(-1, -1),
    d.vec2f(3, -1),
    d.vec2f(-1, 3),
  ]);
  const vertex = tgpu.vertexFn({
    in: { index: d.builtin.vertexIndex },
    out: { position: d.builtin.position },
  })(({ index }) => {
    "use gpu";
    return { position: d.vec4f(corners.$[index], 0, 1) };
  });
  const normal = tgpu.const(d.vec3f, d.vec3f(...CHECK_NORMAL));
  const fragment = tgpu
    .fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })(
      `{
  let world = probes.probes[i32(in.position.x)].xyz;
  return vec4f(sampleSunShadow(world, normal, in.position.xy), 0, 0, 1);
}`,
    )
    .$uses({ sampleSunShadow, probes: probeLayout.$, normal });
  return { Probes, probeLayout, vertex, fragment };
}

export async function runShadowOverlapCheck(mutation: ShadowCheckMutation = "none") {
  if (!navigator.gpu) throw Error("WebGPU is unavailable");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("WebGPU adapter is unavailable");
  const device = await adapter.requestDevice();
  const validation: string[] = [];
  device.addEventListener("uncapturederror", (event) =>
    validation.push((event as GPUUncapturedErrorEvent).error.message),
  );

  const fixture = shadowOverlapFixture();
  const count = fixture.probes.length;
  const root = tgpu.initFromDevice({ device });
  const release: (() => void)[] = [() => root.destroy()];
  const own = <T extends { destroy(): void }>(resource: T) => {
    release.push(() => resource.destroy());
    return resource;
  };
  try {
    const shadow = createTypegpuSunShadow(device, fixture.environment, "csm");
    release.push(shadow.dispose);
    shadow.update(fixture.camera);
    const published = shadow.data.receiver;
    const receiverMatchesFixture =
      published.length === fixture.receiver.length &&
      published.every((value, index) => Object.is(value, fixture.receiver[index]));
    if (mutation === "receiver-swap") shadow.state.write(fixture.corruptedReceiver().buffer);

    const environment = await createTypegpuEnvironment(
      device,
      fixture.environment,
      undefined,
      1,
      shadow,
    );
    release.push(environment.dispose);

    const state = frameCamera(fixture.snapshot, CHECK_VIEWPORT.width, CHECK_VIEWPORT.height);
    const cameraBuffer = own(root.createBuffer(Camera).$usage("uniform"));
    cameraBuffer.write(state.bytes.buffer);
    const cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: cameraBuffer });
    environment.setView(state.view, fixture.observer);

    const shader = probeReceiverShader(environment.sampleSunShadow, count);
    const probeBuffer = own(root.createBuffer(shader.Probes).$usage("uniform"));
    probeBuffer.write(fixture.probes.map((probe) => d.vec4f(...probe.world, 1)));
    const probeGroup = root.createBindGroup(shader.probeLayout, { probes: probeBuffer });
    const pipeline = root.createRenderPipeline({
      vertex: shader.vertex,
      fragment: shader.fragment,
      targets: { format: PROBE_FORMAT },
      primitive: { cullMode: "none" },
    });
    await pipeline.initAsync();

    const layers = Array.from({ length: CSM_CASCADES }, (_, layer) =>
      shadow.depth.createView("render", { baseArrayLayer: layer, arrayLayerCount: 1 }),
    );
    const targets = fixture.configurations.map(() =>
      own(root.createTexture({ size: [count, 1], format: PROBE_FORMAT }).$usage("render")),
    );

    const encoder = root["~unstable"].createCommandEncoder();
    const applied: (readonly [number, number])[] = [];
    for (const [index, configuration] of fixture.configurations.entries()) {
      const clears =
        mutation === "layer-swap"
          ? ([configuration.clears[1], configuration.clears[0]] as const)
          : configuration.clears;
      applied.push(clears);
      for (let layer = 0; layer < CSM_CASCADES; layer++) {
        // The whole known-depth region: a clear IS the caster here, so the
        // layer holds one constant and the comparison has one answer.
        const clear = encoder.beginRenderPass({
          label: `shadow-overlap ${configuration.name} layer ${layer}`,
          colorAttachments: [],
          depthStencilAttachment: {
            view: layers[layer],
            depthClearValue: clears[layer],
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        clear.end();
      }
      const pass = encoder.beginRenderPass({
        label: `shadow-overlap ${configuration.name} receivers`,
        colorAttachments: [{ view: targets[index], clearValue: [0, 0, 0, 0] }],
      });
      pipeline.with(cameraGroup).with(environment.group).with(probeGroup).with(pass).draw(3);
      pass.end();
    }
    encoder.submit();

    const failures: string[] = [];
    // Raw readbacks are kept beside both oracles: the unmutated expectation the
    // gate is judged against, and what the same configuration would produce if
    // the two layers were exchanged, so a failure can be read rather than guessed.
    const evaluate = async (index: number) => {
      const configuration = fixture.configurations[index];
      const actual = await readF32Texture(device, root.unwrap(targets[index]));
      const expected = fixture.expected(configuration, "none");
      const swapped = fixture.expected(configuration, "layer-swap");
      const nonfinite = actual.filter((value) => !Number.isFinite(value)).length;
      let maxAbs = 0;
      let maxAbsAgainstSwappedLayers = 0;
      for (const [probe, value] of actual.entries()) {
        if (!Number.isFinite(value)) continue;
        maxAbs = Math.max(maxAbs, Math.abs(value - expected[probe]));
        maxAbsAgainstSwappedLayers = Math.max(
          maxAbsAgainstSwappedLayers,
          Math.abs(value - swapped[probe]),
        );
      }
      if (nonfinite)
        failures.push(`${configuration.name}: ${nonfinite} nonfinite receiver samples`);
      if (!(maxAbs <= fixture.tolerance))
        failures.push(
          `${configuration.name}: max |actual-expected| ${maxAbs} exceeds ${fixture.tolerance}`,
        );
      return {
        name: configuration.name,
        clears: [...configuration.clears],
        appliedClears: [...applied[index]],
        cascadeVisibility: [...configuration.visibility],
        expected,
        swappedExpected: swapped,
        actual,
        maxAbs,
        maxAbsAgainstSwappedLayers,
        nonfinite,
      };
    };
    const configurations: Awaited<ReturnType<typeof evaluate>>[] = [];
    for (const index of fixture.configurations.keys()) configurations.push(await evaluate(index));

    // Three properties read off the MEASURED configurations rather than derived
    // from the oracle a second time. What each cascade removes on its own must
    // be what both remove together; wherever the two cascades cover the
    // receiver between them, occluding both must remove ALL of it, which is
    // what "the weights sum to one" means to a receiver and the first thing a
    // wrong fade breaks; and unoccluded layers must leave it lit.
    const measured = (name: string) => {
      const found = configurations.find((entry) => entry.name === name);
      if (!found) throw Error(`Missing configuration ${name}`);
      return found.actual;
    };
    const occluded0 = measured("cascade-0-occluded");
    const occluded1 = measured("cascade-1-occluded");
    const both = measured("both-occluded");
    const unoccluded = measured("neither-occluded");
    const weightSum = fixture.probes.map((probe, index) => {
      const cascade0 = 1 - occluded0[index];
      const cascade1 = 1 - occluded1[index];
      const combined = 1 - both[index];
      return {
        probe: probe.name,
        covered: probe.weights[0] + probe.weights[1] === 1,
        cascade0,
        cascade1,
        combined,
        residual: Math.abs(cascade0 + cascade1 - combined),
        lit: unoccluded[index],
      };
    });
    for (const entry of weightSum) {
      if (!(entry.residual <= fixture.tolerance))
        failures.push(`${entry.probe}: cascade weights are not additive (${entry.residual})`);
      if (!(Math.abs(entry.lit - 1) <= fixture.tolerance))
        failures.push(`${entry.probe}: unoccluded layers did not leave the receiver lit`);
      if (entry.covered && !(Math.abs(entry.combined - 1) <= fixture.tolerance))
        failures.push(`${entry.probe}: covered receiver is not fully shadowed (${entry.combined})`);
    }
    if (!receiverMatchesFixture)
      failures.push("The owner published a receiver block the fixture does not reproduce");
    if (validation.length) failures.push(...validation.map((m) => `validation: ${m}`));

    return {
      mutation,
      passed: failures.length === 0,
      failures,
      receiverMatchesFixture,
      environment: fixture.environment.id,
      camera: fixture.camera,
      viewport: CHECK_VIEWPORT,
      fit: {
        split: fixture.split,
        overlapMargin: fixture.overlapMargin,
        terminalMargin: fixture.terminalMargin,
        znear: fixture.znear,
        cappedFar: fixture.cappedFar,
      },
      tolerance: fixture.tolerance,
      linearDepthError: LINEAR_DEPTH_ERROR,
      minCompareSeparation: MIN_COMPARE_SEPARATION,
      probes: fixture.probes,
      configurations,
      weightSum,
      validation,
    };
  } finally {
    for (const dispose of release.reverse()) dispose();
  }
}

export type ShadowOverlapReport = Awaited<ReturnType<typeof runShadowOverlapCheck>>;
