import { BATTLE_REVIEW_VISIBILITY } from "../sceneTypes";
import {
  prepareBattleTerrain,
  terrainPickingMeshes,
  battleGroundInputs,
} from "../terrainScenePreparation";
import type { BattleTerrainInput, BattleReviewVisibility } from "../sceneTypes";
import {
  battleTerrainHeightAt,
  expandedBattleTerrainRect,
} from "../../../game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../game-renderer/src/battle/terrainBackdropPolicy";
import type { TypegpuEnvironment } from "./environment";
import type { TgpuRenderPass, TgpuBindGroup } from "typegpu";
import { createTypegpuTerrain } from "./terrain";
import { createTypegpuWater } from "./water";
import { createTypegpuScenery } from "./scenery";
import { createTypegpuBackdrop } from "./backdrop";
type Disposable = { dispose(): void };
/** One committed terrain presentation. Replacements never expose a partial scene. */
export async function createTypegpuBattleTerrainScene(
  device: GPUDevice,
  cameraBuffer: GPUBuffer,
  cameraGroup: TgpuBindGroup,
  environment: TypegpuEnvironment,
  samples: 1 | 4,
  initial: BattleTerrainInput,
  clay = false,
) {
  let disposed = false,
    pending = false,
    zoom = 1,
    strength = 1,
    generation = 0;
  let staging: { dispose(): void } | undefined;
  let active: Awaited<ReturnType<typeof prepare>> | undefined;
  const check = () => {
    if (disposed) throw Error("Terrain scene disposed");
  };
  async function prepare(input: BattleTerrainInput) {
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
    try {
      const { grid, cover, data, slopeBands, waterInputs } = prepareBattleTerrain(input);
      // These surfaces have no same-view equal-depth prepass; invariant clip output can
      // constrain upstream arithmetic and change grazing interpolants.
      const ground = own(
        await createTypegpuTerrain(
          device,
          cameraBuffer,
          environment,
          data.ground,
          data.horizon,
          { earthDistance: data.ground.earthDistance, slopeBands, farGrass: true },
          clay ? "clay" : "beauty",
          samples,
        ),
      );
      const opaqueVista: Awaited<ReturnType<typeof createTypegpuTerrain>>[] = [],
        transparentVista: Awaited<ReturnType<typeof createTypegpuTerrain>>[] = [];
      for (const ring of data.vistaMeshes) {
        const layer = own(
          await createTypegpuTerrain(
            device,
            cameraBuffer,
            environment,
            ring.mesh,
            null,
            { vistaBand: ring.name, slopeBands, farGrass: true },
            "beauty",
            samples,
          ),
        );
        (ring.name === "farFog" ? transparentVista : opaqueVista).push(layer);
      }
      const water = own(
        await createTypegpuWater(device, cameraGroup, environment, waterInputs, samples),
      );
      const scenery = own(await createTypegpuScenery(device, cameraGroup, environment, samples));
      await scenery.upload(data.scenery);
      check();
      const backdrop = own(await createTypegpuBackdrop(device, cameraBuffer, environment, samples));
      await backdrop.setRects(data.rect, expandedBattleTerrainRect(data.rect));
      check();
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
        slopeBands,
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
  async function replace(input: BattleTerrainInput) {
    check();
    if (pending) throw Error("Terrain replacement already pending");
    pending = true;
    try {
      const next = await prepare(input);
      check();
      next.setFrame(zoom, strength);
      const previous = active;
      active = next;
      generation++;
      staging = undefined;
      previous?.dispose();
    } catch (error) {
      staging?.dispose();
      throw error;
    } finally {
      pending = false;
      if (disposed) {
        staging?.dispose();
        active?.dispose();
      }
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
    pickingMeshes: () => terrainPickingMeshes(current().data),
    groundInputs: () => battleGroundInputs(current().data.ground),
    heightAt: (x: number, y: number) => {
      const d = current().data;
      return battleTerrainHeightAt(d.field, d.vista, d.rect, x, y);
    },
    rect: () => current().data.rect as readonly [number, number, number, number],
    // Presentation records need only this identity, not aggregated water/scenery stats.
    committedGeneration: () => (disposed || !active ? null : generation),
    /** Content of the terrain generation currently committed. Every count is a
     *  number its owner already holds, so reading stats never rescans the world.
     *  A disposed or uncommitted scene reports that, not zeros that read as an
     *  empty map. */
    stats() {
      const committed = disposed ? undefined : active;
      if (!committed)
        return {
          installed: false,
          generation,
          replacing: pending,
          groundTriangles: null,
          scenery: null,
          vistaBands: null,
          groundCover: null,
          groundStyle: null,
          slopeBands: null,
          vista: null,
          water: null,
        };
      return {
        installed: true,
        generation,
        replacing: pending,
        groundTriangles: committed.ground.stats().groundTriangles,
        scenery: committed.scenery.stats().scenery,
        vistaBands: committed.opaqueVista.length + committed.transparentVista.length,
        groundCover: committed.cover,
        groundStyle: clay ? ("clay" as const) : ("beauty" as const),
        slopeBands: committed.slopeBands ? { ...committed.slopeBands } : null,
        vista: committed.data.vista
          ? {
              shape: committed.data.vista.shape,
              bands: committed.data.vista.bands
                .filter((band) =>
                  committed.data.vistaMeshes.some((mesh) => mesh.name === band.name),
                )
                .map(({ height: _height, water: _water, ...band }) => ({ ...band })),
            }
          : null,
        water: committed.water.stats(),
      };
    },
    setFrame(nextZoom: number, terrainDetailStrength: number) {
      check();
      zoom = nextZoom;
      strength = terrainDetailStrength;
      current().setFrame(zoom, strength);
    },
    drawOpaque(pass: TgpuRenderPass, visible: BattleReviewVisibility = BATTLE_REVIEW_VISIBILITY) {
      const s = current();
      if (visible.vista) s.backdrop.draw(pass);
      s.ground.draw(pass, { ground: visible.ground, horizon: visible.vista });
      if (visible.vista) for (const layer of s.opaqueVista) layer.draw(pass);
      if (visible.water) s.water.draw(pass);
      if (visible.scenery) s.scenery.draw(pass);
    },
    drawTransparent(
      pass: TgpuRenderPass,
      visible: BattleReviewVisibility = BATTLE_REVIEW_VISIBILITY,
    ) {
      if (visible.vista) for (const layer of current().transparentVista) layer.draw(pass);
    },
    drawShadow(
      pass: TgpuRenderPass,
      shadowCamera: TgpuBindGroup,
      visible: BattleReviewVisibility = BATTLE_REVIEW_VISIBILITY,
    ) {
      const s = current();
      if (visible.vista) s.ground.drawHorizonShadow(pass, shadowCamera);
      if (visible.scenery) s.scenery.draw(pass, shadowCamera, "shadow");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Let pending typed uploads settle before destroying the resources they use.
      if (!pending) {
        staging?.dispose();
        active?.dispose();
      }
    },
  };
}
