import * as THREE from "three/webgpu";
import { PhotorealReadoutLayer } from "../../../../packages/photoreal-renderer/src/battle/readoutLayer";
import type { BattleReadoutInstance } from "../../../../packages/game-renderer/src/battle/readoutData";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { createRawReadout } from "./readout";
import { nativeTarget } from "../controlTarget";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";
import { trackTextureLifetime } from "../textureLifetimeCheck";
async function run() {
  const release: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T) => {
    release.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const trace = new URLSearchParams(location.search).has("trace");
    let traceCase = "initial";
    const uploads: unknown[] = [];
    if (trace) {
      const original = GPUQueue.prototype.copyExternalImageToTexture;
      GPUQueue.prototype.copyExternalImageToTexture = function (source, destination, size) {
        if (source.source instanceof HTMLCanvasElement) {
          const canvas = source.source,
            bytes = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
          let hash = 2166136261;
          for (const b of bytes ?? []) hash = Math.imul(hash ^ b, 16777619);
          uploads.push({
            case: traceCase,
            canvas: [canvas.width, canvas.height],
            destination: [destination.texture.width, destination.texture.height],
            size: Array.isArray(size)
              ? [...size]
              : {
                  width: (size as GPUExtent3DDict).width,
                  height: (size as GPUExtent3DDict).height,
                  depthOrArrayLayers: (size as GPUExtent3DDict).depthOrArrayLayers,
                },
            hash: hash >>> 0,
          });
        }
        original.call(this, source, destination, size);
      };
      release.push(() => {
        GPUQueue.prototype.copyExternalImageToTexture = original;
      });
    }
    const width = 768,
      height = 512,
      samples: 1 | 4 = new URLSearchParams(location.search).get("samples") === "4" ? 4 : 1;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice()),
      errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const lifetime = trackTextureLifetime(device);
    release.push(lifetime.restore);
    const renderer = own(
      new THREE.WebGPURenderer({ antialias: samples === 4, reversedDepthBuffer: true }),
    );
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    await renderer.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0.11, 0.14, 0.18);
    const source = own(new PhotorealReadoutLayer(scene)),
      native = own(createRawReadout(device, samples));
    const output = own(nativeTarget(device, [width, height], samples));
    const reference = own(
      new THREE.RenderTarget(width, height, {
        type: THREE.HalfFloatType,
        samples: samples === 4 ? 4 : 0,
      }),
    );
    const camera = new THREE.PerspectiveCamera();
    const base: BattleReadoutInstance[] = [
      {
        unitId: 1,
        x: -4,
        y: 0,
        z: 2,
        worldPerPx: 0.055,
        chips: [
          { text: "STEADY" },
          { text: "TIRED", kind: "hot" },
          { text: "ROUTING", kind: "bad" },
        ],
      },
      {
        unitId: 2,
        x: 4,
        y: 0,
        z: 2,
        worldPerPx: 0.055,
        chips: [
          { text: "⚔ WIDE" },
          { text: "A:B", kind: "bad" },
          { text: "LONG WORDS", kind: "hot" },
          { text: "STEADY" },
        ],
      },
    ];
    const cases = [
      { label: "chips", data: base, yaw: -Math.PI / 2, pitch: 0.45 },
      { label: "bright", data: base, yaw: -Math.PI / 2, pitch: 0.45 },
      { label: "repeat", data: base, yaw: -Math.PI / 2, pitch: 0.45 },
      { label: "rotate", data: base, yaw: -0.8, pitch: 0.25 },
      {
        label: "growth",
        data: Array.from({ length: 140 }, (_, i) => ({
          ...base[i % 2],
          unitId: i,
          x: ((i % 14) - 6.5) * 2,
          y: Math.floor(i / 14) * 1.4 - 6,
          z: 2,
          worldPerPx: 0.025,
          chips: [{ text: `${i}`, kind: i % 2 ? ("hot" as const) : ("plain" as const) }],
        })),
        yaw: -Math.PI / 2,
        pitch: 0.65,
      },
      {
        label: "shrink",
        data: [{ ...base[0], chips: [{ text: "NEW", kind: "bad" as const }] }],
        yaw: -Math.PI / 2,
        pitch: 0.45,
      },
      { label: "empty", data: [], yaw: -Math.PI / 2, pitch: 0.45 },
      { label: "restore", data: base, yaw: -Math.PI / 2, pitch: 0.45 },
      {
        label: "behind",
        data: [{ ...base[0], x: 0, y: -100, z: 0 }],
        yaw: -Math.PI / 2,
        pitch: 0.45,
      },
    ];
    const results = [];
    let first: number[] | undefined;
    for (const c of cases) {
      traceCase = c.label;
      const background = c.label === "bright" ? [0.6, 0.45, 0.2] : [0.11, 0.14, 0.18];
      scene.background = new THREE.Color(background[0], background[1], background[2]);
      applyCamera3d(camera, {
        target: [0, 0, 0],
        distance: 25,
        pitch: c.pitch,
        yaw: c.yaw,
        fovY: 0.8,
        aspect: width / height,
        near: 0.1,
        far: 1000,
      });
      camera.updateMatrixWorld(true);
      source.setCameraBasis(camera);
      source.upload(c.data);
      native.upload(c.data);
      native.setCamera(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
          .elements,
        camera.matrixWorld.elements,
      );
      const encoder = device.createCommandEncoder(),
        pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: output.attachments.color,
              resolveTarget: output.attachments.resolveTarget,
              loadOp: "clear",
              storeOp: "store",
              clearValue: [...background, 1],
            },
          ],
          depthStencilAttachment: {
            view: output.attachments.depth,
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
      native.draw(pass);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      renderer.setRenderTarget(reference);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      const actual = await readHdrTexture(device, output.color),
        raw = await renderer.readRenderTargetPixelsAsync(reference, 0, 0, width, height);
      if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
      const expected = unpackRgba16fRows(raw, width, height);
      let issuedInstances;
      if (trace) {
        const object = scene.getObjectByName("battle-unit-readout-chip-glyphs") as THREE.Mesh;
        const attributes = ["readoutChip0", "readoutChip1", "readoutChipUv"];
        issuedInstances = await Promise.all(
          attributes.map(async (name) => {
            const attribute = object.geometry.getAttribute(name);
            if (!(attribute instanceof THREE.BufferAttribute))
              throw Error("Expected noninterleaved readout instances");
            const bytes = await renderer.getArrayBufferAsync(attribute);
            const actual = new Float32Array(bytes).slice(0, source.stats().chips * 4),
              expected = Array.from(attribute.array).slice(0, source.stats().chips * 4);
            return {
              name,
              count: actual.length,
              maxDifference: Math.max(0, ...actual.map((v, i) => Math.abs(v - expected[i]))),
            };
          }),
        );
      }

      const rgba = (data: number[]) =>
        encodeRgba8Base64(
          Uint8Array.from(data, (x) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
        );
      const repeat =
        c.label === "repeat" || c.label === "restore" ? compareHdr(actual, first!) : null;
      if (c.label === "chips") first = actual.slice();
      results.push({
        label: c.label,
        width,
        height,
        comparison: compareHdr(actual, expected),
        issuedInstances,
        repeat,
        source: source.stats(),
        native: native.stats(),
        actualRgba: rgba(actual),
        expectedRgba: rgba(expected),
      });
    }
    native.dispose();
    output.dispose();
    source.dispose();
    reference.dispose();
    const sourceTexturesAfterDispose = renderer.info.memory.textures;
    const liveTextures = lifetime.liveCount();
    return {
      samples,
      uploads,
      results,
      errors,
      liveTextures,
      sourceTexturesAfterDispose,
      passed:
        !errors.length &&
        !liveTextures &&
        sourceTexturesAfterDispose === 0 &&
        results.every(
          (r) =>
            r.comparison.nonfinite === 0 &&
            r.comparison.maxAbs <= 1 / 255 &&
            (!r.repeat || r.repeat.maxAbs === 0),
        ),
    };
  } finally {
    for (const f of release.reverse()) f();
  }
}
run()
  .then((result) => Object.assign(window, { __frameCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __frameCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
