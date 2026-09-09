import { assignCrowdLods } from "@packages/crowd-runtime/src/lod";
import {
  chartCamera3d,
  projectionFootprint,
  viewMatrix,
  projMatrix,
} from "@packages/renderer-core/src/camera3d";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import {
  UNIT_CLASS_BY_KEY,
  UnitClass,
  UNIT_CLASS_CATALOG,
} from "../../../../web/src/battle/classData";
import { crowdInstance } from "../labFixtures";
import {
  type LabContext,
  animateSkinned,
  createConfiguredShell,
  createSkinnedPipeline,
  numberParam,
  publish,
  reportTable,
} from "../labShell";

export async function route(ctx: LabContext) {
  const sidearmAppearance = APPEARANCE_DESCRIPTORS.findIndex(
    (descriptor) =>
      descriptor.selection.unitClass === UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry] &&
      descriptor.selection.state === "sidearm",
  );
  const zoom = numberParam(ctx.params, "zoom", 6);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 30,
    pitch: 0.16,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell);
  const heavySword = UNIT_CLASS_BY_KEY[UnitClass.HeavySword];
  const mediumPhalanx = UNIT_CLASS_BY_KEY[UnitClass.MediumPhalanx];
  const shockCavalry = UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry];
  const horseArchers = UNIT_CLASS_BY_KEY[UnitClass.HorseArchers];
  // Heavy sword and medium phalanx are foot; the cavalry classes and the
  // render-only shock-cav sidearm are mounted archetypes.
  const lineup = [
    crowdInstance(-6.0, heavySword, 0, "march", false),
    crowdInstance(-3.0, mediumPhalanx, 0, "march", false),
    crowdInstance(0, shockCavalry, 0, "march", true),
    crowdInstance(3.0, horseArchers, 1, "march", true),
    crowdInstance(6.0, sidearmAppearance, 1, "march", true),
  ];
  const height = shell.stats().height;
  const camera = chartCamera3d({ x: 0, y: 0, zoom, pitch: 0.16, yaw: 0 }, height);
  const lods = assignCrowdLods(
    lineup,
    projectionFootprint(viewMatrix(camera), projMatrix(camera), height, camera.near),
  );
  const byClass = (id: number) => lods[lineup.findIndex((s) => s.classId === id)].screenSize;
  const footSize = byClass(heavySword);
  const phalanxSize = byClass(mediumPhalanx);
  const mountedSizes = {
    [shockCavalry]: byClass(shockCavalry),
    [horseArchers]: byClass(horseArchers),
    [sidearmAppearance]: byClass(sidearmAppearance),
  };
  const allMountedScaled = Object.values(mountedSizes).every((s) => s > footSize + 0.01);
  const phalanxFoot = Math.abs(phalanxSize - footSize) < 0.01;
  const sidearmScaled = mountedSizes[sidearmAppearance] > footSize + 0.01;
  const mountedEqual =
    mountedSizes[shockCavalry] === mountedSizes[horseArchers] &&
    mountedSizes[horseArchers] === mountedSizes[sidearmAppearance];

  animateSkinned(shell, pipeline, () => lineup, { forcedClip: "march", phaseSpeed: 0.6, size: 1 });
  ctx.status.innerHTML = reportTable({
    route: "mounted-units",
    "foot LOD size": footSize.toFixed(2),
    "heavy sword / medium phalanx size": `${footSize.toFixed(2)} / ${phalanxSize.toFixed(2)}`,
    [`shock cav / horse archers / ${sidearmAppearance} size`]: `${mountedSizes[shockCavalry].toFixed(2)} / ${mountedSizes[horseArchers].toFixed(2)} / ${mountedSizes[sidearmAppearance].toFixed(2)}`,
    "all mounted scale": allMountedScaled,
    "medium phalanx remains foot": phalanxFoot,
    [`class ${sidearmAppearance} scaled`]: sidearmScaled,
  });
  publish("mounted-units", true, {
    route: "mounted-units",
    footSize,
    phalanxSize,
    mountedSizes,
    allMountedScaled,
    phalanxFoot,
    sidearmScaled,
    sidearmClass: sidearmAppearance,
    realUnitClassCount: UNIT_CLASS_CATALOG.length,
    heavySwordClass: heavySword,
    mediumPhalanxClass: mediumPhalanx,
    shockCavalryClass: shockCavalry,
    horseArchersClass: horseArchers,
    mountedEqual,
    mountedFlags: lineup.map((s) => ({ classId: s.classId, mounted: s.mounted })),
  });
}
