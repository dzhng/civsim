import * as THREE from "three/webgpu";
import { positionLocal, vec3 } from "three/tsl";
import type { Camera3DParams } from "../../../packages/renderer-core/src/camera3d";
import { battleCameraRig } from "../../../web/src/battle/cameraRig";
import { applyCamera3d } from "../../../packages/photoreal-renderer/src/cameraBridge";
import {
  fbmN,
  linearAlbedo,
  type Vec3Node,
} from "../../../packages/photoreal-renderer/src/battle/battleTsl";
import {
  bakeTurfStrandTexture,
  turfDetailNode,
  turfNaiveDetailNode,
  TURF_SPIKE_PALETTE,
  type BakedTurfTexture,
  type TurfBakeSpec,
} from "./turfTextureSpike";
import { PhotorealWorld } from "../../../packages/photoreal-renderer/src/world";

interface BattleGroundTurfContext {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

type TurfView = "tile" | "topdown" | "rts" | "sizes" | "bench";
type TurfMaterial = "flat" | "fbm" | "naive" | "anti";

const SEED = 0x7a11e5;
const BASE_SPEC: TurfBakeSpec = {
  sizePx: 256,
  tileWorldM: 5,
  seed: SEED,
  strokeCount: 900,
  palette: TURF_SPIKE_PALETTE,
};
const OLIVE = vec3(...TURF_SPIKE_PALETTE.base);

export async function routeBattleGroundTurf(ctx: BattleGroundTurfContext): Promise<void> {
  const view = parseView(ctx.params.get("view"));
  const world = await PhotorealWorld.create(ctx.canvas, { antialias: false });
  const width = ctx.canvas.clientWidth || 1000;
  const height = ctx.canvas.clientHeight || 600;
  world.resize(width, height, 1);
  world.scene.background = new THREE.Color(0.69, 0.7, 0.61);
  addNeutralLights(world.scene);

  const primary = bakeTurfStrandTexture(BASE_SPEC);
  const repeated = bakeTurfStrandTexture(BASE_SPEC);
  const alternate = bakeTurfStrandTexture({ ...BASE_SPEC, seed: SEED + 1 });
  const bakedBySize = new Map<number, BakedTurfTexture>([[BASE_SPEC.sizePx, primary]]);
  if (view === "sizes") {
    for (const sizePx of [128, 512]) {
      bakedBySize.set(
        sizePx,
        bakeTurfStrandTexture({
          ...BASE_SPEC,
          sizePx,
          strokeCount: BASE_SPEC.strokeCount,
        }),
      );
    }
  }

  const camera = new THREE.PerspectiveCamera();
  const sample = ctx.params.get("sample") === "naive" ? "naive" : "anti";
  const panels = buildPanels(world.scene, view, primary, bakedBySize, sample);
  applyCamera3d(camera, cameraFor(view, width / height));

  let frames = 0;
  const draw = () => {
    world.setTime(0);
    world.render(camera);
    frames++;
    if (frames >= 2)
      publishReady(
        ctx,
        view,
        sample,
        primary,
        repeated,
        alternate,
        bakedBySize,
        panels,
        world.stats(),
      );
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function buildPanels(
  scene: THREE.Scene,
  view: TurfView,
  primary: BakedTurfTexture,
  bakedBySize: Map<number, BakedTurfTexture>,
  sample: "naive" | "anti",
): string[] {
  if (view === "bench") {
    return [addPanel(scene, primary, sample, 0, 0, 180, 110, BASE_SPEC.tileWorldM)];
  }
  if (view === "tile") {
    const panels = [
      addPanel(scene, primary, "naive", -44, 0, 36, 36, 36),
      addPanel(scene, primary, "naive", 0, 0, 36, 36, 9),
      addPanel(scene, primary, "anti", 44, 0, 36, 36, 9),
    ];
    addLabel(scene, "RAW TILE", -44, -15);
    addLabel(scene, "4 x 4 NAIVE", 0, -15);
    addLabel(scene, "ANTI-TILED", 44, -15);
    return panels;
  }
  if (view === "sizes") {
    return [128, 256, 512].map((sizePx, index) => {
      addLabel(scene, `${sizePx} PX`, (index - 1) * 58, -42);
      return addPanel(
        scene,
        bakedBySize.get(sizePx)!,
        "anti",
        (index - 1) * 58,
        0,
        52,
        88,
        BASE_SPEC.tileWorldM,
      );
    });
  }
  const panels = [
    addPanel(scene, primary, "flat", -36, 0, 30, 85, BASE_SPEC.tileWorldM),
    addPanel(scene, primary, "fbm", 0, 0, 30, 85, BASE_SPEC.tileWorldM),
    addPanel(scene, primary, "anti", 36, 0, 30, 85, BASE_SPEC.tileWorldM),
  ];
  const labelY = view === "rts" ? 20 : -32;
  addLabel(scene, "FLAT", -36, labelY);
  addLabel(scene, "ISOTROPIC FBM", 0, labelY);
  addLabel(scene, "STRAND TAPS", 36, labelY);
  return panels;
}

function addPanel(
  scene: THREE.Scene,
  baked: BakedTurfTexture,
  detail: TurfMaterial,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): string {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, metalness: 0 });
  let multiplier: Vec3Node = vec3(1);
  if (detail === "fbm") {
    const value = fbmN(positionLocal.xy.mul(2.2)).sub(0.5).mul(0.24).add(1);
    multiplier = vec3(value);
  } else if (detail === "naive") {
    multiplier = turfNaiveDetailNode(baked, positionLocal.xy, { scale, strength: 0.9 });
  } else if (detail === "anti") {
    multiplier = turfDetailNode(baked, positionLocal.xy, { scale, strength: 0.9 });
  }
  material.colorNode = linearAlbedo(OLIVE.mul(multiplier));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), material);
  mesh.position.set(x, y, 0);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return detail;
}

function cameraFor(view: TurfView, aspect: number): Camera3DParams {
  if (view === "tile")
    return {
      target: [0, -3, 0],
      distance: 120,
      pitch: 1.3,
      yaw: -Math.PI / 2,
      fovY: 0.76,
      aspect,
      near: 0.5,
      far: 1000,
    };
  if (view === "sizes")
    return {
      target: [0, -4, 0],
      distance: 270,
      pitch: 1.3,
      yaw: -Math.PI / 2,
      fovY: 0.62,
      aspect,
      near: 0.5,
      far: 1000,
    };
  const bounds = { width: 180, height: 105 };
  const range = { min: 0.4, max: 8 };
  const rig = battleCameraRig(view === "rts" ? 7.3 : range.min, range, bounds);
  return {
    target: [0, -rig.target[0], rig.target[2]],
    distance: rig.distance,
    pitch: rig.pitch,
    yaw: -Math.PI / 2,
    fovY: rig.fovY,
    aspect,
    near: 0.5,
    far: 1000,
  };
}

function addLabel(scene: THREE.Scene, text: string, x: number, y: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for turf workbench label");
  ctx.fillStyle = "rgba(31 34 25 / 0.88)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgb(232 221 174)";
  ctx.font = "600 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.position.set(x, y, 1);
  sprite.scale.set(22, 4.2, 1);
  sprite.renderOrder = 10;
  scene.add(sprite);
}

function addNeutralLights(scene: THREE.Scene): void {
  scene.add(
    new THREE.HemisphereLight(
      new THREE.Color(0.92, 0.95, 1),
      new THREE.Color(0.48, 0.46, 0.38),
      1.2,
    ),
  );
  const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.98, 0.92), 1.7);
  sun.position.set(-80, -90, 130);
  scene.add(sun);
}

function publishReady(
  ctx: BattleGroundTurfContext,
  view: TurfView,
  sample: "naive" | "anti",
  primary: BakedTurfTexture,
  repeated: BakedTurfTexture,
  alternate: BakedTurfTexture,
  bakedBySize: Map<number, BakedTurfTexture>,
  panels: string[],
  worldStats: ReturnType<PhotorealWorld["stats"]>,
): void {
  const stats = {
    route: "battle-ground-turf",
    view,
    sample,
    seed: SEED,
    deterministic: primary.pixelHash === repeated.pixelHash,
    primaryHash: primary.pixelHash,
    repeatedHash: repeated.pixelHash,
    alternateHash: alternate.pixelHash,
    differentSeedDiffers: primary.pixelHash !== alternate.pixelHash,
    bakeMs: Number(primary.bakeMs.toFixed(3)),
    bakeCount: 3 + (bakedBySize.size - 1),
    sizes: [...bakedBySize.keys()],
    panels,
    cameraContract: view === "topdown" || view === "rts" ? "battleCameraRig" : "workbench",
    gpuMs: worldStats.gpuTimeMs,
    device: worldStats.device,
  };
  ctx.status.innerHTML = `<table>${Object.entries(stats)
    .map(([key, value]) => `<tr><th>${key}</th><td>${String(value)}</td></tr>`)
    .join("")}</table>`;
  const browserWindow = window as unknown as {
    __rendererLabReady?: boolean;
    __rendererLabStats?: { ok: boolean; route: string; stats: typeof stats };
  };
  browserWindow.__rendererLabReady = true;
  browserWindow.__rendererLabStats = { ok: true, route: "battle-ground-turf", stats };
}

function parseView(value: string | null): TurfView {
  if (value === "tile" || value === "rts" || value === "sizes" || value === "bench") return value;
  return "topdown";
}
