import { nativeGpuScope } from "../../../../packages/battle-renderer/src/gpuScope";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import type {
  BattleCrowdAssets,
  BattleSceneOptions,
  BattleTerrainInput,
} from "../../../../packages/battle-renderer/src/sceneTypes";
import { createRawEnvironment } from "./world/environment";
import { RawBattleFrame } from "./world/frame";
import { RawSunShadow } from "./world/shadow";
import { createRawCrowdAudience } from "./world/crowdAudience";
import { createRawBattleTerrainScene } from "./world/terrainScene";
import { createRawGrassField } from "./world/grassField";
import { createRawStandards } from "./world/standards";
import { createRawReadout } from "./world/readout";
import { createRawLineLayer, createRawRingLayer, createRawTriangleLayer } from "./world/overlay";
import { battleSceneCamera } from "../../../../packages/battle-renderer/src/sceneCamera";
import { reverseZFrustumPlanes } from "../../../../packages/battle-renderer/src/crowdFrustum";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../../../packages/crowd-runtime/src/visibility";
import type { GpuDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
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
  AdmittedSeatingIdentity,
  AdmittedSeatingVerification,
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "../../../../packages/battle-renderer/src/types";

/** Complete native scene submission. The caller owns simulation/presentation data,
 * device and canvas; this owner owns every scene resource and final pass ordering. */
export async function createRawBattleScene(
  device: GPUDevice,
  caps: GpuDeviceCaps,
  options: BattleSceneOptions,
) {
  options.signal?.throwIfAborted();
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(value: T): T => {
    releases.push(() => value.dispose());
    options.signal?.throwIfAborted();
    return value;
  };
  let lastCamera: BattleCameraSnapshot | null = null,
    lastTime = 0;
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
    const shadow =
      options.shadows === "off"
        ? undefined
        : own(new RawSunShadow(device, options.environment, options.shadows));
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
    const newCrowdAudience = (published: BattleCrowdAssets) =>
      createRawCrowdAudience(
        device,
        caps,
        published.assets,
        published.atlases,
        frame.cameraLayout,
        environment,
        options.samples,
      );
    // Replaceable, so the release reads the installed generation rather than the first.
    let crowd = await newCrowdAudience(options);
    // A replacement history restarts its submission counter at 0, so the submission
    // alone cannot identify a pose across one. This epoch is what distinguishes them.
    let crowdGeneration = 0;
    releases.push(() => crowd.dispose());
    options.signal?.throwIfAborted();
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
    // Two triangle layers, as the source has: the block-debug view persists across
    // frames whose attack arcs are empty, so it cannot share the arc layer's buffers.
    const debugBlocks = options.debugBlocks
      ? own(await createRawTriangleLayer(device, frame.cameraLayout, options.samples))
      : null;
    const triangles = own(
      await createRawTriangleLayer(device, frame.cameraLayout, options.samples),
    );
    // One camera bind group per cascade: the caster passes are encoded into the
    // same submission, so they cannot share one buffer.
    const shadowCameras =
      shadow?.cameras.map((buffer) =>
        device.createBindGroup({
          layout: frame.cameraLayout,
          entries: [{ binding: 0, resource: { buffer } }],
        }),
      ) ?? [];
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
    // The last prepared camera, detached from the caller's mutable snapshot. A crowd
    // replacement reprojects the carried pose through it rather than a second owner.
    const rememberCamera = (camera: BattleCameraSnapshot, time: number) => {
      lastCamera = {
        ...camera,
        camera3d: { ...camera.camera3d, target: [...camera.camera3d.target] },
      };
      lastTime = time;
    };
    // The one surface soldiers are seated on: the playable height field, without
    // the vista apron `heightAt` adds. The crowd builder and every later
    // verification of what it built share this exact sampler.
    const seatingHeightAt = (x: number, y: number) => terrainHeightAt(terrain.field(), x, y);
    /** Identity of the current admitted pose and committed terrain generation. O(1) — every counter is one its owner
     *  already keeps — so a consumer may record it on each presented frame. Null
     *  while nothing is admitted, or while no terrain generation is committed. */
    const admittedSeatingIdentity = (): AdmittedSeatingIdentity | null => {
      check();
      const submission = crowd.admittedSubmission();
      const terrainGeneration = terrain.committedGeneration();
      if (submission === null || terrainGeneration === null) return null;
      return { crowdGeneration, submission, terrainGeneration };
    };
    const wind = createWindUniforms(),
      sun = photorealEnvironment(options.environment).sunDirection;
    options.signal?.throwIfAborted();
    return {
      pickingMeshes: () => terrain.pickingMeshes(),
      groundInputs: () => terrain.groundInputs(),
      grassReplayState: () => grass.snapshot(),
      grassRoutingBuffers: () => grass.routingBuffers(),
      heightAt: terrain.heightAt,
      seatingHeightAt,
      admittedSeatingIdentity,
      /** Re-measure the whole admitted population against the installed playable
       *  height field. Verification only: it submits nothing, allocates no army
       *  copy, and no frame or stats read reaches it. A caller holding a presented
       *  frame's identity must compare it against `installed` before attributing
       *  the measurement to that frame. */
      verifyAdmittedSeating(): AdmittedSeatingVerification {
        check();
        const installed = admittedSeatingIdentity();
        const refuse = (unavailable: string): AdmittedSeatingVerification => ({
          measurement: null,
          unavailable,
          installed,
        });
        // A staged operation is mid-flight, so what is admitted now is not what
        // this scene is about to present.
        if (busy) return refuse("Battle scene preparation is in flight");
        if (!installed) return refuse("No admitted crowd pose over a committed terrain generation");
        const measurement = crowd.verifySeating(seatingHeightAt);
        // An identified pose that measures nothing is an empty population, which
        // is an unseated world rather than a world that passed.
        if (!measurement) return refuse("The admitted crowd pose is empty");
        return { measurement, unavailable: null, installed };
      },
      async replaceTerrain(input: BattleTerrainInput) {
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
          updateShadowAudience();
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
      /** Stage a complete new crowd and atlas generation. A failed load, a rejected
       * admission or disposal releases the staged resources and keeps the installed
       * crowd; terrain, environment and frame attachments are never rebuilt. */
      async replaceCrowdAssets(published: BattleCrowdAssets, validate?: () => void) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        // Replacement is exclusive: keep this scope through every staged upload,
        // then validate before retiring the last drawable generation.
        const admitGpu = beginGpuAdmission(device);
        busy = true;
        try {
          const staged = await newCrowdAudience(published);
          try {
            check();
            validate?.();
            check();
            const carried = crowd.admitted();
            if (carried && lastCamera) {
              const camera = battleSceneCamera(
                lastCamera,
                frame.width,
                frame.height,
                lastTime,
                options.environment,
              );
              staged.upload(carried, crowdViews(camera), camera.impostor);
              const encoder = device.createCommandEncoder({ label: "battle pose update" });
              nativeGpuScope(device, "pose", () => staged.precompute(encoder));
              device.queue.submit([encoder.finish()]);
            }
            await admitGpu();
            validate?.();
            check();
          } catch (error) {
            staged.dispose();
            throw error;
          }
          crowd.dispose();
          crowd = staged;
          crowdGeneration++;
          prepared = false;
        } finally {
          await admitGpu().catch(() => {});
          busy = false;
        }
      },
      admittedCrowdPoses: () => crowd.admittedPoses(),
      debugSoldierAnim: (index: number) => crowd.debugSoldierAnim(index),
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
        crowd.upload(instances, crowdViews(camera), camera.impostor);
        // Source pose work belongs to each draw update, including updates before a render.
        const encoder = device.createCommandEncoder({ label: "battle pose update" });
        nativeGpuScope(device, "pose", () => crowd.precompute(encoder));
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
      uploadDebugBlocks(vertices: Float32Array) {
        check();
        if (busy) throw Error("Battle scene preparation already in flight");
        if (!debugBlocks) throw Error("Block-debug rendering was not enabled");
        debugBlocks.upload(vertices);
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
          // The canonical admitted frame publishes its view matrix and near
          // plane FIRST; every shadow fit and the receiver block below are then
          // derived from that same camera, so receivers never blend a fit
          // against a different frame's view.
          frame.setCamera(camera.snapshot, camera.observer, options.grade);
          standards.setView(camera.view, input.time);
          readouts.setCamera(camera.viewProjection, camera.world);
          if (crowd.reproject(crowdViews(camera), camera.impostor)) {
            const encoder = device.createCommandEncoder({ label: "battle camera pose update" });
            nativeGpuScope(device, "pose", () => crowd.precompute(encoder));
            device.queue.submit([encoder.finish()]);
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
          rememberCamera(input.camera, input.time);
          prepared = true;
        } finally {
          busy = false;
        }
      },
      encode(encoder: GPUCommandEncoder, output: GPUTextureView) {
        check();
        if (!prepared || busy) throw Error("Battle scene has no completed preparation");
        nativeGpuScope(device, "grass", () => grass.route(encoder));
        // The shadow owner labels and orders its own cascade passes; each gets
        // its own camera bind group and the SAME union audience and poses.
        shadow?.encode(encoder, (pass, cascade) => {
          terrain.drawShadow(pass, shadowCameras[cascade]);
          crowd.draw(pass, shadowCameras[cascade], "shadow");
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
            // Source order: formation blocks under the attack arcs, both above the cues.
            debugBlocks?.encode(pass, camera);
            triangles.encode(pass, camera);
          },
          bloom,
          post,
        );
      },
      /** What this scene has actually installed. `preparedCamera` is the pose the
       *  last completed `prepare` wrote into the frame, which is NOT the pose of
       *  the last frame that reached the queue: a preparation still in flight, or
       *  one whose submission failed, has already replaced it. A consumer
       *  reporting a presented camera must take it from its own presentation
       *  record. */
      stats: () => ({
        prepared,
        preparedCamera: lastCamera,
        environment: options.environment.id,
        depth: frame.depthStats(),
        shadows: shadow?.stats() ?? {
          mode: "off" as const,
          cascades: 0,
          mapSize: 0,
          layers: 0,
          depthBytes: 0,
          cameraBuffers: 0,
          receiverBytes: 0,
        },
        crowd: crowd.stats(),
        grass: grass.stats(),
        standards: standards.stats(),
        readouts: readouts.stats(),
        terrain: terrain.stats(),
        tacticalLines: {
          groundCues: ground.stats(),
          rings: rings.stats(),
          effects: effects.stats(),
          triangles: triangles.stats(),
          debugBlocks: debugBlocks?.stats() ?? null,
        },
      }),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
