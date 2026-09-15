import type { Gpu, FramePass } from "vgpu";
import type { BattleTerrainInput } from "../sceneTypes";
import { prepareBattleTerrain, battleGroundInputs } from "../terrainScenePreparation";
import { createSceneLifecycle } from "../sceneLifecycle";
import {
  battleTerrainHeightAt,
  expandedBattleTerrainRect,
} from "../../../../packages/game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../../packages/game-renderer/src/battle/terrainBackdropPolicy";
import type { VgpuEnvironment } from "./environment";
import { createVgpuTerrain } from "./terrain";
import { createVgpuWater } from "./water";
import { createVgpuScenery } from "./scenery";
import { createVgpuBackdrop } from "./backdrop";

type Disposable = { dispose(): void };
export async function createVgpuBattleTerrainScene(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  samples: 1 | 4,
  initial: BattleTerrainInput,
) {
  let active: Awaited<ReturnType<typeof prepare>> | undefined;
  let zoom = 1,
    strength = 1;
  const lifecycle = createSceneLifecycle(() => active?.dispose());
  async function prepare(input: BattleTerrainInput) {
    const prepared = prepareBattleTerrain(input);
    const { data, slopeBands, waterInputs } = prepared;
    const resources: Disposable[] = [];
    const dispose = () => {
      const errors: unknown[] = [];
      for (const r of resources.splice(0).reverse()) {
        try {
          r.dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Terrain resource cleanup failed");
    };
    const own = <T extends Disposable>(r: T): T => {
      resources.push(r);
      lifecycle.check();
      return r;
    };
    try {
      const ground = own(
        await createVgpuTerrain(
          gpu,
          camera,
          environment,
          data.ground,
          data.horizon,
          { earthDistance: data.ground.earthDistance, slopeBands, farGrass: true },
          "beauty",
          samples,
        ),
      );
      const opaqueVista: (typeof ground)[] = [],
        transparentVista: (typeof ground)[] = [];
      for (const ring of data.vistaMeshes) {
        const layer = own(
          await createVgpuTerrain(
            gpu,
            camera,
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
      const water = own(await createVgpuWater(gpu, camera, environment, waterInputs, samples));
      const scenery = own(await createVgpuScenery(gpu, camera, environment, samples));
      await scenery.upload(data.scenery);
      lifecycle.check();
      const backdrop = own(await createVgpuBackdrop(gpu, camera, environment, samples));
      backdrop.setRects(data.rect, expandedBattleTerrainRect(data.rect));
      const setFrame = (z: number, s: number) => {
        backdrop.setStyle(terrainBackdropStyleForZoom(z));
        ground.setState(s);
        for (const layer of [...opaqueVista, ...transparentVista]) layer.setState(s);
      };
      setFrame(zoom, strength);
      return {
        ...prepared,
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
      try {
        dispose();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Terrain preparation failed");
      }
      throw error;
    }
  }
  const replace = (input: BattleTerrainInput) =>
    lifecycle.run(async () => {
      const next = await prepare(input);
      try {
        lifecycle.check();
        next.setFrame(zoom, strength);
      } catch (error) {
        next.dispose();
        throw error;
      }
      const previous = active;
      active = next;
      previous?.dispose();
    });
  const current = () => {
    lifecycle.check();
    if (!active) throw Error("Terrain scene not ready");
    return active;
  };
  try {
    await replace(initial);
  } catch (error) {
    lifecycle.dispose();
    throw error;
  }
  return {
    replace,
    grid: () => current().grid,
    cover: () => current().cover,
    field: () => current().data.field,
    groundInputs: () => battleGroundInputs(current().data.ground),
    heightAt: (x: number, y: number) => {
      const d = current().data;
      return battleTerrainHeightAt(d.field, d.vista, d.rect, x, y);
    },
    rect: () => current().data.rect as readonly [number, number, number, number],
    setFrame(z: number, s: number) {
      lifecycle.check();
      zoom = z;
      strength = s;
      current().setFrame(z, s);
    },
    drawOpaque(pass: FramePass) {
      const s = current();
      s.backdrop.draw(pass);
      s.ground.draw(pass);
      for (const v of s.opaqueVista) v.draw(pass);
      s.water.draw(pass);
      s.scenery.draw(pass);
    },
    drawTransparent(pass: FramePass) {
      for (const v of current().transparentVista) v.draw(pass);
    },
    drawShadow(pass: FramePass, shadowCamera: typeof camera) {
      const s = current();
      s.ground.drawHorizonShadow(pass, shadowCamera);
      s.scenery.draw(pass, shadowCamera, "shadow");
    },
    dispose: lifecycle.dispose,
  };
}
