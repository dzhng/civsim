import { trackBufferLifetime } from "../bufferLifetimeCheck";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { PhotorealStandardLayer } from "../../../../packages/photoreal-renderer/src/battle/standardLayer";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import type { BattleStandardInstance } from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import { viewMatrix, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { standardsControlBackend } from "../standardsControlBackend";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
function preview(pixels: readonly number[]) {
  const bytes = Uint8Array.from(pixels, (v, i) =>
    Math.round(
      255 *
        Math.min(
          1,
          Math.max(
            0,
            i % 4 === 3 ? v : v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055,
          ),
        ),
    ),
  );
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
const W = 640,
  H = 480;
async function run() {
  const search = new URLSearchParams(location.search),
    kind = search.get("backend") ?? "raw",
    samples: 1 | 4 = search.get("samples") === "4" ? 4 : 1;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No WebGPU adapter");
  const device = await adapter.requestDevice(),
    errors: string[] = [],
    release: (() => void)[] = [() => device.destroy()];
  const buffers = trackBufferLifetime(device),
    textures = trackTextureLifetime(device);
  release.push(buffers.restore, textures.restore);
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  try {
    const world = await PhotorealWorld.create(document.createElement("canvas"), {
      antialias: false,
    });
    release.push(() => world.dispose());
    const renderer = world.renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    const env = CIVSIM_ENVIRONMENTS.golden;
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    for (const c of world.scene.children) if (c instanceof THREE.Mesh) c.visible = false;
    const source = new PhotorealStandardLayer(world.scene, world.uTime);
    release.push(() => source.dispose());
    const backend = await standardsControlBackend(
      kind,
      device,
      env,
      [W, H],
      samples,
      (s) => errors.push(s),
      buffers.createdCount,
    );
    release.push(backend.dispose);
    const reference = new THREE.RenderTarget(W, H, {
      type: THREE.HalfFloatType,
      samples: samples === 4 ? 4 : 0,
      depthBuffer: true,
    });
    release.push(() => reference.dispose());
    const camera = new THREE.PerspectiveCamera();
    const base: BattleStandardInstance[] = [
      { unitId: 1, x: -2, y: 0, z: 0, yaw: 0.2, scale: 1, factionId: "azure", selected: false },
      { unitId: 7, x: 0, y: 0, z: 0.3, yaw: 1.4, scale: 1, factionId: "crimson", selected: true },
      { unitId: 19, x: 2, y: 0, z: 0, yaw: 3.1, scale: 1.2, factionId: "neutral", selected: false },
    ];
    const cases = [
      { name: "overlap", time: 0, yaw: 0, distance: 11, instances: base },
      { name: "front", time: 0, yaw: Math.PI / 2, distance: 11, instances: base },
      { name: "wave", time: 1.6, yaw: Math.PI / 2, distance: 11, instances: base },
      { name: "reverse", time: 4.1, yaw: -Math.PI / 2, distance: 11, instances: base },
      {
        name: "selected",
        time: 1.6,
        yaw: Math.PI / 2,
        distance: 11,
        instances: base.map((v) => ({ ...v, selected: true })),
      },
      {
        name: "legibility",
        time: 2,
        yaw: 0.5,
        distance: 120,
        instances: base.map((v) => ({ ...v, x: v.x * 12, scale: 8 })),
      },
      {
        name: "growth",
        time: 2.2,
        yaw: 0,
        distance: 35,
        instances: Array.from({ length: 40 }, (_, i) => ({
          ...base[i % 3],
          unitId: i,
          x: ((i % 8) - 3.5) * 2,
          y: Math.floor(i / 8) * 2,
          scale: 0.8,
        })),
      },
      { name: "shrink", time: 0, yaw: 0, distance: 11, instances: base },
      { name: "hidden", time: 0, yaw: 0, distance: 11, instances: base },
      { name: "empty", time: 0, yaw: 0, distance: 11, instances: [] },
    ];
    const results = [];
    let concurrentUploadRejected = false;
    for (const c of cases) {
      source.upload(c.instances);
      const upload = backend.upload(c.instances);
      if (c.name === "growth") {
        try {
          await backend.upload(base);
        } catch (error) {
          concurrentUploadRejected = String(error).includes("already in flight");
        }
      }
      await upload;
      backend.setVisible(c.name !== "hidden");
      const object = world.scene.children.find((x) => x.name === "battle-unit-3d-standards")!;
      object.visible = c.name !== "hidden" && c.instances.length > 0;
      const params: Camera3DParams = {
        target: [0, 0, 1.6],
        distance: c.distance,
        pitch: 0.32,
        yaw: c.yaw,
        fovY: 0.7,
        aspect: W / H,
        near: 0.1,
        far: 2000,
      };
      applyCamera3d(camera, params);
      world.uTime.value = c.time;
      backend.setCamera(
        cameraUniformData({
          camera3d: params,
          x: 0,
          y: 0,
          zoom: 1,
          width: W,
          height: H,
          sunAzimuth: 0,
          sunElevation: 0,
        }),
        viewMatrix(params),
        [0, 0, 0],
        c.time,
      );
      await backend.render();
      renderer.setRenderTarget(reference);
      renderer.render(world.scene, camera);
      renderer.setRenderTarget(null);
      const actual = await readHdrTexture(device, backend.output),
        expected = unpackRgba16fRows(
          (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
          W,
          H,
        ),
        pixels = compareHdr(actual, expected);
      const outliers: { x: number; y: number; actual: number[]; expected: number[] }[] = [];
      let shadeMismatch = 0;
      let coverageMismatch = 0,
        maxCovered = 0,
        covered = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (actual[i + 3] !== expected[i + 3]) coverageMismatch++;
        if (expected[i + 3] > 0) covered++;
        if (actual[i + 3] > 0 && expected[i + 3] > 0) {
          let error = 0;
          for (let k = 0; k < 3; k++)
            error = Math.max(error, Math.abs(actual[i + k] - expected[i + k]));
          maxCovered = Math.max(maxCovered, error);
          if (error > 1 / 255) {
            shadeMismatch++;
            if (outliers.length < 32)
              outliers.push({
                x: (i / 4) % W,
                y: Math.floor(i / 4 / W),
                actual: actual.slice(i, i + 4),
                expected: expected.slice(i, i + 4),
              });
          }
        }
      }
      const stats = backend.stats(),
        sourceStats = source.stats(),
        counts = stats.count === sourceStats.standards && stats.selected === sourceStats.selected;
      results.push({
        name: c.name,
        pixels,
        coverageMismatch,
        shadeMismatch,
        outliers,
        maxCovered,
        covered,
        counts,
        stats,
        passed:
          counts &&
          pixels.nonfinite === 0 &&
          coverageMismatch === 0 &&
          maxCovered <= 1 / 255 &&
          (c.name === "hidden" || c.name === "empty" ? covered === 0 : covered > 0),
        width: W,
        height: H,
        actual: preview(actual),
        expected: preview(expected),
      });
    }
    backend.disposeLayer();
    let disposedGuard = false;
    try {
      await backend.upload(base);
    } catch {
      disposedGuard = true;
    }
    backend.dispose();
    const buffersAfterDispose = buffers.liveCount(),
      texturesAfterDispose = textures.liveCount();
    return {
      initializedBuffers: backend.initializedBuffers,
      buffersAfterDispose,
      texturesAfterDispose,
      backend: kind,
      samples,
      errors,
      disposedGuard,
      concurrentUploadRejected,
      passed:
        backend.initializedBuffers === 4 &&
        disposedGuard &&
        concurrentUploadRejected &&
        buffersAfterDispose === 0 &&
        texturesAfterDispose === 0 &&
        results.every((r) => r.passed) &&
        errors.length === 0,
      results,
      scope:
        "Battle standards component: authored wave, livery, selection and legibility scale; no shadow, no full-scene/performance claim",
    };
  } finally {
    for (const f of release.reverse()) f();
  }
}
run()
  .then((report) => Object.assign(window, { __standardsCheck: report }))
  .catch((error) =>
    Object.assign(window, { __standardsCheck: { passed: false, error: String(error) } }),
  );
