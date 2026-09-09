import { world3dToScreen } from "@packages/renderer-core/src/cameraUniform";
import { type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import { UNIT_CLASS_BY_KEY, UnitClass } from "../../../../web/src/battle/classData";
import {
  type LabContext,
  LabGroundPass,
  chartCameraSnapshot,
  createConfiguredShell,
  createSkinnedPipeline,
  labGroundFramePass,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const sidearmAppearance = APPEARANCE_DESCRIPTORS.findIndex(
    (descriptor) =>
      descriptor.selection.unitClass === UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry] &&
      descriptor.selection.state === "sidearm",
  );
  // Oblique review pitch: camera3d vertical scale is sin(pitch), so a
  // near-top-down 0.18 collapses soldiers to a few pixels. sin(1.1) ≈ 0.89
  // keeps the full silhouette legible.
  const camera = { x: 0, y: 0, zoom: 92, pitch: 1.1, yaw: 0 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const pipeline = await createSkinnedPipeline(shell);
  const frontClass = UNIT_CLASS_BY_KEY[UnitClass.HeavySword];
  const rearClass = sidearmAppearance;
  const frontY = -0.03;
  const rearY = 0.03;
  const instances: CrowdInstance[] = [
    {
      x: 0,
      y: frontY,
      facing: Math.PI / 2,
      classId: frontClass,
      faction: 0,
      alive: true,

      clip: "idle",
      phase: 0.15,
      seed: 11,
      mounted: false,
      lod: 0,
    },
    {
      x: 0,
      y: rearY,
      facing: Math.PI / 2,
      classId: rearClass,
      faction: 1,
      alive: true,

      clip: "idle",
      phase: 0.15,
      seed: 22,
      mounted: true,
      lod: 0,
    },
  ];
  pipeline.upload(
    instances.map((instance) => ({ ...instance, clip: "idle" })),
    { size: 1.35 },
  );
  const ground = new LabGroundPass(shell, [-4, -3, 8, 6]);
  shell.drawFrame({
    precompute: (encoder) => pipeline.precompute(encoder),
    clear: { r: 0.7, g: 0.78, b: 0.62, a: 1 },
    passes: [
      labGroundFramePass(ground, "skinned-depth-ground"),
      {
        id: "skinned-depth-crowd",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => pipeline.draw(pass),
      },
    ],
  });
  const shellStats = shell.stats();
  const sampleCamera = chartCameraSnapshot(camera, shellStats.width, shellStats.height);
  const [sampleX, sampleY] = world3dToScreen(sampleCamera, -0.52 * 1.35, frontY, 1.36 * 1.35);
  const sample = { x: sampleX, y: sampleY, world: [-0.52 * 1.35, frontY, 1.36 * 1.35] };
  ctx.status.innerHTML = reportTable({
    route: "skinned-depth",
    contract: "front soldier is drawn before rear bucket",
    frontClass,
    rearClass,
    drawCalls: pipeline.stats().drawCalls,
    depth: shellStats.depth.allocated ? shellStats.depth.format : "none",
  });
  publish("skinned-depth", true, {
    ...pipeline.stats(),
    frontClass,
    rearClass,
    hostileDrawOrder: `front-class-${frontClass}-submitted-before-rear-class-${rearClass}`,
    sample,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
  });
}
