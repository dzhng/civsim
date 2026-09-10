import type {
  RawFrameShell,
  WorldRenderPass,
} from "../../../packages/renderer-core/src/frameShell";
import { WORLD_CAMERA_WGSL } from "../../../packages/renderer-core/src/cameraWgsl";
import { cameraOnlyPipeline } from "../../../packages/renderer-core/src/pipelineContracts";
import { makeVertexBuffer } from "../../../packages/renderer-core/src/gpuBuffers";

// Elevated blocks are submitted before their ground, to make painter order fail.
// The later shadow pass must also stay behind the blocks through depth testing.
export function makeFixture(shell: RawFrameShell, extent: number, occluders: boolean) {
  const vertices: number[] = [];
  function face(points: number[][], color: number[]) {
    for (const i of [0, 1, 2, 0, 2, 3]) vertices.push(...points[i], ...color);
  }
  if (occluders)
    for (const [x, y] of [
      [-3, -3],
      [0, 0],
      [3, 3],
    ]) {
      const l = x - 0.7,
        r = x + 0.7,
        b = y - 0.7,
        t = y + 0.7,
        h = 1.6;
      face(
        [
          [l, b, h],
          [r, b, h],
          [r, t, h],
          [l, t, h],
        ],
        [0.8, 0.7, 0.48],
      );
      face(
        [
          [l, b, 0],
          [r, b, 0],
          [r, b, h],
          [l, b, h],
        ],
        [0.63, 0.53, 0.34],
      );
      face(
        [
          [r, b, 0],
          [r, t, 0],
          [r, t, h],
          [r, b, h],
        ],
        [0.72, 0.61, 0.4],
      );
      face(
        [
          [r, t, 0],
          [l, t, 0],
          [l, t, h],
          [r, t, h],
        ],
        [0.52, 0.46, 0.32],
      );
      face(
        [
          [l, t, 0],
          [l, b, 0],
          [l, b, h],
          [l, t, h],
        ],
        [0.62, 0.51, 0.33],
      );
    }
  face(
    [
      [-extent, -extent, 0],
      [extent, -extent, 0],
      [extent, extent, 0],
      [-extent, extent, 0],
    ],
    [0.34, 0.4, 0.23],
  );
  const buffer = makeVertexBuffer(shell.device, "fixture-world", new Float32Array(vertices));
  const module = shell.device.createShaderModule({
    code: `${WORLD_CAMERA_WGSL}
    struct Out { @builtin(position) pos: vec4f, @location(0) color: vec3f };
    @vertex fn vs(@location(0) position: vec3f, @location(1) color: vec3f) -> Out {
      var out: Out; out.pos=projectWorld(position); out.color=color; return out;
    }
    @fragment fn fs(in: Out) -> @location(0) vec4f { return vec4f(in.color,1); }`,
  });
  const pipeline = cameraOnlyPipeline(shell, {
    label: "fixture-world",
    module,
    buffers: [
      {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x3" },
        ],
      },
    ],
    target: "opaque",
    depth: "read-write",
  });
  return {
    draw(pass: WorldRenderPass) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, shell.cameraBindGroup);
      pass.setVertexBuffer(0, buffer);
      pass.draw(vertices.length / 6);
    },
    destroy() {
      buffer.destroy();
    },
  };
}
