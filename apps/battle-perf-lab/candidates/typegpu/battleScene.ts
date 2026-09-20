import { nativeGpuScope } from "../../../../packages/battle-renderer/src/gpuScope";
import type { TgpuCommandEncoder } from "typegpu";
import { createSceneLifecycle } from "../../src/sceneLifecycle";
import type { BattleSceneOptions } from "../../../../packages/battle-renderer/src/sceneTypes";
import { createTypegpuEnvironment } from "./environment";
import { TypegpuBattleFrame } from "./frame";
import { createTypegpuSunShadow } from "./shadow";
import { createTypegpuCrowdAudience } from "./crowdAudience";
import { createTypegpuBattleTerrainScene } from "./terrainScene";
import type { BattleTerrainInput } from "../../../../packages/battle-renderer/src/sceneTypes";
import { createTypegpuGrassField } from "./grassField";
import { createTypegpuStandards } from "./standards";
import { createTypegpuReadout } from "./readout";
import {
  createTypegpuLineLayer,
  createTypegpuRingLayer,
  createTypegpuTriangleLayer,
} from "./overlay";
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

/** Complete TypeGPU scene submission. The caller owns simulation/presentation data,
 * device and canvas; this owner owns every scene resource and final pass ordering. */
export async function createTypegpuBattleScene(device: GPUDevice, options: BattleSceneOptions) {
  options.signal?.throwIfAborted();
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(value: T): T => {
    releases.push(() => value.dispose());
    options.signal?.throwIfAborted();
    return value;
  };
  let lastCamera: BattleCameraSnapshot | null = null;
  let bloom = options.bloom,
    post = options.post;
  let prepared = false;
  const lifecycle = createSceneLifecycle(() => {
    const errors: unknown[] = [];
    for (const release of releases.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "TypeGPU scene cleanup failed");
  });
  const check = lifecycle.check;
  const dispose = lifecycle.dispose;
  try {
    if (options.shadows === "csm")
      throw Error("The TypeGPU candidate implements the fitted single shadow map, not High");
    const shadow =
      options.shadows === "off"
        ? undefined
        : own(createTypegpuSunShadow(device, options.environment));
    const environment = own(
      await createTypegpuEnvironment(
        device,
        options.environment,
        undefined,
        options.samples,
        shadow,
      ),
    );
    const frame = own(
      await TypegpuBattleFrame.create(
        device,
        environment,
        options.width,
        options.height,
        options.samples,
        options.outputFormat,
      ),
    );
    const terrain = own(
      await createTypegpuBattleTerrainScene(
        device,
        frame.cameraBuffer,
        frame.cameraGroup,
        environment,
        options.samples,
        options.terrain,
      ),
    );
    const crowd = own(
      await createTypegpuCrowdAudience(
        device,
        options.assets,
        options.atlases,
        frame.cameraGroup,
        environment,
        options.samples,
      ),
    );
    const grass = own(
      await createTypegpuGrassField(device, environment, options.grassProfile, options.samples),
    );
    grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
    grass.setVisible(options.grass);
    grass.setFarVisible(options.farGrass);
    const standards = own(await createTypegpuStandards(device, environment, options.samples));
    const readouts = own(await createTypegpuReadout(device, options.samples));
    const ground = own(
      await createTypegpuLineLayer(
        device,
        frame.cameraGroup,
        options.samples,
        { z: 0.25, drape: { heightAt: terrain.heightAt, step: 4 } },
        0.98,
        true,
      ),
    );
    const rings = own(
      await createTypegpuRingLayer(
        device,
        frame.cameraGroup,
        options.samples,
        terrain.heightAt,
        0.12,
      ),
    );
    const effects = own(
      await createTypegpuLineLayer(
        device,
        frame.cameraGroup,
        options.samples,
        { z: 0, perVertexZ: true },
        0.92,
        false,
      ),
    );
    const triangles = own(
      await createTypegpuTriangleLayer(device, frame.cameraGroup, options.samples),
    );
    const shadowCamera = shadow?.cameraGroup;
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
      readGrassRouting: () => grass.readRouting(),
      heightAt: terrain.heightAt,
      seatingHeightAt: (x: number, y: number) => terrainHeightAt(terrain.field(), x, y),
      async replaceTerrain(input: BattleTerrainInput) {
        return lifecycle.run(async () => {
          const previousPrepared = prepared;
          let committed = false;
          prepared = false;
          try {
            await terrain.replace(input);
            committed = true;
            check();
            grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
            updateShadowAudience();
          } catch (error) {
            // A failed staged replacement preserves the old scene. After terrain commits,
            // a dependent failure is terminal rather than presenting mixed generations.
            if (committed) dispose();
            else prepared = previousPrepared;
            throw error;
          }
        });
      },
      async settleGrass(camera?: BattleCameraSnapshot) {
        return lifecycle.run(async () => {
          prepared = false;

          if (camera) grass.update(camera.camera3d, frame.height);
          await grass.settle();
          check();
        });
      },
      async resize(width: number, height: number) {
        return lifecycle.run(async () => {
          await frame.resize(width, height);
          check();
          prepared = false;
        });
      },
      setVisibility(value: { grass: boolean; farGrass: boolean; bloom: boolean; post: boolean }) {
        lifecycle.idle();
        grass.setVisible(value.grass);
        grass.setFarVisible(value.farGrass);
        bloom = value.bloom;
        post = value.post;
        prepared = false;
      },
      async uploadCrowd(
        instances: readonly CrowdInstance[],
        input: BattleCameraSnapshot,
        time = 0,
      ) {
        return lifecycle.run(async () => {
          prepared = false;
          const camera = battleSceneCamera(
            input,
            frame.width,
            frame.height,
            time,
            options.environment,
          );
          grass.update(camera.snapshot.camera3d, frame.height);
          await crowd.upload(instances, crowdViews(camera), camera.impostor);
          check();
          // Source pose work belongs to each draw update, including updates before a render.
          const encoder = frame.createCommandEncoder();
          nativeGpuScope(device, "pose", () => crowd.precompute(frame.nativeEncoder(encoder)));
          encoder.submit();
        });
      },
      async uploadReadouts(
        nextStandards: readonly BattleStandardInstance[],
        nextReadouts: readonly BattleReadoutInstance[],
      ) {
        return lifecycle.run(async () => {
          prepared = false;

          await standards.upload(nextStandards);
          check();
          await readouts.upload(nextReadouts);
          check();
        });
      },
      async uploadTriangles(vertices: Float32Array) {
        return lifecycle.run(async () => {
          prepared = false;
          await triangles.upload(vertices);
        });
      },
      async uploadTacticalLines(lines: BattleTacticalLineFrame) {
        return lifecycle.run(async () => {
          prepared = false;
          await ground.upload(lines.groundCues);
          check();
          await rings.upload(lines.rings);
          check();
          await effects.upload(lines.effects);
        });
      },
      async prepare(input: { camera: BattleCameraSnapshot; time: number }) {
        return lifecycle.run(async () => {
          prepared = false;

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
            const encoder = frame.createCommandEncoder();
            nativeGpuScope(device, "pose", () => crowd.precompute(frame.nativeEncoder(encoder)));
            encoder.submit();
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
          check();
          terrain.setFrame(input.camera.zoom, grass.snapshot().terrainDetailStrength);
          lastCamera = {
            ...input.camera,
            camera3d: { ...input.camera.camera3d, target: [...input.camera.camera3d.target] },
          };
          prepared = true;
        });
      },
      createCommandEncoder: () => {
        lifecycle.idle();
        return frame.createCommandEncoder();
      },
      encode(encoder: TgpuCommandEncoder, output: GPUTextureView) {
        check();
        if (!prepared || lifecycle.busy) throw Error("Battle scene has no completed preparation");
        nativeGpuScope(device, "grass", () => grass.route(encoder));
        if (shadow && shadowCamera)
          nativeGpuScope(device, "shadow", () =>
            shadow.encode(encoder, (pass) => {
              terrain.drawShadow(pass, shadowCamera);
              crowd.draw(pass, "shadow", shadowCamera);
            }),
          );
        frame.encode(
          encoder,
          output,
          (pass, camera) => {
            terrain.drawOpaque(pass);
            crowd.draw(pass, "main", camera);
            standards.draw(pass, camera);
            grass.draw(pass, camera);
            // Source readouts are opaque cutouts, before the transparent render list.
            readouts.draw(pass);
            terrain.drawTransparent(pass);
            ground.draw(pass);
            rings.draw(pass);
            effects.draw(pass);
            triangles.draw(pass);
          },
          bloom,
          post,
        );
      },
      stats: () => ({
        prepared,
        camera: lastCamera,
        crowd: crowd.stats(),
        grass: grass.stats(),
        standards: standards.stats(),
        readouts: readouts.stats(),
      }),
      dispose,
    };
  } catch (error) {
    try {
      dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Scene construction and cleanup failed");
    }
    throw error;
  }
}
