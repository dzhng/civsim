import { initFromDevice, draw, bundle, uniforms, compute, storage } from "vgpu";
import { SHADOW_WGSL } from "../../../packages/renderer-core/src/soldierShadowPass";
import { WORLD_CAMERA_WGSL } from "../../../packages/renderer-core/src/cameraWgsl";
import { CAMERA_UNIFORM_BYTES } from "../../../packages/renderer-core/src/cameraUniform";
import { GPU_DEPTH_FORMAT } from "../../../packages/renderer-core/src/depthContract";
import { cameraValues, cameraUniformData, shadowLayouts, type MakeBackend } from "./contract";
export const makeBackend: MakeBackend = async (shell, quad, instances, count, camera) => {
  const gpu = await initFromDevice(shell.device);
  const cam = uniforms(gpu, cameraValues(camera));
  const shadow = draw(gpu, {
    shader: SHADOW_WGSL,
    label: "vgpu-shadow",
    set: { cam },
    geometry: {
      vertexBuffers: [quad, instances],
      vertexBufferLayouts: shadowLayouts,
      vertexCount: 4,
      instanceCount: count,
      topology: "triangle-strip",
    },
    blend: {
      color: { src: "src-alpha", dst: "one-minus-src-alpha" },
      alpha: { src: "one", dst: "one-minus-src-alpha" },
    },
    depth: { write: false, compare: "greater-equal" },
  });
  // Isolated packing check: vgpu 0.4.1 collides draw/compute cache IDs when
  // they share the same uniform object. The separate reproduction pins that bug.
  const probeCamera = uniforms(gpu, cameraValues(camera));
  const packed = storage(gpu, CAMERA_UNIFORM_BYTES);
  const copy = compute(
    gpu,
    `${WORLD_CAMERA_WGSL}
    @group(1) @binding(0) var<storage, read_write> packed: Camera;
    @compute @workgroup_size(1) fn copyCamera() { packed = cam; }
  `,
    { set: { cam: probeCamera, packed } },
  );
  copy.dispatch(1);
  const actual = new Float32Array(await packed.read());
  const expected = cameraUniformData(camera);
  if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i]))
    throw new Error("vgpu camera packing differs from production");
  let bindingTypoRuntimeError: string | null = null;
  try {
    shadow.set({ camTypo: 1 });
  } catch (error) {
    bindingTypoRuntimeError = String(error);
  }
  if (!bindingTypoRuntimeError?.includes("camTypo"))
    throw new Error("Binding typo was not rejected for the expected reason");
  const target = {
    colors: [shell.info.format],
    depth: GPU_DEPTH_FORMAT,
    sampleCount: shell.sampleCount as 1 | 4,
  };
  await shadow.compile(target);
  // Public raw bundle handle avoids private encode APIs or a second frame owner.
  // Counts re-record below. Buffer identity is fixed; replacing a buffer also requires re-recording.
  let recorded = bundle(gpu, { target }, (recorder) => {
    if (count > 0) recorder.draw(shadow);
  });
  return {
    setCount(next) {
      if (next === count) return;
      count = next;
      recorded = bundle(gpu, { target }, (recorder) => {
        if (count > 0) recorder.draw(shadow, { instances: count });
      });
    },
    updateCamera: (next) => cam.set(cameraValues(next)),
    draw: (pass) => {
      if (count > 0) pass.executeBundles([recorded.gpu]);
    },
    destroy: () => gpu.dispose(),
    details: {
      path: "production WGSL + reflected uniforms + public render bundle",
      countChangesRerecordBundle: true,
      cameraBytes: CAMERA_UNIFORM_BYTES,
      cameraByteParity: true,
      bindingTypoRuntimeError,
    },
  };
};
