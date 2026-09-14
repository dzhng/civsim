import * as THREE from "three/webgpu";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/landscape/sceneryLayer";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import type { SceneryPropId } from "@packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { type LabContext, numberParam, publish, reportTable } from "../labShell";

/** Actual production scenery, including camera-sized detail selection. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const world = await PhotorealWorld.create(ctx.canvas);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardNodeMaterial({ color: 0x96936b, roughness: 1 }),
  );
  ground.receiveShadow = true;
  world.scene.add(ground);
  const scenery = new PhotorealScenery(world.scene);
  const kinds: SceneryPropId[] = ["conifer", "ash", "broadleaf", "aspen", "bush"];
  const requestedKind = kinds.find((kind) => kind === ctx.params.get("kind"));
  scenery.upload(
    requestedKind
      ? [{ kind: requestedKind, x: 0, y: 0, size: 3 }]
      : kinds.flatMap((kind, col) =>
          [0, 1, 2].map((row) => ({
            kind,
            x: (col - 2) * 7,
            y: (row - 1) * 9,
            size: 3,
            yaw: row * 1.5,
          })),
        ),
  );
  const sun = world.sunLight!;
  sun.castShadow = true;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -35,
    right: 35,
    top: 35,
    bottom: -35,
    near: 1,
    far: 500,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const camera = new THREE.PerspectiveCamera();
  const draw = (zoom: number) => {
    const width = ctx.canvas.clientWidth,
      height = ctx.canvas.clientHeight;
    world.resize(width, height, 1);
    const pose = chartCamera3d(
      { x: 0, y: 0, zoom, pitch: numberParam(ctx.params, "pitch", 0.65) },
      height,
    );
    pose.aspect = width / height;
    applyCamera3d(camera, pose);
    scenery.prepareRender(camera, height);
    world.setTime(0);
    world.render(camera);
    ctx.status.innerHTML = reportTable(scenery.stats());
    publish("landscape-tree-lod", true, { ...world.stats(), ...scenery.stats(), zoom });
  };
  Object.assign(window, { __treeLod: { draw, stats: () => scenery.stats() } });
  draw(numberParam(ctx.params, "zoom", 22));
  requestAnimationFrame(() => draw(numberParam(ctx.params, "zoom", 22)));
  window.addEventListener(
    "pagehide",
    () => {
      scenery.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      world.dispose();
    },
    { once: true },
  );
}
