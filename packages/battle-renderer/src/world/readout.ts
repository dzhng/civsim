import { battleDepthBypass } from "../worldDepth";
import { tgpu, d, type TgpuRenderPass } from "typegpu";
import {
  QUAD,
  QUAD_INDEX,
  type BattleReadoutInstance,
} from "../../../game-renderer/src/battle/readoutData";
import { readoutVertexBodyWgsl, readoutFragmentBodyWgsl } from "../shaders/readout";
import { readoutCamera } from "../readoutCamera";
import { prepareReadouts } from "../readoutPreparation";
import { beginGpuAdmission } from "../gpuAdmission";
const Camera = d.struct({
  vp: d.mat4x4f,
  right: d.vec4f,
  up: d.vec4f,
  eye: d.vec4f,
  forward: d.vec4f,
});
const cameraLayout = tgpu.bindGroupLayout({ camera: { uniform: Camera } }).$idx(0);
const atlasLayout = tgpu
  .bindGroupLayout({ atlas: { texture: d.texture2d() }, linear: { sampler: "filtering" } })
  .$idx(1);
const quadLayout = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const instanceLayout = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance");
const cellLayout = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance");
const sizeLayout = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance");
const V = d.struct({ clip: d.vec4f, uv: d.vec2f });
/** Borrowed device; typed resources and admission precede each published replacement. */
export async function createTypegpuReadout(device: GPUDevice, samples: 1 | 4) {
  const root = tgpu.initFromDevice({ device }),
    owned: { destroy(): void }[] = [],
    pending = new Set<{ destroy(): void }>();
  let disposed = false,
    busy = false;
  const own = <T extends { destroy(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of pending) r.destroy();
    pending.clear();
    for (const r of owned.reverse()) r.destroy();
    root.destroy();
  };
  const initial = beginGpuAdmission(device);
  try {
    const camera = own(root.createBuffer(Camera).$usage("uniform")),
      cameraGroup = root.createBindGroup(cameraLayout, { camera });
    const quad = own(root.createBuffer(quadLayout.schemaForCount(4)).$usage("vertex"));
    quad.write(QUAD.slice().buffer);
    const index = own(root.createBuffer(d.arrayOf(d.u32, 6), QUAD_INDEX).$usage("index"));
    const linear = root.createSampler({ minFilter: "linear", magFilter: "linear" });
    const algorithm = tgpu
      .fn(
        [d.vec3f, d.vec4f, d.vec4f, d.vec4f],
        V,
      )(`(quad:vec3f,chip0:vec4f,chip1:vec4f,cell:vec4f)->V{${readoutVertexBodyWgsl}}`)
      .$uses({
        V,
        get camera() {
          return cameraLayout.$.camera;
        },
      });
    const shade = tgpu
      .fn(
        [V],
        d.vec4f,
      )(`(v:V)->vec4f{${readoutFragmentBodyWgsl}}`)
      .$uses({
        V,
        get atlas() {
          return atlasLayout.$.atlas;
        },
        get linear() {
          return atlasLayout.$.linear;
        },
      });
    const pipeline = root.createRenderPipeline({
      attribs: {
        quad: quadLayout.attrib,
        chip0: instanceLayout.attrib,
        chip1: sizeLayout.attrib,
        cell: cellLayout.attrib,
      },
      vertex: tgpu.vertexFn({
        in: { quad: d.vec3f, chip0: d.vec4f, chip1: d.vec4f, cell: d.vec4f },
        out: { clip: d.builtin.position, uv: d.vec2f },
      })((v) => {
        "use gpu";
        const r = algorithm(v.quad, v.chip0, v.chip1, v.cell);
        return { clip: r.clip, uv: r.uv };
      }),
      fragment: tgpu.fragmentFn({ in: { clip: d.builtin.position, uv: d.vec2f }, out: d.vec4f })(
        (v) => {
          "use gpu";
          return shade(V({ clip: v.clip, uv: v.uv }));
        },
      ),
      targets: { format: "rgba16float" },
      primitive: { cullMode: "none" },
      depthStencil: battleDepthBypass(),
      multisample: { count: samples },
    });
    root.unwrap(camera);
    root.unwrap(cameraGroup);
    root.unwrap(linear);
    root.unwrap(quad);
    root.unwrap(index);
    const compiled = pipeline.initAsync();
    await Promise.all([compiled, initial()]);
    let current: ReturnType<typeof prepareReadouts> | undefined,
      atlas: ReturnType<typeof makeAtlas> | undefined,
      buffers: ReturnType<typeof makeBuffers> | undefined,
      spare: { value: ReturnType<typeof makeBuffers>; capacity: number } | undefined,
      capacity = 0,
      count = 0,
      atlasUploads = 0,
      atlasUploadBytes = 0,
      instanceUploadBytes = 0;
    function makeAtlas(canvas: HTMLCanvasElement) {
      const t = root
        .createTexture({ size: [canvas.width, canvas.height], format: "rgba8unorm-srgb" })
        .$usage("sampled", "render");
      pending.add(t);
      root.unwrap(t);
      t.write(canvas);
      const group = root.createBindGroup(atlasLayout, { atlas: t.createView(), linear });
      root.unwrap(group);
      return { texture: t, group };
    }
    function makeBuffers(n: number) {
      const a = root.createBuffer(instanceLayout.schemaForCount(n)).$usage("vertex"),
        b = root.createBuffer(sizeLayout.schemaForCount(n)).$usage("vertex"),
        c = root.createBuffer(cellLayout.schemaForCount(n)).$usage("vertex");
      for (const x of [a, b, c]) {
        pending.add(x);
        root.unwrap(x);
      }
      return { a, b, c };
    }
    const releaseBuffers = (b: ReturnType<typeof makeBuffers> | undefined) => {
      if (b) for (const x of [b.a, b.b, b.c]) x.destroy();
    };
    return {
      async upload(instances: readonly BattleReadoutInstance[]) {
        if (disposed || busy) throw Error("Readout disposed or upload already pending");
        const next = prepareReadouts(instances, current);
        busy = true;
        const finish = beginGpuAdmission(device);
        let nextAtlas: typeof atlas, nextBuffers: typeof buffers;
        try {
          if (!atlas || next.key !== current?.key) nextAtlas = makeAtlas(next.canvas);
          let nextCapacity = Math.max(128, 2 ** Math.ceil(Math.log2(Math.max(1, next.count))));
          if (spare && spare.capacity >= nextCapacity) {
            nextBuffers = spare.value;
            nextCapacity = spare.capacity;
            spare = undefined;
            for (const x of [nextBuffers.a, nextBuffers.b, nextBuffers.c]) pending.add(x);
          } else nextBuffers = makeBuffers(nextCapacity);
          if (next.count) {
            nextBuffers.a.write(next.chip0.buffer);
            nextBuffers.b.write(next.chip1.buffer);
            nextBuffers.c.write(next.chipUv.buffer);
          }
          await finish();
          if (disposed) throw Error("Readout disposed during admission");
          if (nextAtlas) {
            atlas?.texture.destroy();
            atlas = nextAtlas;
            pending.delete(atlas.texture);
            atlasUploads++;
            atlasUploadBytes += next.canvas.width * next.canvas.height * 4;
          }
          if (nextBuffers) {
            releaseBuffers(spare?.value);
            spare = buffers ? { value: buffers, capacity } : undefined;
            buffers = nextBuffers;
            capacity = nextCapacity;
            for (const x of [buffers.a, buffers.b, buffers.c]) pending.delete(x);
          }
          current = next;
          count = next.count;
          instanceUploadBytes += count * 48;
        } catch (error) {
          for (const r of pending) r.destroy();
          pending.clear();
          await finish();
          throw error;
        } finally {
          busy = false;
        }
      },
      setCamera(vp: ArrayLike<number>, world: ArrayLike<number>) {
        if (disposed) throw Error("Readout disposed");
        camera.write(readoutCamera(vp, world).buffer);
      },
      draw(pass: TgpuRenderPass) {
        if (disposed || busy) throw Error("Readout unavailable");
        if (count)
          pipeline
            .with(cameraGroup)
            .with(atlas!.group)
            .with(quadLayout, quad)
            .with(instanceLayout, buffers!.a)
            .with(sizeLayout, buffers!.b)
            .with(cellLayout, buffers!.c)
            .withIndexBuffer(index)
            .with(pass)
            .drawIndexed(6, count);
      },
      stats: () => ({
        readouts: current?.readouts ?? 0,
        chips: count,
        atlasWidth: current?.canvas.width ?? 1,
        atlasHeight: current?.canvas.height ?? 1,
        atlasUploads,
        atlasUploadBytes,
        instanceUploadBytes,
        instanceBufferBytes: (capacity + (spare?.capacity ?? 0)) * 48,
      }),
      dispose() {
        if (disposed) return;
        atlas?.texture.destroy();
        releaseBuffers(buffers);
        releaseBuffers(spare?.value);
        dispose();
      },
    };
  } catch (error) {
    dispose();
    await initial();
    throw error;
  }
}
