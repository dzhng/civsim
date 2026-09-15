import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { createGroundMesh } from "@packages/photoreal-renderer/src/battle/terrainLayer";
import {
  createLandscapeGroundMaterial,
  createLandscapeGroundMesh,
} from "@packages/photoreal-renderer/src/landscape/terrainMaterial";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { loadRockDetailMap } from "@packages/photoreal-renderer/src/landscape/rockDetailMap";
import { CAMPAIGN_TERRAIN_PROFILE } from "@packages/game-renderer/src/terrain/materialProfile";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import type { LandscapeMesh } from "@packages/game-renderer/src/terrain/surface";
import { type LabContext, labRouteLifetime, publish } from "../labShell";

/** Identical dry inputs through both consumers isolate material response. */
export async function route(ctx: LabContext) {
  const scope = labRouteLifetime();
  try {
    ctx.root.classList.add("reference-shot");
    // Both consumers below take this one instance, so the pair stays an A/B on
    // the consumer and never on the resource.
    const rockDetailMap = await loadRockDetailMap();
    scope.own(() => rockDetailMap.dispose());
    const world = await PhotorealWorld.create(ctx.canvas);
    scope.own(() => world.dispose());
    const frame = createLandscapeFrameUniforms();
    applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
      aerialObserver: vec3(frame.focus, 0),
    });
    const mesh = materialRamp();
    if (ctx.params.get("tint") === "rock") mesh.tint!.fill(2);
    const originalVertices = mesh.vertices.slice();
    const originalTint = mesh.tint!.slice();
    const consumer = ctx.params.get("consumer") === "battle" ? "battle" : "campaign";
    let ground: THREE.Mesh;
    if (consumer === "battle") {
      ground = createGroundMesh(frame, mesh, {
        ...CAMPAIGN_TERRAIN_PROFILE,
        rockDetailMap,
        slopeBands:
          ctx.params.get("slopes") === "authored"
            ? null
            : {
                ...CAMPAIGN_TERRAIN_PROFILE.slopeBands,
                flatMax: 0.08,
                cliffDilateCells: 0,
                highlandCapMinM: 0,
              },
      });
    } else {
      const material = createLandscapeGroundMaterial(frame, undefined, { rockDetailMap });
      const disownMaterial = scope.own(() => material.dispose());
      ground = createLandscapeGroundMesh(mesh, material);
      // The mesh carries the material from here, and its release covers both.
      disownMaterial();
    }
    scope.own(() => {
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    });
    world.scene.add(ground);
    const camera = new THREE.PerspectiveCamera();
    const zoom =
      ctx.params.get("view") === "near" ? 4.8 : ctx.params.get("view") === "far" ? 1.6 : 3.2;
    const draw = () => {
      const width = ctx.canvas.clientWidth,
        height = ctx.canvas.clientHeight;
      world.resize(width, height, 1);
      const pose = chartCamera3d({ x: 0, y: 0, zoom, pitch: 0.55 }, height);
      pose.aspect = width / height;
      pose.target = [0, 0, 18];
      applyCamera3d(camera, pose);
      world.setTime(0);
      world.render(camera);
      publish("landscape-materials", true, {
        ...world.stats(),
        consumer,
        sourceUnchanged:
          mesh.vertices.every((v, i) => v === originalVertices[i]) &&
          mesh.tint!.every((v, i) => v === originalTint[i]),
        terrainTriangles: mesh.triangles,
        profile: CAMPAIGN_TERRAIN_PROFILE,
      });
    };
    draw();
    const secondFrame = requestAnimationFrame(draw);
    scope.own(() => cancelAnimationFrame(secondFrame));
  } catch (error) {
    scope.release();
    throw error;
  }
}

function materialRamp(): LandscapeMesh {
  const columns = 129,
    rows = 97,
    cell = 2;
  const vertices = new Float32Array(columns * rows * 10),
    surfaceColor = new Float32Array(columns * rows * 3),
    tint = new Float32Array(columns * rows);
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  const heightAt = (x: number, y: number) =>
    20 * (1 + Math.tanh((x + 15 + Math.sin(y / 30) * 8) / 9));
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      const k = j * columns + i,
        x = i * cell - 128,
        y = j * cell - 96;
      const dx = (heightAt(x + 0.1, y) - heightAt(x - 0.1, y)) / 0.2;
      const dy = (heightAt(x, y + 0.1) - heightAt(x, y - 0.1)) / 0.2;
      const normalLength = Math.hypot(dx, dy, 1);
      vertices.set(
        [
          x,
          y,
          heightAt(x, y),
          -dx / normalLength,
          -dy / normalLength,
          1 / normalLength,
          0.55,
          0.56,
          0.3,
          0,
        ],
        k * 10,
      );
      surfaceColor.set([0.55, 0.56, 0.3], k * 3);
      if (i < columns - 1 && j < rows - 1)
        indices.set(
          [k, k + columns, k + 1, k + 1, k + columns, k + columns + 1],
          (j * (columns - 1) + i) * 6,
        );
    }
  return { vertices, surfaceColor, tint, indices, triangles: indices.length / 3 };
}
