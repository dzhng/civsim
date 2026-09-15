import { createRawEnvironment } from "./environment";
import { RawBattleFrame } from "./frame";
import { RawSunShadow } from "./shadow";
import { createRawCrowdAudience } from "./crowdAudience";
import { createRawBattleTerrainScene, type RawBattleTerrainInput } from "./terrainScene";
import { createRawGrassField } from "./grassField";
import { createRawStandards } from "./standards";
import { createRawReadout } from "./readout";
import { createRawLineLayer, createRawRingLayer, createRawTriangleLayer } from "./overlay";
import { battleSceneCamera } from "../sceneCamera";
import { reverseZFrustumPlanes } from "../crowdFrustum";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import type { ImpostorAtlasData } from "../../../../packages/soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../packages/crowd-runtime/src/visibility";
import type { GpuDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
import { terrainHeightAt } from "../../../../packages/game-renderer/src/terrain/heightField";
import { projectionFootprint } from "../../../../packages/renderer-core/src/camera3d";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import type { CivsimEnvironment } from "../../../../packages/game-renderer/src/environment/environment";
import type { BattlePostGradeUniforms } from "../../../../packages/game-renderer/src/environment/postParameters";
import type { BladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import {
  createWindUniforms,
  updateWindUniforms,
} from "../../../../packages/game-renderer/src/battle/windSignal";
import type { BattleStandardInstance } from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "../../../../packages/game-renderer/src/battle/readoutData";
import type {
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "../../../../packages/photoreal-renderer/src/battle/battleWorld";

export interface RawBattleSceneOptions {
  environment: CivsimEnvironment;
  assets: Record<number, AppearanceBundle>;
  atlases: Record<number, ImpostorAtlasData>;
  terrain: RawBattleTerrainInput;
  grassProfile: BladeFieldProfile;
  width: number;
  height: number;
  samples: 1 | 4;
  outputFormat: GPUTextureFormat;
  shadows: boolean;
  grass: boolean;
  farGrass: boolean;
  bloom: boolean;
  post: boolean;
  grade: BattlePostGradeUniforms;
  signal?: AbortSignal;
}

/** Complete native scene submission. The caller owns simulation/presentation data,
 * device and canvas; this owner owns every scene resource and final pass ordering. */
export async function createRawBattleScene(
  device: GPUDevice,
  caps: GpuDeviceCaps,
  options: RawBattleSceneOptions,
) {
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
  let disposed = false,
    busy = false,
    prepared = false;
  const check = () => {
    if (disposed) throw Error("Battle scene disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of releases.reverse()) release();
  };
  try {
    const shadow = options.shadows ? own(new RawSunShadow(device, options.environment)) : undefined;
    const environment = own(
      await createRawEnvironment(device, options.environment, options.samples, shadow),
    );
    const frame = own(
      new RawBattleFrame(
        device,
        environment,
        options.width,
        options.height,
        options.samples,
        options.outputFormat,
      ),
    );
    const terrain = own(
      await createRawBattleTerrainScene(
        device,
        frame.cameraLayout,
        environment,
        options.samples,
        options.terrain,
      ),
    );
    const crowd = own(
      await createRawCrowdAudience(
        device,
        caps,
        options.assets,
        options.atlases,
        frame.cameraLayout,
        environment,
        options.samples,
      ),
    );
    const grass = own(
      await createRawGrassField(
        device,
        frame.cameraLayout,
        environment,
        options.grassProfile,
        options.samples,
      ),
    );
    grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
    grass.setVisible(options.grass);
    grass.setFarVisible(options.farGrass);
    const standards = own(
      await createRawStandards(device, frame.cameraLayout, environment, options.samples),
    );
    const readouts = own(createRawReadout(device, options.samples));
    const ground = own(
      await createRawLineLayer(
        device,
        frame.cameraLayout,
        options.samples,
        { z: 0.25, drape: { heightAt: terrain.heightAt, step: 4 } },
        0.98,
        true,
      ),
    );
    const rings = own(
      await createRawRingLayer(device, frame.cameraLayout, options.samples, terrain.heightAt, 0.12),
    );
    const effects = own(
      await createRawLineLayer(
        device,
        frame.cameraLayout,
        options.samples,
        { z: 0, perVertexZ: true },
        0.92,
        false,
      ),
    );
    const triangles = own(
      await createRawTriangleLayer(device, frame.cameraLayout, options.samples),
    );
    const shadowCamera = shadow
      ? device.createBindGroup({
          layout: frame.cameraLayout,
          entries: [{ binding: 0, resource: { buffer: shadow.camera } }],
        })
      : undefined;
    const updateShadowAudience = (): CrowdProjectionView[] => {
      const data = shadow?.setWorldRect(terrain.rect());
      return data
        ? [
            {
              shadow: true,
              frustum: { planes: reverseZFrustumPlanes(data.viewProjection) },
              projection: projectionFootprint(data.view, data.projection, data.mapSize, data.near),
            },
          ]
        : [];
    };
    let shadowViews = updateShadowAudience();
    const wind = createWindUniforms(),
      sun = photorealEnvironment(options.environment).sunDirection;
    options.signal?.throwIfAborted();
    return {
      groundInputs: () => terrain.groundInputs(),
      grassReplayState: () => grass.snapshot(),
      grassRoutingBuffers: () => grass.routingBuffers(),
      heightAt: terrain.heightAt,
      seatingHeightAt: (x: number, y: number) => terrainHeightAt(terrain.field(), x, y),
      async replaceTerrain(input: RawBattleTerrainInput) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        busy = true;
        const previousPrepared = prepared;
        let committed = false;
        prepared = false;
        try {
          await terrain.replace(input);
          committed = true;
          check();
          grass.setTerrain(terrain.grid(), terrain.field(), terrain.cover());
          shadowViews = updateShadowAudience();
        } catch (error) {
          // A failed staged replacement preserves the old scene. After terrain commits,
          // a dependent failure is terminal rather than presenting mixed generations.
          if (committed) dispose();
          else prepared = previousPrepared;
          throw error;
        } finally {
          busy = false;
        }
      },
      async settleGrass(camera?: BattleCameraSnapshot) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        busy = true;
        prepared = false;
        try {
          if (camera) grass.update(camera.camera3d, frame.height);
          await grass.settle();
          check();
        } finally {
          busy = false;
        }
      },
      async resize(width: number, height: number) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        busy = true;
        try {
          await frame.resize(width, height);
          check();
          prepared = false;
        } finally {
          busy = false;
        }
      },
      setVisibility(value: { grass: boolean; farGrass: boolean; bloom: boolean; post: boolean }) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        grass.setVisible(value.grass);
        grass.setFarVisible(value.farGrass);
        bloom = value.bloom;
        post = value.post;
        prepared = false;
      },
      uploadCrowd(instances: readonly CrowdInstance[], input: BattleCameraSnapshot, time = 0) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        prepared = false;
        const camera = battleSceneCamera(
          input,
          frame.width,
          frame.height,
          time,
          options.environment,
        );
        grass.update(camera.snapshot.camera3d, frame.height);
        crowd.upload(
          instances,
          [
            {
              shadow: false,
              frustum: { planes: reverseZFrustumPlanes(camera.viewProjection) },
              projection: camera.projection,
            },
            ...shadowViews,
          ],
          camera.impostor,
        );
        // Source pose work belongs to each draw update, including updates before a render.
        const encoder = device.createCommandEncoder({ label: "battle pose update" });
        crowd.precompute(encoder);
        device.queue.submit([encoder.finish()]);
      },
      async uploadReadouts(
        nextStandards: readonly BattleStandardInstance[],
        nextReadouts: readonly BattleReadoutInstance[],
      ) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        busy = true;
        prepared = false;
        try {
          await standards.upload(nextStandards);
          check();
          readouts.upload(nextReadouts);
        } finally {
          busy = false;
        }
      },
      uploadTriangles(vertices: Float32Array) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        triangles.upload(vertices);
        prepared = false;
      },
      uploadTacticalLines(lines: BattleTacticalLineFrame) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        ground.upload(lines.groundCues);
        rings.upload(lines.rings);
        effects.upload(lines.effects);
        prepared = false;
      },
      async prepare(input: { camera: BattleCameraSnapshot; time: number }) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        busy = true;
        prepared = false;
        try {
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
        } finally {
          busy = false;
        }
      },
      encode(encoder: GPUCommandEncoder, output: GPUTextureView) {
        check();
        if (!prepared || busy) throw Error("Battle scene has no completed preparation");
        grass.route(encoder);
        if (shadow && shadowCamera)
          shadow.encode(encoder, (pass) => {
            terrain.drawShadow(pass, shadowCamera);
            crowd.draw(pass, shadowCamera, "shadow");
          });
        frame.encode(
          encoder,
          output,
          (pass, camera) => {
            terrain.drawOpaque(pass, camera);
            crowd.draw(pass, camera);
            standards.draw(pass, camera);
            grass.draw(pass, camera);
            // Source readouts are opaque cutouts, before the transparent render list.
            readouts.draw(pass);
            terrain.drawTransparent(pass, camera);
            ground.encode(pass, camera);
            rings.encode(pass, camera);
            effects.encode(pass, camera);
            triangles.encode(pass, camera);
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
    dispose();
    throw error;
  }
}
