import * as THREE from "three/webgpu";
import { attribute, vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import {
  createLandscapeGroundMaterial,
  createLandscapeGroundMesh,
} from "@packages/photoreal-renderer/src/landscape/terrainMaterial";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { campaignLandscapeSource } from "@packages/game-renderer/src/terrain/campaignSource";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { type LabContext, numberParam, publish } from "../labShell";

/** Fixed source coast, inland lake and river isolate material/time from geometry. */
export async function route(ctx: LabContext) {
  ctx.root.classList.add("reference-shot");
  const size = 64;
  const classes = new Uint8Array(size * size).fill(1);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (
        x < 28 + Math.sin(y / 8) * 4 ||
        (Math.abs(y - 27 - Math.sin(x / 6) * 2) < 1.5 && x < 51) ||
        Math.hypot((x - 51) / 1.5, y - 45) < 5
      )
        classes[y * size + x] = 0;
  const source = campaignLandscapeSource({
    w: size,
    h: size,
    cell: 1,
    minX: 0,
    maxY: size,
    height: new Float32Array(size * size).fill(0.5),
    biome: new Uint8Array(size * size * 4).fill(128),
    renderMask: { width: size, height: size, classes, rect: { min: [0, 0], max: [size, size] } },
  });
  const landscape = buildCampaignLandscape(source, [32, 32], 32, 2);
  const original = landscape.surface.mesh.vertices.slice();
  const world = await PhotorealWorld.create(ctx.canvas);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.noon);
  const frame = createLandscapeFrameUniforms();
  const phase = numberParam(ctx.params, "time", 0);
  frame.time.value = phase;
  const material =
    ctx.params.get("mask") === "1"
      ? new THREE.MeshBasicNodeMaterial({ colorNode: vec3(attribute<"float">("gWater", "float")) })
      : createLandscapeGroundMaterial(frame, undefined, {
          sourceShore: ctx.params.get("control") !== "1",
        });
  const ground = createLandscapeGroundMesh(landscape.surface.mesh, material);
  world.scene.add(ground);
  const camera = new THREE.PerspectiveCamera();
  const width = ctx.canvas.clientWidth,
    height = ctx.canvas.clientHeight;
  world.resize(width, height, 1);
  const pose = chartCamera3d({ x: 32, y: 32, zoom: 10, pitch: 0 }, height);
  pose.aspect = width / height;
  applyCamera3d(camera, pose);
  world.setTime(phase);
  world.render(camera);
  await world.settlePresentedFrame();
  publish("landscape-water", true, {
    ...world.stats(),
    phase,
    sourceUnchanged: original.every((v, i) => landscape.surface.mesh.vertices[i] === v),
    sourceShore: !!landscape.surface.mesh.shoreDistance,
  });
  window.addEventListener(
    "pagehide",
    () => {
      ground.geometry.dispose();
      material.dispose();
      world.dispose();
    },
    { once: true },
  );
}
