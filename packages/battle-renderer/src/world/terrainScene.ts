import {
  prepareBattleTerrain,
  terrainPickingMeshes,
  battleGroundInputs,
} from "../terrainScenePreparation";
import type { BattleTerrainInput } from "../sceneTypes";
import {
  battleTerrainHeightAt,
  expandedBattleTerrainRect,
} from "../../../game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../game-renderer/src/battle/terrainBackdropPolicy";
import type { RawEnvironment } from "./environment";
import { RawBattleTerrain } from "./terrain";
import { RawBattleWater } from "./water";
import { createRawScenery } from "./scenery";
import { createRawBackdrop } from "./backdrop";
import { beginGpuAdmission } from "../gpuAdmission";
type Disposable = { dispose(): void };
/** One committed terrain presentation. Replacements never expose a partial scene. */
export async function createRawBattleTerrainScene(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
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
      const { grid, cover, data, slopeBands, waterInputs } = prepareBattleTerrain(input);
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
          scenery: null,
          vistaBands: null,
          water: null,
        };
      return {
        installed: true,
        generation,
        replacing: pending,
        scenery: committed.scenery.stats().scenery,
        vistaBands: committed.opaqueVista.length + committed.transparentVista.length,
        water: committed.water.stats(),
      };
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
