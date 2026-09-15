import {
  BattleGrassResidency,
  initialBladeFieldTransition,
  type BladeFieldProfile,
} from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { bladeGeometryData } from "../../../../packages/game-renderer/src/battle/bladeGeometry";
import {
  BLADE_FIELD_TRANSLUCENCY,
  LIVING_MEADOW_FAR_DENSITY_PROFILE,
  bladesPerRecordFor,
  thinningProfileForTransition,
} from "../../../../packages/game-renderer/src/battle/bladeFieldPolicy";
import type {
  BattleGroundCover,
  BattleTerrainGrid,
} from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import type { TerrainHeightField } from "../../../../packages/game-renderer/src/terrain/heightField";
import { viewMatrix, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { createRawGrass, type GrassFrame } from "./grass";
import type { RawEnvironment } from "./environment";

/** Stable native base/ring pipelines consume the shared residency history. Caller owns frame submission. */
export async function createRawGrassField(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  profile: BladeFieldProfile,
  sampleCount: 1 | 4 = 1,
) {
  const tiers = profile.tiers.map((tier) =>
    bladeGeometryData(
      tier.segments,
      bladesPerRecordFor(LIVING_MEADOW_FAR_DENSITY_PROFILE, tier.id),
    ),
  );
  const layers: Awaited<ReturnType<typeof createRawGrass>>[] = [];
  let disposed = false,
    pending: Promise<unknown> = Promise.resolve();
  const owner = new BattleGrassResidency(profile, initialBladeFieldTransition(profile));
  const revisions = [-1, -1],
    uploads = [0, 0];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owner.dispose();
    for (const layer of layers) layer.dispose();
  };
  try {
    for (let i = 0; i < 2; i++)
      layers.push(
        await createRawGrass(
          device,
          cameraLayout,
          environment,
          new Float32Array(),
          tiers,
          "rgba16float",
          sampleCount,
        ),
      );
    const sync = () => {
      const job = pending.then(async () => {
        if (disposed) throw Error("Native grass field disposed");
        const snapshot = owner.snapshot();
        for (const [index, part] of [snapshot.base, snapshot.ring].entries())
          if (revisions[index] !== part.revision) {
            await layers[index].updateRecords(part.records ?? new Float32Array());
            revisions[index] = part.revision;
            uploads[index]++;
          }
        return snapshot;
      });
      pending = job.catch(() => {});
      return job;
    };
    let state = owner.snapshot();
    return {
      setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover) {
        owner.setTerrain(grid, field, cover);
      },
      setVisible(value: boolean) {
        owner.setVisible(value);
      },
      setFarVisible(value: boolean) {
        owner.setFarVisible(value);
      },
      async settle() {
        owner.settle();
        await sync();
      },
      async prepare(
        camera: Camera3DParams,
        height: number,
        wind: GrassFrame["wind"],
        sun: GrassFrame["sun"],
      ) {
        if (disposed) throw Error("Native grass field disposed");
        owner.prepareRender(camera, height);
        state = await sync();
        const common = {
          anchor: [camera.target[0], camera.target[1]] as [number, number],
          view: viewMatrix(camera),
          transition: state.transition,
          thinning: thinningProfileForTransition(true, LIVING_MEADOW_FAR_DENSITY_PROFILE),
          wind,
          sun,
          rim: BLADE_FIELD_TRANSLUCENCY.rimStrength,
          subsurface: BLADE_FIELD_TRANSLUCENCY.subsurfaceStrength,
        };
        for (const [index, part] of [state.base, state.ring].entries())
          layers[index].update({
            ...common,
            mask: part.circle ?? { enabled: false, center: [0, 0], radiusSq: 0 },
            wedge:
              index === 1 && state.wedge
                ? state.wedge
                : {
                    enabled: false,
                    forward: [0, 1],
                    side: [1, 0],
                    halfWidthSlope: 1,
                    backMarginM: 0,
                    farMarginM: 0,
                  },
          });
      },
      route(encoder: GPUCommandEncoder) {
        if (disposed) throw Error("Native grass field disposed");
        for (const [index, part] of [state.base, state.ring].entries())
          if (part.visible) layers[index].route(encoder);
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, depthPrepass = false) {
        if (disposed) throw Error("Native grass field disposed");
        const parts = [state.base, state.ring];
        if (depthPrepass)
          for (let tier = 0; tier < 2; tier++)
            for (const [index, part] of parts.entries())
              if (part.visible)
                layers[index].draw(pass, camera, true, state.farVisible, "depth", tier);
        // Source renderOrder groups both layers by tier before advancing to the next tier.
        for (let tier = 0; tier < 3; tier++)
          for (const [index, part] of parts.entries())
            if (part.visible)
              layers[index].draw(pass, camera, false, state.farVisible, "beauty", tier);
      },
      stats() {
        return {
          residency: owner.stats(),
          uploads: [...uploads],
          layers: layers.map((layer) => layer.stats()),
        };
      },
      snapshot: () => owner.snapshot(),
      routingBuffers: () =>
        layers.map((layer) => ({ commands: layer.commands, visible: layer.visible })),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
