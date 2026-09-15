import { RawSunShadow } from "./shadow";
import { configureSunShadows } from "../../../../packages/photoreal-renderer/src/battle/shadowRig";
import { createFrameControlBackend } from "../frameControlBackend";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import { PhotorealCrowd } from "../../../../packages/photoreal-renderer/src/battle/crowdLayer";
import { createGroundMesh } from "../../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { createBattleFrameUniforms } from "../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { loadAppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import { buildBattleTerrainData } from "../../../../packages/game-renderer/src/battle/terrainSceneData";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { generatedFormation } from "../../../../packages/crowd-runtime/src/instanceData";
import {
  planCrowdLods,
  type CrowdProjectionView,
} from "../../../../packages/crowd-runtime/src/visibility";
import {
  viewMatrix,
  projectionFootprint,
  projMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { resolveDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
import { createRawEnvironment, rawEnvironmentWgsl } from "./environment";
import type { WorldSurfaceDiagnostic } from "../shaders/environment";
import { createRawCrowd } from "./crowd";
import { RawBattleTerrain } from "./terrain";
import { RawBattleFrame } from "./frame";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";

const backend = new URL(location.href).searchParams.get("backend") ?? "raw";
const width = 768,
  height = 512;
const samples: 1 | 4 = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => {
      "dispose" in r ? r.dispose() : r.destroy();
    });
    return r;
  };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice());
    const errors: string[] = [];
    const poseProbe = new URL(location.href).searchParams.has("pose-probe");
    let poseBuffer: GPUBuffer | undefined;
    const createBuffer = device.createBuffer;
    if (poseProbe) {
      device.createBuffer = function (descriptor: GPUBufferDescriptor) {
        const palette =
          descriptor.label?.startsWith("native crowd rig") &&
          descriptor.label?.endsWith("-palette");
        const buffer = createBuffer.call(
          device,
          palette
            ? { ...descriptor, usage: descriptor.usage | GPUBufferUsage.COPY_SRC }
            : descriptor,
        );
        if (palette) poseBuffer = buffer;
        return buffer;
      };
      releases.push(() => {
        device.createBuffer = createBuffer;
      });
    }
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const caps = resolveDeviceCaps({
      adapterLimits: {
        maxBufferSize: device.limits.maxBufferSize,
        maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      },
      deviceFeatures: device.features,
      powerPreference: "default",
    });
    const shadows = new URL(location.href).searchParams.has("shadows");
    if (shadows && backend !== "raw")
      throw Error("Composed shadows not implemented for this backend yet");
    const env = CIVSIM_ENVIRONMENTS.golden;
    const world = own(
      await PhotorealWorld.create(document.createElement("canvas"), { antialias: samples === 4 }),
    );
    world.renderer.setSize(width, height);
    world.renderer.setPixelRatio(1);
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    const sourceShadow = shadows
      ? own(configureSunShadows(world.renderer, world.sunLight!, env, "single"))
      : undefined;
    const camera = new THREE.PerspectiveCamera();
    const post = own(new BattlePostChain(world.renderer, world.scene, camera, env.id));
    if (!["raw", "typegpu", "vgpu"].includes(backend)) throw new Error("Unknown frame backend");
    const candidateTextures = trackTextureLifetime(device);
    releases.push(candidateTextures.restore);
    const nativeShadow = shadows ? own(new RawSunShadow(device, env)) : undefined;
    const nativeEnv =
      backend === "raw"
        ? own(await createRawEnvironment(device, env, samples, nativeShadow))
        : undefined;
    const nativeDiagnostic = new URL(location.href).searchParams.get(
      "native-material",
    ) as WorldSurfaceDiagnostic | null;
    if (nativeDiagnostic && !nativeEnv) throw new Error("Native diagnostics require raw backend");
    if (nativeDiagnostic && nativeEnv)
      nativeEnv.shader = rawEnvironmentWgsl(env, nativeDiagnostic, shadows);
    const nativeFrame = nativeEnv
      ? own(new RawBattleFrame(device, nativeEnv, width, height, samples, "rgba16float"))
      : undefined;
    const shadowCameraGroup =
      nativeShadow && nativeFrame
        ? device.createBindGroup({
            layout: nativeFrame.cameraLayout,
            entries: [{ binding: 0, resource: { buffer: nativeShadow.camera } }],
          })
        : undefined;
    const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
    const catalog = await (await fetch(catalogUrl)).json();
    const assets = {
      0: await loadAppearanceBundle(new URL(catalog.appearances[0], catalogUrl).href),
    };
    const sourceCrowd = own(await PhotorealCrowd.create(world.renderer, world.scene, assets));
    const nativeCrowd =
      nativeFrame && nativeEnv
        ? own(
            await createRawCrowd(device, caps, assets, nativeFrame.cameraLayout, nativeEnv, {
              sampleCount: samples,
            }),
          )
        : undefined;
    const grid = {
      w: 20,
      h: 20,
      cell: 2,
      ox: -20,
      oy: -20,
      tint: new Uint8Array(400),
      height: new Float32Array(400),
    };
    const data = buildBattleTerrainData(grid, "green-grass", null);
    sourceShadow?.setWorldRect(data.rect);
    nativeShadow?.setWorldRect(data.rect);
    const ground = createGroundMesh(createBattleFrameUniforms(), data.ground, {
      earthDistance: data.ground.earthDistance,
    });
    world.scene.add(ground);
    releases.push(() => {
      ground.geometry.dispose();
      const materials = Array.isArray(ground.material) ? ground.material : [ground.material];
      materials.forEach((m) => m.dispose());
      const texture = ground.userData.earthDistanceTexture;
      if (texture instanceof THREE.Texture) texture.dispose();
    });
    const driver =
      backend === "raw"
        ? undefined
        : own(
            await createFrameControlBackend(
              backend as "typegpu" | "vgpu",
              device,
              env,
              assets,
              data.ground,
              width,
              height,
              samples,
            ),
          );
    const nativeGround =
      nativeFrame && nativeEnv
        ? own(
            new RawBattleTerrain(
              device,
              nativeFrame.cameraLayout,
              nativeEnv,
              data.ground,
              null,
              { earthDistance: data.ground.earthDistance },
              "beauty",
              samples,
            ),
          )
        : undefined;
    const output = own(
      device.createTexture({
        size: [width, height],
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    const reference = own(
      new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false }),
    );
    const instances = generatedFormation(12, {
      columns: 4,
      spacing: 1.5,
      clip: assets[0].manifest.presentation!.actions.ready!.clip,
      phase: 0.31,
    });
    const grade = post.stats().grade.uniforms;
    if (new URL(location.href).searchParams.has("settle-init"))
      await device.queue.onSubmittedWorkDone();
    const results = [];
    let priorHdr: number[] | undefined;
    let priorPose: number[] | undefined;
    for (const [label, pitch, distance] of [
      ["tactical", 0.65, 15],
      ["tactical-repeat", 0.65, 15],
      ["horizon", 0.15, 23],
    ] as const) {
      const params: Camera3DParams = {
        target: [0, 0, 0],
        distance,
        pitch,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 3000,
      };
      applyCamera3d(camera, params);
      const views: CrowdProjectionView[] = [
        {
          frustum: { planes: [] },
          projection: projectionFootprint(
            viewMatrix(params),
            projMatrix(params),
            height,
            params.near,
          ),
          shadow: false,
        },
      ];
      if (sourceShadow) views.push(...sourceShadow.cullingViews());
      const plan = planCrowdLods(instances, views, assets);
      sourceCrowd.upload(instances, { camera, views });
      if (driver) await driver.upload(instances, plan);
      else nativeCrowd!.upload(instances, plan);
      (driver ?? nativeFrame!).setCamera(
        {
          camera3d: params,
          x: 0,
          y: 0,
          zoom: height / (2 * distance * Math.tan(0.4)),
          width,
          height,
          time: 0,
          sunAzimuth: env.sunAzimuth,
          sunElevation: env.sunElevation,
        },
        [0, 0, 0],
        grade,
      );
      for (const bloom of [false, true]) {
        post.setBloomEnabled(bloom);
        if (driver) {
          await driver.render(bloom);
        } else {
          const encoder = device.createCommandEncoder();
          nativeCrowd!.precompute(encoder);
          nativeShadow?.encode(encoder, (pass) =>
            nativeCrowd!.draw(pass, shadowCameraGroup!, "shadow"),
          );
          nativeFrame!.encode(
            encoder,
            output.createView(),
            (pass, group) => {
              nativeGround!.encode(pass, group);
              nativeCrowd!.draw(pass, group);
            },
            bloom,
          );
          device.queue.submit([encoder.finish()]);
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        world.renderer.setRenderTarget(reference);
        post.render(world.scene, camera);
        world.renderer.setRenderTarget(null);
        const actual = Array.from(await readHdrTexture(device, driver?.output ?? output));
        const hdr = Array.from(await readHdrTexture(device, driver?.hdr ?? nativeFrame!.hdr));
        const priorHdrDifference = priorHdr ? compareHdr(hdr, priorHdr) : null;
        priorHdr = hdr;
        let priorPoseDifference = null;
        if (poseBuffer) {
          const staging = device.createBuffer({
            size: poseBuffer.size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
          try {
            const copy = device.createCommandEncoder();
            copy.copyBufferToBuffer(poseBuffer, 0, staging, 0, poseBuffer.size);
            device.queue.submit([copy.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const pose = Array.from(new Float32Array(staging.getMappedRange().slice(0)));
            priorPoseDifference = priorPose ? compareHdr(pose, priorPose) : null;
            priorPose = pose;
          } finally {
            staging.destroy();
          }
        }
        const raw = await world.renderer.readRenderTargetPixelsAsync(
          reference,
          0,
          0,
          width,
          height,
        );
        if (!(raw instanceof Uint16Array)) throw Error("Expected HDR half readback");
        const expected = Array.from(unpackRgba16fRows(raw, width, height));
        const bytes = (a: number[]) =>
          encodeRgba8Base64(
            Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
          );
        results.push({
          label: `${label}-${bloom ? "bloom" : "plain"}`,
          width,
          height,
          comparison: compareHdr(actual, expected),
          priorHdrDifference,
          priorPoseDifference,
          actualRgba: bytes(actual),
          expectedRgba: bytes(expected),
        });
      }
    }
    driver?.dispose();
    nativeGround?.dispose();
    nativeCrowd?.dispose();
    nativeFrame?.dispose();
    nativeEnv?.dispose();
    nativeShadow?.dispose();
    output.destroy();
    const liveCandidateTexturesAfterDispose = candidateTextures.liveCount();
    return {
      backend,
      liveCandidateTexturesAfterDispose,
      samples,
      shadows,
      nativeDiagnostic,
      results,
      errors,
      passed:
        errors.length === 0 &&
        liveCandidateTexturesAfterDispose === 0 &&
        results.every((r) => r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255),
    };
  } finally {
    for (const release of releases.reverse()) release();
  }
}
run()
  .then((result) => Object.assign(window, { __frameCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __frameCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
