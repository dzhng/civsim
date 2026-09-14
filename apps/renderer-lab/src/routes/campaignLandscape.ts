import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { createGroundMesh } from "@packages/photoreal-renderer/src/battle/terrainLayer";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/landscape/sceneryLayer";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { createSurfaceView } from "@packages/game-renderer/src/terrain/surface";
import { LANDSCAPE_REGIONS, coastalRidgeFixture } from "./landscapeFixtures";
import { chartCamera3d, screenRay } from "@packages/renderer-core/src/camera3d";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, numberParam, publish, reportTable } from "../labShell";

/** Regional migration spike. Reuses battle materials, physical environment,
 * camera bridge and trees over real campaign geography; no game state needed. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const isFixture = ctx.path === "/renderer/landscape-surface";
  const preset =
    LANDSCAPE_REGIONS[
      isFixture ? "fixture" : ctx.params.get("region") === "italy" ? "italy" : "alps"
    ];
  const field = isFixture
    ? coastalRidgeFixture()
    : new TerrainField((await loadCampaignData()).data);
  const center: [number, number] = [...preset.center];
  center[0] = numberParam(ctx.params, "x", center[0]);
  center[1] = numberParam(ctx.params, "y", center[1]);
  const landscapes = (isFixture ? [-preset.radius, preset.radius] : [0]).map((offset) =>
    buildCampaignLandscape(field, [center[0] + offset, center[1]], preset.radius),
  );
  const surface = createSurfaceView(
    landscapes[0].surface,
    landscapes.slice(1).map((s) => s.surface),
  );
  const trees = landscapes.flatMap((s) => s.scenery);
  const terrainTriangles = landscapes.reduce((sum, s) => sum + s.surface.mesh.triangles, 0);
  const world = await PhotorealWorld.create(ctx.canvas);
  const frame = createLandscapeFrameUniforms();
  frame.focus.value.set(...center);
  const env = applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
    aerialObserver: vec3(frame.focus, 0),
  });
  const grounds = landscapes.map((landscape) => {
    const ground = createGroundMesh(frame, landscape.surface.mesh, {
      detailScale: 2,
      slopeBands: {
        flatMax: 0.08,
        rollingMax: 0.18,
        slowMin: 0.35,
        cliffMin: 0.8,
        cliffDilateCells: 0,
        highlandCapMinM: 0,
      },
    });
    ground.name = "campaign-continuous-landscape";
    ground.castShadow = true;
    world.scene.add(ground);
    return ground;
  });
  const scenery = new PhotorealScenery(world.scene);
  scenery.upload(trees);
  const sun = world.sunLight!;
  sun.position.set(
    center[0] + env.sunDirection[0] * 500,
    center[1] + env.sunDirection[1] * 500,
    env.sunDirection[2] * 500,
  );
  sun.target.position.set(center[0], center[1], 0);
  sun.castShadow = true;
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
    pose.target = [center[0], center[1], surface.sampleRendered(...center)!.position[2]];
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
      terrainTriangles,
      trees: trees.length,
      mountainProps: 0,
      center,
      material: "shared-battle-ground",
      environment: world.environmentId,
    });
  };
  draw();
  // A second frame includes the asynchronously compiled shadow materials.
  requestAnimationFrame(draw);
  window.addEventListener("resize", draw);
  window.addEventListener(
    "pagehide",
    () => {
      window.removeEventListener("resize", draw);
      scenery.dispose();
      for (const ground of grounds) {
        ground.geometry.dispose();
        (ground.material as THREE.Material).dispose();
      }
      world.dispose();
    },
    { once: true },
  );
  ctx.status.innerHTML = reportTable({
    route: "campaign-landscape",
    status: "terrain migration spike",
    terrainTriangles,
    trees: trees.length,
    mountains: "continuous height field",
    materials: "battle ground + foliage",
    lighting: "shared physical environment",
  });
}
