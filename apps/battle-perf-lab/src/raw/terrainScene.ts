import { buildBattleTerrainData } from "../../../../packages/game-renderer/src/battle/terrainSceneData";
import {
  battleTerrainHeightAt,
  expandedBattleTerrainRect,
} from "../../../../packages/game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../../packages/game-renderer/src/battle/terrainBackdropPolicy";
import type {
  BattleTerrainGrid,
  BattleGroundCover,
  BattleSlopeBands,
} from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import type { BattleVistaGrid } from "../../../../packages/game-renderer/src/battle/vistaSurface";
import type { BattleLakeSurfaceSpec } from "../../../../packages/game-renderer/src/water/battleWaterGeometry";
import type { RawEnvironment } from "./environment";
import { RawBattleTerrain } from "./terrain";
import { RawBattleWater } from "./water";
import { createRawScenery } from "./scenery";
import { createRawBackdrop } from "./backdrop";
import { beginGpuAdmission } from "../gpuAdmission";
import type { BattleWaterInput } from "../waterData";
export interface RawBattleTerrainInput {
  grid: BattleTerrainGrid;
  cover: BattleGroundCover;
  vista: BattleVistaGrid | null;
  lakes: readonly BattleLakeSurfaceSpec[];
  slopeBands?: BattleSlopeBands | null;
}
type Disposable = { dispose(): void };
/** One committed terrain presentation. Replacements never expose a partial scene. */
export async function createRawBattleTerrainScene(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  samples: 1 | 4,
  initial: RawBattleTerrainInput,
) {
  let disposed = false,
    pending = false,
    zoom = 1,
    strength = 1;
  let staging: { dispose(): void } | undefined;
  let active: Awaited<ReturnType<typeof prepare>> | undefined;
  const check = () => {
    if (disposed) throw Error("Terrain scene disposed");
  };
  async function prepare(input: RawBattleTerrainInput) {
    const resources: Disposable[] = [];
    let cancelled = false;
    const dispose = () => {
      if (cancelled) return;
      cancelled = true;
      for (const r of resources.reverse()) r.dispose();
    };
    staging = { dispose };
    const own = <T extends Disposable>(r: T) => {
      if (disposed || cancelled) {
        r.dispose();
        throw Error("Terrain preparation cancelled");
      }
      resources.push(r);
      return r;
    };
    async function admitted<T extends Disposable>(create: () => T) {
      const finish = beginGpuAdmission(device);
      try {
        const r = own(create());
        await finish();
        if (disposed || cancelled) throw Error("Terrain preparation cancelled");
        return r;
      } catch (error) {
        await finish();
        throw error;
      }
    }
    try {
      // Source setTerrain snapshots WASM-backed arrays before deriving render data.
      const grid: BattleTerrainGrid = {
        ...input.grid,
        tint: new Uint8Array(input.grid.tint),
        height: input.grid.height?.slice(),
        rough: input.grid.rough?.slice(),
        speed: input.grid.speed?.slice(),
      };
      const cover = input.cover;
      const lakes = input.lakes.map((l) => ({ ...l }));
      const slopeBands = input.slopeBands ? { ...input.slopeBands } : null;
      const data = buildBattleTerrainData(grid, cover, input.vista);
      // These surfaces have no same-view equal-depth prepass; invariant clip output can
      // constrain upstream arithmetic and change grazing interpolants.
      const ground = await admitted(
        () =>
          new RawBattleTerrain(
            device,
            cameraLayout,
            environment,
            data.ground,
            data.horizon,
            { earthDistance: data.ground.earthDistance, slopeBands, farGrass: true },
            "beauty",
            samples,
            false,
          ),
      );
      const opaqueVista: RawBattleTerrain[] = [],
        transparentVista: RawBattleTerrain[] = [];
      for (const ring of data.vistaMeshes) {
        const layer = await admitted(
          () =>
            new RawBattleTerrain(
              device,
              cameraLayout,
              environment,
              ring.mesh,
              null,
              { vistaBand: ring.name, slopeBands, farGrass: true },
              "beauty",
              samples,
              false,
            ),
        );
        (ring.name === "farFog" ? transparentVista : opaqueVista).push(layer);
      }
      const waterInputs: BattleWaterInput[] = [
        ...(data.horizon?.oceanPlanes ?? []).map((spec) => ({ kind: "ocean" as const, spec })),
        ...lakes.map((spec) => ({ kind: "lake" as const, spec, grid })),
      ];
      const water = await admitted(
        () => new RawBattleWater(device, cameraLayout, environment, waterInputs, samples),
      );
      const scenery = own(await createRawScenery(device, cameraLayout, environment, samples));
      const uploadAdmission = beginGpuAdmission(device);
      try {
        scenery.upload(data.scenery);
      } finally {
        await uploadAdmission();
      }
      const backdrop = own(await createRawBackdrop(device, cameraLayout, environment, samples));
      const rectangleAdmission = beginGpuAdmission(device);
      try {
        backdrop.setRects(data.rect, expandedBattleTerrainRect(data.rect));
      } finally {
        await rectangleAdmission();
      }
      const setFrame = (nextZoom: number, nextStrength: number) => {
        backdrop.setStyle(terrainBackdropStyleForZoom(nextZoom));
        ground.setState(nextStrength);
        for (const layer of [...opaqueVista, ...transparentVista]) layer.setState(nextStrength);
      };
      setFrame(zoom, strength);
      if (disposed || cancelled) throw Error("Terrain preparation cancelled");
      return {
        grid,
        cover,
        data,
        ground,
        opaqueVista,
        transparentVista,
        water,
        scenery,
        backdrop,
        setFrame,
        dispose,
      };
    } catch (error) {
      dispose();
      throw error;
    }
  }
  async function replace(input: RawBattleTerrainInput) {
    check();
    if (pending) throw Error("Terrain replacement already pending");
    pending = true;
    try {
      const next = await prepare(input);
      check();
      next.setFrame(zoom, strength);
      const previous = active;
      active = next;
      staging = undefined;
      previous?.dispose();
    } catch (error) {
      staging?.dispose();
      throw error;
    } finally {
      pending = false;
      staging = undefined;
    }
  }
  const current = () => {
    check();
    if (!active) throw Error("Terrain scene has no committed presentation");
    return active;
  };
  try {
    await replace(initial);
  } catch (error) {
    staging?.dispose();
    active?.dispose();
    throw error;
  }
  return {
    replace,
    // Borrowed immutable snapshots: grass and terrain consume the same source-owned data copy.
    grid: () => current().grid,
    cover: () => current().cover,
    field: () => current().data.field,
    heightAt: (x: number, y: number) => {
      const d = current().data;
      return battleTerrainHeightAt(d.field, d.vista, d.rect, x, y);
    },
    rect: () => current().data.rect as readonly [number, number, number, number],
    setFrame(nextZoom: number, terrainDetailStrength: number) {
      check();
      zoom = nextZoom;
      strength = terrainDetailStrength;
      current().setFrame(zoom, strength);
    },
    drawOpaque(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
      const s = current();
      s.backdrop.encode(pass, camera);
      s.ground.encode(pass, camera);
      for (const layer of s.opaqueVista) layer.encode(pass, camera);
      s.water.encode(pass, camera);
      s.scenery.draw(pass, camera);
    },
    drawTransparent(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
      for (const layer of current().transparentVista) layer.encode(pass, camera);
    },
    drawShadow(pass: GPURenderPassEncoder, shadowCamera: GPUBindGroup) {
      const s = current();
      s.ground.encodeHorizonShadow(pass, shadowCamera);
      s.scenery.draw(pass, shadowCamera, "shadow");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      staging?.dispose();
      active?.dispose();
    },
  };
}
