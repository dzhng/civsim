import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import { BattleBackgroundQuads } from "../../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { createBattleFrameUniforms } from "../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { RawBattleFrame } from "./frame";
import { createRawEnvironment } from "./environment";
import { createRawBackdrop } from "./backdrop";
import type { BackdropKind } from "../shaders/backdrop";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import { trackBufferLifetime } from "../bufferLifetimeCheck";
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const width = 640,
      height = 400,
      samples: 1 | 4 = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice()),
      errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const textures = trackTextureLifetime(device),
      buffers = trackBufferLifetime(device);
    releases.push(textures.restore, buffers.restore);
    const env = CIVSIM_ENVIRONMENTS.golden;
    const world = own(
      await PhotorealWorld.create(document.createElement("canvas"), { antialias: samples === 4 }),
    );
    world.renderer.setPixelRatio(1);
    world.renderer.setSize(width, height);
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    const camera = new THREE.PerspectiveCamera(),
      post = own(new BattlePostChain(world.renderer, world.scene, camera, env.id));
    post.setBloomEnabled(false);
    const environment = own(await createRawEnvironment(device, env, samples)),
      frame = own(new RawBattleFrame(device, environment, width, height, samples, "rgba16float"));
    const uniforms = createBattleFrameUniforms(),
      source = own(new BattleBackgroundQuads(world.scene, uniforms));
    const native = own(await createRawBackdrop(device, frame.cameraLayout, environment, samples));
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
    for (const label of [
      "backdrop",
      "default",
      "wide-detail",
      "composed",
      "composed-wide",
      "restore",
      "shifted",
      "horizon",
    ] as const) {
      const only: BackdropKind | undefined = ["backdrop", "default", "wide-detail"].includes(label)
        ? (label as BackdropKind)
        : undefined;
      const style =
        label === "wide-detail" || label === "composed-wide" ? "wide-detail" : "default";
      const terrainRect: [number, number, number, number] =
        label === "shifted" ? [0, -18, 48, 36] : [-30, -24, 60, 48];
      const backdropRect: [number, number, number, number] = [-100, -80, 200, 160];
      source.setRects(terrainRect, backdropRect);
      source.setStyle(style);
      source.backdrop.visible = !only || only === "backdrop";
      source.terrainDefault.visible = only ? only === "default" : style === "default";
      source.terrainWide.visible = only ? only === "wide-detail" : style === "wide-detail";
      native.setRects(terrainRect, backdropRect);
      native.setStyle(style);
      const params: Camera3DParams = {
        target: [7, -3, 0],
        distance: 90,
        pitch: label === "horizon" ? 0.18 : 0.7,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 5000,
      };
      applyCamera3d(camera, params);
      uniforms.focus.value.set(7, -3);
      frame.setCamera(
        {
          camera3d: params,
          x: 7,
          y: -3,
          zoom: height / (2 * 90 * Math.tan(0.4)),
          width,
          height,
          time: 0,
          sunAzimuth: env.sunAzimuth,
          sunElevation: env.sunElevation,
        },
        [0, 0, 0],
        post.stats().grade.uniforms,
      );
      const encoder = device.createCommandEncoder();
      frame.encode(
        encoder,
        output.createView(),
        (pass, group) => native.encode(pass, group, only),
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
      const bytes = (a: number[]) =>
        encodeRgba8Base64(Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)));
      results.push({
        label,
        width,
        height,
        comparison: compareHdr(actual, expected),
        actualRgba: bytes(actual),
        expectedRgba: bytes(expected),
        draws: only ? 1 : 2,
      });
    }
    native.dispose();
    frame.dispose();
    environment.dispose();
    output.destroy();
    const liveBuffers = buffers.liveCount(),
      liveTextures = textures.liveCount();
    return {
      samples,
      results,
      errors,
      liveBuffers,
      liveTextures,
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
  .then((result) => Object.assign(window, { __backdropCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __backdropCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
