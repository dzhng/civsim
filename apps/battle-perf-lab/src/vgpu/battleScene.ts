import { nativeGpuScope } from "../../../../packages/battle-renderer/src/gpuScope";
import type { Gpu, Target } from "vgpu";
import type { BattleSceneOptions, BattleTerrainInput } from "../../../../packages/battle-renderer/src/sceneTypes";
import { createSceneLifecycle } from "../sceneLifecycle";
import { createVgpuEnvironment } from "./environment";
import { VgpuBattleFrame } from "./frame";
import { createVgpuSunShadow } from "./shadow";
import { createVgpuCrowdAudience } from "./crowdAudience";
import { createVgpuBattleTerrainScene } from "./terrainScene";
import { createVgpuGrassField } from "./grassField";
import { createVgpuStandards } from "./standards";
import { createVgpuReadout } from "./readout";
import { createVgpuLineLayer, createVgpuRingLayer, createVgpuTriangleLayer } from "./overlay";
import { battleSceneCamera } from "../../../../packages/battle-renderer/src/sceneCamera";
import { reverseZFrustumPlanes } from "../../../../packages/battle-renderer/src/crowdFrustum";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../packages/crowd-runtime/src/visibility";
import {
  terrainHeightAt,
  heightFieldRange,
} from "../../../../packages/game-renderer/src/terrain/heightField";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import {
  createWindUniforms,
  updateWindUniforms,
} from "../../../../packages/game-renderer/src/battle/windSignal";
import type { BattleStandardInstance } from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "../../../../packages/game-renderer/src/battle/readoutData";
import type {
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "../../../../packages/battle-renderer/src/types";

/** Borrowed vgpu context/output. Scene resources and ordering belong here; public
 * compute dispatches submit at their recorded command boundaries, never via raw draws. */
export async function createVgpuBattleScene(gpu: Gpu, options: BattleSceneOptions) {
  options.signal?.throwIfAborted();
  const releases: (() => void)[] = [];
  const life = createSceneLifecycle(() => {
    const errors: unknown[] = [];
    for (const release of releases.splice(0).reverse())
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    if (errors.length) throw new AggregateError(errors, "Battle scene cleanup failed");
  });
  const own = <T extends { dispose(): void }>(value: T): T => {
    releases.push(() => value.dispose());
    options.signal?.throwIfAborted();
    return value;
  };
  let prepared = false,
    bloom = options.bloom,
    post = options.post;
  let lastCamera: BattleCameraSnapshot | null = null;
  const mutate = <T>(operation: () => T | Promise<T>) =>
    life.run(() => {
      prepared = false;
      return operation();
    });
  try {
    if (options.shadows === "csm")
      throw Error("The vgpu candidate implements the fitted single shadow map, not High");
    const shadow =
      options.shadows === "off" ? undefined : own(createVgpuSunShadow(gpu, options.environment));
    const environment = own(
      await createVgpuEnvironment(gpu, options.environment, undefined, 3, options.samples, shadow),
    );
    const frame = own(
      await VgpuBattleFrame.create(
        gpu,
        environment,
        options.width,
        options.height,
        options.samples,
        options.outputFormat,
      ),
    );
    const terrain = own(
      await createVgpuBattleTerrainScene(
        gpu,
        frame.camera,
        environment,
        options.samples,
        options.terrain,
      ),
    );
    const crowd = own(
      await createVgpuCrowdAudience(
        gpu,
        options.assets,
        options.atlases,
        frame.camera,
        environment,
        options.samples,
      ),
    );
    const grass = own(
      await createVgpuGrassField(
        gpu,
        frame.camera,
        environment,
        options.grassProfile,
        options.samples,
      ),
    );
    grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
    grass.setVisible(options.grass);
    grass.setFarVisible(options.farGrass);
    const standards = own(
      await createVgpuStandards(gpu, frame.camera, environment, options.samples),
    );
    const readouts = own(await createVgpuReadout(gpu.device.gpu, options.samples));
    const ground = own(
      await createVgpuLineLayer(
        gpu,
        frame.camera,
        options.samples,
        { z: 0.25, drape: { heightAt: terrain.heightAt, step: 4 } },
        0.98,
        true,
      ),
    );
    const rings = own(
      await createVgpuRingLayer(gpu, frame.camera, options.samples, terrain.heightAt, 0.12),
    );
    const effects = own(
      await createVgpuLineLayer(
        gpu,
        frame.camera,
        options.samples,
        { z: 0, perVertexZ: true },
        0.92,
        false,
      ),
    );
    const triangles = own(await createVgpuTriangleLayer(gpu, frame.camera, options.samples));
    const updateShadowAudience = (): CrowdProjectionView[] =>
      shadow?.setWorldRect(terrain.rect(), heightFieldRange(terrain.field())).crowdViews ?? [];
    updateShadowAudience();
    const crowdViews = (camera: ReturnType<typeof battleSceneCamera>): CrowdProjectionView[] => [
      {
        shadow: false,
        frustum: { planes: reverseZFrustumPlanes(camera.viewProjection) },
        projection: camera.projection,
      },
      ...(shadow?.update(camera.snapshot.camera3d).crowdViews ?? []),
    ];
    const wind = createWindUniforms(),
      sun = photorealEnvironment(options.environment).sunDirection;
    options.signal?.throwIfAborted();
    return {
      pickingMeshes: () => terrain.pickingMeshes(),
      groundInputs: () => terrain.groundInputs(),
      grassReplayState: () => grass.snapshot(),
      readGrassDiagnostics: () => grass.readDiagnostics(),
      heightAt: (x: number, y: number) => {
        life.check();
        return terrain.heightAt(x, y);
      },
      seatingHeightAt: (x: number, y: number) => {
        life.check();
        return terrainHeightAt(terrain.field(), x, y);
      },
      replaceTerrain(input: BattleTerrainInput) {
        return mutate(async () => {
          let committed = false;
          try {
            await terrain.replace(input);
            committed = true;
            life.check();
            grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
            updateShadowAudience();
          } catch (error) {
            if (committed) life.dispose();
            throw error;
          }
        });
      },
      settleGrass(camera?: BattleCameraSnapshot) {
        return mutate(async () => {
          if (camera) grass.update(camera.camera3d, frame.height);
          await grass.settle();
          life.check();
        });
      },
      resize(width: number, height: number) {
        return mutate(async () => {
          await frame.resize(width, height);
          life.check();
        });
      },
      setVisibility(value: { grass: boolean; farGrass: boolean; bloom: boolean; post: boolean }) {
        life.idle();
        prepared = false;
        grass.setVisible(value.grass);
        grass.setFarVisible(value.farGrass);
        bloom = value.bloom;
        post = value.post;
      },
      uploadCrowd(instances: readonly CrowdInstance[], input: BattleCameraSnapshot, time = 0) {
        return mutate(async () => {
          const camera = battleSceneCamera(
            input,
            frame.width,
            frame.height,
            time,
            options.environment,
          );
          grass.update(camera.snapshot.camera3d, frame.height);
          await crowd.upload(instances, crowdViews(camera), camera.impostor);
          life.check();
          nativeGpuScope(gpu.device.gpu, "pose", () => crowd.precompute());
        });
      },
      uploadReadouts(
        nextStandards: readonly BattleStandardInstance[],
        nextReadouts: readonly BattleReadoutInstance[],
      ) {
        return mutate(async () => {
          await standards.upload(nextStandards);
          life.check();
          await readouts.upload(nextReadouts);
          life.check();
        });
      },
      uploadTriangles(vertices: Float32Array) {
        return mutate(() => triangles.upload(vertices));
      },
      uploadTacticalLines(lines: BattleTacticalLineFrame) {
        return mutate(async () => {
          await ground.upload(lines.groundCues);
          life.check();
          await rings.upload(lines.rings);
          life.check();
          await effects.upload(lines.effects);
          life.check();
        });
      },
      prepare(input: { camera: BattleCameraSnapshot; time: number }) {
        return mutate(async () => {
          const camera = battleSceneCamera(
            input.camera,
            frame.width,
            frame.height,
            input.time,
            options.environment,
          );
          frame.setCamera(camera.snapshot, camera.observer, options.grade);
          standards.setView(camera.view, input.time);
          readouts.setCamera(camera.viewProjection, camera.world);
          if (await crowd.reproject(crowdViews(camera), camera.impostor)) {
            nativeGpuScope(gpu.device.gpu, "pose", () => crowd.precompute());
          }
          crowd.refreshCamera(camera.impostor);
          updateWindUniforms(wind, input.time);
          await grass.prepare(
            camera.snapshot.camera3d,
            frame.height,
            {
              direction: [wind.meanDirection.value.x, wind.meanDirection.value.y],
              speed: wind.speed.value,
              gustPhase: wind.gustPhase.value,
              velocity: [wind.bandVelocity.value.x, wind.bandVelocity.value.y],
              frequency: wind.bandFrequency.value,
              sharpness: wind.bandSharpness.value,
            },
            sun,
          );
          life.check();
          terrain.setFrame(input.camera.zoom, grass.snapshot().terrainDetailStrength);
          lastCamera = {
            ...input.camera,
            camera3d: { ...input.camera.camera3d, target: [...input.camera.camera3d.target] },
          };
          prepared = true;
        });
      },
      render(output: Target) {
        return life.run(async () => {
          if (!prepared) throw Error("Battle scene has no completed preparation");
          await frame.render(
            output,
            () => nativeGpuScope(gpu.device.gpu, "grass", () => grass.route()),
            (pass) => {
              terrain.drawOpaque(pass);
              crowd.draw(pass);
              standards.draw(pass);
              grass.draw(pass);
              readouts.draw(pass);
              terrain.drawTransparent(pass);
              ground.draw(pass);
              rings.draw(pass);
              effects.draw(pass);
              triangles.draw(pass);
            },
            bloom,
            (current) => {
              if (shadow)
                nativeGpuScope(gpu.device.gpu, "shadow", () =>
                  shadow.encode(current, (pass) => {
                    terrain.drawShadow(pass, shadow.camera);
                    crowd.draw(pass, "shadow", shadow.camera);
                  }),
                );
            },
            post,
          );
        });
      },
      stats() {
        life.check();
        return {
          prepared,
          camera: lastCamera,
          crowd: crowd.stats(),
          grass: grass.stats(),
          standards: standards.stats(),
          readouts: readouts.stats(),
        };
      },
      dispose: life.dispose,
    };
  } catch (error) {
    try {
      life.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Scene construction and cleanup failed");
    }
    throw error;
  }
}
