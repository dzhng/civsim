import * as THREE from "three/webgpu";
import { attribute, vec4 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { linearAlbedo } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { RENDER_ORDER } from "@packages/photoreal-renderer/src/renderOrder";
import { createPhotorealStatsPublisher } from "@packages/photoreal-renderer/src/stats";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { type PhotorealRouteContext, YAW, camera3dFor, canvasSize } from "../labPhotoreal";

// Three fixed-world modes over one world, one camera, one lighting rig and one
// frozen time: `screen` is the screen phase, `world` is the old in-world UI path
// it replaced, and `none` is the bare graded world — the background the screen
// phase must leave untouched and blend translucent ink over.

const UI_CAMERA = {
  target: [0, 0, 2],
  distance: 46,
  pitch: 0.45,
  yaw: YAW,
  fovY: 0.7,
  near: 1,
  far: 5000,
} as const;

/** Authored display-referred ink, in 0-255 sRGB with a source alpha. The opaque
 *  row's first entry is the exact campaign label ink the brightness gate
 *  measures; the rest bracket it so a grade shows up as a curve, not a single
 *  sample. The translucent row is the real UI case — glyph edges and marker
 *  fills arrive with partial coverage — so it pins the blend arithmetic against
 *  the graded background rather than just the authored colour. */
const SWATCHES = [
  { name: "label-ink", srgb: [248, 244, 237], alpha: 1 },
  { name: "white", srgb: [255, 255, 255], alpha: 1 },
  { name: "mid-grey", srgb: [128, 128, 128], alpha: 1 },
  { name: "faction-red", srgb: [178, 58, 48], alpha: 1 },
  { name: "label-ink-half", srgb: [248, 244, 237], alpha: 0.5 },
  { name: "white-quarter", srgb: [255, 255, 255], alpha: 0.25 },
  { name: "shadow-half", srgb: [0, 0, 0], alpha: 0.5 },
  { name: "faction-red-three-quarter", srgb: [178, 58, 48], alpha: 0.75 },
] as const;

const SWATCHES_PER_ROW = 4;
const SWATCH_WIDTH = 140;
const SWATCH_HEIGHT = 90;
const SWATCH_GAP = 24;

interface SwatchRect {
  name: string;
  srgb: readonly number[];
  alpha: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Local proof geometry; production layers retain their own geometry. */
function swatchRects(width: number, height: number): SwatchRect[] {
  const rows = Math.ceil(SWATCHES.length / SWATCHES_PER_ROW);
  const rowWidth = SWATCHES_PER_ROW * SWATCH_WIDTH + (SWATCHES_PER_ROW - 1) * SWATCH_GAP;
  const blockHeight = rows * SWATCH_HEIGHT + (rows - 1) * SWATCH_GAP;
  const left = Math.round((width - rowWidth) / 2);
  const top = Math.round((height - blockHeight) / 2);
  return SWATCHES.map((swatch, index) => ({
    name: swatch.name,
    srgb: swatch.srgb,
    alpha: swatch.alpha,
    x: left + (index % SWATCHES_PER_ROW) * (SWATCH_WIDTH + SWATCH_GAP),
    y: top + Math.floor(index / SWATCHES_PER_ROW) * (SWATCH_HEIGHT + SWATCH_GAP),
    width: SWATCH_WIDTH,
    height: SWATCH_HEIGHT,
  }));
}

function swatchGeometry(rects: SwatchRect[], width: number, height: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];
  for (const rect of rects) {
    const x0 = (rect.x / width) * 2 - 1;
    const x1 = ((rect.x + rect.width) / width) * 2 - 1;
    const y0 = 1 - (rect.y / height) * 2;
    const y1 = 1 - ((rect.y + rect.height) / height) * 2;
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]) {
      positions.push(x, y, 0);
      colors.push(rect.srgb[0] / 255, rect.srgb[1] / 255, rect.srgb[2] / 255);
      alphas.push(rect.alpha);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("swatchColor", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("swatchAlpha", new THREE.Float32BufferAttribute(alphas, 1));
  return geometry;
}

type UiMode = "screen" | "world" | "none";

function uiMode(params: URLSearchParams): UiMode {
  const value = params.get("ui");
  return value === "world" || value === "none" ? value : "screen";
}

export async function route(ctx: PhotorealRouteContext) {
  const mode = uiMode(ctx.params);
  const world = await PhotorealWorld.create(ctx.canvas);
  const { width, height } = canvasSize(ctx.canvas);
  // DPR 1: the swatch rects are published in CSS pixels and read back from the
  // screenshot, so the proof never has to reason about a scaled backbuffer.
  world.resize(width, height, 1);
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(UI_CAMERA, width / height));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  // A graded world with a real luminance range under the swatches: a lit
  // ground plane plus bright dielectric spheres AgX visibly rolls off.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.42, 0.4, 0.32),
      roughness: 0.95,
      metalness: 0,
    }),
  );
  world.scene.add(ground);
  const sphereGeometry = new THREE.SphereGeometry(4, 48, 32);
  for (let index = 0; index < 5; index++) {
    const sphere = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshStandardNodeMaterial({
        color: new THREE.Color(0.78, 0.72, 0.6),
        roughness: 0.15 + index * 0.2,
        metalness: 0,
      }),
    );
    sphere.position.set((index - 2) * 11, 0, 4);
    world.scene.add(sphere);
  }

  const rects = swatchRects(width, height);
  if (mode !== "none") {
    const geometry = swatchGeometry(rects, width, height);
    const material = new THREE.MeshBasicNodeMaterial();
    const authored = linearAlbedo(attribute<"vec3">("swatchColor", "vec3"));
    const alpha = attribute<"float">("swatchAlpha", "float");
    material.vertexNode = vec4(attribute<"vec3">("position", "vec3"), 1);
    material.fragmentNode =
      mode === "screen"
        ? world.screenUi.output(vec4(authored, alpha))
        : // The pre-change recipe verbatim, including the flag WebGPURenderer
          // ignores — the control has to fail the way production failed.
          vec4(authored, alpha);
    if (mode === "world") {
      material.toneMapped = false;
      // Aerial fog was already isolated by the campaign label control, and it is
      // structurally impossible in the screen phase. Opting the control out of it
      // leaves the tone map as the ONLY difference the two modes measure.
      material.fog = false;
    }
    material.transparent = true;
    material.side = THREE.DoubleSide;
    material.forceSinglePass = true;
    material.depthTest = false;
    material.depthWrite = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `screen-ui-swatches-${mode}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.readout;
    if (mode === "screen") world.screenUi.add(mesh);
    else world.scene.add(mesh);
  }

  const publish = createPhotorealStatsPublisher(world, "screen-ui-output", () => ({
    mode,
    swatches: rects,
    canvas: { width, height },
    screenUi: world.screenUi.stats(),
  }));
  const draw = async () => {
    await new Promise(requestAnimationFrame);
    world.setTime(Number(ctx.params.get("t") ?? 0));
    world.render(camera);
    await world.settlePresentedFrame();
    const s = publish(performance.now());
    const display = world.screenUi.stats().display;
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>screen-ui-output (${s.substrate})</td></tr>
      <tr><td>ui phase</td><td>${mode}${mode === "world" ? " (graded control)" : ""}</td></tr>
      <tr><td>screen members</td><td>${world.screenUi.stats().drawn}</td></tr>
      <tr><td>display target</td><td>${display ? `${display.width}×${display.height} +${display.copyDraws} draw` : "none"}</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? "pending"}</td></tr>
    </table>`;
  };
  const proofWindow = window as unknown as { __screenUiProofRedraw?: () => Promise<void> };
  proofWindow.__screenUiProofRedraw = draw;
  window.addEventListener(
    "pagehide",
    () => {
      delete proofWindow.__screenUiProofRedraw;
      void world.dispose();
    },
    { once: true },
  );
  await draw();
}
