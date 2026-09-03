import { assignCrowdLods } from "@packages/crowd-runtime/src/lod";
import { loadPlaceholderVat } from "@packages/soldier-assets/src/placeholders";
import { REAL_UNIT_CLASS_COUNT, SHOCK_CAV_SIDEARM_CLASS } from "@packages/soldier-assets/src/soldierMesh";
import { UNIT_CLASS_BY_KEY, UnitClass } from "../../../../web/src/battle/classData";
import { crowdInstance } from "../labFixtures";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, numberParam, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const vat = await loadPlaceholderVat();
  const zoom = numberParam(ctx.params, "zoom", 6);
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 30,
    pitch: 0.16,
    yaw: 0,
  });
  const pipeline = await createSkinnedPipeline(shell, [0.2, 0.42, 0.88], vat);
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
    crowdInstance(6.0, SHOCK_CAV_SIDEARM_CLASS, 1, "march", true),
  ];
  const lods = assignCrowdLods(lineup, zoom);
  const byClass = (id: number) => lods[lineup.findIndex((s) => s.classId === id)].screenSize;
  const footSize = byClass(heavySword);
  const phalanxSize = byClass(mediumPhalanx);
  const mountedSizes = {
    [shockCavalry]: byClass(shockCavalry),
    [horseArchers]: byClass(horseArchers),
    [SHOCK_CAV_SIDEARM_CLASS]: byClass(SHOCK_CAV_SIDEARM_CLASS),
  };
  const allMountedScaled = Object.values(mountedSizes).every((s) => s > footSize + 0.01);
  const phalanxFoot = Math.abs(phalanxSize - footSize) < 0.01;
  const sidearmScaled = mountedSizes[SHOCK_CAV_SIDEARM_CLASS] > footSize + 0.01;
  const mountedEqual =
    mountedSizes[shockCavalry] === mountedSizes[horseArchers] &&
    mountedSizes[horseArchers] === mountedSizes[SHOCK_CAV_SIDEARM_CLASS];

  animateSkinned(shell, pipeline, () => lineup, { forcedClip: "march", phaseSpeed: 0.6, size: 1 });
  ctx.status.innerHTML = reportTable({
    route: "mounted-units",
    "foot LOD size": footSize.toFixed(2),
    "heavy sword / medium phalanx size": `${footSize.toFixed(2)} / ${phalanxSize.toFixed(2)}`,
    [`shock cav / horse archers / ${SHOCK_CAV_SIDEARM_CLASS} size`]: `${mountedSizes[shockCavalry].toFixed(2)} / ${mountedSizes[horseArchers].toFixed(2)} / ${mountedSizes[SHOCK_CAV_SIDEARM_CLASS].toFixed(2)}`,
    "all mounted scale": allMountedScaled,
    "medium phalanx remains foot": phalanxFoot,
    [`class ${SHOCK_CAV_SIDEARM_CLASS} scaled`]: sidearmScaled,
  });
  publish("mounted-units", true, {
    route: "mounted-units",
    footSize,
    phalanxSize,
    mountedSizes,
    allMountedScaled,
    phalanxFoot,
    sidearmScaled,
    sidearmClass: SHOCK_CAV_SIDEARM_CLASS,
    realUnitClassCount: REAL_UNIT_CLASS_COUNT,
    heavySwordClass: heavySword,
    mediumPhalanxClass: mediumPhalanx,
    shockCavalryClass: shockCavalry,
    horseArchersClass: horseArchers,
    mountedEqual,
    mountedFlags: lineup.map((s) => ({ classId: s.classId, mounted: s.mounted })),
  });
}
