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
  PhotorealMarkerLayer,
} from "../../../../packages/photoreal-renderer/src/battle/overlayLayer";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { viewMatrix, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import { makeVertexBuffer } from "../../../../packages/renderer-core/src/gpuBuffers";
import {
  createRawLineLayer,
  createRawTriangleLayer,
  createRawRingLayer,
  createRawMarkerLayer,
} from "./overlay";
import { RawBattleFrame } from "./frame";
import { createRawEnvironment } from "./environment";
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
    const width = 640,
      height = 400,
      samples: 1 | 4 = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice()),
      errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const buffers = new Set<GPUBuffer>();
    const createBuffer = device.createBuffer;
    device.createBuffer = function (descriptor: GPUBufferDescriptor) {
      const buffer = createBuffer.call(device, descriptor),
        destroy = buffer.destroy;
      buffers.add(buffer);
      buffer.destroy = function () {
        destroy.call(buffer);
        buffers.delete(buffer);
      };
      return buffer;
    };
    releases.push(() => {
      device.createBuffer = createBuffer;
    });
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
    const environment = own(await createRawEnvironment(device, env, samples)),
      frame = own(new RawBattleFrame(device, environment, width, height, samples, "rgba16float"));
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
      marker: own(new PhotorealMarkerLayer(world.scene)),
    };
    const native = {
      ground: own(
        await createRawLineLayer(
          device,
          frame.cameraLayout,
          samples,
          { z: 0.25, drape: { heightAt, step: 2 } },
          0.7,
          true,
        ),
      ),
      effect: own(
        await createRawLineLayer(
          device,
          frame.cameraLayout,
          samples,
          { z: 0, perVertexZ: true },
          0.8,
          false,
        ),
      ),
      triangle: own(await createRawTriangleLayer(device, frame.cameraLayout, samples)),
      ring: own(await createRawRingLayer(device, frame.cameraLayout, samples, heightAt, 0.25)),
      marker: own(await createRawMarkerLayer(device, frame.cameraLayout, samples)),
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
    const vb = own(makeVertexBuffer(device, "overlay control occluder", packedOccluder));
    const module = device.createShaderModule({
      code: `${WORLD_CAMERA_WGSL}\nstruct V { @builtin(position) clip:vec4f,@location(0) color:vec3f }; @vertex fn v(@location(0)p:vec3f,@location(1)c:vec3f)->V{return V(projectWorld(p),c);}\n@fragment fn f(v:V)->@location(0)vec4f{return vec4f(v.color,1);}`,
    });
    const occluderPipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [frame.cameraLayout] }),
      vertex: {
        module,
        entryPoint: "v",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "f", targets: [{ format: "rgba16float" }] },
      primitive: { cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
      multisample: { count: samples },
    });
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
    const cases = [
      "ground",
      "effect",
      "triangle",
      "ring",
      "marker",
      "marker-occluded",
      "composed",
      "unoccluded",
      "growth",
      "shrink",
      "empty",
      "horizon",
    ] as const;
    const results = [];
    for (const label of cases) {
      const all = ["composed", "unoccluded", "growth", "shrink", "horizon"].includes(label),
        grow = label === "growth";
      const enabled = (name: string) =>
        label !== "empty" &&
        (all || label === name || (name === "marker" && label === "marker-occluded"));
      const line = new Float32Array([-22, -5, 0.1, 0.8, 1, 0.8, 22, -5, 1, 0.2, 0.1, 0.2]);
      const effect = new Float32Array([-18, -5, 5, 1, 0.9, 0.2, 18, -5, 5, 0.9, 0.1, 0.1]);
      const triangle = new Float32Array([
        -8, -16, 1, 0.1, 0.2, 0.4, 8, -16, 0.1, 1, 0.2, 0.7, 0, -9, 0.2, 0.1, 1, 0.5,
      ]);
      const ring = new Float32Array([
        -12, -5, 4, 0.2, 0.7, 1, 1, 0, -5, 4, 1, 0.6, 0.1, 0.7, 12, -5, 4, 1, 0.1, 0.2, 0.4,
      ]);
      const markers = [
        { x: -12, y: label === "marker-occluded" ? 8 : 27, size: 10, faction: 0 as const },
        { x: 0, y: label === "marker-occluded" ? 8 : 27, size: 10, faction: 1 as const, lod: 1 },
        { x: 12, y: label === "marker-occluded" ? 8 : 27, size: 10, faction: 2 as const, lod: 2 },
      ];
      const repeat = (a: Float32Array) =>
        grow ? Float32Array.from({ length: a.length * 300 }, (_, i) => a[i % a.length]) : a;
      const groundData = enabled("ground") ? repeat(line) : new Float32Array(),
        effectData = enabled("effect") ? repeat(effect) : new Float32Array(),
        triData = enabled("triangle") ? repeat(triangle) : new Float32Array(),
        ringData = enabled("ring") ? repeat(ring) : new Float32Array(),
        markerData = enabled("marker")
          ? grow
            ? Array.from({ length: 300 }, (_, i) => markers[i % 3])
            : markers
          : [];
      source.ground.upload(groundData);
      native.ground.upload(groundData);
      source.effect.upload(effectData);
      native.effect.upload(effectData);
      source.triangle.upload(triData);
      native.triangle.upload(triData);
      source.ring.upload(ringData);
      native.ring.upload(ringData);
      const occluderVertices = label === "unoccluded" ? 6 : occluderData.length / 3;
      g.setDrawRange(0, occluderVertices);
      occluder.visible = label !== "marker";
      source.marker.upload(markerData);
      native.marker.upload(markerData);
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
      source.marker.setCameraBasis(camera);
      const view = viewMatrix(params);
      native.marker.setBasis([view[0], view[4], view[8]], [view[1], view[5], view[9]]);
      frame.setCamera(
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
      const encoder = device.createCommandEncoder();
      frame.encode(
        encoder,
        output.createView(),
        (pass, group) => {
          native.marker.encode(pass, group);
          if (occluder.visible) {
            pass.setPipeline(occluderPipeline);
            pass.setBindGroup(0, group);
            pass.setVertexBuffer(0, vb);
            pass.draw(occluderVertices);
          }
          native.ring.encode(pass, group);
          native.ground.encode(pass, group);
          native.effect.encode(pass, group);
          native.triangle.encode(pass, group);
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
      const expected = Array.from(unpackRgba16fRows(raw, width, height)),
        bytes = (a: number[]) =>
          encodeRgba8Base64(
            Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
          );
      results.push({
        label,
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
    for (const layer of Object.values(native)) layer.dispose();
    frame.dispose();
    environment.dispose();
    output.destroy();
    vb.destroy();
    const liveBuffers = buffers.size;
    const liveTextures = lifetime.liveCount();
    return {
      samples,
      results,
      errors,
      liveTextures,
      liveBuffers,
      passed:
        errors.length === 0 &&
        liveTextures === 0 &&
        liveBuffers === 0 &&
        results.every((r) => r.comparison.nonfinite === 0 && r.comparison.maxAbs <= 1 / 255),
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
