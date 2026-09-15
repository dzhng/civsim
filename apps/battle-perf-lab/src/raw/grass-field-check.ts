import { traceSourceGrass } from "../sourceGrassTrace";
import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { BattleGrassField } from "../../../../packages/photoreal-renderer/src/battle/battleGrassField";
import {
  PhotorealBladeFieldLayer,
  BladeFieldTransitionUniforms,
  createBladeFieldWindUniforms,
} from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import {
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { flatHeightField } from "../../../../packages/game-renderer/src/terrain/heightField";
import { updateWindUniforms } from "../../../../packages/game-renderer/src/battle/windSignal";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  eyePosition,
  viewMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import { createGrassBackendControl } from "../grassBackendControl";
import { grassGeometries } from "../grassData";
import { liveGrassRecords } from "../grassField";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";
const W = 480,
  H = 320;
async function run() {
  const search = new URLSearchParams(location.search),
    kind = search.get("backend") ?? "raw";
  if (kind !== "raw" && kind !== "typegpu" && kind !== "vgpu") throw Error("Unknown grass backend");
  const samples: 1 | 4 = search.get("samples") === "4" ? 4 : 1;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("No WebGPU");
  const device = await adapter.requestDevice();
  const trace = traceSourceGrass(device);
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const release: (() => void)[] = [() => device.destroy(), () => trace.dispose()];
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
    const env = CIVSIM_ENVIRONMENTS.golden,
      spec = applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    for (const c of world.scene.children) if (c instanceof THREE.Mesh) c.visible = false;
    const profile = productionBladeFieldProfile(),
      wind = createBladeFieldWindUniforms();
    const sourceTransition = new BladeFieldTransitionUniforms(initialBladeFieldTransition(profile));
    const source = new BattleGrassField(world.scene, profile, sourceTransition, wind);
    release.push(() => source.dispose());
    source.setSunDirection(new THREE.Vector3(...spec.sunDirection));
    const backend = await createGrassBackendControl(
      kind,
      device,
      env,
      grassGeometries(profile),
      new Float32Array(),
      [W, H],
      samples,
      (message) => errors.push(message),
      profile,
    );
    release.push(backend.dispose);
    const native = backend.field;
    if (!native) throw Error("Missing field controller");
    let field = flatHeightField(-64, -64, 32, 32, 4),
      grid = { ...field, tint: new Uint8Array(1024) };
    source.setTerrain(grid, field, "green-grass");
    native.setTerrain(grid, field, "green-grass");
    const output = backend.output;
    const reference = new THREE.RenderTarget(W, H, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      samples: samples === 4 ? 4 : 0,
    });
    release.push(() => reference.dispose());
    const camera = new THREE.PerspectiveCamera(),
      results = [];
    let priorUploads: number[] | null = null;
    for (const [label, x, distance, far, replace] of [
      ["initial", 0, 24, true, false],
      ["same-revision", 0, 24, true, false],
      ["pan-ring", 100, 24, true, false],
      ["far-hidden", 100, 24, false, false],
      ["overview", 0, 900, true, false],
      ["terrain-replaced", 0, 24, true, true],
      ["interior-initial", 0, 24, true, true],
      ["interior-pan", 100, 24, true, false],
      ["interior-far-hidden", 100, 24, false, false],
    ] as const) {
      trace.phase(label);
      if (label === "interior-initial") {
        field = flatHeightField(-256, -256, 64, 64, 8);
        grid = { ...field, tint: new Uint8Array(4096) };
      }
      if (replace) {
        source.setTerrain(grid, field, "green-grass");
        native.setTerrain(grid, field, "green-grass");
      }
      source.setFarVisible(far);
      native.setFarVisible(far);
      updateWindUniforms(wind, 3);
      const params: Camera3DParams = {
        target: [x, 0, 0],
        distance,
        pitch: 0.5,
        yaw: -Math.PI / 2,
        fovY: 0.8,
        aspect: W / H,
        near: 0.1,
        far: 3000,
      };
      applyCamera3d(camera, params);
      const w = {
        direction: [wind.meanDirection.value.x, wind.meanDirection.value.y] as [number, number],
        speed: wind.speed.value,
        gustPhase: wind.gustPhase.value,
        velocity: [wind.bandVelocity.value.x, wind.bandVelocity.value.y] as [number, number],
        frequency: wind.bandFrequency.value,
        sharpness: wind.bandSharpness.value,
      };
      source.update(params, H);
      await native.prepare(params, H, w, spec.sunDirection);
      source.settle(renderer);
      await native.settle();
      source.prepareRender(renderer, params);
      await native.prepare(params, H, w, spec.sunDirection);
      backend.setView(viewMatrix(params), [0, 0, 0]);
      backend.writeCamera(
        cameraUniformData({
          camera3d: params,
          x: 0,
          y: 0,
          zoom: 8,
          width: W,
          height: H,
          sunAzimuth: 0,
          sunElevation: 0,
        }),
      );
      await backend.render();
      if (label === "interior-far-hidden") {
        trace.clear();
        trace.phase("combined");
        for (const object of world.scene.children)
          if (object instanceof THREE.Mesh && object.name.includes("blades-")) {
            const before = object.onBeforeRender;
            object.onBeforeRender = function (...args) {
              trace.mark(this.name);
              before.apply(this, args);
            };
          }
      }
      renderer.setRenderTarget(reference);
      renderer.render(world.scene, camera);
      renderer.setRenderTarget(null);
      const routes = [];
      const nativeRoutes = await backend.readFieldRoutes();
      const state = native.snapshot();
      for (const [i, part] of [state.base, state.ring].entries())
        if (part.visible) {
          const commands = nativeRoutes[i].commands;
          for (const [tier, name] of ["near", "mid", "far"].entries()) {
            const mesh = world.scene.children.find(
              (c) =>
                c.name.endsWith(`${i ? "ring-" : ""}blades-${name}`) &&
                (i === 1 || !c.name.includes("-ring-")),
            ) as THREE.Mesh<THREE.InstancedBufferGeometry> | undefined;
            if (!mesh) throw Error(`Missing ${i}/${name}`);
            const expected = new Uint32Array(
              await renderer.getArrayBufferAsync(mesh.geometry.getIndirect()!),
            );
            routes.push({
              sourceVisible: mesh.visible,
              sourceInstanceCapacity: mesh.geometry.instanceCount,
              layer: i,
              tier,
              actual: Array.from(commands.slice(tier * 5, tier * 5 + 5)),
              expected: Array.from(expected),
              equal: commands[tier * 5] === expected[0] && commands[tier * 5 + 1] === expected[1],
            });
          }
        }
      const actual = await readHdrTexture(device, output),
        expected = unpackRgba16fRows(
          (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
          W,
          H,
        );
      let ringOnly: number[] | undefined;
      let standalone: number[] | undefined;
      let effective: object | undefined;
      if (label === "interior-far-hidden") {
        const baseMeshes = world.scene.children.filter(
          (c) =>
            c instanceof THREE.Mesh && c.name.includes("blades-") && !c.name.includes("-ring-"),
        );
        const visibility = baseMeshes.map((c) => c.visible);
        for (const mesh of baseMeshes) mesh.visible = false;
        trace.phase("ring-only");
        renderer.setRenderTarget(reference);
        renderer.render(world.scene, camera);
        renderer.setRenderTarget(null);
        ringOnly = unpackRgba16fRows(
          (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
          W,
          H,
        );
        baseMeshes.forEach((mesh, i) => {
          mesh.visible = visibility[i];
        });
        // Lab-only read-only owner inspection: no private GPU resources are modified.
        const sourceRing = Reflect.get(source, "ring");
        if (!(sourceRing instanceof PhotorealBladeFieldLayer))
          throw Error("Missing source ring owner");
        const material = sourceRing.materialSet().tiers!.near;
        const attr = material.grassData.value;
        const visibleAttr = material.visibleIndices.value;
        if (
          !(attr instanceof THREE.BufferAttribute) ||
          !(visibleAttr instanceof THREE.BufferAttribute)
        )
          throw Error("Missing material storage attributes");
        const boundRecords = new Float32Array(await renderer.getArrayBufferAsync(attr));
        const boundVisible = new Uint32Array(await renderer.getArrayBufferAsync(visibleAttr));
        const expectedRecords = liveGrassRecords(state.ring);
        effective = {
          sourceTransition: sourceTransition.transition(),
          nativeTransition: state.transition,
          anchor: material.anchor.value.toArray(),
          stats: sourceRing.stats(),
          boundRecordFloats: boundRecords.length,
          expectedRecordFloats: expectedRecords.length,
          recordsExact:
            boundRecords.length === expectedRecords.length &&
            boundRecords.every((v, i) => v === expectedRecords[i]),
          firstVisible: Array.from(boundVisible.slice(0, 12)),
          positions: Array.from(boundVisible.slice(0, 12), (i) =>
            Array.from(boundRecords.slice(i * 16, i * 16 + 4)),
          ),
        };
        const oldMeshes = world.scene.children.filter(
          (c) => c instanceof THREE.Mesh && c.name.includes("blades-"),
        );
        const oldVisibility = oldMeshes.map((c) => c.visible);
        for (const mesh of oldMeshes) mesh.visible = false;
        const lone = new PhotorealBladeFieldLayer(
          world.scene,
          profile.tiers,
          true,
          new BladeFieldTransitionUniforms(state.transition),
          wind,
        );
        try {
          lone.setSunDirection(spec.sunDirection);
          lone.applyPackedRecords(liveGrassRecords(state.ring), true);
          lone.setFarTierVisible(false);
          // The standalone copy has to route the same half of the ground: the
          // live range holds tiles from the focus the owner has not published.
          lone.setRouteMask(state.ring.mask);
          lone.setRouteCullWedge(state.wedge);
          lone.routeGpu(renderer, eyePosition(params), [params.target[0], params.target[1]]);
          trace.phase("standalone");
          trace.mark("standalone");
          renderer.setRenderTarget(reference);
          renderer.render(world.scene, camera);
          renderer.setRenderTarget(null);
          standalone = unpackRgba16fRows(
            (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
            W,
            H,
          );
        } finally {
          lone.dispose();
          oldMeshes.forEach((mesh, i) => {
            mesh.visible = oldVisibility[i];
          });
        }
      }
      const pixels = compareHdr(actual, expected);
      const mismatches = [];
      let coverageMismatch = 0,
        maxCovered = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (actual[i + 3] !== expected[i + 3]) {
          coverageMismatch++;
          if (mismatches.length < 40)
            mismatches.push({
              x: (i / 4) % W,
              y: Math.floor(i / 4 / W),
              actual: actual.slice(i, i + 4),
              expected: expected.slice(i, i + 4),
            });
        }
        if (actual[i + 3] && expected[i + 3])
          for (let c = 0; c < 3; c++)
            maxCovered = Math.max(maxCovered, Math.abs(actual[i + c] - expected[i + c]));
      }
      const stats = native.stats(),
        unchangedUpload =
          label !== "same-revision" ||
          JSON.stringify(stats.uploads) === JSON.stringify(priorUploads);
      priorUploads = stats.uploads;
      results.push({
        label,
        width: W,
        height: H,
        actual,
        expected,
        ...(ringOnly
          ? {
              ringOnly,
              sourceRingOnly: {
                versusNative: compareHdr(actual, ringOnly),
                versusCombined: compareHdr(expected, ringOnly),
                coveredPixels: ringOnly.filter((v, i) => i % 4 === 3 && v > 0).length,
              },
            }
          : {}),
        effective,
        ...(label === "interior-far-hidden" ? { issued: await trace.snapshot() } : {}),
        ...(standalone
          ? {
              standalone,
              sourceStandalone: {
                sourceStandaloneParity:
                  compareHdr(expected, standalone).maxAbs === 0 &&
                  standalone.some((v, i) => i % 4 === 3 && v > 0),
                versusNative: compareHdr(actual, standalone),
                versusCombined: compareHdr(expected, standalone),
                coveredPixels: standalone.filter((v, i) => i % 4 === 3 && v > 0).length,
              },
            }
          : {}),
        routes,
        pixels,
        coverageMismatch,
        mismatches,
        maxCovered,
        unchangedUpload,
        uploads: stats.uploads,
        pipelines: stats.layers.map((l) => l.pipelineBuilds),
        passed:
          routes.every((r) => r.equal) &&
          unchangedUpload &&
          pixels.nonfinite === 0 &&
          coverageMismatch === 0 &&
          maxCovered <= 1 / 255,
      });
    }
    return {
      backend: kind,
      samples,
      results,
      errors,
      passed: results.every((r) => r.passed) && errors.length === 0,
      scope:
        "Small authored base/ring residency history; strict component diagnostic, not full-scene parity",
    };
  } finally {
    for (const f of release.reverse()) f();
  }
}
run()
  .then((report) => Object.assign(window, { __grassFieldCheck: report }))
  .catch((error) =>
    Object.assign(window, { __grassFieldCheck: { passed: false, error: String(error) } }),
  );
