import {
  terrainFixture,
  WIDTH as NUMERICAL_WIDTH,
  HEIGHT as NUMERICAL_HEIGHT,
  poses as numericalPoses,
  slopeBands,
  VISUAL_WIDTH,
  VISUAL_HEIGHT,
  visualPose,
} from "./fixture";
import { coplanarWallCapAt } from "./wallCapLocalization";
import { captureHdr } from "./capture";
import * as THREE from "three/webgpu";
import { float, positionLocal, uniform, vec4 } from "three/tsl";
import {
  createGroundMesh,
  createHorizonBlockerMesh,
} from "../../../../packages/photoreal-renderer/src/battle/terrainLayer";
import { createBattleFrameUniforms } from "../../../../packages/photoreal-renderer/src/battle/battleTsl";
import { BladeFieldTransitionUniforms } from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import { applyCamera3d } from "../../../../packages/photoreal-renderer/src/cameraBridge";
import { SkyModel } from "../../../../packages/photoreal-renderer/src/atmosphere/skyModel";
import { aerialPerspectiveNode } from "../../../../packages/photoreal-renderer/src/atmosphere/aerialPerspective";
import { CIVSIM_ENVIRONMENTS } from "../../../../packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "../../../../packages/game-renderer/src/environment/physicalEnvironment";
import {
  cameraUniformData,
  CAMERA_UNIFORM_BYTES,
} from "../../../../packages/renderer-core/src/cameraUniform";
import { viewMatrix } from "../../../../packages/renderer-core/src/camera3d";
import { RawBattleTerrain } from "../../src/raw/terrain";
import { createRawEnvironment } from "../../src/raw/environment";
import { readHdrTexture, unpackRgba16fRows, compareHdr } from "../../src/numericalReadback";

const dumpShaders = new URL(location.href).searchParams.has("shaders");
const visualReview = new URL(location.href).searchParams.has("visual");
const WIDTH = visualReview ? VISUAL_WIDTH : NUMERICAL_WIDTH,
  HEIGHT = visualReview ? VISUAL_HEIGHT : NUMERICAL_HEIGHT;
const poses = visualReview ? [visualPose] : numericalPoses;
const canonicalProjection = new URL(location.href).searchParams.has("canonical");
const ABSOLUTE_LIMIT = { material: 0.001, beauty: 0.005 };
interface TerrainCase {
  preset: string;
  includeHorizon: boolean;
  mode: "material" | "beauty";
  pose: string;
  maxAbs: number;
  maxRelative: number;
  rmse: number;
  nonfinite: number;
  coverageMismatch: number;
  overTolerance: number;
  failingPixels: number;
  localizedWallCapPixels: number;
  unlocalizedFailurePixels: number;
  worst: {
    x: number;
    y: number;
    actual: number[];
    expected: number[];
    error: number;
    coplanarWallCap: ReturnType<typeof coplanarWallCapAt>;
  }[];
}
async function run() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU");
  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener("uncapturederror", (e) => errors.push(e.error.message));
  const renderer = new THREE.WebGPURenderer({ alpha: true, reversedDepthBuffer: true });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  const generator = new THREE.PMREMGenerator(renderer),
    camera = new THREE.PerspectiveCamera();
  const { ground, horizon } = terrainFixture();
  const frame = createBattleFrameUniforms();
  const farGrass = new BladeFieldTransitionUniforms({
    denseBladeEndM: 120,
    farGrassStartM: 80,
    farGrassEndM: 200,
    terrainDetailStrength: 1,
  });
  const options = { slopeBands, farGrass: true, earthDistance: ground.earthDistance };
  const reference = new THREE.RenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  const output = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: "rgba16float",
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING,
  });
  const depth = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const cameraBuffer = device.createBuffer({
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
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
  const shaderSources: { name: string; vertexShader: string; fragmentShader: string }[] = [];
  const results: TerrainCase[] = [];
  const captures: { name: string; png: string }[] = [];
  try {
    await renderer.init();
    for (const env of Object.values(CIVSIM_ENVIRONMENTS).filter(
      (env) => !visualReview || env.id === "golden",
    )) {
      const environment = await createRawEnvironment(device, env),
        sky = new SkyModel(env);
      let atlas: THREE.RenderTarget | undefined;
      try {
        sky.bake(renderer);
        atlas = generator.fromEquirectangular(sky.lut.texture);
        for (const includeHorizon of [false, true])
          for (const mode of ["material", "beauty"] as const) {
            const scene = new THREE.Scene();
            const groundMesh = createGroundMesh(frame, ground, {
              slopeBands,
              farGrass,
              earthDistance: ground.earthDistance,
            });
            const horizonMesh = includeHorizon ? createHorizonBlockerMesh(horizon) : null;
            const meshes = [groundMesh, ...(horizonMesh ? [horizonMesh] : [])];
            const original = meshes.map((m) => m.material as THREE.MeshStandardNodeMaterial);
            if (mode === "material")
              for (let i = 0; i < meshes.length; i++) {
                const mat = new THREE.NodeMaterial();
                mat.fragmentNode = vec4(
                  (original[i].colorNode as THREE.Node<"vec4">).rgb,
                  (original[i].roughnessNode as THREE.Node<"float"> | null) ??
                    float(original[i].roughness),
                );
                meshes[i].material = mat;
              }
            const referenceProjection = uniform(new THREE.Matrix4());
            for (const mesh of meshes) {
              if (canonicalProjection)
                (mesh.material as THREE.NodeMaterial).vertexNode = referenceProjection.mul(
                  vec4(positionLocal, 1),
                );
              scene.add(mesh);
            }
            const observer = uniform(new THREE.Vector3());
            if (mode === "beauty") {
              const spec = photorealEnvironment(env);
              scene.environment = atlas.texture;
              scene.environmentIntensity = spec.environmentIntensity;
              const light = new THREE.DirectionalLight(
                new THREE.Color(...spec.sunColor),
                spec.sunIntensity,
              );
              light.position.set(...spec.sunDirection).multiplyScalar(100);
              scene.add(light);
              scene.add(light.target);
              scene.fogNode = aerialPerspectiveNode(sky, env, observer);
            }
            const raw = new RawBattleTerrain(
              device,
              cameraLayout,
              environment,
              ground,
              includeHorizon ? horizon : null,
              options,
              mode,
            );
            try {
              for (const pose of poses) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                applyCamera3d(camera, pose.camera);
                frame.focus.value.set(pose.camera.target[0], pose.camera.target[1]);
                frame.time.value = pose.time;
                farGrass.terrainDetailStrength.value = pose.strength;
                observer.value.set(...pose.camera.target);
                environment.setView(viewMatrix(pose.camera), pose.camera.target);
                raw.setState(pose.strength);
                device.queue.writeBuffer(
                  cameraBuffer,
                  0,
                  cameraUniformData({
                    camera3d: pose.camera,
                    x: pose.camera.target[0],
                    y: pose.camera.target[1],
                    zoom: 1,
                    width: WIDTH,
                    height: HEIGHT,
                    time: pose.time,
                    sunAzimuth: env.sunAzimuth,
                    sunElevation: env.sunElevation,
                  }),
                );
                referenceProjection.value.fromArray(
                  cameraUniformData({
                    camera3d: pose.camera,
                    x: pose.camera.target[0],
                    y: pose.camera.target[1],
                    zoom: 1,
                    width: WIDTH,
                    height: HEIGHT,
                    time: pose.time,
                    sunAzimuth: env.sunAzimuth,
                    sunElevation: env.sunElevation,
                  }).subarray(0, 16),
                );
                const encoder = device.createCommandEncoder();
                const pass = encoder.beginRenderPass({
                  colorAttachments: [
                    {
                      view: output.createView(),
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
                raw.encode(pass, cameraGroup);
                pass.end();
                device.queue.submit([encoder.finish()]);
                renderer.setRenderTarget(reference);
                renderer.render(scene, camera);
                renderer.setRenderTarget(null);
                if (dumpShaders && !includeHorizon && env.id === "golden" && pose === poses[0]) {
                  renderer.setRenderTarget(reference);
                  const shader = await renderer.debug.getShaderAsync(scene, camera, groundMesh);
                  if (shader.vertexShader === null || shader.fragmentShader === null)
                    throw new Error("Compiled terrain shader source is unavailable");
                  shaderSources.push({
                    name: mode,
                    vertexShader: shader.vertexShader,
                    fragmentShader: shader.fragmentShader,
                  });
                  renderer.setRenderTarget(null);
                }
                const expected = unpackRgba16fRows(
                    (await renderer.readRenderTargetPixelsAsync(
                      reference,
                      0,
                      0,
                      WIDTH,
                      HEIGHT,
                    )) as Uint16Array,
                    WIDTH,
                    HEIGHT,
                  ),
                  actual = await readHdrTexture(device, output);
                if (
                  !canonicalProjection &&
                  includeHorizon &&
                  mode === "beauty" &&
                  env.id === "golden"
                )
                  for (const [name, pixels] of [
                    ["raw", actual],
                    ["three", expected],
                  ] as const)
                    captures.push({
                      name: `${env.id}-${pose.name}-${name}`,
                      png: await captureHdr(
                        device,
                        pixels,
                        WIDTH,
                        HEIGHT,
                        env.id,
                        environment.exposure,
                      ),
                    });
                const comparison = compareHdr(actual, expected);
                let coverageMismatch = 0,
                  overTolerance = 0;
                for (let i = 0; i < actual.length; i++) {
                  if (i % 4 === 3 && actual[i] > 0 !== expected[i] > 0) coverageMismatch++;
                  if (Math.abs(actual[i] - expected[i]) > 0.004) overTolerance++;
                }
                const worst: TerrainCase["worst"] = [];
                let failingPixels = 0,
                  localizedWallCapPixels = 0;
                for (let i = 0; i < actual.length; i += 4) {
                  const error = Math.max(
                    ...Array.from({ length: 4 }, (_, c) =>
                      Math.abs(actual[i + c] - expected[i + c]),
                    ),
                  );
                  if (error > ABSOLUTE_LIMIT[mode]) {
                    failingPixels++;
                    const x = (i / 4) % WIDTH,
                      y = Math.floor(i / 4 / WIDTH);
                    const coplanarWallCap = includeHorizon
                      ? coplanarWallCapAt(horizon, pose.camera, x, y, WIDTH, HEIGHT)
                      : null;
                    if (coplanarWallCap) localizedWallCapPixels++;
                    if (worst.length < 16 || error > worst[worst.length - 1].error) {
                      worst.push({
                        x,
                        y,
                        actual: actual.slice(i, i + 4),
                        expected: expected.slice(i, i + 4),
                        error,
                        coplanarWallCap,
                      });
                      worst.sort((a, b) => b.error - a.error);
                      if (worst.length > 16) worst.pop();
                    }
                  }
                }
                results.push({
                  worst,
                  failingPixels,
                  localizedWallCapPixels,
                  unlocalizedFailurePixels: failingPixels - localizedWallCapPixels,
                  preset: env.id,
                  includeHorizon,
                  mode,
                  pose: pose.name,
                  maxAbs: comparison.maxAbs,
                  maxRelative: comparison.maxRelative,
                  rmse: comparison.rmse,
                  nonfinite: comparison.nonfinite,
                  coverageMismatch,
                  overTolerance,
                });
              }
            } finally {
              raw.dispose();
              for (let i = 0; i < meshes.length; i++) {
                meshes[i].geometry.dispose();
                (meshes[i].material as THREE.Material).dispose();
                if (mode === "material") original[i].dispose();
              }
              groundMesh.userData.earthDistanceTexture?.dispose();
            }
          }
      } finally {
        environment.dispose();
        sky.dispose();
        atlas?.dispose();
      }
    }
    const accepts = (r: TerrainCase) =>
      r.nonfinite === 0 && r.coverageMismatch === 0 && r.maxAbs <= ABSOLUTE_LIMIT[r.mode];
    return {
      limits: ABSOLUTE_LIMIT,
      groundPassed: results.filter((r) => !r.includeHorizon).every(accepts) && errors.length === 0,
      horizonPassed: results.filter((r) => r.includeHorizon).every(accepts) && errors.length === 0,
      shaderSources,
      visualReview,
      canonicalProjection,
      captures,
      passed: results.every(accepts) && errors.length === 0,
      results,
      errors,
      framebuffer: [WIDTH, HEIGHT],
      geometry: {
        groundIndices: ground.indices.length,
        horizonIndices: horizon.mesh.indices.length,
      },
      scope:
        "base playable terrain and sealed opaque horizon; excludes sky background/background quads/vista/ocean/lake/grass/scenery/shadow-map generation",
    };
  } finally {
    renderer.dispose();
    generator.dispose();
    reference.dispose();
    output.destroy();
    depth.destroy();
    cameraBuffer.destroy();
    device.destroy();
  }
}
try {
  const report = await run();
  Object.assign(window, { __terrainCheck: report });
  document.querySelector("#result")!.textContent = JSON.stringify(
    {
      ...report,
      captures: report.captures.map((c) => c.name),
      shaderSources: report.shaderSources.map((s) => s.name),
    },
    null,
    2,
  );
} catch (error) {
  Object.assign(window, { __terrainCheck: { passed: false, error: String(error) } });
  document.querySelector("#result")!.textContent = String(error);
}
