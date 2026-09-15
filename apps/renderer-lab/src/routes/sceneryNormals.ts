import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { PhotorealScenery } from "@packages/photoreal-renderer/src/landscape/sceneryLayer";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { type LabContext, publish } from "../labShell";

/** Instance scaling must light identically to the same transform baked into a model. */
export async function route(ctx: LabContext) {
  ctx.root.classList.add("reference-shot");
  const world = await PhotorealWorld.create(ctx.canvas);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, { aerialObserver: vec3(0) });
  const pose = ctx.params.get("pose") ?? "uniform";
  const size = pose === "wide" ? 8 : 4;
  const height = pose === "tall" ? 16 : 4;
  const baked = ctx.params.get("baked") === "1";
  const scenery = new PhotorealScenery(world.scene, "canopy");
  scenery.upload([
    {
      kind: "rock",
      x: -5,
      y: 0,
      size: baked ? 1 : size,
      height: baked ? 1 : height,
      yaw: 0.4,
      shade: 0.5,
    },
    {
      kind: "aspen",
      x: 4,
      y: 0,
      size: baked ? 1 : size,
      height: baked ? 1 : height,
      yaw: -0.6,
      shade: 0.5,
    },
  ]);
  if (baked) {
    const scale = new THREE.Matrix4().makeScale(size, size, height);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(scale);
    // Keep yaw and translation in the production instance path on both sides.
    // Powers of two make the CPU Float32 scale bake exact before GPU normalization.
    world.scene.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !object.visible ||
        !object.name.startsWith("landscape-scenery-")
      )
        return;
      for (const [name, attribute] of Object.entries(
        (object.geometry as THREE.BufferGeometry).attributes,
      )) {
        if (name === "position" || name.startsWith("shapePosition")) attribute.applyMatrix4(scale);
        if (name === "sNormal" || name.startsWith("shapeNormal")) {
          const n = new THREE.Vector3();
          for (let i = 0; i < attribute.count; i++) {
            // A positive common factor does not change a normal direction. Keeping
            // XY magnitude avoids different rounding solely from unit normalization.
            n.fromBufferAttribute(attribute, i).applyMatrix3(normalMatrix).multiplyScalar(size);
            attribute.setXYZ(i, n.x, n.y, n.z);
          }
        }
      }
    });
  }
  const camera = new THREE.PerspectiveCamera();
  const draw = () => {
    const width = ctx.canvas.clientWidth,
      height = ctx.canvas.clientHeight;
    world.resize(width, height, 1);
    const view = chartCamera3d({ x: 0, y: 0, zoom: pose === "tall" ? 20 : 28, pitch: 0.5 }, height);
    view.aspect = width / height;
    view.target = [0, 0, pose === "tall" ? 7 : 2];
    applyCamera3d(camera, view);
    world.setTime(0);
    world.render(camera);
    publish("scenery-normals", true, { ...world.stats(), ...scenery.stats(), pose, baked });
  };
  draw();
  requestAnimationFrame(draw);
  window.addEventListener(
    "pagehide",
    () => {
      scenery.dispose();
      world.dispose();
    },
    { once: true },
  );
}
