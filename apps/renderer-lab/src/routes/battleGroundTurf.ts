import * as THREE from "three/webgpu";
import { positionWorld, vec3 } from "three/tsl";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";
import { battleCameraRig } from "../../../../web/src/battle/cameraRig";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { linearAlbedo } from "@packages/photoreal-renderer/src/battle/battleTsl";
import { groundDetailNode } from "@packages/photoreal-renderer/src/battle/groundDetail";
import { MEADOW } from "@packages/game-renderer/src/battle/meadowPalette";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import type { LabContext } from "../labShell";

type TurfView = "topdown" | "rts";

const OLIVE = vec3(...MEADOW.base);

export async function route(ctx: LabContext): Promise<void> {
  const view = parseView(ctx.params.get("view"));
  const world = await PhotorealWorld.create(ctx.canvas, { antialias: false });
  const width = ctx.canvas.clientWidth || 1000;
  const height = ctx.canvas.clientHeight || 600;
  world.resize(width, height, 1);
  world.scene.background = new THREE.Color(0.69, 0.7, 0.61);
  addNeutralLights(world.scene);

  addPanel(world.scene);
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, cameraFor(view, width / height));

  let frames = 0;
  const draw = () => {
    world.setTime(0);
    world.render(camera);
    frames++;
    if (frames >= 2) publishReady(ctx, view, world.stats());
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function addPanel(scene: THREE.Scene): void {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, metalness: 0 });
  material.colorNode = linearAlbedo(groundDetailNode(positionWorld.xy, OLIVE));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(108, 85, 1, 1), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function cameraFor(view: TurfView, aspect: number): Camera3DParams {
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
  ctx: LabContext,
  view: TurfView,
  worldStats: ReturnType<PhotorealWorld["stats"]>,
): void {
  const stats = {
    route: "battle-ground-turf",
    view,
    owner: "macro-ground-material",
    syntheticFineDetail: false,
    coordinateOwner: "positionWorld.xy",
    textureResources: 0,
    drawCalls: worldStats.drawCalls,
    cameraContract: "battleCameraRig",
    gpuMs: worldStats.gpuTimeMs,
    device: worldStats.device,
  };
  ctx.status.innerHTML = `<table>${Object.entries(stats)
    .map(([key, value]) => `<tr><th>${key}</th><td>${JSON.stringify(value)}</td></tr>`)
    .join("")}</table>`;
  const browserWindow = window as unknown as {
    __rendererLabReady?: boolean;
    __rendererLabStats?: { ok: boolean; route: string; stats: typeof stats };
  };
  browserWindow.__rendererLabReady = true;
  browserWindow.__rendererLabStats = { ok: true, route: "battle-ground-turf", stats };
}

function parseView(value: string | null): TurfView {
  return value === "rts" ? "rts" : "topdown";
}
