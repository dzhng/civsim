import * as THREE from 'three/webgpu';
import { PhotorealWorld } from '../../../packages/photoreal-renderer/src/world';
import { applyCamera3d } from '../../../packages/photoreal-renderer/src/cameraBridge';
import { applyCivsimEnvironment } from '../../../packages/photoreal-renderer/src/environment';
import { createPhotorealStatsPublisher } from '../../../packages/photoreal-renderer/src/stats';
import {
  createClass0ImpostorAtlas,
  createImpostorSpikeInstances,
  ImpostorSpikeMeshCrowd,
  OctahedralImpostorCrowd,
} from '../../../packages/photoreal-renderer/src/battle/impostorSpike';
import { CIVSIM_ENVIRONMENTS } from '../../../packages/game-renderer/src/environment/environment';
import type { Camera3DParams } from '../../../packages/renderer-core/src/camera3d';
import { loadPlaceholderVat } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../packages/soldier-assets/src/soldierMesh';

interface ImpostorRouteContext {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

type SpikeMode = 'mesh' | 'impostor' | 'split';

const YAW = -Math.PI / 2;
const CAMERA = {
  target: [0, 90, 0],
  distance: 230,
  pitch: 0.32,
  yaw: YAW,
  fovY: 0.83,
  near: 1,
  far: 8000,
} as const;

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  return { width: canvas.clientWidth || 1000, height: canvas.clientHeight || 600 };
}

function camera3d(aspect: number, orbit: number): Camera3DParams {
  return {
    target: [CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]],
    distance: CAMERA.distance,
    pitch: CAMERA.pitch,
    yaw: CAMERA.yaw + orbit,
    fovY: CAMERA.fovY,
    aspect,
    near: CAMERA.near,
    far: CAMERA.far,
  };
}

function modeParam(params: URLSearchParams): SpikeMode {
  const mode = params.get('mode');
  return mode === 'mesh' || mode === 'split' ? mode : 'impostor';
}

function startLoop(world: PhotorealWorld, params: URLSearchParams, frame: (nowMs: number) => void) {
  const fixedT = params.has('t') ? Number(params.get('t')) : null;
  const t0 = performance.now();
  const loop = (now: number) => {
    world.setTime(fixedT ?? (now - t0) / 1000);
    frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export async function routeImpostorSpike(ctx: ImpostorRouteContext) {
  const mode = modeParam(ctx.params);
  const count = Math.max(1000, Math.min(30000, Number(ctx.params.get('count')) || 30000));
  const tileSize = Math.max(64, Math.min(128, Number(ctx.params.get('tile')) || 96));
  const orbitDeg = Number(ctx.params.get('orbit')) || 0;
  const orbit = orbitDeg * Math.PI / 180;

  const [world, vat] = await Promise.all([PhotorealWorld.create(ctx.canvas, { antialias: false }), loadPlaceholderVat()]);
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3d(width / height, orbit));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1500),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.42, 0.44, 0.26), roughness: 1.0, metalness: 0.0 }),
  );
  ground.position.set(0, 450, 0);
  world.scene.add(ground);

  const class0 = createPlaceholderSoldierMeshes()[0];
  const atlas = createClass0ImpostorAtlas(class0, vat, { columns: 8, rows: 8, tileSize });
  const instances = createImpostorSpikeInstances(count);
  const nearFirst = [...instances].sort((a, b) => a.y - b.y);
  const splitIndex = Math.floor(instances.length * 0.22);
  const meshInstances = mode === 'mesh' ? instances : mode === 'split' ? nearFirst.slice(0, splitIndex) : [];
  const impostorInstances = mode === 'impostor' ? instances : mode === 'split' ? nearFirst.slice(splitIndex) : [];

  const meshLayer = new ImpostorSpikeMeshCrowd(world.scene, atlas.posedMesh);
  meshLayer.upload(meshInstances);
  const impostorLayer = new OctahedralImpostorCrowd(world.scene, atlas);
  impostorLayer.upload(impostorInstances);

  const publish = createPhotorealStatsPublisher(world, 'impostor-spike', () => ({
    mode,
    cameraPreset: 'vista',
    count,
    orbitDeg,
    ...meshLayer.stats(),
    ...impostorLayer.stats(),
  }));

  startLoop(world, ctx.params, (now) => {
    impostorLayer.setCamera(camera);
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>impostor-spike (${s.substrate})</td></tr>
      <tr><td>mode</td><td>${mode}</td></tr>
      <tr><td>count</td><td>${count}</td></tr>
      <tr><td>mesh</td><td>${meshInstances.length}</td></tr>
      <tr><td>impostors</td><td>${impostorInstances.length}</td></tr>
      <tr><td>atlas</td><td>${atlas.columns}x${atlas.rows} @ ${tileSize}px</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr>
    </table>`;
  });
}
