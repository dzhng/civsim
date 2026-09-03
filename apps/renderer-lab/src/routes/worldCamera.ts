import { Nested3dFixturePass } from "@packages/game-renderer/src/fixtures/nested3d";
import { projectNestedPoint, worldCameraAnchorAgreement } from "../labCampaign";
import { type LabContext, LabGroundPass, createConfiguredShell, labGroundFramePass, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const mode = ctx.params.get("mode") === "battle" ? "battle" : "campaign";
  // Both modes need the oblique review pitch (> ~0.75) so the nested3d wall
  // occludes the planted-standard sample under the real camera3d projector.
  const camera =
    mode === "battle"
      ? { x: 0, y: -0.6, zoom: 42, pitch: 1.0, yaw: -0.1 }
      : { x: 0, y: -0.6, zoom: 38, pitch: 1.1, yaw: -0.04 };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const nested = new Nested3dFixturePass(shell);
  const ground = new LabGroundPass(shell, [-14, -7, 28, 15]);
  shell.drawFrame({
    passes: [
      labGroundFramePass(ground, "world-camera-ground"),
      {
        id: "world-camera-nested-3d",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => nested.draw(pass),
      },
    ],
  });
  const shellStats = shell.stats();
  const anchorAgreement = worldCameraAnchorAgreement(ctx.canvas, camera, [
    ["city-ground", [-2.62, 0.1, 0.0]],
    ["garrison-ground", [-3.1, -0.72, 0.0]],
    ["rank-ground", [4.3, -1.2, 0.0]],
    ["ring-ground", [-2.2, -0.55, 0.0]],
  ]);
  const nestedStats = nested.stats();
  ctx.status.innerHTML =
    reportTable({
      route: "world-camera",
      status: "shared camera/depth contract",
      mode,
      camera: `pitch ${camera.pitch.toFixed(2)}, yaw ${camera.yaw.toFixed(2)}`,
      depth: shellStats.depth.allocated
        ? `${shellStats.depth.format} ${shellStats.depth.width}x${shellStats.depth.height}`
        : "not allocated",
      cameraWgsl: "packages/renderer-core/src/cameraWgsl.ts",
      maxAnchorDeltaPx: anchorAgreement.maxDelta.toFixed(4),
      nestedFixtures: nestedStats.fixtures.join(", "),
    }) +
    `<p class="renderer-note"><a href="/renderer/world-camera?mode=campaign">campaign camera</a> · <a href="/renderer/world-camera?mode=battle">battle camera</a></p>`;
  publish("world-camera", true, {
    mode,
    camera,
    depth: shellStats.depth,
    framePhases: shellStats.phases,
    nested3d: nestedStats,
    cameraContract: "shared-world-camera-wgsl",
    anchorAgreement,
    samples: {
      occludedLowerStandard: projectNestedPoint(ctx.canvas, camera, [-2.62, 0.1, 1.35]),
      visibleUpperFlag: projectNestedPoint(ctx.canvas, camera, [-1.2, 0.1, 3.7]),
      frontRankOverlap: projectNestedPoint(ctx.canvas, camera, [4.3, -1.2, 1.08]),
    },
  });
}
