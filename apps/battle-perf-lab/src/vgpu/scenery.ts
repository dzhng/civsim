import { draw, geometry, sampler, type Gpu, type FramePass } from "vgpu";
import {
  BATTLE_SCENERY_KINDS,
  packBattleScenery,
} from "../../../../packages/game-renderer/src/battle/sceneryData";
import { SCENERY_PROP_MODELS } from "../../../../packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { buildLeafAtlas } from "../../../../packages/game-renderer/src/models/shared/leafAtlas";
import type { CampaignSceneryInstance } from "../../../../packages/game-renderer/src/campaign/sceneryPass";
import { sceneryShader } from "../shaders/scenery";
import { createVgpuImageTexture } from "./imageTexture";
import type { VgpuEnvironment } from "./environment";
/** Caller lends camera/environment; each bucket owns immutable geometry and replaceable instance buffers. */
export async function createVgpuScenery(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  samples: 1 | 4,
) {
  const releases: (() => void)[] = [];
  const pending = new Set<{ destroy(): void }>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of pending) resource.destroy();
    pending.clear();
    for (const f of releases.reverse()) f();
  };
  try {
    const atlas = buildLeafAtlas();
    const leaf = await createVgpuImageTexture(
      gpu.device.gpu,
      { width: atlas.width, height: atlas.height, data: atlas.rgba },
      { colorSpace: "linear", generateMipmaps: true },
    );
    releases.push(leaf.dispose);
    const leafSampler = sampler(gpu, {
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const beautyShader = sceneryShader(environment.shader, environment.shadows);
    // Full leaf-card source silhouettes use vertex alpha, never atlas opacity.
    const casterShader =
      sceneryShader(environment.casterShader, false).split("fn leafColor")[0] +
      `@fragment fn shadowFragment(v:V)->@location(0) vec4f{if(v.color.a<=0.5){discard;}return vec4f(0);}`;
    const buckets: {
      upload(instances: readonly CampaignSceneryInstance[]): Promise<void>;
      draw(pass: FramePass, cam: typeof camera, audience: "main" | "shadow"): void;
      readonly count: number;
    }[] = [];
    for (const kind of BATTLE_SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build().opaque;
      let capacity = 1,
        count = 0;
      const create = (n: number) =>
        geometry(gpu, {
          buffers: [
            {
              data: Float32Array.from(model.vertices),
              stride: 40,
              attributes: {
                p: { format: "float32x3", offset: 0 },
                n: { format: "float32x3", offset: 12 },
                color: { format: "float32x4", offset: 24 },
              },
            },
            {
              data: model.uvs
                ? Float32Array.from(model.uvs)
                : new Float32Array((model.vertices.length / 10) * 2).fill(-1),
              stride: 8,
              attributes: { uv: "float32x2" },
            },
            {
              data: new Float32Array(n * 4),
              stride: 16,
              stepMode: "instance",
              attributes: { pose: "float32x4" },
            },
            {
              data: new Float32Array(n * 4),
              stride: 16,
              stepMode: "instance",
              attributes: { style: "float32x4" },
            },
          ],
          indices: Uint32Array.from(model.indices),
        });
      let mesh = create(capacity);
      releases.push(() => mesh.destroy());
      const make = (m: typeof mesh) => ({
        beauty: draw(gpu, {
          shader: beautyShader,
          geometry: m,
          set: { cam: camera, leaf: leaf.texture, leafSampler, ...environment.bindings },
          cull: "none",
          depth: { write: true, compare: "greater-equal" },
        }),
        caster: draw(gpu, {
          shader: casterShader,
          geometry: m,
          set: { cam: camera, ...environment.casterBindings },
          cull: "none",
          depth: { write: true, compare: "greater-equal" },
          writeMask: [],
        }),
      });
      let passes = make(mesh);
      const compile = async (p: typeof passes) => {
        await p.beauty.compile({
          colors: ["rgba16float"],
          depth: "depth32float",
          sampleCount: samples,
        });
        await p.caster.compile({ colors: ["rgba8unorm"], depth: "depth32float", sampleCount: 1 });
      };
      await compile(passes);
      buckets.push({
        async upload(instances: readonly CampaignSceneryInstance[]) {
          const data = packBattleScenery(kind, instances);
          if (data.count > capacity) {
            const n = 2 ** Math.ceil(Math.log2(data.count));
            const next = create(n);
            pending.add(next);
            try {
              const draws = make(next);
              await compile(draws);
              if (disposed) throw Error("vgpu scenery disposed during growth");
              mesh.destroy();
              mesh = next;
              passes = draws;
              capacity = n;
              pending.delete(next);
            } catch (e) {
              next.destroy();
              pending.delete(next);
              throw e;
            }
          }
          count = data.count;
          if (count) {
            mesh.buffers[2].write(data.pose);
            mesh.buffers[3].write(data.style);
          }
        },
        draw(pass: FramePass, cam: typeof camera, audience: "main" | "shadow") {
          if (count) {
            const render = audience === "main" ? passes.beauty : passes.caster;
            render.set({ cam });
            pass.draw(render, { instances: count });
          }
        },
        get count() {
          return count;
        },
      });
    }
    return {
      async upload(instances: readonly CampaignSceneryInstance[]) {
        if (disposed) throw Error("vgpu scenery disposed");
        for (const b of buckets) await b.upload(instances);
      },
      draw(pass: FramePass, cam: typeof camera = camera, audience: "main" | "shadow" = "main") {
        if (disposed) throw Error("vgpu scenery disposed");
        for (const b of buckets) b.draw(pass, cam, audience);
      },
      stats: () => ({ scenery: buckets.reduce((n, b) => n + b.count, 0) }),
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
