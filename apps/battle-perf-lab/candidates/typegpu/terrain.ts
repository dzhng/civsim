import { typegpuTextureBytes } from "./textureUpload";
import { tgpu, d, std, type TgpuRenderPass } from "typegpu";
import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import { frontSideGroundIndices } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../../src/shaders/terrainMaterial";
import { createTerrainSurface, terrainLinear } from "./terrainFunctions";
import { environmentLayout, type TypegpuEnvironment } from "./environment";

import { Camera, typegpuCameraLayout as cameraLayout } from "./camera";
const terrainLayout = tgpu
  .bindGroupLayout({
    state: { uniform: d.vec4f, visibility: ["fragment"] },
    earth: { texture: d.texture2d(), visibility: ["fragment"] },
    linear: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(1);
const geometry = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ position: d.vec3f, normal: d.vec3f, color: d.vec3f, water: d.f32 })),
);
const tintVertices = tgpu.vertexLayout(d.disarrayOf(d.f32)),
  colorVertices = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const Varyings = {
  clip: d.builtin.position,
  position: d.vec3f,
  normal: d.vec3f,
  color: d.vec3f,
  tint: d.f32,
  water: d.f32,
  // Three normalizes this in the vertex stage before interpolated fragment derivatives.
  viewNormalGeometry: d.vec3f,
};
const FragmentIn = {
  position: d.vec3f,
  normal: d.vec3f,
  color: d.vec3f,
  tint: d.f32,
  water: d.f32,
  viewNormalGeometry: d.vec3f,
};
function bytes(data: ArrayBufferView) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return copy.buffer;
}
export interface TerrainAttachments {
  color: GPUTextureView;
  depth: GPUTextureView;
  resolveTarget?: GPUTextureView;
}

/** Same shared ground/horizon algorithms, with TypeGPU resources and draw commands.
 * Attachments and canonical camera buffer are borrowed. This is a partial scene. */
export async function createTypegpuTerrain(
  device: GPUDevice,
  cameraBuffer: GPUBuffer,
  environment: TypegpuEnvironment,
  ground: PhotorealBattleGroundMesh,
  horizon: BattleHorizonLayout | null,
  options: TerrainMaterialOptions = {},
  mode: "beauty" | "material" = "beauty",
  sampleCount: 1 | 4 = 1,
) {
  const root = tgpu.initFromDevice({ device }),
    owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  try {
    const camera = root.createBuffer(Camera, cameraBuffer).$usage("uniform");
    owned.push(camera);
    const cameraGroup = root.createBindGroup(cameraLayout, { cam: camera });
    const state = root.createBuffer(d.vec4f, d.vec4f(1, 1, 0, 0)).$usage("uniform");
    owned.push(state);
    const sdf = options.earthDistance,
      earth = root
        .createTexture({ size: [sdf?.width ?? 1, sdf?.height ?? 1], format: "rg8unorm" })
        .$usage("sampled");
    owned.push(earth);
    earth.write(typegpuTextureBytes(sdf?.data ?? new Uint8Array([0, 0])));
    const linear = root.createSampler({ minFilter: "linear", magFilter: "linear" }),
      group = root.createBindGroup(terrainLayout, { state, earth: earth.createView(), linear });
    const surface = createTerrainSurface(options);
    const geometryRoughnessFromView = environment.geometryRoughnessFromView;
    const shade = environment.shade;
    const finish =
      mode === "beauty"
        ? tgpu.fn(
            [d.vec4f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.vec3f],
            d.vec4f,
          )((surface, normal, position, eye, shadow, viewNormal) => {
            "use gpu";
            return shade(
              surface.rgb,
              d.vec3f(0),
              surface.a,
              geometryRoughnessFromView(viewNormal),
              0,
              1,
              normal,
              position,
              shadow,
              eye,
            );
          })
        : tgpu.fn(
            [d.vec4f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.vec3f],
            d.vec4f,
          )(
            "(surface:vec4f,normal:vec3f,position:vec3f,eye:vec3f,shadow:f32,viewNormal:vec3f)->vec4f{return surface;}",
          );
    const groundShade = tgpu.fragmentFn({ in: FragmentIn, out: d.vec4f })((v) => {
      "use gpu";
      const s = surface(
        v.position,
        v.normal,
        v.color,
        v.tint,
        v.water,
        cameraLayout.$.cam.time,
        cameraLayout.$.cam.focus,
        terrainLayout.$.state.x,
        terrainLayout.$.earth,
        terrainLayout.$.linear,
      );
      return finish(
        s,
        v.normal,
        v.position,
        cameraLayout.$.cam.eye,
        terrainLayout.$.state.y,
        v.viewNormalGeometry,
      );
    });
    const vertex = tgpu.vertexFn({
      in: { position: d.vec3f, normal: d.vec3f, color: d.vec3f, tint: d.f32, water: d.f32 },
      out: Varyings,
    })((v) => {
      "use gpu";
      return {
        clip: std.mul(cameraLayout.$.cam.viewProj, d.vec4f(v.position, 1)),
        position: v.position,
        normal: v.normal,
        color: v.color,
        tint: v.tint,
        water: v.water,
        viewNormalGeometry: std.normalize(
          std.mul(environmentLayout.$.data.worldToView, d.vec4f(v.normal, 0)).xyz,
        ),
      };
    });
    const pipelineState = {
      targets: { format: "rgba16float" as const },
      primitive: {
        topology: "triangle-list" as const,
        cullMode: "back" as const,
        frontFace: "ccw" as const,
      },
      depthStencil: {
        format: "depth32float" as const,
        depthWriteEnabled: true,
        depthCompare: "greater-equal" as const,
      },
      multisample: { count: sampleCount },
    };
    const groundPipeline = root.createRenderPipeline({
      ...pipelineState,
      attribs: {
        position: geometry.attrib.position,
        normal: geometry.attrib.normal,
        water: geometry.attrib.water,
        tint: tintVertices.attrib,
        color: colorVertices.attrib,
      },
      vertex,
      fragment: groundShade,
    });
    const vertices = root
        .createBuffer(geometry.schemaForCount(ground.vertices.length / 10))
        .$usage("vertex"),
      tints = root.createBuffer(tintVertices.schemaForCount(ground.tint.length)).$usage("vertex"),
      colors = root
        .createBuffer(colorVertices.schemaForCount(ground.surfaceColor.length / 3))
        .$usage("vertex"),
      indices = root.createBuffer(d.arrayOf(d.u32, ground.indices.length)).$usage("index");
    owned.push(vertices, tints, colors, indices);
    vertices.write(bytes(ground.vertices));
    tints.write(bytes(ground.tint));
    colors.write(bytes(ground.surfaceColor));
    indices.write(bytes(frontSideGroundIndices(ground.indices)));
    const boundGround = groundPipeline
      .with(cameraGroup)
      .with(group)
      .with(environment.group)
      .with(geometry, vertices)
      .with(tintVertices, tints)
      .with(colorVertices, colors)
      .withIndexBuffer(indices);
    const draws: ((pass: TgpuRenderPass) => void)[] = [
      (pass) => boundGround.with(pass).drawIndexed(ground.indices.length),
    ];
    const init = [groundPipeline.initAsync()];
    if (horizon && horizon.mesh.indices.length) {
      const h = horizon.mesh,
        hv = root.createBuffer(geometry.schemaForCount(h.vertices.length / 10)).$usage("vertex"),
        hi = root
          .createBuffer(d.disarrayOf(d.u16, h.indices.length + (h.indices.length % 2)))
          .$usage("index");
      owned.push(hv, hi);
      hv.write(bytes(h.vertices));
      const indexData = new Uint16Array(h.indices.length + (h.indices.length % 2));
      indexData.set(h.indices);
      hi.write(bytes(indexData));
      const hVertex = tgpu.vertexFn({
        in: { position: d.vec3f, normal: d.vec3f, color: d.vec3f },
        out: Varyings,
      })((v) => {
        "use gpu";
        return {
          clip: std.mul(cameraLayout.$.cam.viewProj, d.vec4f(v.position, 1)),
          position: v.position,
          normal: v.normal,
          color: v.color,
          tint: 0,
          water: 0,
          viewNormalGeometry: std.normalize(
            std.mul(environmentLayout.$.data.worldToView, d.vec4f(v.normal, 0)).xyz,
          ),
        };
      });
      const hFragment = tgpu.fragmentFn({ in: FragmentIn, out: d.vec4f })((v) => {
        "use gpu";
        const s = d.vec4f(terrainLinear(std.clamp(v.color, d.vec3f(0), d.vec3f(1))), 0.92);
        return finish(
          s,
          v.normal,
          v.position,
          cameraLayout.$.cam.eye,
          terrainLayout.$.state.y,
          v.viewNormalGeometry,
        );
      });
      const pipeline = root.createRenderPipeline({
        ...pipelineState,
        attribs: {
          position: geometry.attrib.position,
          normal: geometry.attrib.normal,
          color: geometry.attrib.color,
        },
        vertex: hVertex,
        fragment: hFragment,
      });
      const bound = pipeline
        .with(cameraGroup)
        .with(group)
        .with(environment.group)
        .with(geometry, hv)
        .withIndexBuffer(hi);
      draws.push((pass) => bound.with(pass).drawIndexed(h.indices.length));
      init.push(pipeline.initAsync());
    }
    await Promise.all(init);
    return {
      setState(farStrength: number, shadow = 1) {
        if (disposed) throw Error("TypeGPU terrain disposed");
        state.write(d.vec4f(farStrength, shadow, 0, 0));
      },
      render(attachments: TerrainAttachments) {
        if (disposed) throw Error("TypeGPU terrain disposed");
        const encoder = root["~unstable"].createCommandEncoder({ label: "TypeGPU terrain" });
        const pass = encoder.beginRenderPass({
          colorAttachments: {
            view: attachments.color,
            resolveTarget: attachments.resolveTarget,
            clearValue: [0, 0, 0, 0],
            loadOp: "clear",
            storeOp: "store",
          },
          depthStencilAttachment: {
            view: attachments.depth,
            depthClearValue: 0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        for (const draw of draws) draw(pass);
        pass.end();
        encoder.submit();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
