/// <reference types="vitest/globals" />
import { init } from "vgpu/mock";
import { geometry, draw, type Gpu } from "vgpu";
import { createVgpuHorizonCaster, HORIZON_CASTER_WGSL } from "../src/vgpu/terrain";

/** The horizon beauty mesh, exactly as ./terrain builds it: p, n and colour at stride 40. */
const beautyHorizon = (gpu: Gpu, vertices = 3) =>
  geometry(gpu, {
    buffers: [
      {
        data: new Float32Array(vertices * 10),
        stride: 40,
        attributes: {
          p: { format: "float32x3", offset: 0 },
          n: { format: "float32x3", offset: 12 },
          color: { format: "float32x3", offset: 24 },
        },
      },
    ],
    // Odd index counts are normal for a horizon strip; keep one here so the borrowed
    // index buffer is exercised at a byte length the caster cannot have rounded itself.
    indices: new Uint16Array([0, 1, 2]),
  });

describe("vgpu horizon shadow caster", () => {
  it("builds a position-only pass against the p/n/color horizon mesh", async () => {
    const gpu = await init();
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    const mesh = beautyHorizon(gpu);

    const caster = await createVgpuHorizonCaster(gpu, mesh, camera);

    expect(caster.mesh.vertexCount).toBe(mesh.vertexCount);
    expect(caster.mesh.indexCount).toBe(mesh.indexCount);
    expect(caster.mesh.indexFormat).toBe(mesh.indexFormat);
  });

  it("borrows the beauty mesh's buffers instead of re-uploading the horizon", async () => {
    const gpu = await init();
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    const mesh = beautyHorizon(gpu);

    const caster = await createVgpuHorizonCaster(gpu, mesh, camera);

    expect(caster.mesh.vertexBuffers[0]).toBe(mesh.vertexBuffers[0]);
    expect(caster.mesh.indexBuffer).toBe(mesh.indexBuffer);
  });

  it("destroys no horizon bytes of its own, in either disposal order", async () => {
    const gpu = await init();
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });

    const owner = beautyHorizon(gpu);
    const borrower = await createVgpuHorizonCaster(gpu, owner, camera);
    expect(() => {
      borrower.mesh.destroy();
      owner.destroy();
    }).not.toThrow();

    const second = beautyHorizon(gpu);
    const secondCaster = await createVgpuHorizonCaster(gpu, second, camera);
    expect(() => {
      second.destroy();
      secondCaster.mesh.destroy();
    }).not.toThrow();
  });

  it("would reject the beauty mesh: vgpu binds every attribute to a vertex input by name", async () => {
    const gpu = await init();
    const camera = gpu.device.createBuffer({ size: 192, usage: ["uniform", "copy_dst"] });
    const mesh = beautyHorizon(gpu);

    // Binding the caster's own shader to the p/n/color mesh is the shape that failed startup.
    expect(() =>
      draw(gpu, {
        shader: HORIZON_CASTER_WGSL,
        geometry: mesh,
        set: { cam: camera },
        cull: "front",
        frontFace: "ccw",
        depth: { write: true, compare: "greater-equal" },
        writeMask: [],
      }),
    ).toThrowError(/VGPU-MESH-ATTRIBUTE-UNMATCHED: Geometry attribute 'n' has no shader input/);
  });
});
