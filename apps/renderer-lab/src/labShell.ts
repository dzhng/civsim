import { createFrameShell, type BackgroundRenderPass, type FrameGraphPass, type RawFrameShell } from "@packages/renderer-core/src/frameShell";
import { PROJECTION_IDENTITY, type CameraSnapshot } from "@packages/renderer-core/src/cameraUniform";
import { WORLD_CAMERA_WGSL } from "@packages/renderer-core/src/cameraWgsl";
import { NOISE_WGSL } from "@packages/renderer-core/src/noiseWgsl";
import { compileShader } from "@packages/renderer-core/src/compileShader";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import { type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { chartCamera3d, type ChartCameraSpec } from "@packages/renderer-core/src/camera3d";
import { resolveBattleEnvironment, skinnedLightingForBattleEnvironment, type BattleEnvironment } from "@packages/game-renderer/src/environment/environment";
import { loadPlaceholderVat } from "@packages/soldier-assets/src/placeholders";
import { createPlaceholderSoldierMeshes } from "@packages/soldier-assets/src/soldierMesh";
import {
  CAMPAIGN_ENVIRONMENT,
} from "@packages/game-renderer/src/campaign/environment";

export type LabRoute = (ctx: LabContext) => Promise<void> | void;

export interface LabContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  status: HTMLElement;
  path: string;
  params: URLSearchParams;
}

interface LabGroundShaderStyle {
  oliveLow: string;
  oliveHigh: string;
  dry: string;
  lightFleckLow: string;
  lightFleckHigh: string;
  darkFleckLow: string;
  darkFleckHigh: string;
  stoneFleckLow: string;
  stoneFleckHigh: string;
  speckleStrength: string;
  dryMixBase: string;
  trampleMix: string;
  stubbleColor: string;
  stubbleStrength: string;
  darkFleckColor: string;
  darkFleckStrength: string;
  stoneFleckStrength: string;
  dustStrength: string;
  aerialStrength: string;
}

const LAB_GROUND_STYLE: LabGroundShaderStyle = {
  oliveLow: 'vec3f(0.43, 0.56, 0.22)',
  oliveHigh: 'vec3f(0.66, 0.69, 0.33)',
  dry: 'vec3f(0.76, 0.67, 0.39)',
  lightFleckLow: '0.884',
  lightFleckHigh: '0.990',
  darkFleckLow: '0.820',
  darkFleckHigh: '0.982',
  stoneFleckLow: '0.924',
  stoneFleckHigh: '0.996',
  speckleStrength: '0.315',
  dryMixBase: '0.22',
  trampleMix: '0.15',
  stubbleColor: 'vec3f(0.53, 0.48, 0.25)',
  stubbleStrength: '0.055',
  darkFleckColor: 'vec3f(0.47, 0.43, 0.32)',
  darkFleckStrength: '0.38',
  stoneFleckStrength: '0.30',
  dustStrength: '0.14',
  aerialStrength: '0.22',
};

function labGroundWgsl(style: LabGroundShaderStyle) {
  return `
${WORLD_CAMERA_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec2f, @location(1) dist: f32 };
@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.world = world;
  out.dist = length(world - cam.focus);
  return out;
}
${NOISE_WGSL}
fn ridged(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}
fn groundHeight(p: vec2f) -> f32 {
  let broad = vnoise(p * 0.018 + vec2f(8.1, 2.4)) * 0.58;
  let folds = ridged(vec2f(p.x * 0.052 + p.y * 0.018, p.y * 0.038 - p.x * 0.012)) * 0.26;
  let scratch = ridged(vec2f(p.x * 0.42 + p.y * 0.09, p.y * 0.26)) * 0.16;
  return broad + folds + scratch;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let fine = vnoise(in.world * 2.2);
  let mid = vnoise(in.world * 0.47 + vec2f(5.2, 1.8));
  let broad = vnoise(in.world * 0.085 + vec2f(0.7, 9.3));
  let relief = groundHeight(in.world);
  let hx = groundHeight(in.world + vec2f(1.8, 0.0)) - relief;
  let hy = groundHeight(in.world + vec2f(0.0, 1.8)) - relief;
  let sun = normalize(vec3f(-0.46, -0.34, 0.82));
  let normal = normalize(vec3f(-hx * 1.45, -hy * 1.45, 1.0));
  let lambert = clamp(dot(normal, sun), 0.0, 1.0);
  let grazing = smoothstep(0.16, 0.86, ridged(vec2f(in.world.x * 0.12 + in.world.y * 0.03, in.world.y * 0.09)));
  let olive = mix(${style.oliveLow}, ${style.oliveHigh}, mid * 0.66 + fine * 0.16 + relief * 0.18);
  let dry = ${style.dry};
  let scrubPatch = smoothstep(0.50, 0.86, broad) * (1.0 - smoothstep(0.86, 0.98, fine));
  let trample = smoothstep(0.72, 0.98, vnoise((in.world + vec2f(13.0, -7.0)) * 0.18));
  let rakedDust = smoothstep(0.58, 0.92, grazing) * (0.08 + relief * 0.08);
  let seed = floor(in.world * 6.8);
  let fleck = hash(seed);
  let blade = hash(seed + vec2f(19.0, 41.0));
  let pebble = hash(seed + vec2f(73.0, 11.0));
  let stubble = smoothstep(0.66, 0.95, ridged(vec2f(in.world.x * 1.26 + in.world.y * 0.18, in.world.y * 0.84)));
  let lightFleck = smoothstep(${style.lightFleckLow}, ${style.lightFleckHigh}, fleck) * (0.46 + 0.54 * fine);
  let darkFleck = smoothstep(${style.darkFleckLow}, ${style.darkFleckHigh}, blade) * (1.0 - smoothstep(0.76, 0.98, broad));
  let stoneFleck = smoothstep(${style.stoneFleckLow}, ${style.stoneFleckHigh}, pebble) * (0.36 + relief * 0.46);
  let speckle = lightFleck * ${style.speckleStrength};
  var grass = mix(olive, dry, ${style.dryMixBase} + trample * ${style.trampleMix});
  grass = mix(grass, vec3f(0.31, 0.39, 0.18), scrubPatch * 0.34);
  grass = mix(grass, vec3f(0.88, 0.75, 0.47), rakedDust);
  grass *= 0.70 + lambert * 0.34;
  grass += vec3f(0.13, 0.12, 0.055) * speckle;
  grass = mix(grass, ${style.stubbleColor}, stubble * ${style.stubbleStrength});
  grass = mix(grass, grass * ${style.darkFleckColor}, darkFleck * ${style.darkFleckStrength});
  grass = mix(grass, vec3f(0.46, 0.43, 0.32), stoneFleck * ${style.stoneFleckStrength});
  let dust = ${style.dustStrength} * smoothstep(18.0, 96.0, in.dist);
  let aerial = smoothstep(120.0, 420.0, in.dist);
  let sunBleached = mix(grass, vec3f(0.86, 0.72, 0.46), dust);
  let haze = vec3f(0.78, 0.75, 0.64);
  return vec4f(mix(sunBleached, haze, aerial * ${style.aerialStrength}), 1.0);
}`;
}

export class LabGroundPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly vertexBuffer: GPUBuffer;

  constructor(private readonly shell: RawFrameShell, rect: [number, number, number, number]) {
    const module = compileShader(shell.device, labGroundWgsl(LAB_GROUND_STYLE), "lab-ground");
    this.pipeline = shell.device.createRenderPipeline({
      label: "lab-ground-pipeline",
      layout: shell.device.createPipelineLayout({
        bindGroupLayouts: [shell.cameraBindGroupLayout],
      }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        ],
      },
      fragment: { module, entryPoint: "fs", targets: [{ format: shell.info.format }] },
      primitive: { topology: "triangle-strip" },
      multisample: { count: shell.sampleCount },
    });
    this.vertexBuffer = shell.device.createBuffer({
      label: "lab-ground-quad",
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.setRect(rect);
  }

  draw(pass: BackgroundRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  private setRect([x, y, w, h]: [number, number, number, number]) {
    this.shell.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]),
    );
  }
}

export function labGroundFramePass(ground: LabGroundPass, id: string): FrameGraphPass {
  return {
    id,
    role: "background-underpaint",
    phase: "background",
    draw: (pass) => ground.draw(pass),
  };
}

export function chartCameraSnapshot(spec: ChartCameraSpec, width: number, height: number): CameraSnapshot {
  return {
    x: spec.x,
    y: spec.y,
    zoom: spec.zoom,
    width,
    height,
    camera3d: chartCamera3d(spec, height),
  };
}

export // The setCamera form of the same conversion (the shell owns width/height).
function chartSnapshot(
  spec: ChartCameraSpec,
  shell: RawFrameShell,
): Omit<CameraSnapshot, "width" | "height"> {
  return {
    x: spec.x,
    y: spec.y,
    zoom: spec.zoom,
    camera3d: chartCamera3d(spec, shell.stats().height),
  };
}

/** Battle-lit lab shell: the sun comes from a battle environment (golden hour by default). */
export async function createConfiguredShell(
  canvas: HTMLCanvasElement,
  camera: ChartCameraSpec,
  environment: BattleEnvironment = resolveBattleEnvironment("golden-hour"),
) {
  const shell = await createFrameShell(canvas, { sun: environment.environment });
  shell.setCamera(chartSnapshot(camera, shell));
  return shell;
}

/** Campaign-chart lab shell: the sun is the campaign environment's, never a battle preset. */
export async function createCampaignShell(canvas: HTMLCanvasElement, camera: ChartCameraSpec) {
  const shell = await createFrameShell(canvas, { sun: CAMPAIGN_ENVIRONMENT });
  shell.setCamera(chartSnapshot(camera, shell));
  return shell;
}

export async function createSkinnedPipeline(
  shell: RawFrameShell,
  accent: [number, number, number],
  vat?: Awaited<ReturnType<typeof loadPlaceholderVat>>,
  environment = resolveBattleEnvironment("golden-hour"),
) {
  return new SkinnedCrowdPipeline(
    shell,
    createPlaceholderSoldierMeshes(accent),
    vat ?? (await loadPlaceholderVat()),
    undefined,
    {
      lighting: skinnedLightingForBattleEnvironment(environment),
    },
  );
}

export function skinnedCrowdPass(pipeline: SkinnedCrowdPipeline, id: string): FrameGraphPass {
  return {
    id,
    role: "world-opaque",
    phase: "world-depth",
    depth: "read-write",
    draw: (pass) => pipeline.draw(pass),
  };
}

export function numberParam(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function integerParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Math.floor(numberParam(params, key, fallback));
  return Math.max(min, Math.min(max, value));
}

export function animateSkinned(
  shell: RawFrameShell,
  pipeline: SkinnedCrowdPipeline,
  getInstances: () => CrowdInstance[],
  opts: {
    forcedClip?: string | null;
    phaseOffset?: number;
    phaseSpeed?: number;
    size?: number;
    afterFrame?: () => void;
  } = {},
) {
  const start = performance.now();
  const ground = new LabGroundPass(shell, [-42, -28, 84, 56]);
  const tick = () => {
    const phaseOffset =
      (opts.phaseOffset ?? 0) + ((performance.now() - start) / 1000) * (opts.phaseSpeed ?? 0);
    pipeline.upload(getInstances(), { forcedClip: opts.forcedClip, phaseOffset, size: opts.size });
    shell.drawFrame({
      passes: [
        labGroundFramePass(ground, "animated-skinned-ground"),
        {
          id: "animated-skinned-crowd",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => pipeline.draw(pass),
        },
      ],
    });
    opts.afterFrame?.();
    requestAnimationFrame(tick);
  };
  tick();
}

export function publish(route: string, ok: boolean, stats: unknown) {
  const w = window as unknown as {
    __rendererLabReady?: boolean;
    __rendererLabStats?: {
      ok: boolean;
      route: string;
      projection: typeof PROJECTION_IDENTITY;
      stats: unknown;
    };
  };
  w.__rendererLabReady = true;
  // Every route publishes the engine's one projection/depth identity so the
  // scene suite can prove one projector engine-wide.
  w.__rendererLabStats = { ok, route, projection: PROJECTION_IDENTITY, stats };
}

export function reportTable(values: Record<string, unknown>) {
  const rows = Object.entries(values)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

export function issueList(issues: { code: string; message: string; path: string }[]) {
  if (issues.length === 0) return "";
  return `<ol>${issues.map((i) => `<li><b>${escapeHtml(i.code)}</b> ${escapeHtml(i.path)}: ${escapeHtml(i.message)}</li>`).join("")}</ol>`;
}

export function el(tag: string, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
