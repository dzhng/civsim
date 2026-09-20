import {
  prepareBattleTerrain,
  terrainPickingMeshes,
  battleGroundInputs,
} from "../../../../packages/battle-renderer/src/terrainScenePreparation";
import type { BattleTerrainInput } from "../../../../packages/battle-renderer/src/sceneTypes";
import {
  battleTerrainHeightAt,
  expandedBattleTerrainRect,
} from "../../../../packages/game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../../packages/game-renderer/src/battle/terrainBackdropPolicy";
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
          "beauty",
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
    setFrame(nextZoom: number, terrainDetailStrength: number) {
      check();
      zoom = nextZoom;
      strength = terrainDetailStrength;
      current().setFrame(zoom, strength);
    },
    drawOpaque(pass: TgpuRenderPass) {
      const s = current();
      s.backdrop.draw(pass);
      s.ground.draw(pass);
      for (const layer of s.opaqueVista) layer.draw(pass);
      s.water.draw(pass);
      s.scenery.draw(pass);
    },
    drawTransparent(pass: TgpuRenderPass) {
      for (const layer of current().transparentVista) layer.draw(pass);
    },
    drawShadow(pass: TgpuRenderPass, shadowCamera: TgpuBindGroup) {
      const s = current();
      s.ground.drawHorizonShadow(pass, shadowCamera);
      s.scenery.draw(pass, shadowCamera, "shadow");
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
