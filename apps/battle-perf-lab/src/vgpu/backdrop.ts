import { draw, geometry, target, frame, type Gpu, type FramePass } from "vgpu";
import type { VgpuEnvironment } from "./environment";
import { backdropShader, type BackdropKind } from "../../../../packages/battle-renderer/src/shaders/backdrop";
import { BACKDROP_INDICES, backdropVertices, type BackdropRect } from "../../../../packages/battle-renderer/src/backdropData";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { destroyVgpuTarget } from "./targetLifetime";
/** Public library buffers/pipelines/draws; caller owns context, camera, and environment. */
export async function createVgpuBackdrop(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  samples: 1 | 4,
) {
  const owned: { destroy(): void }[] = [];
  let disposed = false;
  const own = <T extends { destroy(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  const check = () => {
    if (disposed) throw Error("Backdrop disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
  };
  const finish = beginGpuAdmission(gpu.device.gpu);
  try {
    const backdrop = own(gpu.device.createBuffer({ size: 48, usage: ["vertex", "copy_dst"] }));
    const terrain = own(gpu.device.createBuffer({ size: 48, usage: ["vertex", "copy_dst"] }));
    const indices = own(gpu.device.createBuffer({ size: 12, usage: ["index", "copy_dst"] }));
    indices.write(BACKDROP_INDICES);
    const meshes = [backdrop, terrain].map((buffer) =>
      own(
        geometry(gpu, {
          vertexCount: 4,
          buffers: [{ buffer: buffer.gpu, stride: 12, attributes: { p: "float32x3" } }],
          indexBuffer: indices.gpu,
          indexFormat: "uint16",
          indexCount: 6,
        }),
      ),
    );
    const draws = (["backdrop", "default", "wide-detail"] as const).map((kind, i) =>
      draw(gpu, {
        shader: backdropShader(environment.shader, kind),
        geometry: meshes[i === 0 ? 0 : 1],
        set: { cam: camera, ...environment.bindings },
        cull: "back",
        depth: { write: false, compare: "always" },
      }),
    );
    const compilation = Promise.all(
      draws.map((d) =>
        d.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples }),
      ),
    );
    await Promise.all([finish(), compilation]);
    // Compile does not materialize vgpu bind groups. Admit them once through public Frame encoding.
    const admit = beginGpuAdmission(gpu.device.gpu);
    let admissionTarget: ReturnType<typeof target> | undefined;
    try {
      admissionTarget = target(gpu, {
        size: [1, 1],
        format: "rgba16float",
        depth: "depth32float",
        msaa: samples === 4,
      });
      const output = admissionTarget;
      const submission = frame(gpu, (current) =>
        current.pass({ target: output, clear: [0, 0, 0, 0], clearDepth: 0 }, (pass) => {
          for (const d of draws) pass.draw(d);
        }),
      );
      await Promise.all([admit(), submission.done]);
    } finally {
      try {
        await admit();
      } finally {
        if (admissionTarget) destroyVgpuTarget(admissionTarget);
      }
    }
    let style: "default" | "wide-detail" = "default";
    return {
      setRects(terrainRect: BackdropRect, backdropRect: BackdropRect) {
        check();
        terrain.write(backdropVertices(terrainRect));
        backdrop.write(backdropVertices(backdropRect));
      },
      setStyle(value: "default" | "wide-detail") {
        check();
        style = value;
      },
      draw(pass: FramePass, only?: BackdropKind) {
        check();
        for (const kind of only ? [only] : (["backdrop", style] as const))
          pass.draw(draws[kind === "backdrop" ? 0 : kind === "default" ? 1 : 2]);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    await finish();
    throw error;
  }
}
