import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { assignCrowdLodLevels, lodWithHysteresis } from "@packages/crowd-runtime/src/lod";
import { projectionFootprint, viewMatrix, projMatrix } from "@packages/renderer-core/src/camera3d";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { crowdInstance } from "../labFixtures";
import {
  type LabContext,
  animateSkinned,
  createConfiguredShell,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const appearances = await loadAppearanceCatalog(
    new URL("/assets/soldiers/catalog.json", location.href).href,
  );
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 40,
    pitch: 0.18,
    yaw: 0,
  });
  const pipeline = await SkinnedCrowdPipeline.create(shell, appearances);

  // Three soldiers side by side, explicitly L0/L1/L2, so detail reduction is
  // directly reviewable.
  const lineup = [0, 1, 2].map((lod) => ({
    ...crowdInstance(
      (lod - 1) * 2.6,
      0,
      0,
      appearances[0].manifest.presentation!.actions.atEase!.clip,
    ),
    lod,
  }));
  const triCounts = appearances[0].tiers.map((mesh) => mesh.indices.length / 3);

  // The distance algorithm: a line of instances receding from the camera focus
  // must coarsen monotonically (near = L0, far = coarser).
  const probeCamera = {
    target: [0, 0, 0] as const,
    distance: 10,
    pitch: 0.24,
    yaw: -Math.PI / 2,
    fovY: 0.85,
    aspect: 1.6,
    near: 1,
  };
  const probe = Array.from({ length: 16 }, (_, i) => ({
    ...crowdInstance(0, 0, 0, "idle"),
    y: i * 30,
  }));
  const probeLevels = new Uint8Array(probe.length);
  assignCrowdLodLevels(
    probe,
    projectionFootprint(viewMatrix(probeCamera), projMatrix(probeCamera), 800, probeCamera.near),
    undefined,
    probeLevels,
  );
  const monotonic = probeLevels.every((lvl, i) => i === 0 || lvl >= probeLevels[i - 1]);
  const tiersReached = new Set(probeLevels).size;

  // Hysteresis: within the deadband around the L0/L1 boundary (size 18), an
  // instance keeps its previous tier instead of flipping every frame.
  const heldL0 = lodWithHysteresis(0, 17.5);
  const heldL1 = lodWithHysteresis(1, 18.5);

  animateSkinned(shell, pipeline, () => lineup, { phaseSpeed: 0.5, size: 1.4 });
  ctx.status.innerHTML = reportTable({
    route: "lod-tiers",
    "L0 / L1 / L2 triangles": triCounts.join(" / "),
    "tiers reduce geometry": triCounts[0] > triCounts[1] && triCounts[1] > triCounts[2],
    "distance bins coarsen": monotonic,
    "probe levels": probeLevels.join(""),
    "hysteresis holds at boundary": heldL0 === 0 && heldL1 === 1,
  });
  publish("lod-tiers", true, {
    route: "lod-tiers",
    triCounts,
    reduces: triCounts[0] > triCounts[1] && triCounts[1] > triCounts[2],
    probeLevels,
    monotonic,
    tiersReached,
    hysteresis: { heldL0, heldL1 },
    meshVariants: pipeline.stats().meshVariants,
  });
}
