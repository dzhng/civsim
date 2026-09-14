import * as THREE from "three/webgpu";
import { vec4, vec2, float } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { createGroundMesh } from "@packages/photoreal-renderer/src/battle/terrainLayer";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { fieldWaterSurfaceNodes } from "@packages/photoreal-renderer/src/battle/seaLayer";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { type LabContext, publish } from "../labShell";

/** Same water response through two consumers: terrain above, standalone below.
 * Their pixel colours must agree under the same physical light. */
export async function route(ctx: LabContext) {
  ctx.root.classList.add("reference-shot");
  const world = await PhotorealWorld.create(ctx.canvas);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.noon);
  const frame = createLandscapeFrameUniforms();
  const vertices = new Float32Array([
    -100, 5, 0, 0, 0, 1, 0, 0, 0, 1, 100, 5, 0, 0, 0, 1, 0, 0, 0, 1, -100, 75, 0, 0, 0, 1, 0, 0, 0,
    1, 100, 75, 0, 0, 0, 1, 0, 0, 0, 1,
  ]);
  const ground = createGroundMesh(frame, {
    vertices,
    indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
    tint: new Float32Array(4),
    surfaceColor: new Float32Array(12),
    triangles: 2,
  });
  const water = fieldWaterSurfaceNodes(frame, vec2(0, -40), float(1));
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  material.colorNode = vec4(water.albedo, 1);
  material.roughnessNode = water.roughness;
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(200, 70), material);
  reference.position.y = -40;
  world.scene.add(ground, reference);
  const width = ctx.canvas.clientWidth,
    height = ctx.canvas.clientHeight;
  world.resize(width, height, 1);
  const camera = new THREE.PerspectiveCamera();
  const pose = chartCamera3d({ x: 0, y: 0, zoom: 5, pitch: 0 }, height);
  pose.aspect = width / height;
  applyCamera3d(camera, pose);
  world.render(camera);
  await world.settlePresentedFrame();
  publish("terrain-water", true, {
    terrain: "shared-ground",
    reference: "shared-water-response",
    ...world.stats(),
  });
  window.addEventListener(
    "pagehide",
    () => {
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      reference.geometry.dispose();
      material.dispose();
      world.dispose();
    },
    { once: true },
  );
}
