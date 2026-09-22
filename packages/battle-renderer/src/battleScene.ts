import { BATTLE_REVIEW_VISIBILITY } from "./sceneTypes";
import { nativeGpuScope } from "./gpuScope";
import { beginGpuAdmission } from "./gpuAdmission";
import type { TgpuCommandEncoder } from "typegpu";
import { createSceneLifecycle } from "./sceneLifecycle";
import type {
  BattleSceneOptions,
  BattleMeshPreviewOptions,
  BattleReviewVisibility,
} from "./sceneTypes";
import { createTypegpuEnvironment } from "./world/environment";
import { TypegpuBattleFrame } from "./world/frame";
import { createTypegpuSunShadow } from "./world/shadow";
import { createTypegpuCrowdAudience } from "./world/crowdAudience";
import { createTypegpuBattleTerrainScene } from "./world/terrainScene";
import type { BattleTerrainInput } from "./sceneTypes";
import { createTypegpuGrassField } from "./world/grassField";
import { createTypegpuStandards } from "./world/standards";
import { createTypegpuReadout } from "./world/readout";
import {
  createTypegpuLineLayer,
  createTypegpuRingLayer,
  createTypegpuTriangleLayer,
} from "./world/overlay";
import { battleSceneCamera } from "./sceneCamera";
import { reverseZFrustumPlanes } from "./crowdFrustum";
import type { CrowdInstance } from "../../crowd-runtime/src/instanceData";
import type { CrowdProjectionView } from "../../crowd-runtime/src/visibility";
import { terrainHeightAt, heightFieldRange } from "../../game-renderer/src/terrain/heightField";
import { photorealEnvironment } from "../../game-renderer/src/environment/physicalEnvironment";
import { createWindUniforms, updateWindUniforms } from "../../game-renderer/src/battle/windSignal";
import type { BattleStandardInstance } from "../../game-renderer/src/models/shared/battleStandardData";
import type { BattleReadoutInstance } from "../../game-renderer/src/battle/readoutData";
import type {
  AdmittedSeatingIdentity,
  AdmittedSeatingVerification,
  BattleCameraSnapshot,
  BattleTacticalLineFrame,
} from "./types";

/** Complete TypeGPU scene submission. The caller owns simulation/presentation data,
 * device and canvas; this owner owns every scene resource and final pass ordering. */
export async function createTypegpuBattleScene(
  device: GPUDevice,
  options: BattleSceneOptions | BattleMeshPreviewOptions,
) {
  options.signal?.throwIfAborted();
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(value: T): T => {
    releases.push(() => value.dispose());
    options.signal?.throwIfAborted();
    return value;
  };
  let posedCamera: { camera: BattleCameraSnapshot; time: number } | null = null,
    preparedCamera: BattleCameraSnapshot | null = null;
  let bloom = options.bloom,
    post = options.post;
  let prepared = false;
  let reviewVisibility: BattleReviewVisibility = { ...BATTLE_REVIEW_VISIBILITY };
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
    const shadow =
      options.shadows === "off"
        ? undefined
        : own(createTypegpuSunShadow(device, options.environment, options.shadows));
    const environment = own(
      await createTypegpuEnvironment(
        device,
        options.environment,
        undefined,
        options.samples,
        shadow,
        !options.reviewClay,
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
        options.reviewClay,
      ),
    );
    const newCrowdAudience = (published: Pick<typeof options, "assets" | "atlases">) =>
      createTypegpuCrowdAudience(
        device,
        published.assets,
        published.atlases,
        frame.cameraGroup,
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
    // Two triangle layers, as the source has: the block-debug view persists across
    // frames whose attack arcs are empty, so it cannot share the arc layer's buffers.
    const debugBlocks = options.debugBlocks
      ? own(await createTypegpuTriangleLayer(device, frame.cameraGroup, options.samples))
      : null;
    const triangles = own(
      await createTypegpuTriangleLayer(device, frame.cameraGroup, options.samples),
    );
    // One camera bind group per cascade: the caster passes are encoded into the
    // same submission, so they cannot share one buffer.
    const shadowCameras = shadow?.cameraGroups ?? [];
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
    // Every camera this scene poses the crowd through, detached from the caller's
    // mutable snapshot: a source upload admits a drawable pose before anything has
    // prepared, so a crowd replacement in that window still has a camera to carry it
    // through. Only a completed preparation also publishes its camera as the prepared
    // one, so an upload is never reported as a presented frame.
    const rememberCamera = (input: BattleCameraSnapshot, time: number, completed: boolean) => {
      const camera: BattleCameraSnapshot = {
        ...input,
        camera3d: { ...input.camera3d, target: [...input.camera3d.target] },
      };
      posedCamera = { camera, time };
      if (completed) preparedCamera = camera;
    };
    // The one surface soldiers are seated on: the playable height field, without
    // the vista apron `heightAt` adds. The crowd builder and every later
    // verification of what it built share this exact sampler.
    const seatingHeightAt = (x: number, y: number) => terrainHeightAt(terrain.field(), x, y);
    /** Identity of the current admitted pose and committed terrain generation. O(1)
     *  — every counter is one its owner already keeps — so a consumer may record it
     *  on each presented frame. Null while nothing is admitted, or while no terrain
     *  generation is committed. */
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
      setReviewVisibility(value: BattleReviewVisibility) {
        lifecycle.idle();
        reviewVisibility = { ...value };
        prepared = false;
      },
      pickingMeshes: () => terrain.pickingMeshes(),
      groundInputs: () => terrain.groundInputs(),
      grassReplayState: () => grass.snapshot(),
      readGrassDiagnostics: () => grass.readDiagnostics(),
      readGrassRouting: () => grass.readRouting(),
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
        if (lifecycle.busy) return refuse("Battle scene preparation is in flight");
        if (!installed) return refuse("No admitted crowd pose over a committed terrain generation");
        const measurement = crowd.verifySeating(seatingHeightAt);
        // An identified pose that measures nothing is an empty population, which
        // is an unseated world rather than a world that passed.
        if (!measurement) return refuse("The admitted crowd pose is empty");
        return { measurement, unavailable: null, installed };
      },
      admittedCrowdPoses: () => crowd.admittedPoses(),
      debugSoldierAnim: (index: number) => crowd.debugSoldierAnim(index),
      /** Stage a complete new crowd and atlas generation. A failed load, a rejected
       * admission or disposal releases the staged resources and keeps the installed
       * crowd; terrain, environment and frame attachments are never rebuilt. */
      async replaceCrowdAssets(
        published: Pick<typeof options, "assets" | "atlases">,
        validate?: () => void,
      ) {
        return lifecycle.run(async () => {
          // Replacement is exclusive: keep this scope through every staged upload,
          // then validate before retiring the last drawable generation.
          const admitGpu = beginGpuAdmission(device);
          try {
            const staged = await newCrowdAudience(published);
            try {
              check();
              validate?.();
              const carried = crowd.admitted();
              if (carried && posedCamera) {
                const camera = battleSceneCamera(
                  posedCamera.camera,
                  frame.width,
                  frame.height,
                  posedCamera.time,
                  options.environment,
                );
                await staged.upload(carried, crowdViews(camera), camera.impostor);
                check();
                const encoder = frame.createCommandEncoder();
                nativeGpuScope(device, "pose", () =>
                  staged.precompute(frame.nativeEncoder(encoder)),
                );
                encoder.submit();
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
          }
        });
      },
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
          // This camera admitted a drawable pose, so a replacement before the first
          // preparation carries it through the same one. No frame was prepared here.
          rememberCamera(input, time, false);
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
      async uploadDebugBlocks(vertices: Float32Array) {
        return lifecycle.run(async () => {
          if (!debugBlocks) throw Error("Block-debug rendering was not enabled");
          prepared = false;
          await debugBlocks.upload(vertices);
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
          terrain.setFrame(
            input.camera.zoom,
            grass.snapshot().terrainDetailStrength,
            camera.projection,
          );
          rememberCamera(input.camera, input.time, true);
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
        // The shadow owner labels and orders its own cascade passes; each gets
        // its own camera bind group and the SAME union audience and poses.
        shadow?.encode(encoder, (pass, cascade) => {
          terrain.drawShadow(pass, shadowCameras[cascade], reviewVisibility);
          if (reviewVisibility.crowd) crowd.draw(pass, "shadow", shadowCameras[cascade]);
        });
        frame.encode(
          encoder,
          output,
          (pass, camera) => {
            terrain.drawOpaque(pass, reviewVisibility);
            if (reviewVisibility.crowd) crowd.draw(pass, "main", camera);
            standards.draw(pass, camera);
            grass.draw(pass, camera);
            // Source readouts are opaque cutouts, before the transparent render list.
            readouts.draw(pass);
            terrain.drawTransparent(pass, reviewVisibility);
            ground.draw(pass);
            rings.draw(pass);
            effects.draw(pass);
            // Source order: formation blocks under the attack arcs, both above the cues.
            debugBlocks?.draw(pass);
            triangles.draw(pass);
          },
          bloom,
          post,
        );
      },
      stats: () => ({
        prepared,
        reviewClay: options.reviewClay ?? false,
        reviewVisibility: { ...reviewVisibility },
        preparedCamera,
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
    try {
      dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Scene construction and cleanup failed");
    }
    throw error;
  }
}
