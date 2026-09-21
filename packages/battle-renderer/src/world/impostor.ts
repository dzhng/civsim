import { battleWorldDepth } from "../worldDepth";
import { typegpuTextureBytes } from "./textureUpload";
import {
  impostorAtlasLayout,
  type ImpostorAtlasData,
} from "../../../soldier-assets/src/impostorAtlas";
import {
  tgpu,
  d,
  std,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRenderCommands,
} from "typegpu";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import type { ImpostorView } from "../impostorData";
import { impostorVertexWgsl, impostorSurfaceWgsl } from "../shaders/impostor";
import { factionAccent } from "../shaders/soldierFactionTyped";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
import {
  IMPOSTOR_STATE_FLOATS,
  ImpostorRecord,
  type ImpostorRecordValue,
  ImpostorState,
  ImpostorViewBlock,
  impostorDerivation,
  impostorViewBlock,
  writeImpostorState,
} from "./impostorDerivation";

const stateLayout = tgpu.vertexLayout((n) => d.arrayOf(ImpostorState, n), "instance");
const bindings = tgpu
  .bindGroupLayout({
    view: { uniform: ImpostorViewBlock, visibility: ["vertex"] },
    albedo: { texture: d.texture2d(), visibility: ["fragment"] },
    normal: { texture: d.texture2d(), visibility: ["fragment"] },
    orm: { texture: d.texture2d(), visibility: ["fragment"] },
    linear: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(1);
const ImpostorVertex = d.struct({ world: d.vec3f, uv: d.vec2f, properties: d.vec4f });
const ImpostorSurface = d.struct({
  base: d.vec3f,
  normal: d.vec3f,
  roughness: d.f32,
  metal: d.f32,
  ao: d.f32,
});
/** The diagnostic stage's group size. It dispatches over the installed soldier buffer and
 * guards on its actual length, so a capacity that is not a multiple of it is still safe. */
const RECORD_WORKGROUP = 64;
const vertexAlgorithm = tgpu
  .fn(
    [d.u32, d.vec4f, d.vec4f, d.f32, d.vec3f, d.vec3f],
    ImpostorVertex,
  )(impostorVertexWgsl)
  .$uses({ ImpostorVertex });

/** Owns atlas uploads and instance data; device, camera and typed environment are borrowed.
 * TypeGPU owns resource creation, uploads, pipeline compilation and draw encoding. */
export async function createTypegpuImpostors(
  device: GPUDevice,
  atlas: ImpostorAtlasData,
  environment: TypegpuEnvironment,
  samples = 4,
  /** Opt-in, and off for every frame path: admits the soldier buffer as storage as well
   *  as vertex input so `readRecords` can run the derivation over it. Nothing else about
   *  the layer changes, and the diagnostic's own resources are still built on first use. */
  recordDiagnostics = false,
) {
  const root = tgpu.initFromDevice({ device });
  const placement = impostorAtlasLayout(atlas);
  const owned: { destroy(): void }[] = [];
  let disposed = false,
    count = 0,
    capacity = 512,
    staging = new Float32Array(0);
  /** Bumped by every publication of state or view: what a readback has to still match. */
  let published = 0;
  let scopesOpen = false;
  const closeScopes = async () => {
    if (!scopesOpen) return;
    scopesOpen = false;
    const results = await Promise.allSettled([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);
    const errors = results.flatMap((r) =>
      r.status === "rejected" ? [String(r.reason)] : r.value ? [r.value.message] : [],
    );
    if (errors.length) throw new Error(`TypeGPU impostor admission: ${errors.join("; ")}`);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("TypeGPU impostors disposed");
  };
  try {
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("internal");
    device.pushErrorScope("validation");
    scopesOpen = true;
    const createStates = (size: number) => {
      const buffer = root.createBuffer(stateLayout.schemaForCount(size));
      return recordDiagnostics ? buffer.$usage("vertex", "storage") : buffer.$usage("vertex");
    };
    let states = createStates(capacity);
    owned.push(states);
    const viewBlock = root.createBuffer(ImpostorViewBlock).$usage("uniform");
    owned.push(viewBlock);
    const width = atlas.columns * atlas.tileSize,
      height = atlas.rows * atlas.tileSize,
      levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const upload = (chain: readonly Uint8Array[], format: "rgba8unorm" | "rgba8unorm-srgb") => {
      if (chain.length !== levels) throw new Error("Impostor atlas requires complete mip chains");
      const texture = root
        .createTexture({ size: [width, height], format, mipLevelCount: levels })
        .$usage("sampled");
      owned.push(texture);
      chain.forEach((bytes, mip) => {
        if (bytes.length !== Math.max(1, width >> mip) * Math.max(1, height >> mip) * 4)
          throw new Error("Impostor mip dimensions mismatch");
        texture.write(typegpuTextureBytes(bytes), mip);
      });
      return texture;
    };
    const albedo = upload(atlas.albedo, "rgba8unorm-srgb"),
      normal = upload(atlas.normal, "rgba8unorm"),
      orm = upload(atlas.orm, "rgba8unorm");
    const group = root.createBindGroup(bindings, {
      view: viewBlock,
      albedo: albedo.createView(),
      normal: normal.createView(),
      orm: orm.createView(),
      linear: root.createSampler({
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
      }),
    });
    const surfaceAlgorithm = tgpu
      .fn(
        [d.vec2f, d.vec4f, d.texture2d(), d.texture2d(), d.texture2d(), d.sampler()],
        ImpostorSurface,
      )(impostorSurfaceWgsl(atlas.columns, atlas.rows))
      .$uses({ ImpostorSurface, factionAccent });
    const { deriveImpostorRecord } = impostorDerivation(placement);
    const vertex = tgpu.vertexFn({
      in: {
        index: d.builtin.vertexIndex,
        position: d.vec2f,
        facing: d.f32,
        faction: d.f32,
        elevation: d.f32,
        living: d.f32,
      },
      out: { position: d.builtin.position, world: d.vec3f, uv: d.vec2f, properties: d.vec4f },
    })((input) => {
      "use gpu";
      const record = deriveImpostorRecord(
        ImpostorState({
          position: input.position,
          facing: input.facing,
          faction: input.faction,
          elevation: input.elevation,
          living: input.living,
        }),
        bindings.$.view,
      );
      const v = vertexAlgorithm(
        input.index,
        d.vec4f(record.anchor, record.faction),
        d.vec4f(record.tile, record.span, record.span, record.angle),
        record.living,
        bindings.$.view.right,
        bindings.$.view.up,
      );
      return {
        position: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.world, 1)),
        world: v.world,
        uv: v.uv,
        properties: v.properties,
      };
    });
    const shade = environment.shade;
    const fragment = tgpu.fragmentFn({
      in: { world: d.vec3f, uv: d.vec2f, properties: d.vec4f },
      out: d.vec4f,
    })((v) => {
      "use gpu";
      const s = surfaceAlgorithm(
        v.uv,
        v.properties,
        bindings.$.albedo,
        bindings.$.normal,
        bindings.$.orm,
        bindings.$.linear,
      );
      return shade(
        s.base,
        d.vec3f(0),
        s.roughness,
        0,
        s.metal,
        s.ao,
        s.normal,
        v.world,
        1,
        typegpuCameraLayout.$.cam.eye,
      );
    });
    const pipeline = root
      .createRenderPipeline({
        vertex,
        fragment,
        attribs: stateLayout.attrib,
        targets: { format: "rgba16float" },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: battleWorldDepth("read-write"),
        multisample: { count: samples },
      })
      .with(group)
      .with(environment.group);
    await Promise.all([pipeline.initAsync(), closeScopes()]);
    /** The camera-independent half: six floats a soldier owns until it is submitted again. */
    const updateState = (source: readonly CrowdInstance[]) => {
      assertLive();
      published++;
      count = source.length;
      if (count > capacity) {
        states.destroy();
        capacity = Math.max(count, capacity * 2);
        states = createStates(capacity);
        owned.push(states);
      }
      if (!count) return;
      if (staging.length !== count * IMPOSTOR_STATE_FLOATS)
        staging = new Float32Array(count * IMPOSTOR_STATE_FLOATS);
      for (let i = 0; i < count; i++)
        writeImpostorState(source[i], staging, i * IMPOSTOR_STATE_FLOATS);
      states.write(staging.buffer);
    };
    /** The whole camera dependency. A moving camera writes this and nothing else,
     *  whatever the population: the record itself is derived in the vertex stage. */
    const setView = (camera: ImpostorView) => {
      assertLive();
      viewBlock.write(impostorViewBlock(camera));
      published++;
    };
    const recordLayout = tgpu.bindGroupLayout({
      view: { uniform: ImpostorViewBlock },
      states: { storage: (n: number) => d.arrayOf(ImpostorState, n), access: "readonly" },
      records: { storage: (n: number) => d.arrayOf(ImpostorRecord, n), access: "mutable" },
    });
    const recordEntry = tgpu.computeFn({
      workgroupSize: [RECORD_WORKGROUP],
      in: { id: d.builtin.globalInvocationId },
    })(({ id }) => {
      "use gpu";
      if (id.x < std.arrayLength(recordLayout.$.states))
        recordLayout.$.records[id.x] = deriveImpostorRecord(
          recordLayout.$.states[id.x],
          recordLayout.$.view,
        );
    });
    const createRecords = (size: number) =>
      root.createBuffer(d.arrayOf(ImpostorRecord, size)).$usage("storage");
    let recordPipeline: ReturnType<typeof root.createComputePipeline> | undefined;
    let diagnostic:
      | { states: typeof states; records: ReturnType<typeof createRecords>; group: TgpuBindGroup }
      | undefined;
    /** Diagnostic only. The records the buffers currently installed on this layer actually
     *  produce: `recordEntry` closes over the SAME `deriveImpostorRecord` the
     *  vertex entry compiles, and reads the SAME soldier buffer and view block the draw
     *  binds. Its resources are built on first call and rebuilt whenever growth replaces
     *  the soldier buffer, so a stale binding cannot answer for the live one; a submission
     *  or a camera write that lands while the readback is in flight fails rather than
     *  returning records no installed state ever had. Nothing in `draw` reaches here. */
    const readRecords = async (): Promise<ImpostorRecordValue[]> => {
      assertLive();
      if (!recordDiagnostics)
        throw new Error("TypeGPU impostors were admitted without record diagnostics");
      if (!count) return [];
      recordPipeline ??= root.createComputePipeline({ compute: recordEntry });
      if (diagnostic?.states !== states) {
        diagnostic?.records.destroy();
        const records = createRecords(capacity);
        owned.push(records);
        const group = root.createBindGroup(recordLayout, {
          view: viewBlock,
          // `recordDiagnostics` is what gave this buffer its storage usage, and the guard
          // above already rejected a layer admitted without it.
          states: states as typeof states & StorageFlag,
          records,
        });
        diagnostic = { states, records, group };
      }
      const installed = published;
      const encoder = root["~unstable"].createCommandEncoder();
      recordPipeline
        .with(diagnostic.group)
        .with(encoder)
        .dispatchWorkgroups(Math.ceil(count / RECORD_WORKGROUP));
      encoder.submit();
      const values = await diagnostic.records.read().catch((error: unknown) => {
        assertLive();
        throw error;
      });
      assertLive();
      if (published !== installed)
        throw new Error("TypeGPU impostor records: state or view was republished during readback");
      return values.slice(0, count);
    };
    return {
      updateState,
      setView,
      readRecords,
      draw(pass: TgpuRenderCommands, camera: TgpuBindGroup) {
        assertLive();
        if (count) pipeline.with(camera).with(stateLayout, states).with(pass).draw(6, count);
      },
      stats: () => ({
        instances: count,
        draws: count ? 1 : 0,
        clipInvariant: false,
        castShadow: false,
        receiveShadow: false,
        atlasSource: "prepared full mip chain",
      }),
      dispose,
    };
  } catch (error) {
    try {
      await closeScopes();
    } finally {
      dispose();
    }
    throw error;
  }
}
