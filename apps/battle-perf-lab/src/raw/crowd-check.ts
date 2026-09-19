import { createCrowdControlBackend } from "../crowdControlBackend";
import { trackTextureLifetime } from "../textureLifetimeCheck";
import { sampleRigLocalPose } from "../../../../packages/soldier-assets/src/localPose";
import type { WorldSurfaceDiagnostic } from "../../../../packages/battle-renderer/src/shaders/environment";
import type { SoldierMeshData } from "../../../../packages/soldier-assets/src/mesh";
import * as THREE from "three/webgpu";
import {
  vec3,
  vec2,
  wgslFn,
  vertexIndex,
  varying,
  attribute,
  vec4,
  positionLocal,
  uniform,
  getGeometryRoughness,
  diffuseColor,
  normalView,
  normalViewGeometry,
  uv,
  roughness,
  metalness,
  ambientOcclusion,
  cameraWorldMatrix,
  normalize,
} from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { PhotorealCrowd } from "../../../../packages/photoreal-renderer/src/battle/crowdLayer";
import {
  loadAppearanceBundle,
  type AppearanceBundle,
} from "../../../../packages/soldier-assets/src/appearanceBundle";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { viewMatrix, type Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import { resolveDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
import {
  planCrowdLods,
  type CrowdProjectionView,
} from "../../../../packages/crowd-runtime/src/visibility";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { encodeRgba8Base64 } from "../imageTransport";
import { createRawEnvironment, rawEnvironmentWgsl } from "../../../../packages/battle-renderer/src/world/environment";
import {
  crowdQuadDiagnostic,
  crowdDerivativeDiagnostic,
  type SoldierDiagnostic,
} from "../../../../packages/battle-renderer/src/shaders/soldier";
import { createRawCrowd } from "../../../../packages/battle-renderer/src/world/crowd";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";

const backend = new URL(location.href).searchParams.get("backend") ?? "raw";
const W = 768,
  H = 512;
const sampleCount = new URL(location.href).searchParams.get("samples") === "4" ? 4 : 1;
const motion = new URL(location.href).searchParams.has("motion");
const isolatedTriangle = new URL(location.href).searchParams.get("triangle");
const deindexed = new URL(location.href).searchParams.has("deindex");
const invariantPosition = !new URL(location.href).searchParams.has("non-invariant");
const canonical = new URL(location.href).searchParams.has("canonical");
const diagnostic = new URL(location.href).searchParams.get(
  "material",
) as WorldSurfaceDiagnostic | null;
const vertexDiagnostic = new URL(location.href).searchParams.get(
  "vertex",
) as SoldierDiagnostic | null;
const quadNode = wgslFn("fn crowdQuad" + crowdQuadDiagnostic);
const derivativesNode = wgslFn("fn crowdDerivatives" + crowdDerivativeDiagnostic);
const debugShaders = new URL(location.href).searchParams.has("shaders");
/** Diagnostic only: preserve every triangle's ordered attribute values while
 * giving its first vertex a unique index for the flat raster identity output. */
function deindex(mesh: SoldierMeshData): SoldierMeshData {
  const expand = (data: ArrayLike<number>, width: number) => {
    const out = new Float32Array(mesh.indices.length * width);
    for (let i = 0; i < mesh.indices.length; i++)
      for (let c = 0; c < width; c++) out[i * width + c] = data[mesh.indices[i] * width + c];
    return out;
  };
  return {
    positions: expand(mesh.positions, 3),
    normals: expand(mesh.normals, 3),
    colors: expand(mesh.colors, 4),
    joints: Uint16Array.from(expand(mesh.joints, 4)),
    weights: expand(mesh.weights, 4),
    uvs: expand(mesh.uvs, 2),
    tangents: expand(mesh.tangents, 4),
    materialIds: expand(mesh.materialIds, 1),
    factionMasks: expand(mesh.factionMasks, 1),
    indices: Uint32Array.from({ length: mesh.indices.length }, (_, i) => i),
  };
}
async function readFloatTexture(device: GPUDevice, texture: GPUTexture) {
  const b = device.createBuffer({
    size: W * H * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const e = device.createCommandEncoder();
    e.copyTextureToBuffer({ texture }, { buffer: b, bytesPerRow: W * 16 }, [W, H]);
    device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    return new Float32Array(b.getMappedRange().slice(0));
  } finally {
    b.destroy();
  }
}
async function run() {
  const cleanup: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(resource: T): T => {
    cleanup.push(() => {
      if ("dispose" in resource) resource.dispose();
      else resource.destroy();
    });
    return resource;
  };
  try {
    if (vertexDiagnostic && sampleCount !== 1)
      throw new Error("Float32 vertex diagnostics require one sample");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPU adapter");
    const device = own(await adapter.requestDevice());
    const errors: string[] = [];
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const caps = resolveDeviceCaps({
      adapterLimits: {
        maxBufferSize: device.limits.maxBufferSize,
        maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      },
      deviceFeatures: device.features,
      powerPreference: "default",
    });
    const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
    const catalog = await (await fetch(catalogUrl)).json();
    const assets: Record<number, AppearanceBundle> = {};
    for (const id of [0, 6])
      assets[id] = await loadAppearanceBundle(new URL(catalog.appearances[id], catalogUrl).href);
    if (deindexed)
      for (const bundle of Object.values(assets))
        bundle.tiers = bundle.tiers.map((mesh) => deindex(mesh)) as AppearanceBundle["tiers"];
    if (isolatedTriangle !== null) {
      const start = Number(isolatedTriangle);
      if (!Number.isInteger(start) || start < 0 || start % 3)
        throw new Error("Invalid triangle index offset");
      for (const bundle of Object.values(assets)) {
        const mesh = bundle.tiers[0];
        bundle.tiers[0] = { ...mesh, indices: mesh.indices.slice(start, start + 3) };
      }
    }
    const world = own(
      await PhotorealWorld.create(document.createElement("canvas"), { antialias: false }),
    );
    const renderer = world.renderer;
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    const env = CIVSIM_ENVIRONMENTS.golden;
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    for (const child of world.scene.children)
      if (child instanceof THREE.Mesh) child.visible = false;
    const source = own(await PhotorealCrowd.create(renderer, world.scene, assets));
    if (!["raw", "typegpu", "vgpu"].includes(backend)) throw new Error("Unknown crowd backend");
    if (backend !== "raw" && (diagnostic || vertexDiagnostic))
      throw new Error(
        "Candidate port diagnostics require raw control; full material oracle unchanged",
      );
    const environment =
      backend === "raw" ? own(await createRawEnvironment(device, env)) : undefined;
    if (diagnostic && environment) environment.shader = rawEnvironmentWgsl(env, diagnostic);
    const cameraBuffer = own(
      device.createBuffer({
        size: 192,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );
    const cameraLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const cameraGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
    });
    const output = own(
      device.createTexture({
        size: [W, H],
        format: vertexDiagnostic ? "rgba32float" : "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    );
    const multisampled =
      sampleCount === 4
        ? own(
            device.createTexture({
              size: [W, H],
              format: "rgba16float",
              sampleCount,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            }),
          )
        : undefined;
    const depth = own(
      device.createTexture({
        size: [W, H],
        format: "depth32float",
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    );
    const reference = own(
      new THREE.RenderTarget(W, H, {
        type: vertexDiagnostic ? THREE.FloatType : THREE.HalfFloatType,
        depthBuffer: true,
        samples: sampleCount === 4 ? 4 : 0,
      }),
    );
    const params: Camera3DParams = {
      target: [0, 0, 0],
      distance: 13,
      pitch: 0.4,
      yaw: -Math.PI / 2,
      fovY: 0.8,
      aspect: W / H,
      near: 0.1,
      far: 3000,
    };
    const camera = new THREE.PerspectiveCamera();
    applyCamera3d(camera, params);
    const view = viewMatrix(params);
    environment?.setView(view, [0, 0, 0]);
    device.queue.writeBuffer(
      cameraBuffer,
      0,
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
    const projection = uniform(
      new THREE.Matrix4().fromArray(
        cameraUniformData({
          camera3d: params,
          x: 0,
          y: 0,
          zoom: 8,
          width: W,
          height: H,
          sunAzimuth: 0,
          sunElevation: 0,
        }).subarray(0, 16),
      ),
    );
    const results = [];
    const shaders: unknown[] = [];
    const shadowDepth = own(
      device.createTexture({
        size: [W, H],
        format: "depth32float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    );
    const candidateTextures = trackTextureLifetime(device);
    cleanup.push(candidateTextures.restore);
    const driver =
      backend === "raw"
        ? undefined
        : own(
            await createCrowdControlBackend(
              backend as "typegpu" | "vgpu",
              device,
              assets,
              env,
              W,
              H,
              sampleCount,
            ),
          );
    driver?.setView(params);
    const candidate =
      driver ??
      own(
        await createRawCrowd(device, caps, assets, cameraLayout, environment!, {
          sampleCount,
          diagnostic: vertexDiagnostic ?? undefined,
          format: vertexDiagnostic ? "rgba32float" : "rgba16float",
          invariantPosition,
        }),
      );
    candidateTextures.restore();
    let lastInstances: readonly CrowdInstance[] = [];
    const lifecycle: object[] = [];
    let previousLevels: Uint8Array | undefined;
    const repeatResults: object[] = [];
    const cases: readonly (readonly [string, number, number, boolean])[] = motion
      ? Array.from(
          { length: 12 },
          (_, i) => [`motion-${String(i).padStart(2, "0")}`, 30, 0.37, true] as const,
        )
      : [
          ["far-mesh", 6, 1, true],
          ["mid", 12, 1, true],
          ["full", 30, 1, true],
          ["transition", 30, 0.37, true],
          ["corpse", 30, 1, false],
          ["frozen-transition", 30, 0.43, true],
          ["rider-upper-body", 30, 0.58, true],
          ["death", 30, 0.72, false],
        ];
    for (const [caseIndex, [label, pixels, weight, alive]] of cases.entries()) {
      if (motion) {
        params.target = [(caseIndex - 5.5) * 0.008, 0, 0];
        params.yaw = -Math.PI / 2 + (caseIndex - 5.5) * 0.0005;
        applyCamera3d(camera, params);
        environment?.setView(viewMatrix(params), [0, 0, 0]);
        const cameraBytes = cameraUniformData({
          camera3d: params,
          x: 0,
          y: 0,
          zoom: 8,
          width: W,
          height: H,
          sunAzimuth: 0,
          sunElevation: 0,
        });
        device.queue.writeBuffer(cameraBuffer, 0, cameraBytes);
        projection.value.fromArray(cameraBytes.subarray(0, 16));
      }
      const instances: CrowdInstance[] = Object.entries(assets).flatMap(([id, bundle], row) =>
        [0, 1, 2].map((faction) => {
          const clip = bundle.animation.clips[0].name;
          const destination =
            bundle.animation.clips[Math.min(1, bundle.animation.clips.length - 1)].name;
          return {
            x: (faction - 1) * 3,
            y: (row - 0.5) * 4,
            facing: Math.PI / 2 + faction * 0.5,
            classId: Number(id),
            faction: faction as 0 | 1 | 2,
            alive,
            clip,
            phase: 0.31,
            seed: 1,
            mounted: Number(id) === 6,
            lod: 0,
            elevation: 0,
            playback: {
              appearanceId: Number(id),
              base: {
                source: { kind: "clip", sample: { clip, phase: 0.31 } },
                destination: { clip: destination, phase: 0.65 },
                weight,
              },
            },
          };
        }),
      );
      for (const instance of instances) {
        const bundle = assets[instance.classId];
        const playback = instance.playback!;
        if (label === "frozen-transition")
          playback.base.source = {
            kind: "frozen",
            locals: Object.freeze(Array.from(sampleRigLocalPose(bundle.rig, instance.clip, 0.27))),
          };
        if (label === "rider-upper-body" && instance.mounted) {
          const attack = bundle.manifest.presentation!.actions.melee!;
          playback.riderUpperBody = {
            source: playback.base.source,
            destination: { clip: attack.clip, phase: 0.46 },
            weight: 0.58,
          };
        }
        if (label === "death") {
          const death = bundle.manifest.presentation!.actions.death!;
          playback.base.destination = { clip: death.clip, phase: 0.72 };
          instance.clip = death.clip;
          instance.phase = 0.72;
        }
      }
      // A controlled projected demand exercises actual production tier selection
      // while keeping the images large enough to inspect each authored tier.
      const views: CrowdProjectionView[] = [
        {
          frustum: { planes: [] },
          projection: { view, pixelsPerViewUnit: pixels / 1.8, perspective: false, near: 0.1 },
          shadow: false,
        },
      ];
      views.push({
        ...views[0],
        projection: { ...views[0].projection, pixelsPerViewUnit: 30 / 1.8 },
        shadow: true,
      });
      source.upload(instances, { camera, views });
      if (canonical)
        for (const child of world.scene.children)
          if (child instanceof THREE.Mesh && child.name.startsWith("battle-crowd-"))
            (child.material as THREE.NodeMaterial).vertexNode = projection.mul(
              vec4(positionLocal, 1),
            );
      if (diagnostic)
        for (const child of world.scene.children)
          if (child instanceof THREE.Mesh && child.name.startsWith("battle-crowd-")) {
            const material = child.material as THREE.MeshStandardNodeMaterial;
            material.fog = false;
            if (diagnostic === "albedo") material.outputNode = vec4(diffuseColor.rgb, 1);
            else if (diagnostic === "ao") material.outputNode = vec4(vec3(ambientOcclusion), 1);
            else if (diagnostic === "normal")
              material.outputNode = vec4(
                normalize(cameraWorldMatrix.mul(vec4(normalView, 0)).xyz)
                  .mul(0.5)
                  .add(0.5),
                1,
              );
            else
              material.outputNode = vec4(
                roughness,
                getGeometryRoughness() as unknown as THREE.Node<"float">,
                metalness,
                1,
              );
          }
      if (vertexDiagnostic)
        for (const child of world.scene.children)
          if (child instanceof THREE.Mesh && child.name.startsWith("battle-crowd-")) {
            const mat = child.material as THREE.MeshStandardNodeMaterial;
            mat.outputNode =
              vertexDiagnostic === "quad"
                ? quadNode(uv(), normalViewGeometry)
                : vertexDiagnostic === "primitive"
                  ? vec4(
                      vec2(
                        varying(vertexIndex).setInterpolation("flat").toFloat().add(1),
                        varying(attribute<"float">("materialId", "float")).setInterpolation("flat"),
                      ),
                      uv(),
                    )
                  : vertexDiagnostic === "derivatives"
                    ? derivativesNode({ uv: uv(), n: normalViewGeometry })
                    : vertexDiagnostic === "geometry-normal"
                      ? vec4(
                          normalViewGeometry,
                          getGeometryRoughness() as unknown as THREE.Node<"float">,
                        )
                      : vec4(uv(), uv().x.dFdx(), uv().y.dFdy().negate());
          }
      lastInstances = instances;
      const plan = planCrowdLods(instances, views, assets, previousLevels);
      previousLevels = plan.levels;
      await candidate.upload(instances, plan);
      if (driver) {
        driver.setView(params);
        await driver.render();
      } else {
        const encoder = device.createCommandEncoder();
        if (!("precompute" in candidate)) throw new Error("Missing raw compute");
        candidate.precompute(encoder);
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: (multisampled ?? output).createView(),
              resolveTarget: multisampled ? output.createView() : undefined,
              clearValue: [0, 0, 0, 0],
              loadOp: "clear",
              storeOp: "store",
            },
          ],
          depthStencilAttachment: {
            view: depth.createView(),
            depthClearValue: 0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        candidate.draw(pass, cameraGroup);
        pass.end();
        const shadowPass = encoder.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: shadowDepth.createView(),
            depthClearValue: 0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });
        candidate.draw(shadowPass, cameraGroup, "shadow");
        shadowPass.end();
        device.queue.submit([encoder.finish()]);
      }
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      renderer.setRenderTarget(reference);
      renderer.render(world.scene, camera);
      renderer.setRenderTarget(null);
      if (debugShaders && label === "full") {
        renderer.setRenderTarget(reference);
        for (const child of world.scene.children)
          if (child instanceof THREE.Mesh && /^battle-crowd-(0|6)-main-lod0$/.test(child.name))
            shaders.push({
              name: child.name,
              ...(await renderer.debug.getShaderAsync(world.scene, camera, child)),
            });
        renderer.setRenderTarget(null);
      }
      const actual = Array.from(
        await (vertexDiagnostic
          ? readFloatTexture(device, driver?.output ?? output)
          : readHdrTexture(device, driver?.output ?? output)),
      );
      if (driver) {
        await driver.render();
        const repeated = await readHdrTexture(device, driver.output);
        let maxAbs = 0,
          different = 0;
        for (let i = 0; i < actual.length; i++) {
          const error = Math.abs(actual[i] - repeated[i]);
          maxAbs = Math.max(maxAbs, error);
          if (error) different++;
        }
        repeatResults.push({ label, phase: "first-vs-identical-repeat", maxAbs, different });
      }
      const rawReference = await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H);
      const expected =
        rawReference instanceof Float32Array
          ? Array.from(rawReference)
          : rawReference instanceof Uint16Array
            ? Array.from(unpackRgba16fRows(rawReference, W, H))
            : (() => {
                throw new Error("Unexpected reference type");
              })();
      const errorPixels: [number, number][] = [];
      const worst: {
        x: number;
        y: number;
        difference: number;
        actual: number[];
        expected: number[];
      }[] = [];
      let coverageMismatch = 0,
        covered = 0,
        commonMaxAbs = 0,
        commonOverCode = 0;
      for (let i = 0; i < actual.length; i += 4) {
        const a = vertexDiagnostic
            ? actual.slice(i, i + 4).some((v) => v !== 0)
            : actual[i + 3] > 0.5,
          b = vertexDiagnostic
            ? expected.slice(i, i + 4).some((v) => v !== 0)
            : expected[i + 3] > 0.5;
        if (a !== b) coverageMismatch++;
        if (a && b) {
          const difference = Math.max(
            ...(vertexDiagnostic ? [0, 1, 2, 3] : [0, 1, 2]).map((c) =>
              Math.abs(actual[i + c] - expected[i + c]),
            ),
          );
          if (difference > 1 / 255) {
            if (!vertexDiagnostic) errorPixels.push([(i / 4) % W, Math.floor(i / 4 / W)]);
            worst.push({
              x: (i / 4) % W,
              y: Math.floor(i / 4 / W),
              difference,
              actual: actual.slice(i, i + 4),
              expected: expected.slice(i, i + 4),
            });
            worst.sort((a, b) => b.difference - a.difference);
            if (worst.length > 32) worst.pop();
          }
          covered++;
          for (let c = 0; c < (vertexDiagnostic ? 4 : 3); c++) {
            const d = Math.abs(actual[i + c] - expected[i + c]);
            commonMaxAbs = Math.max(commonMaxAbs, d);
            if (d > 1 / 255) commonOverCode++;
          }
        }
      }
      const rgba = (data: number[]) =>
        data.map((v, i) =>
          Math.round(
            Math.min(
              1,
              Math.max(
                0,
                i % 4 === 3 ? v : v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
              ),
            ) * 255,
          ),
        );
      results.push({
        label,
        width: W,
        height: H,
        levels: Array.from(plan.levels),
        stats: candidate.stats(),
        sourceStats: source.stats(),
        comparison: compareHdr(actual, expected),
        coverageMismatch,
        covered,
        commonMaxAbs,
        commonOverCode,
        worst,
        errorPixels,
        probes: vertexDiagnostic
          ? [
              ...Array.from({ length: 36 }, (_, i) => [362 + (i % 6), 194 + Math.floor(i / 6)]),
              [544, 231],
              [225, 241],
              [225, 243],
              [364, 196],
              [372, 237],
              [219, 294],
              [560, 255],
              [398, 254],
            ].map(([x, y]) => {
              const i = (y * W + x) * 4;
              return { x, y, actual: actual.slice(i, i + 4), expected: expected.slice(i, i + 4) };
            })
          : undefined,
        ...(vertexDiagnostic === "primitive"
          ? {
              primitiveIds: Object.fromEntries(
                [
                  ["actual", actual],
                  ["expected", expected],
                ].map(([key, values]) => {
                  const data = values as number[];
                  const ids = Uint32Array.from({ length: W * H }, (_, i) => data[i * 4]);
                  return [key, encodeRgba8Base64(new Uint8Array(ids.buffer))];
                }),
              ),
            }
          : {}),
        actualRgba: encodeRgba8Base64(Uint8Array.from(rgba(actual))),
        expectedRgba: encodeRgba8Base64(Uint8Array.from(rgba(expected))),
      });
    }
    if (driver) {
      const population = Array.from({ length: 257 }, (_, i) => ({
        ...lastInstances[0],
        x: i === 0 ? lastInstances[0].x : 100000 + i,
        y: i === 0 ? lastInstances[0].y : 100000,
      }));
      await driver.upload(population, {
        levels: new Uint8Array(257),
        shadowLevels: new Uint8Array(257),
        visibility: new Uint8Array(257).fill(3),
      });
      await driver.render();
      const grown = driver.stats();
      await driver.upload([], { levels: [], shadowLevels: [], visibility: [] });
      await driver.render();
      const cleared = (await readHdrTexture(device, driver.output)).every((v) => v === 0);
      lifecycle.push({
        case: "grow257-then-empty",
        mainDraws: grown.mainDraws,
        shadowDraws: grown.shadowDraws,
        cleared,
      });
      if (!cleared || grown.mainDraws !== 1 || grown.shadowDraws !== 1)
        throw new Error("Crowd growth/empty control failed");
    }
    candidate.dispose();
    candidate.dispose();
    return {
      backend,
      canonical,
      sampleCount,
      isolatedTriangle,
      motion,
      deindexed,
      invariantPosition: backend === "typegpu" ? false : invariantPosition,
      diagnostic,
      vertexDiagnostic,
      shaders,
      results,
      repeatResults,
      lifecycle,
      errors,
      liveCandidateTexturesAfterDispose: candidateTextures.liveCount(),
      passed:
        errors.length === 0 &&
        candidateTextures.liveCount() === 0 &&
        results.every(
          (r) =>
            r.covered > 0 &&
            r.comparison.nonfinite === 0 &&
            r.coverageMismatch === 0 &&
            r.commonOverCode === 0,
        ),
    };
  } finally {
    for (const dispose of cleanup.reverse()) dispose();
  }
}
run()
  .then((result) => Object.assign(window, { __crowdCheck: result }))
  .catch((error) =>
    Object.assign(window, {
      __crowdCheck: { passed: false, error: String(error), stack: error.stack },
    }),
  );
