import { tgpu, d, std } from "typegpu";
import { initFromDevice, draw, geometry, target } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../packages/game-renderer/src/environment/postParameters";
import type { FrameCameraSnapshot } from "../../../packages/battle-renderer/src/frameCamera";
import { WORLD_CAMERA_WGSL } from "../../../packages/renderer-core/src/cameraWgsl";
import { makeVertexBuffer } from "../../../packages/renderer-core/src/gpuBuffers";
import {
  createRawLineLayer,
  createRawTriangleLayer,
  createRawRingLayer,
} from "./raw/world/overlay";
import {
  createTypegpuLineLayer,
  createTypegpuTriangleLayer,
  createTypegpuRingLayer,
} from "../../../packages/battle-renderer/src/world/overlay";
import { createVgpuLineLayer, createVgpuTriangleLayer, createVgpuRingLayer } from "./vgpu/overlay";
import { RawBattleFrame } from "./raw/world/frame";
import { TypegpuBattleFrame } from "../../../packages/battle-renderer/src/world/frame";
import { VgpuBattleFrame } from "./vgpu/frame";
import { createRawEnvironment } from "./raw/world/environment";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { createVgpuEnvironment } from "./vgpu/environment";
import { typegpuCameraLayout } from "../../../packages/battle-renderer/src/world/camera";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
const fixtureShader = `${WORLD_CAMERA_WGSL}\nstruct V{@builtin(position)clip:vec4f,@location(0)color:vec3f};@vertex fn vertex(@location(0)p:vec3f,@location(1)c:vec3f)->V{return V(projectWorld(p),c);}@fragment fn fragment(v:V)->@location(0)vec4f{return vec4f(v.color,1);}`;
/** Only control plumbing: candidate frame, fixture occluder and cues all use that backend. */
export async function createOverlayControlBackend(
  kind: string,
  device: GPUDevice,
  env: CivsimEnvironment,
  width: number,
  height: number,
  samples: 1 | 4,
  packedOccluder: Float32Array<ArrayBuffer>,
  onError: (s: string) => void,
) {
  const releases: (() => void)[] = [],
    own = <T extends { dispose(): void } | { destroy(): void }>(r: T) => {
      releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
      return r;
    };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of releases.reverse()) f();
  };
  const heightAt = () => 0,
    groundPlacement = { z: 0.25, drape: { heightAt, step: 2 } },
    effectPlacement = { z: 0, perVertexZ: true };
  try {
    if (kind === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      releases.push(() => root.destroy());
      const environment = own(await createTypegpuEnvironment(device, env, undefined, samples)),
        frame = own(
          await TypegpuBattleFrame.create(
            device,
            environment,
            width,
            height,
            samples,
            "rgba16float",
          ),
        );
      const native = {
        ground: own(
          await createTypegpuLineLayer(
            device,
            frame.cameraGroup,
            samples,
            groundPlacement,
            0.7,
            true,
          ),
        ),
        effect: own(
          await createTypegpuLineLayer(
            device,
            frame.cameraGroup,
            samples,
            effectPlacement,
            0.8,
            false,
          ),
        ),
        triangle: own(await createTypegpuTriangleLayer(device, frame.cameraGroup, samples)),
        ring: own(await createTypegpuRingLayer(device, frame.cameraGroup, samples, heightAt, 0.25)),
      };
      const layout = tgpu.vertexLayout(d.disarrayOf(d.unstruct({ p: d.vec3f, c: d.vec3f }))),
        buffer = own(
          root.createBuffer(layout.schemaForCount(packedOccluder.length / 6)).$usage("vertex"),
        );
      buffer.write(packedOccluder.slice().buffer);
      const vertex = tgpu.vertexFn({
        in: { p: d.vec3f, c: d.vec3f },
        out: { clip: d.builtin.position, color: d.vec3f },
      })((v) => {
        "use gpu";
        return { clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.p, 1)), color: v.c };
      });
      const fragment = tgpu.fragmentFn({ in: { color: d.vec3f }, out: d.vec4f })((v) => {
        "use gpu";
        return d.vec4f(v.color, 1);
      });
      const fixture = root
        .createRenderPipeline({
          vertex,
          fragment,
          attribs: layout.attrib,
          targets: { format: "rgba16float" },
          primitive: { cullMode: "none" },
          depthStencil: {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "greater-equal",
          },
          multisample: { count: samples },
        })
        .with(layout, buffer)
        .with(frame.cameraGroup);
      await fixture.initAsync();
      const output = own(
        root.createTexture({ size: [width, height], format: "rgba16float" }).$usage("render"),
      );
      return {
        native,
        output: root.unwrap(output),
        dispose,
        setCamera: (
          s: FrameCameraSnapshot,
          o: readonly [number, number, number],
          g: BattlePostGradeUniforms,
        ) => frame.setCamera(s, o, g),
        async render(vertices: number) {
          frame.render(
            root.unwrap(output).createView(),
            () => {},
            (pass) => {
              fixture.with(pass).draw(vertices);
              native.ring.draw(pass);
              native.ground.draw(pass);
              native.effect.draw(pass);
              native.triangle.draw(pass);
            },
            false,
          );
        },
      };
    }
    if (kind === "vgpu") {
      const gpu = await initFromDevice(device);
      releases.push(
        () => gpu.dispose(),
        gpu.onError((e) => onError(String(e))),
      );
      const environment = own(await createVgpuEnvironment(gpu, env, undefined, 3, samples)),
        frame = own(
          await VgpuBattleFrame.create(gpu, environment, width, height, samples, "rgba16float"),
        );
      const native = {
        ground: own(
          await createVgpuLineLayer(gpu, frame.camera, samples, groundPlacement, 0.7, true),
        ),
        effect: own(
          await createVgpuLineLayer(gpu, frame.camera, samples, effectPlacement, 0.8, false),
        ),
        triangle: own(await createVgpuTriangleLayer(gpu, frame.camera, samples)),
        ring: own(await createVgpuRingLayer(gpu, frame.camera, samples, heightAt, 0.25)),
      };
      const mesh = own(
        geometry(gpu, {
          buffers: [
            {
              data: packedOccluder,
              stride: 24,
              attributes: {
                p: { format: "float32x3", offset: 0 },
                c: { format: "float32x3", offset: 12 },
              },
            },
          ],
        }),
      );
      const fixture = draw(gpu, {
        shader: fixtureShader,
        geometry: mesh,
        set: { cam: frame.camera },
        cull: "none",
        depth: { write: true, compare: "greater-equal" },
      });
      await fixture.compile({
        colors: ["rgba16float"],
        depth: "depth32float",
        sampleCount: samples,
      });
      const output = target(gpu, { size: [width, height], format: "rgba16float" });
      releases.push(() => destroyVgpuTarget(output));
      return {
        native,
        output: output.color.gpu,
        dispose,
        setCamera: (
          s: FrameCameraSnapshot,
          o: readonly [number, number, number],
          g: BattlePostGradeUniforms,
        ) => frame.setCamera(s, o, g),
        async render(vertices: number) {
          await frame.render(
            output,
            () => {},
            (pass) => {
              pass.draw(fixture, { vertices });
              native.ring.draw(pass);
              native.ground.draw(pass);
              native.effect.draw(pass);
              native.triangle.draw(pass);
            },
            false,
          );
        },
      };
    }
    if (kind !== "raw") throw Error("Unknown overlay backend");
    const environment = own(await createRawEnvironment(device, env, samples)),
      frame = own(new RawBattleFrame(device, environment, width, height, samples, "rgba16float"));
    const native = {
      ground: own(
        await createRawLineLayer(device, frame.cameraLayout, samples, groundPlacement, 0.7, true),
      ),
      effect: own(
        await createRawLineLayer(device, frame.cameraLayout, samples, effectPlacement, 0.8, false),
      ),
      triangle: own(await createRawTriangleLayer(device, frame.cameraLayout, samples)),
      ring: own(await createRawRingLayer(device, frame.cameraLayout, samples, heightAt, 0.25)),
    };
    const buffer = own(makeVertexBuffer(device, "overlay fixture", packedOccluder)),
      module = device.createShaderModule({ code: fixtureShader });
    const fixture = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [frame.cameraLayout] }),
      vertex: {
        module,
        entryPoint: "vertex",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
      multisample: { count: samples },
    });
    const output = own(
      device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    return {
      native,
      output,
      dispose,
      setCamera: (
        s: FrameCameraSnapshot,
        o: readonly [number, number, number],
        g: BattlePostGradeUniforms,
      ) => frame.setCamera(s, o, g),
      async render(vertices: number) {
        const encoder = device.createCommandEncoder();
        frame.encode(
          encoder,
          output.createView(),
          (pass, group) => {
            pass.setPipeline(fixture);
            pass.setBindGroup(0, group);
            pass.setVertexBuffer(0, buffer);
            pass.draw(vertices);
            native.ring.encode(pass, group);
            native.ground.encode(pass, group);
            native.effect.encode(pass, group);
            native.triangle.encode(pass, group);
          },
          false,
        );
        device.queue.submit([encoder.finish()]);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
