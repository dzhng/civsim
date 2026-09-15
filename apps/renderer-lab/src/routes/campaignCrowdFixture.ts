import {
  buildEntityFrame,
  type ArmyView,
  type CampaignTerrainField,
} from "@packages/game-renderer/src/campaign/entityFrame";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";
import type { RenderedSurface } from "@packages/game-renderer/src/terrain/surface";

/** Small real frame input: roster sampling and authored clips stay in their production owners. */
export async function campaignCrowdFixture(surface: RenderedSurface) {
  const catalog = await loadAppearanceCatalog(
    new URL("/assets/soldiers/catalog.json", location.href).href,
  );
  const classId = Number(Object.keys(catalog)[0]);
  const appearances = { [classId]: catalog[classId] };
  const roster = Array(classId + 1).fill(0);
  roster[classId] = 6;
  const armies: ArmyView[] = [-35, 35].map((x, id) => ({
    id,
    x,
    y: -25,
    faction: id,
    soldiers: 600,
    stance: 0,
    pieKind: 0,
    pieFrac: 0,
    marching: false,
    encounter: -1,
    moraleCap: 1,
    mine: id === 0,
    roster,
    unitsByClass: roster,
    unitCount: 6,
  }));
  const field: CampaignTerrainField = {
    w: 81,
    h: 81,
    cell: 2,
    minX: -80,
    maxY: 80,
    maxH: 40,
    land: new Uint8Array(81 * 81).fill(1),
    biome: new Uint8Array(81 * 81),
    height: new Float32Array(81 * 81),
    renderLandAt: () => true,
    renderWaterAt: () => false,
    heightAt: (x: number, y: number) => surface.sampleRendered(x, y)!.position[2],
  };
  const data = {
    map: {
      attribution: "fixture",
      nodes: [],
      edges: [],
      factions: [
        { id: "friend", color: [40, 90, 180] as [number, number, number] },
        { id: "foe", color: [180, 45, 30] as [number, number, number] },
      ],
    },
    bgRect: { min: [-80, -80] as [number, number], max: [80, 80] as [number, number] },
  };
  const frame = (zoom = 5, empty = false, time = 0.25) =>
    buildEntityFrame(
      data,
      field,
      {
        cam: { x: 0, y: -25, scale: zoom },
        armies: empty ? [] : armies,
        cities: new Map(),
        selected: 0,
        selectedCity: -1,
        factionLabels: [],
        factionStatus: new Int8Array([0, 2]),
        playerFaction: 0,
        fogOfWar: false,
        visionSources: [],
        factionView: false,
        stackUnitCap: 6,
        controlledStage: false,
      },
      [],
      time,
      (id) => appearances[id].manifest.presentation!.actions.atEase!.clip,
    );
  return { appearances, frame };
}
