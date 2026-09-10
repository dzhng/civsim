import { CAMERA_UNIFORM_BYTES } from "../../../packages/renderer-core/src/cameraUniform";
import { SHADOW_WGSL } from "../../../packages/renderer-core/src/soldierShadowPass";
import { cameraOnlyPipeline } from "../../../packages/renderer-core/src/pipelineContracts";
import { shadowLayouts, type MakeBackend } from "./contract";
export const makeBackend: MakeBackend = async (shell, quad, instances, count) => {
  const module = shell.device.createShaderModule({ code: SHADOW_WGSL, label: "raw-shadow" });
  const pipeline = cameraOnlyPipeline(shell, {
    label: "raw-shadow",
    module,
    buffers: shadowLayouts,
    target: "alpha",
    depth: "read",
    topology: "triangle-strip",
  });
  return {
    setCount: (next) => {
      count = next;
    },
    updateCamera() {}, // The host already writes its camera before each frame.
    draw(pass) {
      if (count === 0) return;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, shell.cameraBindGroup);
      pass.setVertexBuffer(0, quad);
      pass.setVertexBuffer(1, instances);
      pass.draw(4, count);
    },
    destroy() {},
    details: {
      path: "production WGSL + production pipeline helper",
      cameraBytes: CAMERA_UNIFORM_BYTES,
    },
  };
};
