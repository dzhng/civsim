import { createGroundMesh } from "../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { buildBattleTerrainData } from "../../../packages/game-renderer/src/battle/terrainSceneData";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../packages/photoreal-renderer/src/post/postChain";
import {
  createOceanPlaneMesh,
  createLakePlaneMesh,
} from "../../../packages/photoreal-renderer/src/battle/seaLayer";
import type { BattleWaterInput } from "../../../packages/battle-renderer/src/waterData";
import { createBattleFrameUniforms } from "../../../packages/photoreal-renderer/src/battle/battleTsl";
import { CIVSIM_ENVIRONMENTS } from "../../../packages/game-renderer/src/environment/environment";
import type { Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "./numericalReadback";
import { encodeRgba8Base64 } from "./imageTransport";
import { trackTextureLifetime } from "./textureLifetimeCheck";
export async function runWaterControl(backend: "raw" | "typegpu" | "vgpu") {
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
    const kind = new URL(location.href).searchParams.get("kind") === "lake" ? "lake" : "ocean";
    const grid = {
      w: 32,
      h: 32,
      cell: 8,
      ox: -128,
      oy: -128,
      height: new Float32Array(1024),
      tint: Uint8Array.from({ length: 1024 }, (_, i) =>
        Math.hypot((i % 32) - 15.5, Math.floor(i / 32) - 15.5) < 14 ? 1 : 0,
      ),
    };
    const input: BattleWaterInput =
      kind === "ocean"
        ? {
            kind,
            spec: {
              rect: { x0: -200, y0: -300, x1: 1600, y1: 1800, res: 160 },
              baseZ: 0,
              shoreX: -200,
            },
          }
        : {
            kind,
            spec: {
              id: 1,
              level: 0,
              minCellX: 0,
              minCellY: 0,
              maxCellX: 31,
              maxCellY: 31,
              minX: -128,
              minY: -128,
              maxX: 128,
              maxY: 128,
              cells: 616,
            },
            grid,
          };
    for (let i = 0; i < grid.height.length; i++) grid.height[i] = grid.tint[i] === 1 ? -2 : 2;
    const groundData = buildBattleTerrainData(grid, "green-grass", null).ground;
    const sourceFrame = createBattleFrameUniforms();
    const sourceGround = createGroundMesh(sourceFrame, groundData, {
      earthDistance: groundData.earthDistance,
    });
    if (kind === "lake") world.scene.add(sourceGround);
    releases.push(() => {
      sourceGround.geometry.dispose();
      for (const material of Array.isArray(sourceGround.material)
        ? sourceGround.material
        : [sourceGround.material])
        material.dispose();
      const texture = sourceGround.userData.earthDistanceTexture;
      if (texture instanceof THREE.Texture) texture.dispose();
    });
    const source =
      input.kind === "lake"
        ? createLakePlaneMesh(sourceFrame, input.spec, input.grid)
        : createOceanPlaneMesh(sourceFrame, input.spec);
    if (!source) throw Error("Missing water");
    world.scene.add(source);
    releases.push(() => {
      source.geometry.dispose();
      for (const material of Array.isArray(source.material) ? source.material : [source.material])
        material.dispose();
    });
    const candidate = own(
      backend === "raw"
        ? await (
            await import("./raw/waterControlBackend")
          ).createRawWaterControlBackend(device, env, input, groundData, width, height, samples)
        : await (
            await import("./waterControlBackend")
          ).createWaterControlBackend(
            backend,
            device,
            env,
            input,
            groundData,
            width,
            height,
            samples,
          ),
    );
    const beforeDispose = candidate.waterStats();
    const reference = own(
      new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false }),
    );
    const results = [];
    for (const [label, pitch, distance] of [
      ["overview", 0.65, kind === "lake" ? 330 : 650],
      ["horizon", 0.22, kind === "lake" ? 230 : 450],
      ["horizon-repeat", 0.22, kind === "lake" ? 230 : 450],
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
      candidate.setCamera(
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
      for (const time of [0, 3.25]) {
        sourceFrame.time.value = time;
        candidate.setCamera(
          {
            camera3d: params,
            x: 0,
            y: 0,
            zoom: height / (2 * distance * Math.tan(0.4)),
            width,
            height,
            time,
            sunAzimuth: env.sunAzimuth,
            sunElevation: env.sunElevation,
          },
          [0, 0, 0],
          post.stats().grade.uniforms,
        );
        const bloom = false;
        post.setBloomEnabled(bloom);
        await candidate.render(bloom);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        world.renderer.setRenderTarget(reference);
        post.render(world.scene, camera);
        world.renderer.setRenderTarget(null);
        const actual = Array.from(await readHdrTexture(device, candidate.output));
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
          label: `${kind}-${label}-t${time}`,
          width,
          height,
          comparison: compareHdr(actual, expected),
          actualRgba: bytes(actual),
          expectedRgba: bytes(expected),
        });
      }
    }
    candidate.dispose();
    const liveTextures = lifetime.liveCount();
    return {
      samples,
      backend,
      lifecycle: candidate.lifecycle,
      results,
      errors,
      liveTextures,
      kind,
      beforeDispose,
      afterDispose: candidate.waterStats(),
      passed:
        errors.length === 0 &&
        liveTextures === 0 &&
        candidate.waterStats().ownedBuffers === 0 &&
        results.every((r) => r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255),
    };
  } finally {
    for (const release of releases.reverse()) release();
  }
}
