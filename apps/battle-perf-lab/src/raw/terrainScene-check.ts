import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import {
  BattleTerrainSurface,
  buildBattleTerrain,
} from "../../../../packages/photoreal-renderer/src/battle/battleTerrainBuild";
import { BattleBackgroundQuads } from "../../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { PhotorealScenery } from "../../../../packages/photoreal-renderer/src/battle/foliageLayer";
import { createBattleFrameUniforms } from "../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { createBladeFieldTransitionUniforms } from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import {
  initialBladeFieldTransition,
  productionBladeFieldProfile,
} from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { createSeaDisplacementSource } from "../../../../packages/photoreal-renderer/src/battle/seaLayer";
import { configureSunShadows } from "../../../../packages/photoreal-renderer/src/battle/shadowRig";
import { expandedBattleTerrainRect } from "../../../../packages/game-renderer/src/battle/terrainSurfacePolicy";
import { terrainBackdropStyleForZoom } from "../../../../packages/game-renderer/src/battle/terrainBackdropPolicy";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { RawBattleFrame } from "../../../../packages/battle-renderer/src/world/frame";
import { createRawEnvironment } from "../../../../packages/battle-renderer/src/world/environment";
import { RawSunShadow } from "../../../../packages/battle-renderer/src/world/shadow";
import { createRawBattleTerrainScene } from "../../../../packages/battle-renderer/src/world/terrainScene";
import type { BattleTerrainInput } from "../../../../packages/battle-renderer/src/sceneTypes";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import { trackBufferLifetime } from "../bufferLifetimeCheck";
function fixture(vista: boolean): BattleTerrainInput {
  const w = vista ? 32 : 16,
    h = w,
    cell = 8,
    half = (w * cell) / 2;
  const grid = {
    w,
    h,
    cell,
    ox: -half,
    oy: -half,
    tint: new Uint8Array(w * h),
    height: new Float32Array(w * h),
    speed: new Float32Array(w * h).fill(1),
    rough: new Float32Array(w * h),
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!vista && x === 0) {
        grid.tint[y * w + x] = 3;
        grid.speed[y * w + x] = 0;
      }
      if (!vista && x === w - 1) {
        grid.tint[y * w + x] = 1;
        grid.speed[y * w + x] = 0;
      }
      if (vista && x > 20 && x < 25 && y > 8 && y < 13) grid.tint[y * w + x] = 4;
      if (x >= 6 && x <= 8 && y >= 6 && y <= 8) grid.tint[y * w + x] = 1;
    }
  const bands = [
    { name: "vista", cell: 16, half: 384, inner: 128 },
    { name: "farFog", cell: 64, half: 1408, inner: 384 },
  ].map(({ name, cell, half, inner }) => {
    const w = (half * 2) / cell + 1;
    return {
      name,
      cell,
      w,
      h: w,
      ox: -half,
      oy: -half,
      innerHalfW: inner,
      innerHalfH: inner,
      outerHalfW: half,
      outerHalfH: half,
      height: Float32Array.from(
        { length: w * w },
        (_, i) =>
          25 +
          35 *
            Math.sin((-half + (i % w) * cell) * 0.006) *
            Math.cos((-half + Math.floor(i / w) * cell) * 0.004),
      ),
      water: new Float32Array(w * w),
    };
  });
  return {
    grid,
    cover: "green-grass",
    vista: vista ? { shape: "terrain-owner-control", bands } : null,
    lakes: [
      {
        id: 1,
        level: 0,
        minCellX: 6,
        minCellY: 6,
        maxCellX: 8,
        maxCellY: 8,
        minX: -half + 6 * cell,
        minY: -half + 6 * cell,
        maxX: -half + 9 * cell,
        maxY: -half + 9 * cell,
        cells: 9,
      },
    ],
  };
}
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T) => {
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
    const textures = trackTextureLifetime(device),
      buffers = trackBufferLifetime(device);
    releases.push(textures.restore, buffers.restore);
    const env = CIVSIM_ENVIRONMENTS.golden,
      world = own(
        await PhotorealWorld.create(document.createElement("canvas"), { antialias: samples === 4 }),
      );
    world.renderer.setSize(width, height);
    world.renderer.setPixelRatio(1);
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    const sourceShadow = own(configureSunShadows(world.renderer, world.sunLight!, env, "single"));
    const camera = new THREE.PerspectiveCamera(),
      post = own(new BattlePostChain(world.renderer, world.scene, camera, env.id));
    post.setBloomEnabled(false);
    const sourceFrame = createBattleFrameUniforms(),
      transition = createBladeFieldTransitionUniforms(
        initialBladeFieldTransition(productionBladeFieldProfile()),
      ),
      sea = createSeaDisplacementSource();
    const source = own(new BattleTerrainSurface(world.scene)),
      backdrop = own(new BattleBackgroundQuads(world.scene, sourceFrame)),
      scenery = own(new PhotorealScenery(world.scene));
    const a = fixture(false),
      b = fixture(true);
    const shadow = own(new RawSunShadow(device, env)),
      environment = own(await createRawEnvironment(device, env, samples, shadow)),
      frame = own(new RawBattleFrame(device, environment, width, height, samples, "rgba16float"));
    const shadowCamera = device.createBindGroup({
      layout: frame.cameraLayout,
      entries: [{ binding: 0, resource: { buffer: shadow.camera } }],
    });
    const native = own(
      await createRawBattleTerrainScene(device, frame.cameraLayout, environment, samples, a),
    );
    const ownedSnapshot =
      native.grid() !== a.grid &&
      native.grid().tint !== a.grid.tint &&
      native.grid().height === native.field().height &&
      native.cover() === a.cover;
    if (!ownedSnapshot) throw Error("Terrain and grass do not share an owned grid/field snapshot");
    const setSource = (input: BattleTerrainInput) => {
      const built = buildBattleTerrain({
        grid: input.grid,
        cover: input.cover,
        vista: input.vista,
        lakeSurfaces: input.lakes,
        slopeBands: input.slopeBands ?? null,
        frame: sourceFrame,
        grassTransition: transition,
        sea,
      });
      source.replace(built);
      scenery.upload(built.scenery);
      backdrop.setRects(built.rect, expandedBattleTerrainRect(built.rect));
      sourceShadow.setWorldRect(built.rect);
      shadow.setWorldRect(built.rect);
    };
    setSource(a);
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
    let repeat: number[] | undefined, pending: Promise<void> | undefined;
    let failedReplacement = false,
      pendingPreserved = false,
      initialField = native.field();
    for (const label of [
      "initial",
      "repeat",
      "failed-replacement",
      "pending-old",
      "vista",
      "restored",
      "weak-detail",
      "horizon",
      "horizon-repeat",
    ] as const) {
      if (label === "failed-replacement") {
        const create = device.createBuffer;
        let count = 0;
        device.createBuffer = function (...args) {
          if (++count === 2) throw Error("Injected replacement allocation failure");
          return create.apply(this, args);
        };
        try {
          await native.replace(b);
        } catch {
          failedReplacement = true;
        } finally {
          device.createBuffer = create;
        }
        if (!failedReplacement || native.field() !== initialField)
          throw Error("Failed replacement changed active terrain");
      }
      if (label === "pending-old") {
        pending = native.replace(b);
        pendingPreserved = native.field() === initialField;
        if (!pendingPreserved) throw Error("Pending terrain exposed early");
      }
      if (label === "vista") {
        await pending;
        setSource(b);
        if (native.field() === initialField) throw Error("Replacement did not publish new field");
      }
      if (label === "restored") {
        await native.replace(a);
        setSource(a);
      }
      const zoom = label === "weak-detail" ? 0.8 : 2,
        strength = label === "weak-detail" ? 0.25 : 1;
      transition.terrainDetailStrength.value = strength;
      backdrop.setStyle(terrainBackdropStyleForZoom(zoom));
      native.setFrame(zoom, strength);
      const params: Camera3DParams = {
        target: [0, 0, 0],
        distance: label === "vista" ? 450 : 240,
        pitch: label.startsWith("horizon") ? 0.18 : 0.7,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 6000,
      };
      applyCamera3d(camera, params);
      sourceFrame.focus.value.set(0, 0);
      frame.setCamera(
        {
          camera3d: params,
          x: 0,
          y: 0,
          zoom,
          width,
          height,
          time: 0,
          sunAzimuth: env.sunAzimuth,
          sunElevation: env.sunElevation,
        },
        [0, 0, 0],
        post.stats().grade.uniforms,
      );
      const queries = [
        [-10, 0],
        [0, 0],
        [160, 0],
      ].map(([x, y]) => ({ x, y, actual: native.heightAt(x, y), expected: source.heightAt(x, y) }));
      if (queries.some((q) => q.actual !== q.expected))
        throw Error("Terrain height query mismatch");
      const encoder = device.createCommandEncoder();
      shadow.encode(encoder, (pass) => native.drawShadow(pass, shadowCamera));
      frame.encode(
        encoder,
        output.createView(),
        (pass, group) => {
          native.drawOpaque(pass, group);
          native.drawTransparent(pass, group);
        },
        false,
      );
      device.queue.submit([encoder.finish()]);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      world.renderer.setRenderTarget(reference);
      post.render(world.scene, camera);
      world.renderer.setRenderTarget(null);
      const actual = Array.from(await readHdrTexture(device, output)),
        raw = await world.renderer.readRenderTargetPixelsAsync(reference, 0, 0, width, height);
      if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
      const expected = Array.from(unpackRgba16fRows(raw, width, height));
      const preserved =
        label === "failed-replacement" || label === "pending-old"
          ? compareHdr(actual, repeat!)
          : undefined;
      if (preserved?.maxAbs)
        throw Error("Pending/failed terrain changed previously rendered frame");
      if (label === "repeat") repeat = actual;
      const bytes = (data: number[]) =>
        encodeRgba8Base64(
          Uint8Array.from(data, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
        );
      results.push({
        label,
        width,
        height,
        comparison: compareHdr(actual, expected),
        preserved,
        queries,
        actualRgba: bytes(actual),
        expectedRgba: bytes(expected),
      });
    }
    const cancelled = native.replace(b);
    native.dispose();
    let cancelledRejected = false;
    try {
      await cancelled;
    } catch {
      cancelledRejected = true;
    }
    if (!cancelledRejected) throw Error("Disposed pending terrain committed");
    frame.dispose();
    environment.dispose();
    shadow.dispose();
    output.destroy();
    const liveBuffers = buffers.liveCount(),
      liveTextures = textures.liveCount();
    return {
      samples,
      results,
      ownedSnapshot,
      failedReplacement,
      pendingPreserved,
      cancelledRejected,
      errors,
      liveBuffers,
      liveTextures,
      numericalPassed: results.every(
        (r) => r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255,
      ),
      passed:
        !errors.length &&
        !liveBuffers &&
        !liveTextures &&
        results.every((r) => r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255),
    };
  } finally {
    for (const release of releases.reverse()) release();
  }
}
run()
  .then((result) => Object.assign(window, { __terrainSceneCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __terrainSceneCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
