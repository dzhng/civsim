import { STANDARD_SIZE_TIER_IDS, standardSeed, standardWindPhase, standardWindStrength, type StandardSizeTier } from "@packages/game-renderer/src/models/shared/standardAsset";
import { SharedStandardPass, type StandardInstance } from "@packages/game-renderer/src/models/shared/standardPass";
import { type ChartCameraSpec } from "@packages/renderer-core/src/camera3d";
import { type LabContext, LabGroundPass, createConfiguredShell, labGroundFramePass, numberParam, publish, reportTable } from "../labShell";

// Shared standard review: one gate per size tier x faction livery. The route
// deliberately consumes the shared asset/pass, not the campaign army marker or
// DOM banner approximations, so slices 11/13 can port the same contract.
// Review-only config (cameras, gate table) lives here; the asset module carries
// only the production contract.
const STANDARD_REVIEW_FACTIONS = ["azure", "crimson"] as const;

// The look-at point sits on the ground plane, so a tall standard extends
// up-screen from its base: aim north of the pole by ~cloth mid-height
// (compensated through the pitch) to center the flag, and zoom so the full
// pole + finial fills the frame height with margin.
const STANDARD_REVIEW_CAMERA_BY_TIER: Record<StandardSizeTier, ChartCameraSpec> = {
  "battle-unit": { x: 0.05, y: 4.4, zoom: 90, pitch: 1.08, yaw: -0.05 },
  "campaign-army": { x: 0.05, y: 5.1, zoom: 68, pitch: 1.08, yaw: -0.05 },
  "settlement-banner": { x: 0.05, y: 8.1, zoom: 53, pitch: 1.08, yaw: -0.05 },
};

const STANDARD_REVIEW_GATES = STANDARD_SIZE_TIER_IDS.flatMap((tier) =>
  STANDARD_REVIEW_FACTIONS.map((factionId) => ({
    id: `${tier}-${factionId}`,
    tier,
    factionId,
    camera: STANDARD_REVIEW_CAMERA_BY_TIER[tier],
    windPhase: standardWindPhase(standardSeed(tier, factionId)),
    windStrength: standardWindStrength(tier),
    timeSeconds: 0.75,
  })),
);

export async function route(ctx: LabContext) {
  const gate =
    STANDARD_REVIEW_GATES.find((candidate) => candidate.id === ctx.params.get("gate")) ??
    STANDARD_REVIEW_GATES[0];
  const timeSeconds = numberParam(ctx.params, "time", gate.timeSeconds);
  const shell = await createConfiguredShell(ctx.canvas, gate.camera);
  shell.setTime(timeSeconds);
  const standards = new SharedStandardPass(shell);
  const instance: StandardInstance = {
    x: 0,
    y: 0,
    tier: gate.tier,
    factionId: gate.factionId,
    yaw: -0.02,
    windPhase: gate.windPhase,
    windStrength: numberParam(ctx.params, "windStrength", gate.windStrength),
  };
  standards.upload([instance]);
  const ground = new LabGroundPass(shell, [-9, -6, 18, 13]);
  shell.drawFrame({
    clear: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    passes: [
      labGroundFramePass(ground, "shared-standard-ground"),
      {
        id: "shared-standard-opaque",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => standards.drawOpaque(pass),
      },
      {
        id: "shared-standard-shadow",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => standards.drawShadows(pass),
      },
    ],
  });
  const stats = standards.stats();
  ctx.status.innerHTML = reportTable({
    route: "shared-standard-models",
    gate: gate.id,
    tier: gate.tier,
    faction: gate.factionId,
    purpose: "isolated shared 3D standard model sheet",
    timeSeconds: timeSeconds.toFixed(2),
    windPhase: gate.windPhase.toFixed(3),
    windStrength: instance.windStrength?.toFixed(3) ?? gate.windStrength.toFixed(3),
    renderer: "raw WebGPU shared standard asset",
  });
  publish("shared-standard-models", true, {
    route: "shared-standard-models",
    gate: gate.id,
    tier: gate.tier,
    faction: gate.factionId,
    camera: gate.camera,
    timeSeconds,
    windPhase: gate.windPhase,
    windStrength: instance.windStrength ?? gate.windStrength,
    reviewGates: STANDARD_REVIEW_GATES.map((reviewGate) => reviewGate.id),
    ...stats,
    cameraContract: shell.stats().cameraContract,
    depth: shell.stats().depth,
    framePhases: shell.stats().phases,
    postCutoverScreenshots: "renderer-only",
  });
}
