import { trackTextureLifetime } from "../textureLifetimeCheck";
import * as THREE from "three/webgpu";
import { shadow, convert } from "three/tsl";
import { createRawShadowControl } from "./shadowControl";
import { createShadowControlBackend } from "../shadowControlBackend";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import { configureSunShadows } from "../../../../packages/photoreal-renderer/src/battle/shadowRig";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import {
  viewMatrix,
  projMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { multiply } from "../../../../packages/renderer-core/src/mat4";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
import { encodeRgba8Base64 } from "../imageTransport";

// Isolate fit, depth rasterization, normal bias and the real PCF graph before
// integrating shadow sampling with the already-verified environment materials.
async function run() {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  try {
    const width = 768,
      height = 512;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("No GPU");
    const device = own(await adapter.requestDevice());
    const errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const renderer = own(new THREE.WebGPURenderer({ antialias: false, reversedDepthBuffer: true }));
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    await renderer.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(1, 1, 1);
    const env = CIVSIM_ENVIRONMENTS.golden,
      physical = photorealEnvironment(env);
    const sun = new THREE.DirectionalLight();
    sun.position.set(...physical.sunDirection);
    scene.add(sun, sun.target);
    const rig = own(configureSunShadows(renderer, sun, env, "single"));
    const boxGeometry = own(new THREE.BoxGeometry(2, 2, 4));
    boxGeometry.translate(0, 0, 2);
    const casterMaterial = own(new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }));
    const box = new THREE.Mesh(boxGeometry, casterMaterial);
    box.castShadow = true;
    box.layers.set(1);
    sun.shadow.camera.layers.enable(1);
    scene.add(box);
    const planeGeometry = own(new THREE.PlaneGeometry(40, 40));
    const receiverMaterial = own(new THREE.MeshBasicNodeMaterial());
    // Pinned declarations omit the known output type of this public conversion.
    receiverMaterial.colorNode = convert(shadow(sun), "vec3") as THREE.Node<"vec3">;
    const plane = new THREE.Mesh(planeGeometry, receiverMaterial);
    plane.receiveShadow = true;
    scene.add(plane);
    const reference = own(new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType }));
    const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
    if (backend !== "raw" && backend !== "typegpu" && backend !== "vgpu")
      throw Error("Unknown shadow backend");
    const vertices = (g: THREE.BufferGeometry) => {
      const mesh = g.toNonIndexed();
      const data = Float32Array.from(mesh.getAttribute("position").array);
      mesh.dispose();
      return data;
    };
    const cubeData = vertices(boxGeometry),
      groundData = vertices(planeGeometry);
    const textures = trackTextureLifetime(device);
    releases.push(textures.restore);
    const native = own(
      backend === "raw"
        ? createRawShadowControl(device, env, cubeData, groundData, width, height)
        : await createShadowControlBackend(
            backend,
            device,
            env,
            cubeData,
            groundData,
            width,
            height,
          ),
    );
    const camera = new THREE.PerspectiveCamera(),
      results = [];
    let firstActual: number[] | undefined, firstExpected: number[] | undefined;
    for (const [label, pitch, distance, rect] of [
      ["local", 0.65, 18, [-20, -20, 40, 40]],
      ["local-repeat", 0.65, 18, [-20, -20, 40, 40]],
      ["horizon", 0.2, 26, [-20, -20, 40, 40]],
      ["whole-map", 0.65, 18, [-220, -180, 440, 360]],
    ] as const) {
      rig.setWorldRect([...rect]);
      let fit = native.setWorldRect(rect);
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
      if (new URLSearchParams(location.search).has("fitted")) {
        rig.update(params);
        fit = native.update(params);
      }
      applyCamera3d(camera, params);
      await native.render(multiply(projMatrix(params), viewMatrix(params)));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      renderer.setRenderTarget(reference);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      const actual = Array.from(await readHdrTexture(device, native.output));
      const raw = await renderer.readRenderTargetPixelsAsync(reference, 0, 0, width, height);
      if (!(raw instanceof Uint16Array)) throw Error("Expected half output");
      const expected = Array.from(unpackRgba16fRows(raw, width, height));
      const bytes = (a: number[]) =>
        encodeRgba8Base64(Uint8Array.from(a, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)));
      const sourceVp = new THREE.Matrix4().multiplyMatrices(
        sun.shadow.camera.projectionMatrix,
        sun.shadow.camera.matrixWorldInverse,
      );
      const shadowPixels = (data: number[]) =>
        data.reduce((n, v, i) => n + (i % 4 === 0 && v < 0.9 ? 1 : 0), 0);
      const repeat =
        label === "local-repeat"
          ? {
              actual: compareHdr(actual, firstActual!),
              expected: compareHdr(expected, firstExpected!),
            }
          : null;
      if (label === "local") {
        firstActual = actual;
        firstExpected = expected;
      }
      results.push({
        actualShadowPixels: shadowPixels(actual),
        expectedShadowPixels: shadowPixels(expected),
        repeat,
        label,
        width,
        height,
        comparison: compareHdr(actual, expected),
        projectionMax: Math.max(
          ...[...fit.cascades[0].viewProjection].map((v, i) => Math.abs(v - sourceVp.elements[i])),
        ),
        actualRgba: bytes(actual),
        expectedRgba: bytes(expected),
      });
    }
    native.dispose();
    const liveCandidateTexturesAfterDispose = textures.liveCount();
    return {
      liveCandidateTexturesAfterDispose,
      backend,
      unusedColorBytes: native.unusedColorBytes,
      results,
      errors,
      passed:
        errors.length === 0 &&
        liveCandidateTexturesAfterDispose === 0 &&
        results.every(
          (r) =>
            r.comparison.nonfinite === 0 &&
            r.comparison.maxAbs <= 1 / 255 &&
            r.actualShadowPixels > 100 &&
            r.expectedShadowPixels > 100 &&
            (!r.repeat || (r.repeat.actual.maxAbs === 0 && r.repeat.expected.maxAbs === 0)),
        ),
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
