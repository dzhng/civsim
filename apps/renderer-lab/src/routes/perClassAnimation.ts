import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import type { ImportedRig, RigChannel } from "@packages/soldier-assets/src/rig";
import { crowdInstance } from "../labFixtures";
import { type LabContext, createConfiguredShell, publish, reportTable } from "../labShell";

// Retime the authored channels, then use the same local producer as real assets.
function stretchRig(rig: ImportedRig, factor: number): ImportedRig {
  const channel = (value: RigChannel | undefined) =>
    value && { ...value, times: value.times.map((time) => time * factor) };
  return {
    ...rig,
    clips: rig.clips.map((clip) => ({
      ...clip,
      duration: clip.duration * factor,
      tracks: Object.fromEntries(
        Object.entries(clip.tracks).map(([joint, track]) => [
          joint,
          { T: channel(track.T), R: channel(track.R), S: channel(track.S) },
        ]),
      ),
    })),
  };
}

export async function route(ctx: LabContext) {
  const appearances = await loadAppearanceCatalog(
    new URL("/assets/soldiers/catalog.json", location.href).href,
  );
  const stretched = stretchRig(appearances[1].rig, 2);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 70,
    pitch: 0.14,
    yaw: 0,
  });
  // A sparse catalog proves IDs are identities, not offsets in a packed list.
  const pipeline = await SkinnedCrowdPipeline.create(shell, {
    0: appearances[0],
    1: { ...appearances[1], rig: stretched, animation: bakeLocalAnimation(stretched) },
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
    route: "per-class-animation",
    rigVariants: pipeline.stats().rigVariants,
    class0Duration: c0.duration,
    class1Duration: c1.duration,
    class5Duration: c5.duration,
    divergence: c1.duration === c0.duration * 2,
    sharedMatches: c5.duration === c0.duration,
  };
  ctx.status.innerHTML = reportTable({
    route: "per-class-animation",
    "rig variants": stats.rigVariants,
    "class 0 march duration": stats.class0Duration,
    "class 1 march duration (2x)": stats.class1Duration,
    "class 5 march duration (shared asset)": stats.class5Duration,
    "per-class divergence": stats.divergence,
    "explicit shared asset": stats.sharedMatches,
  });

  const start = performance.now();
  const tick = () => {
    const seconds = (performance.now() - start) / 1000;
    for (const soldier of soldiers)
      soldier.phase = (seconds / pipeline.classClip(soldier.classId, "march").duration) % 1;
    pipeline.upload(soldiers, { size: 1 });
    shell.drawFrame({
      precompute: (encoder) => pipeline.precompute(encoder),
      passes: [
        {
          id: "per-class-animation",
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
  publish("per-class-animation", true, stats);
}
