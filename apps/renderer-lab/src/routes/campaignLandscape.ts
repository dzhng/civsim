import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import {
  createLandscapeGroundMaterial,
  createLandscapeGroundMesh,
  createSourceCoverSampler,
} from "@packages/photoreal-renderer/src/landscape/terrainMaterial";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { loadRockDetailMap } from "@packages/photoreal-renderer/src/landscape/rockDetailMap";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/landscape/sceneryLayer";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { campaignMountainBandRaster } from "@packages/game-renderer/src/terrain/campaignSource";
import { createSurfaceView } from "@packages/game-renderer/src/terrain/surface";
import { LANDSCAPE_REGIONS, coastalRidgeFixture } from "./landscapeFixtures";
import { chartCamera3d, screenRay } from "@packages/renderer-core/src/camera3d";
import { TerrainField, TEMPERATE_Y_KM } from "../../../../web/src/campaign/terrain";
import {
  buildCampaignSceneryCandidates,
  buildCampaignWoodlandCandidates,
} from "@packages/game-renderer/src/campaign/scenery";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, labRouteLifetime, numberParam, publish, reportTable } from "../labShell";

/** Regional migration spike. Reuses the shared terrain material, physical environment,
 * camera bridge and trees over real campaign geography; no game state needed. */
export async function route(ctx: LabContext) {
  const scope = labRouteLifetime();
  try {
    if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
    const isFixture = ctx.path === "/renderer/landscape-surface";
    const preset =
      LANDSCAPE_REGIONS[
        isFixture ? "fixture" : ctx.params.get("region") === "italy" ? "italy" : "alps"
      ];
    const data = isFixture ? null : (await loadCampaignData()).data;
    const field = data ? new TerrainField(data) : coastalRidgeFixture();
    const center: [number, number] = [...preset.center];
    center[0] = numberParam(ctx.params, "x", center[0]);
    center[1] = numberParam(ctx.params, "y", center[1]);
    const clay = ctx.params.get("clay") === "1";
    const cell = numberParam(ctx.params, "cell", 2);
    const landscapes = (isFixture ? [-preset.radius, preset.radius] : [0]).map((offset) =>
      buildCampaignLandscape(field, [center[0] + offset, center[1]], preset.radius, cell),
    );
    const surface = createSurfaceView(
      landscapes[0].surface,
      landscapes.slice(1).map((s) => s.surface),
    );
    const candidates = data
      ? buildCampaignSceneryCandidates(data, field, false, TEMPERATE_Y_KM)
      : buildCampaignWoodlandCandidates(field, TEMPERATE_Y_KM);
    const trees = candidates.flatMap((tree) => {
      const hit = surface.sampleRendered(tree.x, tree.y);
      return hit ? [{ ...tree, z: hit.position[2] }] : [];
    });
    const terrainTriangles = landscapes.reduce((sum, s) => sum + s.surface.mesh.triangles, 0);
    // The clay control has no rock response, so it holds no detail tile.
    const rockDetailMap = clay ? null : await loadRockDetailMap();
    if (rockDetailMap) scope.own(() => rockDetailMap.dispose());
    const world = await PhotorealWorld.create(ctx.canvas);
    scope.own(() => world.dispose());
    const frame = createLandscapeFrameUniforms();
    frame.focus.value.set(...center);
    const env = applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
      aerialObserver: vec3(frame.focus, 0),
    });
    const cover = rockDetailMap
      ? createSourceCoverSampler(campaignMountainBandRaster(field))
      : null;
    if (cover) scope.own(() => cover.map.dispose());
    const terrainMaterial = rockDetailMap
      ? createLandscapeGroundMaterial(frame, undefined, {
          sourceShore: !!landscapes[0].surface.mesh.shoreDistance,
          rockDetailMap,
          rockCover: cover?.cover,
        })
      : new THREE.MeshStandardNodeMaterial({ color: 0x9c967f, roughness: 0.95 });
    scope.own(() => terrainMaterial.dispose());
    for (const landscape of landscapes) {
      const ground = createLandscapeGroundMesh(landscape.surface.mesh, terrainMaterial);
      scope.own(() => ground.geometry.dispose());
      ground.name = "campaign-continuous-landscape";
      ground.castShadow = true;
      world.scene.add(ground);
    }
    const scenery = new PhotorealScenery(world.scene);
    scope.own(() => scenery.dispose());
    scenery.upload(clay ? [] : trees);
    const sun = world.sunLight!;
    sun.position.set(
      center[0] + env.sunDirection[0] * 500,
      center[1] + env.sunDirection[1] * 500,
      env.sunDirection[2] * 500,
    );
    sun.target.position.set(center[0], center[1], 0);
    sun.castShadow = ctx.params.get("shadows") !== "0";
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -400,
      right: 400,
      top: 400,
      bottom: -400,
      near: 1,
      far: 1400,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.35;
    sun.shadow.bias = -0.00015;
    const camera = new THREE.PerspectiveCamera();
    const draw = () => {
      const width = ctx.canvas.clientWidth,
        height = ctx.canvas.clientHeight;
      world.resize(width, height, 1);
      const pose = chartCamera3d(
        {
          x: center[0],
          y: center[1],
          zoom: numberParam(ctx.params, "zoom", preset.zoom),
          pitch: numberParam(ctx.params, "pitch", 0.55),
        },
        height,
      );
      pose.aspect = width / height;
      pose.target = [
        center[0],
        center[1],
        numberParam(ctx.params, "targetZ", surface.sampleRendered(...center)!.position[2]),
      ];
      applyCamera3d(camera, pose);
      scenery.prepareRender(camera, height);
      world.setTime(0);
      world.render(camera);
      const hit = surface.raycastRendered(screenRay(pose, 0, 0));
      publish(isFixture ? "landscape-surface" : "campaign-landscape", true, {
        surface: {
          domains: landscapes.map((s) => s.surface.domain),
          revision: surface.ownerAt(...center).revision,
          centerRay: hit,
        },
        ...world.stats(),
        camera: {
          pose,
          worldMatrix: camera.matrixWorld.toArray(),
          projectionMatrix: camera.projectionMatrix.toArray(),
        },
        terrainTriangles,
        trees: trees.length,
        mountainProps: 0,
        center,
        material: "shared-landscape-ground",
        environment: world.environmentId,
      });
    };
    draw();
    // A second frame includes the asynchronously compiled shadow materials.
    const secondFrame = requestAnimationFrame(draw);
    scope.own(() => cancelAnimationFrame(secondFrame));
    window.addEventListener("resize", draw);
    scope.own(() => window.removeEventListener("resize", draw));
    ctx.status.innerHTML = reportTable({
      route: "campaign-landscape",
      status: "terrain migration spike",
      terrainTriangles,
      trees: trees.length,
      mountains: "continuous height field",
      materials: "landscape ground + foliage",
      lighting: "shared physical environment",
    });
  } catch (error) {
    scope.release();
    throw error;
  }
}
