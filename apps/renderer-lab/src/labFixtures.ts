import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";

export function crowdInstance(
  x: number,
  classId: number,
  faction: 0 | 1 | 2,
  clip: string,
  mounted = false,
): CrowdInstance {
  return {
    x,
    y: 0,
    facing: Math.PI / 2,
    classId,
    faction,
    alive: true,
    clip,
    phase: 0,
    seed: 1,
    mounted,
    lod: 0,
  };
}

export function generatedCrowd(
  count: number,
  x: number,
  y: number,
  faction: 0 | 1 | 2,
): CrowdInstance[] {
  return generatedFormation(count, {
    x,
    y,
    faction: faction === 2 ? 0 : faction,
    columns: Math.ceil(Math.sqrt(count)),
    clip: "march",
  }).map((instance) => ({ ...instance, faction }));
}

export function toCrowdBuildInputs(instances: CrowdInstance[]) {
  const positions = new Float32Array(instances.length * 2);
  const facings = new Float32Array(instances.length);
  const playback = instances.map((instance) => ({
    appearanceId: instance.classId,
    base: {
      source: { kind: "clip" as const, sample: { clip: instance.clip, phase: instance.phase } },
      destination: { clip: instance.clip, phase: instance.phase },
      weight: 1,
    },
  }));
  const alive = new Float32Array(instances.length);
  const soldierUnit = new Uint32Array(instances.length);
  const unitTeam = [0, 1];
  for (let i = 0; i < instances.length; i++) {
    positions[i * 2] = instances[i].x;
    positions[i * 2 + 1] = instances[i].y;
    facings[i] = instances[i].facing;
    alive[i] = instances[i].alive ? 1 : 0;
    soldierUnit[i] = instances[i].faction === 0 ? 0 : 1;
  }
  return { positions, facings, playback, alive, soldierUnit, unitTeam };
}
