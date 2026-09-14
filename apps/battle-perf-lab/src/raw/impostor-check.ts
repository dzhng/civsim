import type { WorldSurfaceDiagnostic } from "../shaders/environment";
import { encodeRgba8Base64 } from "../imageTransport";
import * as THREE from "three/webgpu";
import {
  vec3,
  vec4,
  uniform,
  positionLocal,
  diffuseColor,
  normalize,
  cameraWorldMatrix,
  normalView,
  roughness,
  metalness,
  ambientOcclusion,
} from "three/tsl";
import { PhotorealWorld } from "../../../../packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "../../../../packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import {
  createSoldierImpostorAtlas,
  OctahedralImpostorLayer,
} from "../../../../packages/photoreal-renderer/src/battle/impostorLayer";
import { prepareSoldierSurface } from "../../../../packages/photoreal-renderer/src/battle/soldierSurface";
import { loadAppearanceCatalog } from "../../../../packages/soldier-assets/src/appearanceBundle";
import {
  decodeLocalSample,
  resolveLocalSample,
} from "../../../../packages/soldier-assets/src/localAnimation";
import { localPoseToJointMatrices } from "../../../../packages/soldier-assets/src/localPose";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import {
  eyePosition,
  viewMatrix,
  type Camera3DParams,
} from "../../../../packages/renderer-core/src/camera3d";
import { cameraUniformData } from "../../../../packages/renderer-core/src/cameraUniform";
import {
  createRawEnvironment,
  rawEnvironmentWgsl,
} from "./environment";
import { createRawImpostors, type ImpostorAtlasData, type ImpostorView } from "./impostor";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../numericalReadback";

const W = 640,
  H = 480;
async function captureMipChain(
  renderer: THREE.WebGPURenderer,
  texture: THREE.Texture,
): Promise<Uint8Array[]> {
  // Control-only readback: the native renderer never depends on Three backend resources.
  const backend = renderer.backend as unknown as {
    device: GPUDevice;
    get(texture: THREE.Texture): { texture: GPUTexture };
  };
  const native = backend.get(texture).texture,
    result: Uint8Array[] = [];
  for (let mip = 0; mip < native.mipLevelCount; mip++) {
    const width = Math.max(1, native.width >> mip),
      height = Math.max(1, native.height >> mip),
      stride = Math.ceil((width * 4) / 256) * 256;
    const buffer = backend.device.createBuffer({
      size: stride * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = backend.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: native, mipLevel: mip },
        { buffer, bytesPerRow: stride },
        [width, height],
      );
      backend.device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange()),
        bytes = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++)
        bytes.set(mapped.subarray(y * stride, y * stride + width * 4), y * width * 4);
      result.push(bytes);
    } finally {
      buffer.destroy();
    }
  }
  return result;
}
function rgba(p: number[]) {
  const bytes = Uint8Array.from(p, (v, i) =>
    Math.round(
      Math.min(
        1,
        Math.max(0, i % 4 === 3 ? v : v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055),
      ) * 255,
    ),
  );
  return encodeRgba8Base64(bytes);
}
async function run() {
  const query = new URLSearchParams(location.search);
  const samples = query.get("samples") === "4" ? 4 : 1;
  const canonicalProjection = query.has("canonical");
  const requestedDiagnostic = query.get("diagnostic");
  const diagnostic: WorldSurfaceDiagnostic | undefined =
    requestedDiagnostic === "albedo" ||
    requestedDiagnostic === "normal" ||
    requestedDiagnostic === "roughness" ||
    requestedDiagnostic === "ao"
      ? requestedDiagnostic
      : undefined;
  const focused = query.has("focus");
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice(),
    errors: string[] = [];
  const cleanup: Array<() => void> = [() => device.destroy()];
  try {
    device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
    const world = await PhotorealWorld.create(document.createElement("canvas"), {
        antialias: false,
      }),
      renderer = world.renderer;
    cleanup.push(() => world.dispose());
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    const env = CIVSIM_ENVIRONMENTS.golden;
    applyCivsimEnvironment(world, env, { aerialObserver: vec3(0, 0, 0) });
    for (const child of world.scene.children)
      if (child instanceof THREE.Mesh) child.visible = false;
    const lighting = await createRawEnvironment(device, env);
    cleanup.push(() => lighting.dispose());
    if (diagnostic) lighting.shader = rawEnvironmentWgsl(env, diagnostic);
    const cameraBuffer = device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    cleanup.push(() => cameraBuffer.destroy());
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
    const output = device.createTexture({
      size: [W, H],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    cleanup.push(() => output.destroy());
    const multisample =
      samples === 4
        ? device.createTexture({
            size: [W, H],
            format: "rgba16float",
            sampleCount: samples,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : undefined;
    if (multisample) cleanup.push(() => multisample.destroy());
    const depth = device.createTexture({
      sampleCount: samples,
      size: [W, H],
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    cleanup.push(() => depth.destroy());
    const reference = new THREE.RenderTarget(W, H, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
    });
    cleanup.push(() => reference.dispose());
    const camera = new THREE.PerspectiveCamera();
    const results = [];
    const lifecycle = [];
    const appearances = await loadAppearanceCatalog(
      new URL("/assets/soldiers/catalog.json", location.href).href,
    );
    for (const classId of focused ? [3] : [0, 3, 6]) {
      const classCleanup: Array<() => void> = [];
      try {
        const bundle = appearances[classId],
          surface = await prepareSoldierSurface(renderer, bundle.surface);
        classCleanup.push(() => surface.dispose());
        const far = bundle.manifest.far,
          palette = localPoseToJointMatrices(
            bundle.rig,
            decodeLocalSample(
              bundle.animation,
              resolveLocalSample(bundle.animation, far.clip, far.phase),
            ),
          );
        const atlas = await createSoldierImpostorAtlas(renderer, bundle.farMesh, palette, surface);
        let layer: OctahedralImpostorLayer | undefined;
        classCleanup.push(() => (layer ? layer.dispose() : atlas.dispose()));
        const data: ImpostorAtlasData = {
          columns: atlas.columns,
          rows: atlas.rows,
          tileSize: atlas.tileSize,
          center: [atlas.center.x, atlas.center.y, atlas.center.z],
          worldSpan: atlas.worldSpan,
          albedo: await captureMipChain(renderer, atlas.textures.albedo),
          normal: await captureMipChain(renderer, atlas.textures.normal),
          orm: await captureMipChain(renderer, atlas.textures.orm),
        };
        layer = new OctahedralImpostorLayer(world.scene, atlas);
        let rejectedIncompleteMips = false;
        try {
          await createRawImpostors(device, { ...data, orm: [] }, cameraLayout, lighting, samples);
        } catch {
          rejectedIncompleteMips = true;
        }
        const raw = await createRawImpostors(device, data, cameraLayout, lighting, samples);
        classCleanup.push(() => raw.dispose());
        for (const [label, pitch, distance] of focused
          ? [["overhead", 1.35, 32] as const]
          : ([
              ["oblique", 0.5, 32],
              ["overhead", 1.35, 32],
              ["overlap", 0.5, 14],
              ["floor", 0.5, 900],
            ] as const)) {
          const spacing = label === "overlap" ? 0.65 : distance > 100 ? 14 : 3;
          const source: CrowdInstance[] = Array.from({ length: 12 }, (_, i) => ({
            x: ((i % 4) - 1.5) * spacing,
            y: (Math.floor(i / 4) - 1) * spacing,
            facing: (i * Math.PI) / 6,
            classId,
            faction: (i % 3) as 0 | 1 | 2,
            alive: i < 8,
            clip: far.clip,
            phase: far.phase,
            seed: i,
            mounted: classId === 6,
            lod: 3,
            elevation: i === 5 ? 0.7 : 0,
          }));
          const params: Camera3DParams = {
            target: [0, 0, 1],
            distance,
            pitch,
            yaw: -Math.PI / 2,
            fovY: 0.8,
            aspect: W / H,
            near: 0.1,
            far: 3000,
          };
          applyCamera3d(camera, params);
          const view = viewMatrix(params),
            eye = eyePosition(params),
            matrix = camera.matrixWorld.elements;
          const right = new THREE.Vector3(matrix[0], matrix[1], matrix[2]).normalize(),
            up = new THREE.Vector3(matrix[4], matrix[5], matrix[6]).normalize();
          const billView: ImpostorView = {
            right: [right.x, right.y, right.z],
            up: [up.x, up.y, up.z],
            eye: [eye[0], eye[1], eye[2]],
            fovY: params.fovY,
          };
          lighting.setView(view, [0, 0, 0]);
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
          layer.upload(source);
          layer.setCamera(camera);
          const packed = raw.update(source, billView);
          const mesh = world.scene.getObjectByName(
            "battle-crowd-far-impostors",
          ) as THREE.Mesh<THREE.InstancedBufferGeometry>;
          if (canonicalProjection) {
            const material = mesh.material as THREE.MeshStandardNodeMaterial;
            const projection = cameraUniformData({
              camera3d: params,
              x: 0,
              y: 0,
              zoom: 8,
              width: W,
              height: H,
              sunAzimuth: 0,
              sunElevation: 0,
            }).subarray(0, 16);
            material.vertexNode = uniform(new THREE.Matrix4().fromArray(projection)).mul(
              vec4(positionLocal, 1),
            );
            material.needsUpdate = true;
          }
          if (diagnostic) {
            const material = mesh.material as THREE.MeshStandardNodeMaterial;
            material.fog = false;
            material.outputNode =
              diagnostic === "albedo"
                ? vec4(diffuseColor.rgb, 1)
                : diagnostic === "normal"
                  ? vec4(
                      normalize(cameraWorldMatrix.mul(vec4(normalView, 0)).xyz)
                        .mul(0.5)
                        .add(0.5),
                      1,
                    )
                  : diagnostic === "ao"
                    ? vec4(vec3(ambientOcclusion), 1)
                    : vec4(roughness, 0, metalness, 1);
            material.needsUpdate = true;
          }
          const shadowFlagsMatch = !mesh.castShadow && !mesh.receiveShadow;
          const expectedInst = mesh.geometry.getAttribute("impostorInst"),
            expectedMeta = mesh.geometry.getAttribute("impostorMeta"),
            expectedLiving = mesh.geometry.getAttribute("impostorLiving");
          let packingEqual = true;
          for (let i = 0; i < source.length; i++)
            for (let c = 0; c < 9; c++)
              if (
                packed[i * 12 + c] !==
                (c < 4
                  ? expectedInst.array[i * 4 + c]
                  : c < 8
                    ? expectedMeta.array[i * 4 + c - 4]
                    : expectedLiving.array[i])
              )
                packingEqual = false;
          const encoder = device.createCommandEncoder(),
            pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: (multisample ?? output).createView(),
                  resolveTarget: multisample ? output.createView() : undefined,
                  loadOp: "clear",
                  storeOp: "store",
                  clearValue: [0, 0, 0, 0],
                },
              ],
              depthStencilAttachment: {
                view: depth.createView(),
                depthClearValue: 0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
              },
            });
          raw.draw(pass, cameraGroup);
          pass.end();
          device.queue.submit([encoder.finish()]);
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          renderer.setRenderTarget(reference);
          renderer.render(world.scene, camera);
          renderer.setRenderTarget(null);
          const actual = await readHdrTexture(device, output),
            expected = unpackRgba16fRows(
              (await renderer.readRenderTargetPixelsAsync(reference, 0, 0, W, H)) as Uint16Array,
              W,
              H,
            );
          const pixels = compareHdr(actual, expected);
          const exceptionalPixels: {
            x: number;
            y: number;
            actual: number[];
            expected: number[];
          }[] = [];
          let covered = 0,
            coverageMismatch = 0,
            different = 0,
            maxCovered = 0;
          for (let i = 0; i < actual.length; i += 4) {
            const a = actual[i + 3] > 0,
              b = expected[i + 3] > 0;
            if (a) covered++;
            if (actual[i + 3] !== expected[i + 3]) coverageMismatch++;
            if (a || b) {
              let d = 0;
              for (let c = 0; c < 3; c++)
                d = Math.max(d, Math.abs(actual[i + c] - expected[i + c]));
              maxCovered = Math.max(maxCovered, d);
              if (d > 1 / 255) {
                different++;
                if (exceptionalPixels.length < 20)
                  exceptionalPixels.push({
                    x: (i / 4) % W,
                    y: Math.floor(i / 4 / W),
                    actual: actual.slice(i, i + 4),
                    expected: expected.slice(i, i + 4),
                  });
              }
            }
          }
          let shader;
          if (classId === 3 && label === "overhead") {
            renderer.setRenderTarget(reference);
            shader = await renderer.debug.getShaderAsync(world.scene, camera, mesh);
            renderer.setRenderTarget(null);
          }
          results.push({
            exceptionalPixels,
            shader,
            label: `${classId}-${label}`,
            packingEqual,
            shadowFlagsMatch,
            pixels,
            covered,
            coverageMismatch,
            different,
            maxCovered,
            passed:
              packingEqual &&
              shadowFlagsMatch &&
              pixels.nonfinite === 0 &&
              covered > 0 &&
              coverageMismatch === 0 &&
              different === 0,
            width: W,
            height: H,
            actualRgba: rgba(actual),
            expectedRgba: rgba(expected),
            mipLevels: data.albedo.length,
            stats: raw.stats(),
          });
        }
        const emptyView: ImpostorView = {
          right: [1, 0, 0],
          up: [0, 0, 1],
          eye: [0, -10, 10],
          fovY: 0.8,
        };
        raw.update([], emptyView);
        const emptyDraw = raw.stats().draws === 0;
        raw.dispose();
        let disposedGuard = false;
        try {
          raw.update([], emptyView);
        } catch {
          disposedGuard = true;
        }
        const borrowedAlive =
          (await readHdrTexture(device, output)).every(Number.isFinite) &&
          (await readHdrTexture(device, lighting.sky.lut)).every(Number.isFinite);
        lifecycle.push({
          classId,
          rejectedIncompleteMips,
          emptyDraw,
          disposedGuard,
          borrowedAlive,
        });
      } finally {
        for (const release of classCleanup.reverse()) release();
      }
    }
    return {
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
      samples,
      canonicalProjection,
      diagnostic,
      focused,
      results,
      lifecycle,
      errors,
      passed:
        results.length === (focused ? 1 : 12) &&
        results.every((r) => r.passed) &&
        lifecycle.every(
          (r) => r.rejectedIncompleteMips && r.emptyDraw && r.disposedGuard && r.borrowedAlive,
        ) &&
        errors.length === 0,
      scope: "Captured production atlas mip chains; native bake and full renderer parity pending",
    };
  } finally {
    for (const release of cleanup.reverse()) release();
  }
}
try {
  const result = await run();
  Object.assign(window, { __impostorCheck: result });
  document.querySelector("#result")!.textContent = JSON.stringify(
    result,
    (_, v) => (Array.isArray(v) && v.length > 100 ? `array(${v.length})` : v),
    2,
  );
} catch (error) {
  Object.assign(window, { __impostorCheck: { error: String(error) } });
  document.querySelector("#result")!.textContent = String(error);
}
