import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";
import { SoldierShadowDecalPass } from "@packages/renderer-core/src/soldierShadowPass";
import {
  type LabContext,
  createConfiguredShell,
  createSkinnedPipeline,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  // A smooth ridge centered at x=0 — soldiers climb up and over it.
  const ridge = (x: number, _y: number) => 2.2 * Math.exp(-(x * x) / 36);
  const cols = 14;
  const rows = 3;
  const positions = new Float32Array(cols * rows * 2);
  const soldierUnit = new Uint32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 2] = (c - (cols - 1) / 2) * 2.4;
      positions[i * 2 + 1] = (r - (rows - 1) / 2) * 2.0;
    }
  }
  const built = buildCrowdInstances({
    positions,
    soldierUnit,
    playback: Array.from({ length: cols * rows }, () => ({
      appearanceId: 0,
      base: {
        source: { kind: "clip", sample: { clip: "march", phase: 0 } },
        destination: { clip: "march", phase: 0 },
        weight: 1,
      },
    })),
    terrainHeight: ridge,
  });
  const instances = built.instances.map((inst) => ({ ...inst, facing: Math.PI / 2 }));

  // The elevation each instance received must equal the sampled terrain height.
  const elevationMatches = instances.every(
    (inst) => Math.abs((inst.elevation ?? 0) - ridge(inst.x, inst.y)) < 1e-6,
  );
  const elevationSpan =
    Math.max(...instances.map((i) => i.elevation ?? 0)) -
    Math.min(...instances.map((i) => i.elevation ?? 0));

  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 26,
    pitch: 0.3,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell);
  const shadows = new SoldierShadowDecalPass(shell);

  const start = performance.now();
  const tick = () => {
    const phaseOffset = ((performance.now() - start) / 1000) * 0.6;
    pipeline.upload(
      instances.map((instance) => ({
        ...instance,
        clip: "march",
        phase: (instance.phase + phaseOffset) % 1,
      })),
      { size: 1 },
    );
    shadows.upload(instances);
    shell.drawFrame({
      precompute: (encoder) => pipeline.precompute(encoder),
      passes: [
        {
          id: "elevation-crowd",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
        {
          id: "elevation-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => shadows.draw(pass),
        },
      ],
    });
    requestAnimationFrame(tick);
  };
  tick();
  ctx.status.innerHTML = reportTable({
    route: "battle-elevation",
    soldiers: instances.length,
    "elevation matches terrain": elevationMatches,
    "elevation span": elevationSpan.toFixed(2),
    shadows: shadows.stats().shadows,
  });
  publish("battle-elevation", true, {
    route: "battle-elevation",
    soldiers: instances.length,
    elevationMatches,
    elevationSpan,
    shadows: shadows.stats().shadows,
  });
}
