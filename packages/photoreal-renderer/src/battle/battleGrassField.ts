import * as THREE from "three/webgpu";
import { eyePosition, type Camera3DParams } from "../../../renderer-core/src/camera3d";
import {
  BattleGrassResidency,
  type BladeFieldProfile,
  type GrassResidencyStats,
} from "../../../game-renderer/src/battle/battleGrassResidency";
import type {
  BattleTerrainGrid,
  BattleGroundCover,
} from "../../../game-renderer/src/battle/terrainFeatures";
import type { TerrainHeightField } from "../../../game-renderer/src/terrain/heightField";
import {
  PhotorealBladeFieldLayer,
  type BladeFieldStats,
  type BladeFieldTransitionUniforms,
  type BladeFieldWindUniforms,
} from "./bladeFieldLayer";

export interface BattleGrassStats extends BladeFieldStats, Omit<GrassResidencyStats, "rebuild"> {
  rebuild: GrassResidencyStats["rebuild"] & { shaderCompileCount: number };
}
/** Three owns materials/uploads; shared residency owns sampling and camera history. */
export class BattleGrassField {
  private readonly base: PhotorealBladeFieldLayer;
  private readonly ring: PhotorealBladeFieldLayer;
  private readonly residency: BattleGrassResidency;
  private appliedTransition: ReturnType<BattleGrassResidency["snapshot"]>["transition"];
  private farVisible = true;
  private baseRevision = 0;
  private ringRevision = -1;
  private ringBuffer: Float32Array | null = null;
  constructor(
    scene: THREE.Scene,
    profile: BladeFieldProfile,
    private readonly transition: BladeFieldTransitionUniforms,
    wind: BladeFieldWindUniforms,
  ) {
    this.base = new PhotorealBladeFieldLayer(scene, profile.tiers, true, transition, wind);
    this.ring = new PhotorealBladeFieldLayer(scene, profile.tiers, true, transition, wind, {
      materials: this.base.materialSet(),
      nameSuffix: "ring",
    });
    this.ring.setVisible(false);
    this.residency = new BattleGrassResidency(profile, transition.transition(), () =>
      this.applyResidency(),
    );
    this.appliedTransition = this.residency.snapshot().transition;
  }
  private applyResidency() {
    const state = this.residency.snapshot();
    if (state.base.revision !== this.baseRevision) {
      this.base.applyPackedRecords(state.base.records ?? new Float32Array(), state.base.visible);
      this.baseRevision = state.base.revision;
    }
    if (state.transition !== this.appliedTransition) {
      this.base.setTransition(state.transition);
      this.ring.setTransition(state.transition);
      this.appliedTransition = state.transition;
    }
    if (state.farVisible !== this.farVisible) {
      this.base.setFarTierVisible(state.farVisible);
      this.ring.setFarTierVisible(state.farVisible);
      this.farVisible = state.farVisible;
    }
    this.transition.terrainDetailStrength.value = state.terrainDetailStrength;
    this.base.setVisible(state.base.visible);
    this.ring.setVisible(state.ring.visible);
    // One coverage, two senses: whatever the base field stops drawing is
    // exactly what the focus field starts drawing.
    this.base.setRouteMask(state.base.mask);
    this.ring.setRouteMask(state.ring.mask);
  }
  /**
   * The ring's records live in one buffer the residency owns and mutates in
   * place, so publication is a set of bounded ranges rather than a replacement.
   * Taking the ranges is what releases the next publication step, so this runs
   * exactly once per render and the ranges it applies are bounded per render,
   * not merely per sampling callback. A revision change - a different buffer,
   * or a loading settle that dropped its ranges - is the only whole re-read.
   */
  private publishRing(ring: ReturnType<BattleGrassResidency["snapshot"]>["ring"]) {
    if (!ring.records) return;
    const adopted = ring.records !== this.ringBuffer;
    const wholeRead = adopted || ring.revision !== this.ringRevision;
    if (adopted) {
      this.ring.adoptRecordBuffer(ring.records);
      this.ringBuffer = ring.records;
    } else if (wholeRead) {
      this.ring.markWholeRecordBufferDirty();
    }
    const edits = this.residency.takeRingEdits();
    this.ring.applyRecordEdits({
      edits: wholeRead ? [] : edits,
      recordCount: ring.recordCount,
      visible: ring.visible,
      recordHash: ring.recordHash,
      refreshStats: wholeRead,
    });
    this.ringRevision = ring.revision;
  }

  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover) {
    this.residency.setTerrain(grid, field, cover);
  }
  update(camera: Camera3DParams, height: number) {
    this.residency.update(camera, height);
  }
  prepareRender(renderer: THREE.WebGPURenderer, camera: Camera3DParams) {
    this.residency.prepareRender(camera, renderer.domElement.height);
    const state = this.residency.snapshot();
    this.ring.setRouteCullWedge(state.wedge);
    this.publishRing(state.ring);
    // Unconditional: a field that is not drawing this frame still has to take
    // its ranges to the GPU, or they accumulate until the range list overflows
    // into a whole-buffer upload.
    this.ring.flushRecordUploads(renderer);
    const eye = eyePosition(camera);
    if (!state.base.visible) return;
    this.base.routeGpu(renderer, eye, [camera.target[0], camera.target[1]]);
    if (state.ring.visible) this.ring.routeGpu(renderer, eye, [camera.target[0], camera.target[1]]);
  }
  setSunDirection(direction: THREE.Vector3) {
    this.base.setSunDirection(direction);
  }
  setFarVisible(visible: boolean) {
    this.residency.setFarVisible(visible);
  }
  setVisible(visible: boolean) {
    this.residency.setVisible(visible);
  }
  settle(renderer: THREE.WebGPURenderer) {
    this.residency.settle();
    this.publishRing(this.residency.snapshot().ring);
    this.ring.flushRecordUploads(renderer);
  }
  stats(): BattleGrassStats {
    const state = this.residency.stats();
    return {
      ...mergeBladeFieldStats(
        this.base.stats(),
        this.ring.stats(),
        this.residency.snapshot().ring.visible,
      ),
      ...state,
      rebuild: { ...state.rebuild, shaderCompileCount: this.base.materialCompileCount() },
    };
  }
  dispose() {
    this.residency.dispose();
    this.base.dispose();
    this.ring.dispose();
  }
}

function mergeBladeFieldStats(
  base: BladeFieldStats,
  ring: BladeFieldStats,
  includeRing: boolean,
): BladeFieldStats {
  if (!includeRing) return base;
  const tiers = { ...base.tiers };
  for (const tierId of Object.keys(tiers) as Array<keyof BladeFieldStats["tiers"]>) {
    const baseTier = base.tiers[tierId];
    const ringTier = ring.tiers[tierId];
    tiers[tierId] = {
      ...baseTier,
      candidateRecords: baseTier.candidateRecords + ringTier.candidateRecords,
      records: baseTier.records + ringTier.records,
      droppedByThinning: baseTier.droppedByThinning + ringTier.droppedByThinning,
      triangles: baseTier.triangles + ringTier.triangles,
      vertices: baseTier.vertices + ringTier.vertices,
    };
  }
  const runtimeComputeRoute =
    base.sourceStorageCore.runtimeComputeRoute === "active" ||
    ring.sourceStorageCore.runtimeComputeRoute === "active"
      ? "active"
      : "not-run";
  return {
    ...base,
    enabled: base.enabled || ring.enabled,
    recordCount: base.recordCount + ring.recordCount,
    drawCalls: base.drawCalls + ring.drawCalls,
    submittedTriangles: base.submittedTriangles + ring.submittedTriangles,
    submittedVertices: (base.submittedVertices ?? 0) + (ring.submittedVertices ?? 0),
    tiers,
    culledRecords: base.culledRecords + ring.culledRecords,
    thinnedRecords: base.thinnedRecords + ring.thinnedRecords,
    sourceStorageCore: { ...base.sourceStorageCore, runtimeComputeRoute },
    recordHash: `${base.recordHash}+${ring.recordHash}`,
  };
}
