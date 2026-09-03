import * as THREE from 'three/webgpu';

import { PhotorealWorld } from '@packages/photoreal-renderer/src/world';

import { applyCamera3d } from '@packages/photoreal-renderer/src/cameraBridge';

import { applyCivsimEnvironment } from '@packages/photoreal-renderer/src/environment';

import { createPhotorealStatsPublisher } from '@packages/photoreal-renderer/src/stats';

import { CIVSIM_ENVIRONMENTS } from '@packages/game-renderer/src/environment/environment';

import { type PhotorealRouteContext, YAW, camera3dFor, canvasSize, startLoop } from "../labPhotoreal";



// eye south of target, looking north (+y)
const PBR_CAMERA = { target: [0, 0, 2], distance: 42, pitch: 0.5, yaw: YAW, fovY: 0.7, near: 1, far: 5000 } as const;

// ---------------------------------------------------------------------------
// /renderer/photoreal-pbr — metal by row (south→north 0→1), roughness by column
// (west→east 0.05→1), bronze dielectric base over a neutral ground plane, lit
// by the golden preset's sun + real PMREM IBL.

export async function route(ctx: PhotorealRouteContext) {
  const world = await PhotorealWorld.create(ctx.canvas);
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(PBR_CAMERA, width / height));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.45, 0.42, 0.34), roughness: 0.95, metalness: 0.0 }),
  );
  world.scene.add(ground);

  const grid = 7;
  const spacing = 4.0;
  const sphereGeo = new THREE.SphereGeometry(1.5, 48, 32);
  const baseColor = new THREE.Color(0.72, 0.45, 0.20);
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const material = new THREE.MeshStandardNodeMaterial({
        color: baseColor.clone(),
        metalness: row / (grid - 1),
        roughness: 0.05 + (col / (grid - 1)) * 0.95,
      });
      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.position.set((col - (grid - 1) / 2) * spacing, (row - (grid - 1) / 2) * spacing, 2);
      world.scene.add(mesh);
    }
  }

  const spheres = grid * grid;
  const publish = createPhotorealStatsPublisher(world, 'photoreal-pbr', () => ({ spheres }));
  startLoop(world, ctx.params, (now) => {
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-pbr (${s.substrate})</td></tr>
      <tr><td>environment</td><td>${s.environment}</td></tr>
      <tr><td>spheres</td><td>${spheres}</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr>
    </table>`;
  });
}
