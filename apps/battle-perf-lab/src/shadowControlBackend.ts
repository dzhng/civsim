import { tgpu, d, std } from "typegpu";
import { initFromDevice, geometry, draw, target, frame } from "vgpu";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";
import { createTypegpuSunShadow, sunSamplingLayout } from "../candidates/typegpu/shadow";
import { createVgpuSunShadow } from "./vgpu/shadow";
import { Camera, typegpuCameraLayout } from "../candidates/typegpu/camera";
import { shadowPcfWgsl, shadowVisibilityWgsl } from "./shaders/shadow";
import { destroyVgpuTarget } from "./vgpu/targetLifetime";
const vertices = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const pcf = tgpu.fn(
  [d.textureDepth2d(), d.comparisonSampler(), d.vec2f, d.f32, d.vec2f, d.f32],
  d.f32,
)(shadowPcfWgsl);
const visibility = tgpu
  .fn(
    [d.textureDepth2d(), d.comparisonSampler(), d.mat4x4f, d.vec4f, d.vec3f, d.vec3f, d.vec2f],
    d.f32,
  )(shadowVisibilityWgsl)
  .$uses({ shadowPcf: pcf });
const vertexWgsl = `struct Camera {vp:mat4x4f}; @group(0) @binding(0) var<uniform> camera:Camera;
struct V {@builtin(position) clip:vec4f,@location(0) world:vec3f};
@vertex fn vertex(@location(0) p:vec3f)->V {return V(camera.vp*vec4f(p,1),p);}`;
const receiverWgsl = `${vertexWgsl}
struct Sun {vp:mat4x4f,settings:vec4f}; @group(1) @binding(0) var<uniform> sun:Sun;
@group(1) @binding(1) var depth:texture_depth_2d;
@group(1) @binding(2) var compare:sampler_comparison;
fn shadowPcf${shadowPcfWgsl}
fn shadowVisibility${shadowVisibilityWgsl}
@fragment fn fragment(v:V)->@location(0) vec4f {let shade=shadowVisibility(depth,compare,sun.vp,sun.settings,v.world,vec3f(0,0,1),v.clip.xy);return vec4f(vec3f(shade),1);}`;
/** Only the orchestration differs: all candidates receive identical unindexed fixture vertices. */
export async function createShadowControlBackend(
  backend: "typegpu" | "vgpu",
  device: GPUDevice,
  env: CivsimEnvironment,
  cube: Float32Array<ArrayBuffer>,
  ground: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
) {
  const releases: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of releases.reverse()) f();
  };
  try {
    if (backend === "typegpu") {
      const root = tgpu.initFromDevice({ device });
      releases.push(() => root.destroy());
      const own = <T extends { destroy(): void }>(r: T) => {
        releases.push(() => r.destroy());
        return r;
      };
      const shadow = createTypegpuSunShadow(device, env);
      releases.push(shadow.dispose);
      const camera = own(root.createBuffer(Camera).$usage("uniform"));
      const cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: camera });
      const output = own(
        root.createTexture({ size: [width, height], format: "rgba16float" }).$usage("render"),
      );
      const vertex = tgpu.vertexFn({
        in: { p: d.vec3f },
        out: { clip: d.builtin.position, world: d.vec3f },
      })((v) => {
        "use gpu";
        return { clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.p, 1)), world: v.p };
      });
      const fragment = tgpu.fragmentFn({
        in: { clip: d.builtin.position, world: d.vec3f },
        out: d.vec4f,
      })((v) => {
        "use gpu";
        const shade = visibility(
          sunSamplingLayout.$.depth,
          sunSamplingLayout.$.compare,
          sunSamplingLayout.$.sun.vp,
          sunSamplingLayout.$.sun.settings,
          v.world,
          d.vec3f(0, 0, 1),
          v.clip.xy,
        );
        return d.vec4f(d.vec3f(shade), 1);
      });
      const depth = root.createRenderPipeline({
        attribs: { p: vertices.attrib },
        vertex,
        primitive: { cullMode: "none" },
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: true,
          depthCompare: "greater-equal",
        },
      });
      const receiver = root.createRenderPipeline({
        attribs: { p: vertices.attrib },
        vertex,
        fragment,
        targets: { format: "rgba16float" },
        primitive: { cullMode: "none" },
      });
      await Promise.all([depth.initAsync(), receiver.initAsync()]);
      const upload = (data: Float32Array<ArrayBuffer>) => {
        const b = own(root.createBuffer(vertices.schemaForCount(data.length / 3)).$usage("vertex"));
        b.write(data.buffer);
        return b;
      };
      const cubeBuffer = upload(cube),
        groundBuffer = upload(ground);
      return {
        output: root.unwrap(output),
        setWorldRect: shadow.setWorldRect,
        unusedColorBytes: 0,
        async render(vp: Float32Array) {
          if (disposed) throw Error("Shadow control disposed");
          const packed = new Float32Array(48);
          packed.set(vp);
          camera.write(packed.buffer);
          const encoder = root["~unstable"].createCommandEncoder();
          shadow.encode(encoder, (pass) =>
            depth
              .with(shadow.cameraGroup)
              .with(vertices, cubeBuffer)
              .with(pass)
              .draw(cube.length / 3),
          );
          const pass = encoder.beginRenderPass({
            colorAttachments: { view: output, clearValue: [1, 1, 1, 1] },
          });
          try {
            receiver
              .with(cameraGroup)
              .with(shadow.samplingGroup)
              .with(vertices, groundBuffer)
              .with(pass)
              .draw(ground.length / 3);
          } finally {
            pass.end();
          }
          encoder.submit();
        },
        dispose,
      };
    }
    const gpu = await initFromDevice(device);
    releases.push(() => gpu.dispose());
    const shadow = createVgpuSunShadow(gpu, env);
    releases.push(shadow.dispose);
    const camera = gpu.device.createBuffer({ size: 64, usage: ["uniform", "copy_dst"] });
    releases.push(() => camera.destroy());
    const output = target(gpu, { size: [width, height], format: "rgba16float" });
    releases.push(() => destroyVgpuTarget(output));
    const upload = (data: Float32Array<ArrayBuffer>) => {
      const g = geometry(gpu, { buffers: [{ data, stride: 12, attributes: { p: "float32x3" } }] });
      releases.push(() => g.destroy());
      return g;
    };
    const cubeGeometry = upload(cube),
      groundGeometry = upload(ground);
    const caster = draw(gpu, {
      shader: `${vertexWgsl}\n@fragment fn fragment()->@location(0) vec4f{return vec4f(0);}`,
      geometry: cubeGeometry,
      set: { camera: shadow.camera },
      cull: "none",
      depth: { write: true, compare: "greater-equal" },
      writeMask: [],
    });
    const receiver = draw(gpu, {
      shader: receiverWgsl,
      geometry: groundGeometry,
      set: { camera, sun: shadow.state, depth: shadow.depth, compare: shadow.comparison },
      cull: "none",
    });
    await Promise.all([
      caster.compile({ colors: ["rgba8unorm"], depth: "depth32float", sampleCount: 1 }),
      receiver.compile({ colors: ["rgba16float"], sampleCount: 1 }),
    ]);
    return {
      output: output.color.gpu,
      setWorldRect: shadow.setWorldRect,
      unusedColorBytes: shadow.unusedColorBytes,
      async render(vp: Float32Array) {
        if (disposed) throw Error("Shadow control disposed");
        camera.write(vp.slice());
        await frame(gpu, (current) => {
          shadow.encode(current, (pass) => pass.draw(caster));
          current.pass({ target: output, clear: [1, 1, 1, 1] }, (pass) => pass.draw(receiver));
        }).done;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
