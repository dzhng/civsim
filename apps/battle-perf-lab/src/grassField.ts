import {
  BattleGrassResidency,
  initialBladeFieldTransition,
  type BladeFieldProfile,
} from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  BLADE_FIELD_TRANSLUCENCY,
  LIVING_MEADOW_FAR_DENSITY_PROFILE,
  thinningProfileForTransition,
} from "../../../packages/game-renderer/src/battle/bladeFieldPolicy";
import type {
  BattleGroundCover,
  BattleTerrainGrid,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import type { TerrainHeightField } from "../../../packages/game-renderer/src/terrain/heightField";
import { viewMatrix, type Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { GRASS_FIELD_PACKED_STRIDE_FLOATS } from "../../../packages/game-renderer/src/battle/grassField";
import type { GrassResidencyLayer } from "../../../packages/game-renderer/src/battle/battleGrassResidency";
import type { GrassFrame } from "./grassData";

export function liveGrassRecords(layer: GrassResidencyLayer): Float32Array {
  if (!layer.records) return new Float32Array();
  return layer.records.subarray(0, layer.recordCount * GRASS_FIELD_PACKED_STRIDE_FLOATS);
}

export interface GrassLayerRuntime<Encoder, Pass, Camera> {
  updateRecords(records: Float32Array): Promise<void>;
  update(frame: GrassFrame): void;
  route(encoder: Encoder): void;
  draw(
    pass: Pass,
    camera: Camera,
    prepass: boolean,
    farVisible: boolean,
    stage: "combined" | "depth" | "beauty",
    tier?: number,
  ): void;
  stats(): { recordCount: number; capacity: number; pipelineBuilds: number };
  dispose(): void;
}
/** One publication/revision owner; backend methods own actual GPU orchestration. */
export function createGrassField<
  Encoder,
  Pass,
  Camera,
  Layer extends GrassLayerRuntime<Encoder, Pass, Camera>,
>(profile: BladeFieldProfile, layers: readonly [Layer, Layer]) {
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
  const sync = () => {
    const job = pending.then(async () => {
      if (disposed) throw Error("Grass field disposed");
      const snapshot = owner.snapshot();
      // These backends replace their whole record buffer, so they follow the
      // owner's generation revision rather than its per-step edits. The owner
      // mutates the focus buffer in place, so read only the live range.
      for (const [index, part] of [snapshot.base, snapshot.ring].entries())
        if (revisions[index] !== part.revision) {
          await layers[index].updateRecords(liveGrassRecords(part));
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
    update(camera: Camera3DParams, height: number) {
      if (disposed) throw Error("Grass field disposed");
      owner.update(camera, height);
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
      if (disposed) throw Error("Grass field disposed");
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
    route(encoder: Encoder) {
      if (disposed) throw Error("Grass field disposed");
      for (const [index, part] of [state.base, state.ring].entries())
        if (part.visible) layers[index].route(encoder);
    },
    draw(pass: Pass, camera: Camera, depthPrepass = false) {
      if (disposed) throw Error("Grass field disposed");
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
    dispose,
  };
}
