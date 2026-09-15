import * as THREE from "three/webgpu";
import { vec3, attribute, varying } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattlePostChain } from "../../../../packages/photoreal-renderer/src/post/postChain";
import {
  PhotorealLineLayer,
  PhotorealTriangleLayer,
  PhotorealRingLayer,
} from "../../../../packages/photoreal-renderer/src/battle/overlayLayer";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { createOverlayControlBackend } from "../overlayControlBackend";
import { trackBufferLifetime } from "../bufferLifetimeCheck";
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
    const kind = new URL(location.href).searchParams.get("backend") ?? "raw";
    const width = 640,
      height = 400,
      samples: 1 | 4 = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice()),
      errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const buffers = trackBufferLifetime(device);
    releases.push(buffers.restore);
    const lifetime = trackTextureLifetime(device);
    releases.push(lifetime.restore);
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
    const heightAt = () => 0;
    const source = {
      ground: own(
        new PhotorealLineLayer(world.scene, 0.25, {
          alpha: 0.7,
          depthTest: true,
          renderOrder: 20,
          drape: { heightAt, step: 2 },
        }),
      ),
      effect: own(
        new PhotorealLineLayer(world.scene, 0, {
          alpha: 0.8,
          depthTest: false,
          renderOrder: 30,
          perVertexZ: true,
        }),
      ),
      triangle: own(new PhotorealTriangleLayer(world.scene, 40)),
      ring: own(new PhotorealRingLayer(world.scene, heightAt, 0.25)),
    };
    // A deliberately simple opaque plane and raised block isolate cue occlusion
    // from the production terrain material's separately measured edge differences.
    const face = (a: number[], b: number[], c: number[], d: number[]) => [
      ...a,
      ...b,
      ...c,
      ...c,
      ...b,
      ...d,
    ];
    const occluderData = new Float32Array([
      ...face([-32, -24, 0], [32, -24, 0], [-32, 24, 0], [32, 24, 0]),
      ...face([-3, -8, 3], [3, -8, 3], [-3, -2, 3], [3, -2, 3]),
      ...face([-3, -8, 0], [3, -8, 0], [-3, -8, 3], [3, -8, 3]),
    ]);
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(occluderData, 3));
    const material = own(new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }));
    const colors = Float32Array.from({ length: occluderData.length }, (_, i) =>
      i < 18 ? [0.16, 0.22, 0.12][i % 3] : [0.26, 0.16, 0.08][i % 3],
    );
    g.setAttribute("fixtureColor", new THREE.BufferAttribute(colors, 3));
    material.colorNode = varying(attribute<"vec3">("fixtureColor", "vec3"));
    material.fog = false;
    const occluder = new THREE.Mesh(g, material);
    world.scene.add(occluder);
    occluder.renderOrder = 1;
    const packedOccluder = Float32Array.from({ length: occluderData.length * 2 }, (_, i) => {
      const vertex = Math.floor(i / 6),
        component = i % 6;
      return component < 3
        ? occluderData[vertex * 3 + component]
        : colors[vertex * 3 + component - 3];
    });
    const backend = own(
      await createOverlayControlBackend(
        kind,
        device,
        env,
        width,
        height,
        samples,
        packedOccluder,
        (s) => errors.push(s),
      ),
    );
    const native = backend.native;
    const reference = own(
      new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false }),
    );
    const cases = [
      "upload-initial",
      "concurrent-growth",
      "ground",
      "effect",
      "triangle",
      "ring",
      "composed",
      "unoccluded",
      "growth",
      "shrink",
      "empty",
      "horizon",
    ] as const;
    const results = [];
    let concurrentUploadRejected: boolean | null = kind === "raw" ? null : false;
    let payloadFailure: { rejected: boolean; liveBefore: number; liveAfter: number } | null = null;
    for (const label of cases) {
      const all = ["composed", "unoccluded", "growth", "shrink", "horizon"].includes(label),
        grow = label === "growth";
      const enabled = (name: string) =>
        label !== "empty" &&
        (all ||
          label === name ||
          (name === "ground" && (label === "upload-initial" || label === "concurrent-growth")));
      const line = new Float32Array([-22, -5, 0.1, 0.8, 1, 0.8, 22, -5, 1, 0.2, 0.1, 0.2]);
      const effect = new Float32Array([-18, -5, 5, 1, 0.9, 0.2, 18, -5, 5, 0.9, 0.1, 0.1]);
      const triangle = new Float32Array([
        -8, -16, 1, 0.1, 0.2, 0.4, 8, -16, 0.1, 1, 0.2, 0.7, 0, -9, 0.2, 0.1, 1, 0.5,
      ]);
      const ring = new Float32Array([
        -12, -5, 4, 0.2, 0.7, 1, 1, 0, -5, 4, 1, 0.6, 0.1, 0.7, 12, -5, 4, 1, 0.1, 0.2, 0.4,
      ]);
      const repeat = (a: Float32Array) =>
        grow ? Float32Array.from({ length: a.length * 300 }, (_, i) => a[i % a.length]) : a;
      const shortLines = Float32Array.from(
        { length: (label === "upload-initial" ? 1 : 6) * 12 },
        (_, i) => {
          const segment = Math.floor(i / 12),
            value = i % 12;
          return [-4, -12 + segment * 2, 0.1, 0.8, 1, 0.9, -3, -12 + segment * 2, 0.1, 0.8, 1, 0.9][
            value
          ];
        },
      );
      const groundData =
          label === "upload-initial" || label === "concurrent-growth"
            ? shortLines
            : enabled("ground")
              ? repeat(line)
              : new Float32Array(),
        effectData = enabled("effect") ? repeat(effect) : new Float32Array(),
        triData = enabled("triangle") ? repeat(triangle) : new Float32Array(),
        ringData = enabled("ring") ? repeat(ring) : new Float32Array();
      source.ground.upload(groundData);
      if (label === "concurrent-growth" && kind === "typegpu") {
        const slice = Float32Array.prototype.slice,
          liveBefore = buffers.liveCount();
        let calls = 0,
          rejected = false;
        Float32Array.prototype.slice = function (start, end) {
          if (++calls === 3) throw Error("injected overlay payload allocation failure");
          return slice.call(this, start, end);
        };
        try {
          await native.ground.upload(groundData);
        } catch (error) {
          rejected = String(error).includes("injected overlay payload");
        } finally {
          Float32Array.prototype.slice = slice;
        }
        payloadFailure = { rejected, liveBefore, liveAfter: buffers.liveCount() };
      }
      const groundUpload = native.ground.upload(groundData);
      if (label === "concurrent-growth" && kind !== "raw") {
        const rejected = shortLines.slice(0, 12);
        rejected[5] = 0;
        rejected[11] = 0;
        try {
          await native.ground.upload(rejected);
        } catch (error) {
          concurrentUploadRejected = String(error).includes("already in flight");
        }
      }
      await groundUpload;
      source.effect.upload(effectData);
      await native.effect.upload(effectData);
      source.triangle.upload(triData);
      await native.triangle.upload(triData);
      source.ring.upload(ringData);
      await native.ring.upload(ringData);
      const occluderVertices = label === "unoccluded" ? 6 : occluderData.length / 3;
      g.setDrawRange(0, occluderVertices);
      const params: Camera3DParams = {
        target: [0, 0, 0],
        distance: 85,
        pitch: label === "horizon" ? 0.15 : 0.65,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 5000,
      };
      applyCamera3d(camera, params);
      backend.setCamera(
        {
          camera3d: params,
          x: 0,
          y: 0,
          zoom: height / (2 * 85 * Math.tan(0.4)),
          width,
          height,
          time: 0,
          sunAzimuth: env.sunAzimuth,
          sunElevation: env.sunElevation,
        },
        [0, 0, 0],
        post.stats().grade.uniforms,
      );
      await backend.render(occluderVertices);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      world.renderer.setRenderTarget(reference);
      post.render(world.scene, camera);
      world.renderer.setRenderTarget(null);
      const actual = Array.from(await readHdrTexture(device, backend.output)),
        raw = await world.renderer.readRenderTargetPixelsAsync(reference, 0, 0, width, height);
      if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
      const expected = Array.from(unpackRgba16fRows(raw, width, height)),
        bytes = (a: number[]) =>
          encodeRgba8Base64(
            Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
          );
      results.push({
        label,
        countsMatch:
          source.ground.stats().vertices === native.ground.stats().count &&
          source.effect.stats().vertices === native.effect.stats().count &&
          source.triangle.stats().vertices === native.triangle.stats().count &&
          source.ring.stats().rings === native.ring.stats().count,
        width,
        height,
        comparison: compareHdr(actual, expected),
        actualRgba: bytes(actual),
        expectedRgba: bytes(expected),
        sourceCounts: Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v.stats()])),
        occluderVertices: occluder.visible ? occluderVertices : 0,
        counts: Object.fromEntries(Object.entries(native).map(([k, v]) => [k, v.stats()])),
      });
    }
    backend.dispose();
    const liveBuffers = buffers.liveCount();
    const liveTextures = lifetime.liveCount();
    return {
      backend: kind,
      concurrentUploadRejected,
      payloadFailure,
      samples,
      results,
      errors,
      liveTextures,
      liveBuffers,
      passed:
        (kind === "raw" || concurrentUploadRejected === true) &&
        (kind !== "typegpu" ||
          (payloadFailure?.rejected === true &&
            payloadFailure.liveAfter === payloadFailure.liveBefore)) &&
        errors.length === 0 &&
        liveTextures === 0 &&
        liveBuffers === 0 &&
        results.every(
          (r) => r.countsMatch && r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255,
        ),
    };
  } finally {
    for (const release of releases.reverse()) release();
  }
}
run()
  .then((result) => Object.assign(window, { __overlayCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __overlayCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
