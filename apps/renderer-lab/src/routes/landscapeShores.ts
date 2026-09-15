import { campaignRelief } from "@packages/game-renderer/src/terrain/campaignRelief";
import { buildCampaignCoast } from "@packages/game-renderer/src/terrain/campaignCoast";
import * as THREE from "three/webgpu";
import { attribute, mix, vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { PhotorealTiledTerrain } from "@packages/photoreal-renderer/src/campaign/tiledTerrain";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { conformShoreline } from "@packages/game-renderer/src/terrain/shorelineMesh";
import { createRenderedSurface } from "@packages/game-renderer/src/terrain/surface";
import { campaignLandscapeSource } from "@packages/game-renderer/src/terrain/campaignSource";
import { chartCamera3d, screenRay } from "@packages/renderer-core/src/camera3d";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, publish } from "../labShell";

export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const real = ctx.params.get("real") === "1",
    before = ctx.params.get("before") === "1";
  const classes = new Uint8Array(16 * 16).fill(1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (x < 4 || (x === 8 && y > 3) || (y === 7 && x > 3 && x < 9) || (x === 12 && y === 6))
        classes[y * 16 + x] = 0;
  classes[8 * 16 + 2] = 1; // one source-pixel island
  for (let i = 0; i < 4; i++) classes[(3 + i) * 16 + 5 + i] = 4; // diagonal river mouth
  const fixture = campaignLandscapeSource({
    w: 16,
    h: 16,
    cell: 2,
    minX: 0,
    maxY: 32,
    height: new Float32Array(256).fill(2.2),
    biome: new Uint8Array(1024).fill(128),
    renderMask: { width: 16, height: 16, classes, rect: { min: [0, 0], max: [32, 32] } },
  });
  const field = real ? new TerrainField((await loadCampaignData()).data) : fixture;
  const center: [number, number] = real ? [-320, 640] : [16, 16],
    radius = real ? 64 : 16;
  const make = (cell: number, point = center, r = radius) => {
    const base = buildCampaignLandscape(field, point, r, cell).surface;
    if (before) return { surface: base, typedBytes: 0 };
    const relief = campaignRelief(field, cell);
    const halo = 24;
    const coast = buildCampaignCoast(
      (x, y) => !field.renderWaterAt(x, y),
      base.domain.ox - halo,
      base.domain.oy - halo,
      Math.ceil((r * 2 + halo * 2) / 2) + 1,
      2,
    );
    const result = conformShoreline(base, field.renderMask, 32 * 1024 * 1024, (x, y) =>
      relief.heightAt(x, y, coast.inlandAt(x, y)),
    );
    return { ...result, surface: createRenderedSurface(result.mesh, base.domain, "shore") };
  };
  const coarse = make(real ? 16 : 8);
  const world = await PhotorealWorld.create(ctx.canvas),
    frame = createLandscapeFrameUniforms();
  frame.focus.value.set(...center);
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
    aerialObserver: vec3(frame.focus, 0),
  });
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  material.colorNode = mix(vec3(0.55, 0.5, 0.34), vec3(0.12, 0.35, 0.4), attribute("gWater"));
  const terrain = new PhotorealTiledTerrain(world.scene, material, coarse.surface);
  if (ctx.params.get("detail") === "1") {
    const fine = make(2, [center[0] - radius / 2, center[1] - radius / 2], radius / 2);
    terrain.install(
      {
        request: {
          key: "shore",
          minX: center[0] - radius,
          minY: center[1] - radius,
          size: radius,
          cell: 2,
        },
        domain: fine.surface.domain,
        mesh: fine.surface.mesh,
      },
      [],
    );
  }
  const camera = new THREE.PerspectiveCamera();
  const draw = () => {
    const width = ctx.canvas.clientWidth,
      height = ctx.canvas.clientHeight;
    world.resize(width, height, 1);
    const pose = chartCamera3d(
      { x: center[0], y: center[1], zoom: real ? 5 : 20, pitch: 0.62 },
      height,
    );
    pose.aspect = width / height;
    pose.target = [...center, 0];
    applyCamera3d(camera, pose);
    world.setTime(0);
    world.render(camera);
    publish("landscape-shores", true, {
      ...terrain.stats(),
      typedBytes: coarse.typedBytes,
      centerRay: terrain.surface.raycastRendered(screenRay(pose, 0, 0)),
      triangles: coarse.surface.mesh.triangles,
      before,
      real,
    });
  };
  draw();
  requestAnimationFrame(draw);
  window.addEventListener(
    "pagehide",
    () => {
      terrain.dispose();
      world.dispose();
    },
    { once: true },
  );
}
