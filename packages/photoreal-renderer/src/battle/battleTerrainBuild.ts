import * as THREE from "three/webgpu";
import { buildPhotorealBattleGroundMesh } from "../../../game-renderer/src/battle/groundPass";
import { buildBattleHorizonLayout } from "../../../game-renderer/src/battle/horizonPass";
import { buildBattleTerrainPresentation } from "../../../game-renderer/src/battle/mapCatalog";
import type { battleEnvironmentStats } from "../../../game-renderer/src/environment/environment";
import {
  BATTLE_RELIEF_EXAGGERATION,
  deriveBattleEdgeRoles,
  type BattleGroundCover,
  type BattleSlopeBands,
  type BattleTerrainGrid,
} from "../../../game-renderer/src/battle/terrainFeatures";
import { featuresToBattleScenery } from "../../../game-renderer/src/battle/terrainScenery";
import {
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../game-renderer/src/terrain/heightField";
import type { BattleFrameUniforms } from "./battleTsl";
import {
  createGroundMesh,
  createHorizonBlockerMesh,
  createVistaMesh,
  vistaSurfaceHeightAt,
  type BattleVistaGrid,
} from "./terrainLayer";
import {
  createLakePlaneMesh,
  createOceanPlaneMesh,
  type BattleLakeSurfaceSpec,
  type createSeaDisplacementSource,
} from "./seaLayer";
import type { BladeFieldTransitionUniforms } from "./bladeFieldLayer";
import type { BattleGrassStats } from "./battleGrassField";

export interface BattleTerrainBuildInput {
  grid: BattleTerrainGrid;
  cover: BattleGroundCover;
  slopeBands: BattleSlopeBands | null;
  vista: BattleVistaGrid | null;
  lakeSurfaces: readonly BattleLakeSurfaceSpec[];
  frame: BattleFrameUniforms;
  grassTransition: BladeFieldTransitionUniforms;
  sea: ReturnType<typeof createSeaDisplacementSource>;
}

export interface BattleTerrainBuild {
  field: TerrainHeightField;
  vista: BattleVistaGrid | null;
  rect: [number, number, number, number];
  ground: THREE.Mesh;
  horizonBlockers: THREE.Mesh | null;
  vistaMeshes: THREE.Mesh[];
  oceanPlanes: THREE.Mesh[];
  lakePlanes: THREE.Mesh[];
  sealedEdges: string[];
  groundTriangles: number;
  vistaTriangles: number;
  scenery: ReturnType<typeof featuresToBattleScenery>;
}

export class BattleTerrainSurface {
  ground: THREE.Mesh | null = null;
  horizonBlockers: THREE.Mesh | null = null;
  vistaMeshes: THREE.Mesh[] = [];
  oceanPlanes: THREE.Mesh[] = [];
  lakePlanes: THREE.Mesh[] = [];
  sealedEdges: string[] = [];
  groundTriangles = 0;
  vistaTriangles = 0;
  private field: TerrainHeightField | null = null;
  private vista: BattleVistaGrid | null = null;
  private rect: [number, number, number, number] = [0, 0, 0, 0];

  constructor(private readonly scene: THREE.Scene) {}

  replace(build: BattleTerrainBuild): void {
    this.removeAndDispose();
    this.ground = build.ground;
    this.horizonBlockers = build.horizonBlockers;
    this.vistaMeshes = build.vistaMeshes;
    this.oceanPlanes = build.oceanPlanes;
    this.lakePlanes = build.lakePlanes;
    this.sealedEdges = build.sealedEdges;
    this.groundTriangles = build.groundTriangles;
    this.vistaTriangles = build.vistaTriangles;
    this.field = build.field;
    this.vista = build.vista;
    this.rect = build.rect;
    for (const mesh of this.meshes()) this.scene.add(mesh);
  }

  heightAt(x: number, y: number): number {
    const playable = this.field ? terrainHeightAt(this.field, x, y) : 0;
    const vista = this.vista ? vistaSurfaceHeightAt(this.vista, x, y) : null;
    const [x0, y0, w, h] = this.rect;
    const inside = x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
    return inside ? (vista === null ? playable : Math.max(playable, vista)) : (vista ?? playable);
  }

  heightSampler(): ((x: number, y: number) => number) | undefined {
    const field = this.field;
    return field ? (x, y) => terrainHeightAt(field, x, y) : undefined;
  }

  stats(input: {
    vista: BattleVistaGrid | null;
    standards: readonly { unitId: number; x: number; y: number; z: number }[];
    sea: ReturnType<ReturnType<typeof createSeaDisplacementSource>["stats"]>;
    lakeSurfaces: readonly BattleLakeSurfaceSpec[];
    groundCover: BattleGroundCover;
    slopeBands: BattleSlopeBands | null;
    environment: ReturnType<typeof battleEnvironmentStats>;
    scenery: number;
    grass: BattleGrassStats;
  }) {
    return {
      fixture: "sim-tint" as const,
      layer: "photoreal-battle-ground" as const,
      groundTriangles: this.groundTriangles,
      vistaTriangles: this.vistaTriangles,
      vista: input.vista
        ? {
            bands: input.vista.bands.map((band) => ({
              name: band.name,
              width: band.w,
              height: band.h,
              cell: band.cell,
              originX: band.ox,
              originY: band.oy,
              innerHalfW: band.innerHalfW,
              innerHalfH: band.innerHalfH,
              outerHalfW: band.outerHalfW,
              outerHalfH: band.outerHalfH,
            })),
          }
        : null,
      sealedEdges: [...this.sealedEdges],
      standards: input.standards,
      sea: {
        ...input.sea,
        planes: this.oceanPlanes.length,
        oceanPlanes: this.oceanPlanes.length,
        lakePlanes: this.lakePlanes.length,
        lakeSurfaces: input.lakeSurfaces.map((surface) => ({ ...surface })),
      },
      groundCover: input.groundCover,
      slopeBands: input.slopeBands,
      environment: input.environment,
      scenery: input.scenery,
      grass: input.grass,
    };
  }

  private removeAndDispose(): void {
    for (const mesh of this.meshes()) {
      this.scene.remove(mesh);
      disposeBattleTerrainMesh(mesh);
    }
    this.ground = null;
    this.horizonBlockers = null;
    this.vistaMeshes = [];
    this.oceanPlanes = [];
    this.lakePlanes = [];
  }

  private meshes(): THREE.Mesh[] {
    return [
      ...(this.ground ? [this.ground] : []),
      ...(this.horizonBlockers ? [this.horizonBlockers] : []),
      ...this.vistaMeshes,
      ...this.oceanPlanes,
      ...this.lakePlanes,
    ];
  }
}

/** Build one complete terrain presentation without mutating a scene or world. */
export function buildBattleTerrain(input: BattleTerrainBuildInput): BattleTerrainBuild {
  const { grid, cover, slopeBands, vista, lakeSurfaces, frame, grassTransition, sea } = input;
  const field: TerrainHeightField = grid.height
    ? {
        w: grid.w,
        h: grid.h,
        cell: grid.cell,
        ox: grid.ox,
        oy: grid.oy,
        height: grid.height,
        units: "meters",
        verticalScale: BATTLE_RELIEF_EXAGGERATION,
      }
    : {
        w: grid.w,
        h: grid.h,
        cell: grid.cell,
        ox: grid.ox,
        oy: grid.oy,
        height: new Float32Array(grid.w * grid.h),
        units: "meters",
        verticalScale: 1,
      };
  const presentation = buildBattleTerrainPresentation(
    { id: "live", edges: deriveBattleEdgeRoles(grid), groundCover: cover },
    grid,
    0x5eed,
  );
  const groundData = buildPhotorealBattleGroundMesh(grid, field, cover);
  const ground = createGroundMesh(frame, groundData, {
    slopeBands,
    farGrass: grassTransition,
    earthDistance: groundData.earthDistance,
  });

  let horizonBlockers: THREE.Mesh | null = null;
  const vistaMeshes: THREE.Mesh[] = [];
  const oceanPlanes: THREE.Mesh[] = [];
  let sealedEdges: string[];
  let vistaTriangles = 0;
  if (vista) {
    sealedEdges = ["generated:vista"];
    for (const band of vista.bands) {
      const mesh = createVistaMesh(frame, band, cover, {
        slopeBands,
        farGrass: grassTransition,
      });
      if (!mesh) continue;
      vistaMeshes.push(mesh);
      vistaTriangles += (mesh.geometry.index?.count ?? 0) / 3;
    }
  } else {
    const layout = buildBattleHorizonLayout(
      { ox: grid.ox, oy: grid.oy, w: grid.w, h: grid.h, cell: grid.cell },
      presentation.edges,
      field,
    );
    sealedEdges = layout.builtEdges.map((edge) => `${edge.side}:${edge.role}`);
    horizonBlockers = createHorizonBlockerMesh(layout);
    oceanPlanes.push(...layout.oceanPlanes.map((spec) => createOceanPlaneMesh(frame, spec, sea)));
  }

  const lakePlanes = lakeSurfaces
    .map((spec) => createLakePlaneMesh(frame, spec, grid, sea))
    .filter((plane): plane is THREE.Mesh => plane !== null);
  return {
    field,
    vista,
    rect: [grid.ox, grid.oy, grid.w * grid.cell, grid.h * grid.cell],
    ground,
    horizonBlockers,
    vistaMeshes,
    oceanPlanes,
    lakePlanes,
    sealedEdges,
    groundTriangles: groundData.triangles,
    vistaTriangles,
    scenery: featuresToBattleScenery(presentation.features, field, 0x77, grid),
  };
}

export function disposeBattleTerrainMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const earthDistanceTexture = mesh.userData.earthDistanceTexture;
  if (earthDistanceTexture instanceof THREE.Texture) earthDistanceTexture.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

export function expandedBattleTerrainRect([x, y, w, h]: [number, number, number, number]): [
  number,
  number,
  number,
  number,
] {
  const margin = Math.max(120, Math.max(w, h) * 0.22);
  return [x - margin, y - margin, w + margin * 2, h + margin * 2];
}
