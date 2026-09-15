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
import type { GrassRecordEdit } from "../../../packages/game-renderer/src/battle/grassFocusTiles";
import type { GrassFrame } from "./grassData";

export function liveGrassRecords(layer: GrassResidencyLayer): Float32Array {
  if (!layer.records) return new Float32Array();
  return layer.records.subarray(0, layer.recordCount * GRASS_FIELD_PACKED_STRIDE_FLOATS);
}

export interface GrassLayerRuntime<Encoder, Pass, Camera> {
  /** Whole-buffer replacement, for a field its owner builds once. */
  updateRecords(records: Float32Array): Promise<void>;
  /**
   * Take a persistent capacity buffer the owner mutates in place: allocate GPU
   * storage for the whole capacity once and upload the live prefix. Allocation
   * belongs here so no later publication - and no camera gesture - is the frame
   * that first pays for a buffer or a pipeline.
   */
  adoptRecordCapacity(buffer: Float32Array, recordCount: number): Promise<void>;
  /**
   * Bounded in-place publication: only the named record ranges are uploaded and
   * the live prefix the route pass dispatches over moves with them. No copy, no
   * rehash, no reallocation.
   */
  writeRecordRanges(
    source: Float32Array,
    edits: readonly GrassRecordEdit[],
    recordCount: number,
  ): void;
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
  let ringBuffer: Float32Array | null = null,
    ringCount = -1,
    ringRanges = 0;
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
      // The base field is built once with the terrain, so a whole replacement
      // on its revision costs nothing per frame.
      if (revisions[0] !== snapshot.base.revision) {
        await layers[0].updateRecords(liveGrassRecords(snapshot.base));
        revisions[0] = snapshot.base.revision;
        uploads[0]++;
      }
      // The focus field is one capacity buffer the owner mutates in place.
      // Adoption sizes the GPU storage from the capacity, and every later
      // publication is the ranges the owner actually wrote - taking them is
      // also what releases its next step, so the ranges stay bounded per
      // render rather than per sampling callback.
      const ring = snapshot.ring;
      if (ring.records && (ringBuffer !== ring.records || revisions[1] !== ring.revision)) {
        await layers[1].adoptRecordCapacity(ring.records, ring.recordCount);
        owner.takeRingEdits();
        ringBuffer = ring.records;
        ringCount = ring.recordCount;
        revisions[1] = ring.revision;
        uploads[1]++;
      } else if (ring.records) {
        const edits = owner.takeRingEdits();
        if (edits.length > 0 || ringCount !== ring.recordCount) {
          layers[1].writeRecordRanges(ring.records, edits, ring.recordCount);
          ringCount = ring.recordCount;
          ringRanges += edits.length;
          uploads[1]++;
        }
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
          mask: part.mask ?? {
            enabled: false,
            center: [0, 0],
            radiusSq: 0,
            tileM: 0,
            keepInside: false,
          },
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
        ringRecordRanges: ringRanges,
        layers: layers.map((layer) => layer.stats()),
      };
    },
    snapshot: () => owner.snapshot(),
    dispose,
  };
}
