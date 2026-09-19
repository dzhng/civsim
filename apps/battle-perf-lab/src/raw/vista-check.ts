import { createVistaControlBackend } from "../vistaControlBackend";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import {
  createGroundMesh,
  createVistaMesh,
} from "../../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { createBattleFrameUniforms } from "../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { buildBattleTerrainData } from "../../../../packages/game-renderer/src/battle/terrainSceneData";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { RawBattleFrame } from "../../../../packages/battle-renderer/src/world/frame";
import { RawBattleTerrain } from "../../../../packages/battle-renderer/src/world/terrain";
import { createRawEnvironment } from "../../../../packages/battle-renderer/src/world/environment";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";
import { trackTextureLifetime } from "../textureLifetimeCheck";
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const width = 768,
      height = 512,
      samples: 1 | 4 = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice()),
      errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const lifetime = trackTextureLifetime(device);
    releases.push(lifetime.restore);
    const env = CIVSIM_ENVIRONMENTS.golden;
    const world = own(
      await PhotorealWorld.create(document.createElement("canvas"), { antialias: samples === 4 }),
    );
    world.renderer.setSize(width, height);
    world.renderer.setPixelRatio(1);
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    const camera = new THREE.PerspectiveCamera(),
      post = own(new BattlePostChain(world.renderer, world.scene, camera, env.id));
    const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
    if (backend !== "raw" && backend !== "typegpu" && backend !== "vgpu")
      throw Error("Unknown vista backend");
    const environment =
      backend === "raw" ? own(await createRawEnvironment(device, env, samples)) : undefined;
    const frame = environment
      ? own(new RawBattleFrame(device, environment, width, height, samples, "rgba16float"))
      : undefined;
    const grid = {
      w: 32,
      h: 32,
      cell: 8,
      ox: -128,
      oy: -128,
      height: new Float32Array(1024),
      tint: new Uint8Array(1024),
    };
    const bands = [
      { name: "vista", cell: 16, half: 384, inner: 128 },
      { name: "farFog", cell: 64, half: 1408, inner: 384 },
    ].map(({ name, cell, half, inner }) => {
      const w = (half * 2) / cell + 1,
        h = w;
      return {
        name,
        cell,
        w,
        h,
        ox: -half,
        oy: -half,
        innerHalfW: inner,
        innerHalfH: inner,
        outerHalfW: half,
        outerHalfH: half,
        height: Float32Array.from({ length: w * h }, (_, i) => {
          const x = -half + (i % w) * cell,
            y = -half + Math.floor(i / w) * cell;
          return 25 + 35 * Math.sin(x * 0.006) * Math.cos(y * 0.004);
        }),
        water: new Float32Array(w * h),
      };
    });
    const data = buildBattleTerrainData(grid, "green-grass", { shape: "control", bands });
    const sourceFrame = createBattleFrameUniforms();
    const source = [
      createGroundMesh(sourceFrame, data.ground, { earthDistance: data.ground.earthDistance }),
      ...data.vistaMeshes.map((r) => createVistaMesh(sourceFrame, r.mesh, r.name)),
    ];
    for (const mesh of source) {
      world.scene.add(mesh);
      releases.push(() => {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) m.dispose();
        const texture = mesh.userData.earthDistanceTexture;
        if (texture instanceof THREE.Texture) texture.dispose();
      });
    }
    const driver =
      backend === "raw"
        ? undefined
        : own(await createVistaControlBackend(backend, device, env, data, width, height, samples));
    const layers =
      frame && environment
        ? [
            own(
              new RawBattleTerrain(
                device,
                frame.cameraLayout,
                environment,
                data.ground,
                null,
                { earthDistance: data.ground.earthDistance },
                "beauty",
                samples,
              ),
            ),
            ...data.vistaMeshes.map((r) =>
              own(
                new RawBattleTerrain(
                  device,
                  frame.cameraLayout,
                  environment,
                  r.mesh,
                  null,
                  { vistaBand: r.name },
                  "beauty",
                  samples,
                ),
              ),
            ),
          ]
        : [];
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
    const results = [];
    for (const [label, pitch, distance] of [
      ["overview", 0.65, 650],
      ["horizon", 0.15, 450],
      ["horizon-repeat", 0.15, 450],
    ] as const) {
      const params: Camera3DParams = {
        target: [0, 0, 0],
        distance,
        pitch,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 5000,
      };
      applyCamera3d(camera, params);
      (driver ?? frame!).setCamera(
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
        post.stats().grade.uniforms,
      );
      for (const bloom of [false, true]) {
        post.setBloomEnabled(bloom);
        if (driver) await driver.render(bloom);
        else {
          const encoder = device.createCommandEncoder();
          frame!.encode(
            encoder,
            output.createView(),
            (pass, group) => {
              for (const layer of layers) layer.encode(pass, group);
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
        const raw = await world.renderer.readRenderTargetPixelsAsync(
          reference,
          0,
          0,
          width,
          height,
        );
        if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
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
          actualRgba: bytes(actual),
          expectedRgba: bytes(expected),
        });
      }
    }
    for (const layer of layers) layer.dispose();
    driver?.dispose();
    frame?.dispose();
    environment?.dispose();
    output.destroy();
    const liveTextures = lifetime.liveCount();
    return {
      backend,
      samples,
      results,
      errors,
      liveTextures,
      rings: data.vistaMeshes.map((r) => ({ name: r.name, triangles: r.mesh.triangles })),
      passed:
        errors.length === 0 &&
        liveTextures === 0 &&
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
