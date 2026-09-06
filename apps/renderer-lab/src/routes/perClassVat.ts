import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { type VatBake, type VatClip } from "@packages/soldier-assets/src/schema";
import { crowdInstance } from "../labFixtures";
import { type LabContext, createConfiguredShell, publish, reportTable } from "../labShell";

// A distinct VAT for a class: every clip's frame count scaled by `factor`
// (columns duplicated, poses preserved) so its clip table — and therefore its
// per-class playback rate — differs from the shared placeholder.
function stretchVat(vat: VatBake, factor: number): VatBake {
  const clips: VatClip[] = [];
  const colMap: number[] = [];
  let start = 0;
  for (const clip of vat.clips) {
    const frames = clip.frames * factor;
    clips.push({ ...clip, start, frames, duration: clip.duration * factor });
    for (let f = 0; f < frames; f++) colMap.push(clip.start + Math.floor(f / factor));
    start += frames;
  }
  const width = start;
  const data = new Array<number>(width * vat.height * 4);
  for (let row = 0; row < vat.height; row++) {
    for (let col = 0; col < width; col++) {
      const src = colMap[col];
      for (let k = 0; k < 4; k++)
        data[(row * width + col) * 4 + k] = vat.data[(row * vat.width + src) * 4 + k];
    }
  }
  return { ...vat, width, clips, data };
}

export async function route(ctx: LabContext) {
  const appearances = await loadAppearanceCatalog(new URL("/assets/soldiers/catalog.json", location.href).href);
  const stretched = stretchVat(appearances[1].animation, 2);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 70,
    pitch: 0.14,
    yaw: 0,
  });
  // A sparse catalog proves IDs are identities, not offsets in a packed list.
  const pipeline = new SkinnedCrowdPipeline(shell, {
    0: appearances[0],
    1: { ...appearances[1], animation: stretched },
    5: appearances[5],
  });
  const soldiers = [
    crowdInstance(-3.4, 0, 0, "march"),
    crowdInstance(0, 1, 1, "march"),
    crowdInstance(3.4, 5, 0, "march"),
  ];

  const c0 = pipeline.classClip(0, "march");
  const c1 = pipeline.classClip(1, "march");
  const c5 = pipeline.classClip(5, "march");
  const stats = {
    route: "per-class-vat",
    vatVariants: pipeline.stats().vatVariants,
    class0Frames: c0.frames,
    class1Frames: c1.frames,
    class5Frames: c5.frames,
    divergence: c1.frames === c0.frames * 2,
    sharedMatches: c5.frames === c0.frames,
  };
  ctx.status.innerHTML = reportTable({
    route: "per-class-vat",
    "VAT variants": stats.vatVariants,
    "class 0 march frames": stats.class0Frames,
    "class 1 march frames (2x VAT)": stats.class1Frames,
    "class 5 march frames (shared asset)": stats.class5Frames,
    "per-class divergence": stats.divergence,
    "explicit shared asset": stats.sharedMatches,
  });

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(soldiers, { forcedClip: "march", phaseOffset, size: 1 });
    shell.drawFrame({
      passes: [
        {
          id: "per-class-vat",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  publish("per-class-vat", true, stats);
}
