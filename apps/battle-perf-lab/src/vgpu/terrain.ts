import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import {
  draw,
  geometry,
  texture,
  sampler,
  type Gpu,
  type FramePass,
  type Draw,
  type Geometry,
} from "vgpu";
import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import { frontSideGroundIndices } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../shaders/terrainMaterial";
import { terrainShaders } from "../shaders/terrain";
import type { VgpuEnvironment } from "./environment";

/** One horizon vertex: position, then normal, then colour. Both horizon passes read this stride. */
const HORIZON_VERTEX_STRIDE = 40;
const HORIZON_POSITION = { format: "float32x3", offset: 0 } as const;

/** Depth-only: one vertex input, and it is `p`. The caster's layout below declares exactly that. */
export const HORIZON_CASTER_WGSL =
  WORLD_CAMERA_WGSL +
  `
  @vertex fn vertex(@location(0) p:vec3f)->@builtin(position) vec4f { return projectWorld(p); }
  @fragment fn fragment()->@location(0) vec4f { return vec4f(0); }`;

/**
 * The horizon's depth-only shadow caster, compiled for the sun-shadow target.
 *
 * vgpu resolves every declared geometry attribute against a vertex input by name, so an attribute
 * set describes a pass rather than a mesh: the beauty mesh's p/n/color layout has nothing to bind
 * `n` and `color` to in a shader that reads position alone. The caster therefore declares its own
 * layout, over `mesh`'s existing buffers — `buffer`/`indexBuffer` borrow a buffer instead of
 * uploading one, and vgpu destroys only the buffers it allocated itself, so the horizon vertex
 * bytes keep `mesh` as their single owner. The returned geometry is the caller's to destroy.
 */
export async function createVgpuHorizonCaster(
  gpu: Gpu,
  mesh: Geometry,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
) {
  const casterMesh = geometry(gpu, {
    buffers: [
      {
        buffer: mesh.vertexBuffers[0],
        stride: HORIZON_VERTEX_STRIDE,
        attributes: { p: HORIZON_POSITION },
      },
    ],
    vertexCount: mesh.vertexCount,
    indexBuffer: mesh.indexBuffer,
    indexFormat: mesh.indexFormat,
    indexCount: mesh.indexCount,
  });
  try {
    const render = draw(gpu, {
      shader: HORIZON_CASTER_WGSL,
      geometry: casterMesh,
      set: { cam: camera },
      cull: "front",
      frontFace: "ccw",
      depth: { write: true, compare: "greater-equal" },
      writeMask: [],
    });
    // Matches the sun-shadow target in ./shadow.
    await render.compile({ colors: ["rgba8unorm"], depth: "depth32float", sampleCount: 1 });
    return { mesh: casterMesh, draw: render };
  } catch (error) {
    // Drops this layout only; `mesh` still owns the buffers it lent.
    casterMesh.destroy();
    throw error;
  }
}

/** Caller owns frame, target, context, camera and environment; this owner lends its draws to the pass. */
export async function createVgpuTerrain(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  ground: Omit<PhotorealBattleGroundMesh, "earthDistance">,
  horizon: BattleHorizonLayout | null,
  options: TerrainMaterialOptions = {},
  mode: "beauty" | "material" = "beauty",
  samples: 1 | 4 = 1,
) {
  const owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of owned) resource.destroy();
  };
  try {
    const state = gpu.device.createBuffer({ size: 16, usage: ["uniform", "copy_dst"] });
    owned.push(state);
    state.write(new Float32Array([1, 1, 0, 0]));
    const sdf = options.earthDistance;
    const earth = texture(gpu, {
      kind: "2d",
      size: [sdf?.width ?? 1, sdf?.height ?? 1],
      format: "rg8unorm",
      usage: ["texture_binding", "copy_dst"],
    });
    owned.push(earth);
    // vgpu 0.5.0 has no public texel upload helper; pipeline and pass ownership stay with vgpu.
    gpu.device.queue.gpu.writeTexture(
      { texture: earth.gpu },
      sdf?.data ?? new Uint8Array([0, 0]),
      { bytesPerRow: (sdf?.width ?? 1) * 2 },
      [sdf?.width ?? 1, sdf?.height ?? 1],
    );
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    const shaders = terrainShaders(
      environment.shader,
      options,
      mode,
      false,
      environment.shadows && !options.vistaBand,
    );
    const groundGeometry = geometry(gpu, {
      buffers: [
        {
          data: new Float32Array(ground.vertices),
          stride: 40,
          attributes: {
            p: { format: "float32x3", offset: 0 },
            n: { format: "float32x3", offset: 12 },
            water: { format: "float32", offset: 36 },
          },
        },
        { data: new Float32Array(ground.tint), stride: 4, attributes: { tint: "float32" } },
        {
          data: new Float32Array(ground.surfaceColor),
          stride: 12,
          attributes: { color: "float32x3" },
        },
      ],
      indices: frontSideGroundIndices(ground.indices),
    });
    owned.push(groundGeometry);
    const bindings = {
      cam: camera,
      terrainState: state,
      earthSdf: earth,
      earthSampler: linear,
      ...environment.bindings,
    };
    const draws = [
      draw(gpu, {
        shader: shaders.ground,
        geometry: groundGeometry,
        set: bindings,
        cull: "back",
        frontFace: "ccw",
        depth: { write: options.vistaBand !== "farFog", compare: "greater-equal" },
        ...(options.vistaBand === "farFog"
          ? {
              blend: {
                color: {
                  src: "src-alpha" as const,
                  dst: "one-minus-src-alpha" as const,
                  op: "add" as const,
                },
                alpha: {
                  src: "one" as const,
                  dst: "one-minus-src-alpha" as const,
                  op: "add" as const,
                },
              },
            }
          : {}),
      }),
    ];
    let horizonShadow: Draw | undefined;
    if (horizon?.mesh.indices.length) {
      const mesh = geometry(gpu, {
        buffers: [
          {
            data: new Float32Array(horizon.mesh.vertices),
            stride: HORIZON_VERTEX_STRIDE,
            attributes: {
              p: HORIZON_POSITION,
              n: { format: "float32x3", offset: 12 },
              color: { format: "float32x3", offset: 24 },
            },
          },
        ],
        indices: horizon.mesh.indices,
      });
      owned.push(mesh);
      const caster = await createVgpuHorizonCaster(gpu, mesh, camera);
      owned.push(caster.mesh);
      horizonShadow = caster.draw;
      draws.push(
        draw(gpu, {
          shader: shaders.horizon,
          geometry: mesh,
          set: bindings,
          cull: "back",
          frontFace: "ccw",
          depth: { write: true, compare: "greater-equal" },
        }),
      );
    }
    await Promise.all(
      draws.map((render) =>
        render.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples }),
      ),
    );
    return {
      setState(farStrength: number, shadow = 1) {
        if (disposed) throw Error("vgpu terrain disposed");
        state.write(new Float32Array([farStrength, shadow, 0, 0]));
      },
      drawHorizonShadow(pass: FramePass, shadowCamera: typeof camera) {
        if (disposed) throw Error("vgpu terrain disposed");
        if (horizonShadow) {
          horizonShadow.set({ cam: shadowCamera });
          pass.draw(horizonShadow);
        }
      },
      draw(pass: FramePass) {
        if (disposed) throw Error("vgpu terrain disposed");
        for (const render of draws) pass.draw(render);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
