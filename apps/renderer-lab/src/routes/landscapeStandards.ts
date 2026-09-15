import * as THREE from "three/webgpu";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { PhotorealStandardLayer } from "@packages/photoreal-renderer/src/landscape/standardLayer";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import type { StandardInstance } from "@packages/game-renderer/src/models/shared/standardInstance";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { type LabContext, publish } from "../labShell";

/** Mixed production instance contract; no campaign or battle adapter in this fixture. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const world = await PhotorealWorld.create(ctx.canvas);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);
  const layer = new PhotorealStandardLayer(world.scene, world.uTime);
  const camera = new THREE.PerspectiveCamera();
  const allInstances: StandardInstance[] = [
    {
      x: -9,
      y: 0,
      tier: "settlement-banner",
      factionId: "crimson",
      livery: { field: [0.15, 0.55, 0.25], trim: [0.85, 0.9, 0.9], emblem: [0.75, 0.12, 0.45] },
      windPhase: 0,
      windStrength: 0,
    },
    {
      x: 0,
      y: 0,
      tier: "campaign-army",
      factionId: "azure",
      livery: { field: [0.7, 0.22, 0.45], trim: [0.2, 0.7, 0.8], emblem: [0.95, 0.85, 0.2] },
      windPhase: 1.4,
      windStrength: 1.1,
    },
    {
      x: 9,
      y: 0,
      tier: "battle-unit",
      factionId: "azure",
      unitId: 4,
      z: 0,
      yaw: 0,
      scale: 1,
      selected: true,
    },
  ];
  const instances = ctx.params.has("battle")
    ? allInstances.filter((instance) => instance.tier === "battle-unit")
    : allInstances;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 35),
    new THREE.MeshStandardMaterial({ color: 0x777366, roughness: 1 }),
  );
  world.scene.add(ground);
  let alive = true;
  const draw = () => {
    if (!alive) return;
    const w = ctx.canvas.clientWidth,
      h = ctx.canvas.clientHeight;
    world.resize(w, h, window.devicePixelRatio);
    const pose = chartCamera3d(
      {
        x: ctx.params.has("battle") ? 9 : 0,
        y: 3,
        zoom: ctx.params.has("battle") ? 65 : 32,
        pitch: 1.05,
      },
      h,
    );
    pose.aspect = w / h;
    applyCamera3d(camera, pose);
    world.render(camera);
    publish("landscape-standards", true, { ...world.stats(), ...layer.stats() });
  };
  const upload = (grow = false) => {
    layer.upload(
      grow
        ? [
            ...instances,
            ...Array.from({ length: 33 }, (_, i) => ({
              ...instances[0],
              x: 24 + (i % 8) * 3,
              y: Math.floor(i / 8) * 3,
            })),
          ]
        : instances,
    );
    draw();
    requestAnimationFrame(draw);
  };
  world.setTime(1.25);
  upload();
  Object.assign(window, {
    __landscapeStandards: {
      grow: () => upload(true),
      restore: () => upload(),
      time: (t: number) => {
        world.setTime(t);
        draw();
        requestAnimationFrame(draw);
      },
    },
  });
  window.addEventListener("resize", draw);
  window.addEventListener(
    "pagehide",
    () => {
      alive = false;
      window.removeEventListener("resize", draw);
      layer.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      world.dispose();
    },
    { once: true },
  );
}
