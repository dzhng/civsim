import { draw, geometry, type Gpu, type FramePass } from "vgpu";
import { prepareWaterSurfaces, type BattleWaterInput } from "../../../../packages/battle-renderer/src/waterData";
import { waterShader } from "../../../../packages/battle-renderer/src/shaders/water";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import type { VgpuEnvironment } from "./environment";
/** vgpu owns immutable Geometry, state Buffer and Draw compilation. Geometry
 * replacement constructs a new owner; camera, environment and frame are borrowed. */
export async function createVgpuWater(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  inputs: readonly BattleWaterInput[],
  samples: 1 | 4,
) {
  const owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of owned) resource.destroy();
  };
  const admit = beginGpuAdmission(gpu.device.gpu);
  try {
    const own = <T extends { destroy(): void }>(value: T) => {
      owned.push(value);
      return value;
    };
    const draws: { render: ReturnType<typeof draw>; triangles: number }[] = [];
    for (const data of prepareWaterSurfaces(inputs)) {
      // Own each public Buffer before Geometry admission: vgpu's data-taking
      // Geometry constructor cannot release an earlier allocation if a later one throws.
      const positions = own(
        gpu.device.createBuffer({ size: data.positions.byteLength, usage: ["vertex", "copy_dst"] }),
      );
      positions.write(data.positions);
      const shores = own(
        gpu.device.createBuffer({ size: data.shoreDist.byteLength, usage: ["vertex", "copy_dst"] }),
      );
      shores.write(data.shoreDist);
      const indices = own(
        gpu.device.createBuffer({ size: data.indices.byteLength, usage: ["index", "copy_dst"] }),
      );
      indices.write(data.indices);
      const mesh = own(
        geometry(gpu, {
          buffers: [
            { buffer: positions.gpu, stride: 12, attributes: { p: "float32x3" } },
            { buffer: shores.gpu, stride: 4, attributes: { shore: "float32" } },
          ],
          vertexCount: data.positions.length / 3,
          indexBuffer: indices.gpu,
          indexFormat: "uint32",
          indexCount: data.indices.length,
        }),
      );
      const water = own(gpu.device.createBuffer({ size: 16, usage: ["uniform", "copy_dst"] }));
      water.write(data.state);
      const render = draw(gpu, {
        shader: waterShader(environment.shader, data.kind === "lake"),
        geometry: mesh,
        cull: "back",
        depth: { write: true, compare: "greater-equal" },
        set: { cam: camera, water, ...environment.bindings },
      });
      await render.compile({
        colors: ["rgba16float"],
        depth: "depth32float",
        sampleCount: samples,
      });
      draws.push({ render, triangles: data.indices.length / 3 });
    }
    await admit();
    return {
      draw(pass: FramePass) {
        if (disposed) throw Error("vgpu water disposed");
        for (const d of draws) pass.draw(d.render);
      },
      stats() {
        return {
          draws: draws.length,
          triangles: draws.reduce((sum, draw) => sum + draw.triangles, 0),
          ownedBuffers: disposed ? 0 : draws.length * 4,
          disposed,
          depth: "read-write",
          blending: "opaque",
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    await admit();
    throw error;
  }
}
