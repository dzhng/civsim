import { RawBattleFrame } from "./frame";
import { createRawEnvironment } from "./environment";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { trackBufferLifetime } from "../bufferLifetimeCheck";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import { compareHdr, readHdrTexture } from "../numericalReadback";
import type { FrameCameraSnapshot } from "../frameCamera";

async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No hardware WebGPU");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  const results = [];
  try {
    for (const samples of [1, 4] as const) {
      const preset = Object.values(CIVSIM_ENVIRONMENTS)[0];
      const environment = await createRawEnvironment(device, preset, samples);
      const buffers = trackBufferLifetime(device),
        textures = trackTextureLifetime(device);
      const createPipeline = device.createRenderPipeline;
      let pipelines = 0;
      device.createRenderPipeline = function (descriptor) {
        pipelines++;
        return createPipeline.call(device, descriptor);
      };
      const snapshot: FrameCameraSnapshot = {
        camera3d: {
          target: [0, 0, 0],
          distance: 180,
          pitch: 0.5,
          yaw: 0.2,
          fovY: Math.PI / 3,
          aspect: 1,
          near: 0.1,
        },
        x: 0,
        y: 0,
        zoom: 1,
        width: 127,
        height: 95,
        time: 3,
        sunAzimuth: 0.2,
        sunElevation: 0.6,
      };
      const module = device.createShaderModule({
        code: `
        @vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
          let p=array<vec2f,3>(vec2f(-0.7,-0.6),vec2f(0.7,-0.6),vec2f(0,0.7));
          return vec4f(p[i],0.5,1);
        }
        @fragment fn fragment()->@location(0) vec4f { return vec4f(4,0.4,0.1,1); }
      `,
      });
      const triangle = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vertex" },
        fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: true,
          depthCompare: "greater-equal",
        },
        multisample: { count: samples },
        primitive: { topology: "triangle-list" },
      });
      const grade = {
        strength: 0.7,
        saturationBoost: 1.1,
        contrast: 0.2,
        splitTone: 0.8,
        shadowLift: 1.0,
      };
      const frame = new RawBattleFrame(device, environment, 127, 95, samples, "rgba16float");
      frame.setCamera(snapshot, [0, 0, 0], grade);
      const group = frame.cameraGroup,
        layout = frame.cameraLayout;
      let minimumRgbPeak = Infinity;
      const render = async (frame: RawBattleFrame, enabled: boolean) => {
        const output = device.createTexture({
          size: [frame.width, frame.height],
          format: "rgba16float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        try {
          const encoder = device.createCommandEncoder();
          frame.encode(
            encoder,
            output.createView(),
            (pass) => {
              pass.setPipeline(triangle);
              pass.draw(3);
            },
            true,
            enabled,
          );
          device.queue.submit([encoder.finish()]);
          const pixels = await readHdrTexture(device, output);
          let peak = 0;
          for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) peak = Math.max(peak, pixels[i]);
          minimumRgbPeak = Math.min(minimumRgbPeak, peak);
          return pixels;
        } finally {
          output.destroy();
        }
      };
      const original = await render(frame, true),
        beforePipelines = pipelines;
      await frame.resize(127, 95);
      const unchangedPipelines = pipelines === beforePipelines;
      const beforeFailure = { buffers: buffers.liveCount(), textures: textures.liveCount() };
      const originalCreate = device.createTexture;
      let count = 0,
        rejected = false;
      device.createTexture = function (descriptor) {
        if (++count === 7) throw Error("injected partial post allocation");
        return originalCreate.call(device, descriptor);
      };
      try {
        await frame.resize(191, 129);
      } catch (error) {
        rejected = String(error).includes("injected");
      } finally {
        device.createTexture = originalCreate;
      }
      const retained = compareHdr(await render(frame, true), original);
      const failureClean =
        buffers.liveCount() === beforeFailure.buffers &&
        textures.liveCount() === beforeFailure.textures;
      await frame.resize(191, 129);
      const changedSize = frame.width === 191 && frame.height === 129;
      const fresh = new RawBattleFrame(device, environment, 191, 129, samples, "rgba16float");
      fresh.setCamera(snapshot, [0, 0, 0], grade);
      const resized = compareHdr(await render(frame, true), await render(fresh, true));
      const postOff = compareHdr(await render(frame, false), await render(fresh, false));
      fresh.dispose();
      frame.dispose();
      frame.dispose();
      const empty = buffers.liveCount() === 0 && textures.liveCount() === 0;
      results.push({
        samples,
        unchangedPipelines,
        rejected,
        failureClean,
        retained,
        resized,
        postOff,
        changedSize,
        minimumRgbPeak,
        stableCamera: group === frame.cameraGroup && layout === frame.cameraLayout,
        empty,
      });
      device.createRenderPipeline = createPipeline;
      textures.restore();
      buffers.restore();
      environment.dispose();
    }
    return {
      results,
      errors,
      passed:
        errors.length === 0 &&
        results.every(
          (r) =>
            r.minimumRgbPeak > 0.5 &&
            r.unchangedPipelines &&
            r.rejected &&
            r.failureClean &&
            r.changedSize &&
            r.stableCamera &&
            r.empty &&
            [r.retained, r.resized, r.postOff].every(
              (c) => c.maxAbs === 0 && c.nonfinite === 0 && c.peak > 0.5,
            ),
        ),
    };
  } finally {
    device.destroy();
  }
}
try {
  const report = await run();
  Object.assign(window, { __frameLifecycle: report });
  document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
} catch (error) {
  Object.assign(window, { __frameLifecycle: { passed: false, error: String(error) } });
}
