import tgpu, { d, std, writeToArrayBuffer } from "typegpu";
import {
  gpuAlphaBlendColorTarget,
  gpuWorldDepthStencil,
} from "../../../packages/renderer-core/src/pipelineContracts";
import { cameraValues, cameraUniformData, type MakeBackend } from "./contract";

// The same schema generates shader layout, host packing and TypeScript types.
const CameraSchema = d
  .struct({
    viewProj: d.mat4x4f,
    invViewProj: d.mat4x4f,
    eye: d.vec3f,
    znear: d.f32,
    focus: d.vec2f,
    width: d.f32,
    height: d.f32,
    zoom: d.f32,
    tilt: d.f32,
    time: d.f32,
    zfar: d.f32,
    sunAz: d.f32,
    sunEl: d.f32,
  })
  .$name("Camera");
const quadLayout = tgpu.vertexLayout((n) => d.arrayOf(d.vec2f, n));
const instanceLayout = tgpu.vertexLayout((n) => d.arrayOf(d.vec4f, n), "instance");

export const makeBackend: MakeBackend = async (shell, quad, instances, count, camera) => {
  const root = tgpu.initFromDevice({ device: shell.device });
  const cam = root.createUniform(CameraSchema, cameraValues(camera));
  const pipeline = root
    .createRenderPipeline({
      attribs: { quad: quadLayout.attrib, inst: instanceLayout.attrib },
      vertex: ({ quad, inst }) => {
        "use gpu";
        const world = d.vec3f(inst.x + quad.x * inst.z, inst.y + quad.y * inst.z, inst.w + 0.015);
        return { $position: std.mul(cam.$.viewProj, d.vec4f(world, 1)), local: quad };
      },
      fragment: ({ local }) => {
        "use gpu";
        const distance = std.length(local);
        if (distance > 1) std.discard();
        return d.vec4f(0.06, 0.05, 0.04, (1 - distance * distance) * 0.34);
      },
      targets: gpuAlphaBlendColorTarget(shell.info.format),
      primitive: { topology: "triangle-strip" },
      depthStencil: gpuWorldDepthStencil("read"),
      multisample: { count: shell.sampleCount },
    })
    .with(quadLayout, quad)
    .with(instanceLayout, instances);
  await pipeline.initAsync();
  // Verify the entire camera schema, including fields the shadow shader doesn't read.
  const packed = new ArrayBuffer(d.sizeOf(CameraSchema));
  writeToArrayBuffer(packed, CameraSchema, cameraValues(camera));
  const expected = cameraUniformData(camera);
  const actual = new Float32Array(packed);
  if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i]))
    throw new Error("TypeGPU camera packing differs from production");
  return {
    setCount: (next) => {
      count = next;
    },
    updateCamera: (next) => cam.write(cameraValues(next)),
    draw: (pass) => {
      if (count > 0) pipeline.with(pass).draw(4, count);
    },
    destroy: () => root.destroy(),
    details: {
      path: "TypeScript shader + typed camera + existing render pass",
      cameraBytes: packed.byteLength,
      cameraByteParity: true,
    },
  };
};
