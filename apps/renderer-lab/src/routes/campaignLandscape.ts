import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { createGroundMesh } from "@packages/photoreal-renderer/src/battle/terrainLayer";
import { createBattleFrameUniforms } from "@packages/photoreal-renderer/src/battle/battleTsl";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/battle/foliageLayer";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, numberParam, publish, reportTable } from "../labShell";

/** Regional migration spike. Reuses battle materials, physical environment,
 * camera bridge and trees over real campaign geography; no game state needed. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const { data } = await loadCampaignData();
  const field = new TerrainField(data);
  const center: [number, number] = ctx.params.get("region") === "italy" ? [-325, 640] : [-450, 990];
  center[0] = numberParam(ctx.params, "x", center[0]);
  center[1] = numberParam(ctx.params, "y", center[1]);
  const landscape = buildCampaignLandscape(field, center);
  const world = await PhotorealWorld.create(ctx.canvas);
  const frame = createBattleFrameUniforms();
  frame.focus.value.set(...center);
  const env = applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
    aerialObserver: vec3(frame.focus, 0),
  });
  const ground = createGroundMesh(frame, landscape.mesh, {
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
  const scenery = new PhotorealScenery(world.scene, "canopy");
  scenery.upload(landscape.scenery);
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
        zoom: numberParam(ctx.params, "zoom", 2.5),
        pitch: numberParam(ctx.params, "pitch", 0.55),
      },
      height,
    );
    pose.aspect = width / height;
    pose.target = [center[0], center[1], landscape.heightAt(...center)];
    applyCamera3d(camera, pose);
    world.setTime(0);
    world.render(camera);
    publish("campaign-landscape", true, {
      ...world.stats(),
      terrainTriangles: landscape.mesh.triangles,
      trees: landscape.scenery.length,
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
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      world.dispose();
    },
    { once: true },
  );
  ctx.status.innerHTML = reportTable({
    route: "campaign-landscape",
    status: "terrain migration spike",
    terrainTriangles: landscape.mesh.triangles,
    trees: landscape.scenery.length,
    mountains: "continuous height field",
    materials: "battle ground + foliage",
    lighting: "shared physical environment",
  });
}
