import { battleWorldDepth } from "../worldDepth";
import { beginGpuAdmission } from "../gpuAdmission";
import { vistaOpacityWgsl } from "../shaders/vistaOpacity";
import { typegpuTextureBytes } from "./textureUpload";
import { tgpu, d, std, type TgpuRenderPass, type TgpuBindGroup } from "typegpu";
import type { PhotorealBattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
import { frontSideGroundIndices } from "../../../game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../shaders/terrainMaterial";
import { createTerrainSurface, terrainLinear } from "./terrainFunctions";
import { type TypegpuEnvironment } from "./environment";

import type { TypegpuRockDetail } from "./rockDetail";
import { Camera, typegpuCameraLayout as cameraLayout } from "./camera";
const terrainLayout = tgpu
  .bindGroupLayout({
    state: { uniform: d.vec4f, visibility: ["fragment"] },
    rock: { texture: d.texture2d(), visibility: ["fragment"] },
    rockSampler: { sampler: "filtering", visibility: ["fragment"] },
    earth: { texture: d.texture2d(), visibility: ["fragment"] },
    linear: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(1);
const geometry = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ position: d.vec3f, normal: d.vec3f, color: d.vec3f, water: d.f32 })),
);
const coverageVertices = tgpu.vertexLayout(d.disarrayOf(d.vec3f)),
  colorVertices = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const Varyings = {
  clip: d.builtin.position,
  position: d.vec3f,
  normal: d.vec3f,
  color: d.vec3f,
  coverage: d.vec3f,
  water: d.f32,
  // Three normalizes this in the vertex stage before interpolated fragment derivatives.
  viewNormalGeometry: d.vec3f,
};
const FragmentIn = {
  clip: d.builtin.position,
  position: d.vec3f,
  normal: d.vec3f,
  color: d.vec3f,
  coverage: d.vec3f,
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
  rockDetail: TypegpuRockDetail,
  ground: Omit<PhotorealBattleGroundMesh, "earthDistance">,
  horizon: BattleHorizonLayout | null,
  options: TerrainMaterialOptions = {},
  mode: "beauty" | "material" | "clay" = "beauty",
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
  const admission = beginGpuAdmission(device);
  const init: Promise<unknown>[] = [];
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
      rockSampler = root.createSampler({
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      }),
      group = root.createBindGroup(terrainLayout, {
        state,
        earth: earth.createView(),
        linear,
        rock: rockDetail.texture.createView(),
        rockSampler,
      });
    const environmentLayout = environment.layout;
    const sampleSunShadow = environment.sampleSunShadow;
    const surface = createTerrainSurface(options);
    const geometryRoughnessFromView = environment.geometryRoughnessFromView;
    const shade = environment.shade;
    const finish =
      mode !== "material"
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
    const vistaOpacity = tgpu.fn([d.vec3f, d.vec3f], d.f32)(vistaOpacityWgsl);
    const farFog = options.vistaBand === "farFog" && mode === "beauty";
    const receiveShadow = !options.vistaBand;
    const clay = mode === "clay";
    const groundShade = tgpu.fragmentFn({ in: FragmentIn, out: d.vec4f })((v) => {
      "use gpu";
      const s = clay
        ? d.vec4f(0.56, 0.56, 0.54, 1)
        : surface(
            v.position,
            v.normal,
            v.color,
            v.coverage,
            v.water,
            cameraLayout.$.cam.time,
            cameraLayout.$.cam.focus,
            terrainLayout.$.state.x,
            terrainLayout.$.earth,
            terrainLayout.$.linear,
            terrainLayout.$.rock,
            terrainLayout.$.rockSampler,
          );
      const face = std.normalize(std.cross(std.dpdx(v.position), std.dpdy(v.position)));
      const normal = clay
        ? std.select(face, std.mul(face, -1), std.dot(face, v.normal) < 0)
        : v.normal;
      const lit = finish(
        s,
        normal,
        v.position,
        cameraLayout.$.cam.eye,
        terrainLayout.$.state.y *
          (receiveShadow ? sampleSunShadow(v.position, std.normalize(normal), v.clip.xy) : 1),
        clay
          ? std.normalize(std.mul(environmentLayout.$.data.worldToView, d.vec4f(normal, 0)).xyz)
          : v.viewNormalGeometry,
      );
      return d.vec4f(lit.rgb, farFog ? vistaOpacity(v.position, cameraLayout.$.cam.eye) : lit.a);
    });
    const vertex = tgpu.vertexFn({
      in: { position: d.vec3f, normal: d.vec3f, color: d.vec3f, coverage: d.vec3f, water: d.f32 },
      out: Varyings,
    })((v) => {
      "use gpu";
      return {
        clip: std.mul(cameraLayout.$.cam.viewProj, d.vec4f(v.position, 1)),
        position: v.position,
        normal: v.normal,
        color: v.color,
        coverage: v.coverage,
        water: v.water,
        viewNormalGeometry: std.normalize(
          std.mul(environmentLayout.$.data.worldToView, d.vec4f(v.normal, 0)).xyz,
        ),
      };
    });
    const pipelineState = {
      targets: {
        format: "rgba16float" as const,
        ...(options.vistaBand === "farFog"
          ? {
              blend: {
                color: {
                  srcFactor: "src-alpha" as const,
                  dstFactor: "one-minus-src-alpha" as const,
                  operation: "add" as const,
                },
                alpha: {
                  srcFactor: "one" as const,
                  dstFactor: "one-minus-src-alpha" as const,
                  operation: "add" as const,
                },
              },
            }
          : {}),
      },
      primitive: {
        topology: "triangle-list" as const,
        cullMode: "back" as const,
        frontFace: "ccw" as const,
      },
      depthStencil: battleWorldDepth(options.vistaBand !== "farFog" ? "read-write" : "read"),
      multisample: { count: sampleCount },
    };
    const groundPipeline = root.createRenderPipeline({
      ...pipelineState,
      attribs: {
        position: geometry.attrib.position,
        normal: geometry.attrib.normal,
        water: geometry.attrib.water,
        coverage: coverageVertices.attrib,
        color: colorVertices.attrib,
      },
      vertex,
      fragment: groundShade,
    });
    const vertices = root
        .createBuffer(geometry.schemaForCount(ground.vertices.length / 10))
        .$usage("vertex"),
      coverage = root
        .createBuffer(coverageVertices.schemaForCount(ground.coverage.length / 3))
        .$usage("vertex"),
      colors = root
        .createBuffer(colorVertices.schemaForCount(ground.surfaceColor.length / 3))
        .$usage("vertex"),
      indices = root.createBuffer(d.arrayOf(d.u32, ground.indices.length)).$usage("index");
    owned.push(vertices, coverage, colors, indices);
    vertices.write(bytes(ground.vertices));
    coverage.write(bytes(ground.coverage));
    colors.write(bytes(ground.surfaceColor));
    indices.write(bytes(frontSideGroundIndices(ground.indices)));
    const boundGround = groundPipeline
      .with(cameraGroup)
      .with(group)
      .with(environment.group)
      .with(geometry, vertices)
      .with(coverageVertices, coverage)
      .with(colorVertices, colors)
      .withIndexBuffer(indices);
    const draws: ((pass: TgpuRenderPass) => void)[] = [
      (pass) => boundGround.with(pass).drawIndexed(ground.indices.length),
    ];
    init.push(groundPipeline.initAsync());
    let drawHorizonShadow = (_pass: TgpuRenderPass, _camera: TgpuBindGroup) => {};
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
      root.unwrap(hv);
      root.unwrap(hi);
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
          coverage: d.vec3f(0),
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
          terrainLayout.$.state.y * sampleSunShadow(v.position, std.normalize(v.normal), v.clip.xy),
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
      const shadowVertex = tgpu.vertexFn({
        in: { position: d.vec3f },
        out: { clip: d.builtin.position },
      })((v) => {
        "use gpu";
        return { clip: std.mul(cameraLayout.$.cam.viewProj, d.vec4f(v.position, 1)) };
      });
      const shadowPipeline = root.createRenderPipeline({
        attribs: { position: geometry.attrib.position },
        vertex: shadowVertex,
        primitive: { topology: "triangle-list", cullMode: "front" },
        depthStencil: battleWorldDepth("read-write"),
      });
      init.push(shadowPipeline.initAsync());
      drawHorizonShadow = (pass, camera) =>
        shadowPipeline
          .with(camera)
          .with(geometry, hv)
          .withIndexBuffer(hi)
          .with(pass)
          .drawIndexed(h.indices.length);
    }
    root.unwrap(vertices);
    root.unwrap(coverage);
    root.unwrap(colors);
    root.unwrap(indices);
    root.unwrap(cameraGroup);
    root.unwrap(group);
    root.unwrap(linear);
    const pipelinesReady = Promise.all(init);
    await Promise.all([pipelinesReady, admission()]);
    return {
      stats: () => ({ groundTriangles: disposed ? null : ground.indices.length / 3 }),
      setState(farStrength: number, shadow = 1) {
        if (disposed) throw Error("TypeGPU terrain disposed");
        state.write(d.vec4f(farStrength, shadow, 0, 0));
      },
      drawHorizonShadow(pass: TgpuRenderPass, camera: TgpuBindGroup) {
        if (disposed) throw Error("TypeGPU terrain disposed");
        drawHorizonShadow(pass, camera);
      },
      draw(pass: TgpuRenderPass, visible = { ground: true, horizon: true }) {
        if (disposed) throw Error("TypeGPU terrain disposed");
        if (visible.ground) draws[0](pass);
        if (visible.horizon) draws[1]?.(pass);
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
    await Promise.allSettled([...init, admission()]);
    dispose();
    throw error;
  }
}
