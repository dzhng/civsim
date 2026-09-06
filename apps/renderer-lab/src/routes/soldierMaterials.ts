import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import {
  resolveBattleEnvironment,
  skinnedLightingForBattleEnvironment,
} from "@packages/game-renderer/src/environment/environment";
import {
  type LabContext,
  animateSkinned,
  chartSnapshot,
  createConfiguredShell,
  integerParam,
  numberParam,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const strength = numberParam(ctx.params, "strength", 1);
  const faction = integerParam(ctx.params, "team", 0, 0, 1) as 0 | 1;
  const camera = {
    x: 0,
    y: 0,
    zoom: 130,
    pitch: 1.0,
    yaw: 0.45,
  };
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const snapshot = chartSnapshot(camera, shell);
  snapshot.camera3d.target = [0, 0, 1.6];
  shell.setCamera(snapshot);
  const appearances = await loadAppearanceCatalog(
    new URL(ctx.params.get("catalog") ?? "/assets/soldiers/catalog.json", location.href).href,
  );
  const classId = integerParam(
    ctx.params,
    "class",
    Number(Object.keys(appearances)[0]),
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const bundle = appearances[classId];
  if (!bundle) throw new Error(`soldier appearance ${classId} is not loaded`);
  const clip =
    ctx.params.get("clip") ??
    (bundle.animation.clips.some((clip) => clip.name === "at_ease")
      ? "at_ease"
      : bundle.animation.clips[0].name);
  if (ctx.params.has("reverseMaterials")) {
    bundle.surface = { ...bundle.surface, materials: [...bundle.surface.materials].reverse() };
    bundle.tiers = bundle.tiers.map((mesh) => ({
      ...mesh,
      materialIds: mesh.materialIds.map((id) => bundle.surface.materials.length - 1 - id),
    })) as typeof bundle.tiers;
  }
  const surface = ctx.params.get("surface") ?? "authored";
  const roughness = numberParam(ctx.params, "roughness", 0.55);
  const metallic = numberParam(ctx.params, "metallic", 0);
  // Diagnostic overrides preserve the complete loader and production mesh/VAT
  // path. Blue is ordinary albedo; only the independently authored mask may tint.
  if (surface === "blue" || surface === "gray") {
    bundle.surface = {
      textures: {},
      materials: bundle.surface.materials.map((material) => ({
        ...material,
        baseColor: [1, 1, 1, 1],
        roughness,
        metallic,
        textures: undefined,
      })),
    };
    bundle.tiers = bundle.tiers.map((mesh) => {
      const colors = new Float32Array(mesh.colors.length);
      for (let i = 0; i < colors.length; i += 4)
        colors.set(surface === "blue" ? [0.035, 0.12, 0.65, 1] : [0.3, 0.3, 0.3, 1], i);
      return { ...mesh, colors };
    }) as typeof bundle.tiers;
  }
  const lighting = skinnedLightingForBattleEnvironment(resolveBattleEnvironment("golden-hour"));
  if (ctx.params.has("keyOff")) lighting.keyColor = [0, 0, 0];
  const pipeline = await SkinnedCrowdPipeline.create(shell, { [classId]: bundle }, { lighting });
  pipeline.setFactionMaskStrength(strength);
  const soldier = generatedFormation(1, { frame: 6, spacing: 1, faction, classId }).map((inst) => ({
    ...inst,
    x: 0,
    y: 0,
    facing: numberParam(ctx.params, "facing", Math.PI / 2),
    phase: numberParam(ctx.params, "phase", inst.phase),
    alive: ctx.params.get("alive") !== "0",
    deathVariant: numberParam(ctx.params, "deathVariant", inst.deathVariant ?? 0),
    seed: numberParam(ctx.params, "seed", 0),
  }));
  animateSkinned(shell, pipeline, () => soldier, {
    forcedClip: clip,
    phaseSpeed: 0,
    size: 1.6,
  });
  ctx.status.innerHTML = reportTable({
    route: "soldier-materials",
    "accent strength": strength.toFixed(2),
    faction,
    classId,
    note: "explicit scalar surfaces; only authored faction masks receive team color",
  });
  publish("soldier-materials", true, {
    route: "soldier-materials",
    strength,
    faction,
    classId,
    surface,
    ...pipeline.stats(),
  });
}
