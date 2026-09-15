// /renderer/photoreal-battle boots the FULL production battle world on
// the photoreal substrate, booted from the SAME wasm worlds the production
// battle page runs (Game + start_battle fixed maps, same seed, same spawn
// path) and framed by the SAME shared Camera — so compare-screenshots can hold
// this route against the production battle at matched camera3d framing.
//
//   ?map=A|B|C|gen  fixed map (default A; C = the ocean-flanked coast) or
//                 generated seed map
//   ?env=golden-hour|dusk|overcast-foggy|overcast-highland|noon
//                 environment preset (default golden-hour)
//   ?ai=on        enemy AI (default off — deterministic standing armies)
//   ?ticks=N      sim ticks advanced before first frame (default 60)
//   ?count=N      grow the army to N soldiers via the production spawn path
//   ?run=1        keep the sim ticking each frame (default paused after boot)
//   ?t=S          fixed clock seconds (byte-deterministic frames)
//   ?select=1     select the first player unit (gold ring decals)
//   ?debug=blocks debug unit blocks (mirrors the production toggle)
//   ?pitch=R      camera pitch override in radians (sky/atmosphere QA — the
//                 production rig never points this high)
//   ?yaw=R        camera yaw override in radians (same QA knob)
//   ?camYaw=R     REAL camera yaw (rotates the render camera, like middle-drag
//                 — unlike ?yaw, which only patches the reported snapshot)
//   ?clay=1       generated-map landform review: hide grass/scenery/sea and
//                 swap the live ground mesh to neutral grey clay
//   ?shadows=off|single|csm
//                 sun-shadow tier override (default: 'single'
//                 on every adapter — CSM is the QA override)
//   ?sea=gerstner
//                 photoreal sea displacement source (12a verdict: Gerstner TSL)
//   ?post=off     bypass the whole post chain for a controlled A/B
//   ?bloom=off    keep the chain but drop the bloom stage (glint on/off pair)
//   ?grade=N      override the preset post-grade strength uniform for capture sweeps
//   ?gradeSat=N|gradeContrast=N|gradeSplit=N|gradeLift=N
//                 optional post-grade uniform overrides for look-grade sweeps
import * as THREE from "three/webgpu";
import {
  PhotorealBattleWorld,
  type BattleTacticalLineFrame,
} from "@packages/photoreal-renderer/src/battle/battleWorld";
import { postGradeUniformsFromParams } from "@packages/game-renderer/src/environment/postParameters";
import { DEFAULT_BATTLE_ENVIRONMENT } from "@packages/game-renderer/src/environment/environment";
import { BATTLE_RELIEF_EXAGGERATION } from "@packages/game-renderer/src/battle/terrainFeatures";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { createPhotorealStatsPublisher } from "@packages/photoreal-renderer/src/stats";
import { Camera } from "../../../../web/src/shared/camera";
import { pushPie } from "../../../../web/src/shared/overlays";
import { readGeneratedVistaGrid } from "../../../../web/src/battle/battleTerrain";
import { BattleActionAdapter } from "../../../../web/src/battle/battleActionAdapter";
import { createLiveObservationSource } from "../../../../web/src/battle/battleViews";
import {
  ACTION_TICK_SECONDS,
  ActionTimeline,
  type ActionObservation,
} from "@packages/crowd-runtime/src/actionTimeline";
import { createBattleGroundEdgeFixture } from "../battleGroundEdgeFixture";
import type { LabContext } from "../labShell";

const TICK_DT = ACTION_TICK_SECONDS;

export async function route(ctx: LabContext) {
  const params = ctx.params;
  const generatedMap = params.get("map") === "gen";
  const environment = params.get("env") ?? (generatedMap ? DEFAULT_BATTLE_ENVIRONMENT : null);
  // ?ref=1: full-viewport canvas (the compare-screenshots framing — the
  // production #battlefield also fills its viewport).
  if (params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const [{ default: initWasm, Game }, world] = await Promise.all([
    import("../../../../web/src/wasm/game_wasm.js"),
    PhotorealBattleWorld.create(ctx.canvas, {
      environment,
      shadows: params.get("shadows"),
      post: params.get("post"),
      postGrade: postGradeUniformsFromParams(params),
    }),
  ]);
  if (params.get("bloom") === "off") world.setBloomEnabled(false);
  // Live shadow/lighting QA handle (photoreal-shadows scene + orchestrator probes).
  (window as unknown as { __battleWorld: unknown }).__battleWorld = world;
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  const generatedSeed = Number(params.get("seed") ?? 7) || 7;
  // Fixed-map ids: A = RiverAndCrags (0), B = WalledPlain (1), C = CoastalScrub
  // (2, the ocean-flanked coast — the sea scenes face its west shore).
  const mapIndex = params.get("map") === "C" ? 2 : params.get("map") === "B" ? 1 : 0;
  if (generatedMap) game.start_battle_generated(BigInt(generatedSeed));
  else game.start_battle(mapIndex);
  const edgeFixture = params.get("terrain") === "edge" ? createBattleGroundEdgeFixture() : null;
  const generatedDescriptor = generatedMap
    ? {
        ...JSON.parse(game.generated_map_descriptor()),
        defaultEnvironment: DEFAULT_BATTLE_ENVIRONMENT,
      }
    : null;
  if (params.get("ai") === "on") game.set_ai_team(1);
  const wasmMapId = generatedMap ? undefined : mapIndex;
  const clayMode = params.get("clay") === "1";

  // Grow to ?count through the production spawn path (battle-perf-30k grid).
  const targetCount = Number(params.get("count")) || 0;
  if (targetCount > game.soldier_count()) {
    const need = Math.ceil((targetCount - game.soldier_count()) / 500);
    for (let i = 0; i < need; i++) {
      const row = Math.floor(i / 10);
      const col = i % 10;
      game.spawn_class(-540 + col * 120, -400 + row * 90, Math.PI / 2, 500, 28, 0, row % 2);
    }
  }
  let simTick = Number(params.get("ticks") ?? 60);
  game.advance_ticks(simTick);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = ctx.canvas.clientWidth || 1000;
  const cssH = ctx.canvas.clientHeight || 600;
  world.resize(cssW, cssH, dpr);

  // --- Camera: the shared production Camera + the scene.ts framing block ----
  const camera = new Camera(ctx.canvas);
  const STRIDE = game.unit_info_stride();
  const unitInfo = () =>
    new Float32Array(wasm.memory.buffer, game.unit_info_ptr(), game.unit_count() * STRIDE);
  {
    const mapW = edgeFixture
      ? edgeFixture.grid.w * edgeFixture.grid.cell
      : game.terrain_w() * game.terrain_cell();
    const mapH = edgeFixture
      ? edgeFixture.grid.h * edgeFixture.grid.cell
      : game.terrain_h() * game.terrain_cell();
    const ox = edgeFixture?.grid.ox ?? game.terrain_origin_x();
    const oy = edgeFixture?.grid.oy ?? game.terrain_origin_y();
    camera.bounds = [ox, oy, ox + mapW, oy + mapH];
    const mapZoom = (cssH * dpr) / Math.min(mapH * 0.62, 1000);
    const topDownCos = 0.95;
    const tacticalZoom = Math.min((cssW * dpr) / mapW, (cssH * dpr) / topDownCos / mapH);
    camera.setRig(
      { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) },
      { width: mapW, height: mapH },
    );
    camera.zoom = Number(params.get("zoom")) || Math.max(mapZoom, 3.0);
    if (params.has("camYaw")) camera.yaw = Number(params.get("camYaw")) || 0;
    camera.setViewCenter(
      Number(params.get("cx")) || 0,
      params.has("cy") ? Number(params.get("cy")) : -0.27 * mapH,
    );
    camera.clampView();
  }
  (window as unknown as { __cam?: Camera }).__cam = camera;
  (window as unknown as { __photorealBattleWorld?: PhotorealBattleWorld }).__photorealBattleWorld =
    world;
  // Debug isolation: ?only=battle-ground,battle-crowd keeps just those meshes.
  const only = params.get("only");
  const onlyNames = only ? new Set(only.split(",")) : null;
  const isolationGrassVisible =
    onlyNames === null || [...onlyNames].some((name) => "battle-grass".startsWith(name));
  const applyOnly = () => {
    if (!onlyNames) return;
    world.world.scene.traverse((obj) => {
      const o = obj as {
        isMesh?: boolean;
        isLineSegments?: boolean;
        visible: boolean;
        name: string;
      };
      if (!o.isMesh && !o.isLineSegments) return;
      if (![...onlyNames].some((n) => o.name.startsWith(n))) o.visible = false;
    });
  };
  const applyClayMode = () => {
    if (!clayMode) return;
    world.setGrassVisible(false);
    // Clay judges LANDFORM only: haze must not launder or hide silhouettes,
    // so clay renders with fog disabled.
    (world.world.scene as unknown as { fogNode: unknown }).fogNode = null;
    world.world.scene.traverse((obj) => {
      const o = obj as {
        isMesh?: boolean;
        visible: boolean;
        name: string;
        material?: THREE.Material | THREE.Material[];
      };
      if (!o.isMesh) return;
      if (o.name === "battle-ground") {
        o.visible = true;
        const current = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!current?.userData?.clayReview) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material?.dispose();
          const clay = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.56, 0.56, 0.54),
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide,
            // The ground mesh carries no vertex normals (the production
            // material derives them in TSL) - flat shading computes face
            // normals in-shader so the relief actually shades.
            flatShading: true,
          });
          clay.userData.clayReview = true;
          o.material = clay;
        }
        return;
      }
      if (
        o.name.startsWith("battle-grass") ||
        o.name.startsWith("battle-scenery") ||
        o.name.startsWith("battle-ocean") ||
        o.name.startsWith("battle-horizon")
      ) {
        o.visible = false;
      }
    });
  };

  // --- Static per-soldier data + terrain (the setStatic/setTerrain seam) ----
  const applyStatic = () => {
    const soldierUnit = new Uint32Array(
      wasm.memory.buffer,
      game.soldier_unit_ptr(),
      game.soldier_count(),
    );
    const info = unitInfo();
    const teams = Array.from(
      { length: game.unit_count() },
      (_, u) => info[u * STRIDE + UNIT_INFO.team],
    );
    const classes = Array.from(
      { length: game.unit_count() },
      (_, u) => info[u * STRIDE + UNIT_INFO.classId],
    );
    world.setStatic(soldierUnit, teams, classes);
  };
  applyStatic();
  {
    const grid = edgeFixture?.grid ?? readBattleTerrainGrid(game, wasm.memory);
    world.setTerrain(
      {
        ...grid,
        height: edgeFixture ? grid.height : heightForPhotorealRoute(grid.height!, generatedMap),
      },
      {
        wasmMapId: edgeFixture ? undefined : wasmMapId,
        slopeBands: edgeFixture
          ? {
              flatMax: 0.07,
              rollingMax: 0.115,
              slowMin: 0.135,
              cliffMin: 0.32,
              cliffDilateCells: 2,
              highlandCapMinM: 150,
            }
          : (generatedDescriptor?.slopeBands ?? null),
        vista:
          edgeFixture || !generatedDescriptor
            ? null
            : readGeneratedVistaGrid(game, wasm.memory, generatedDescriptor),
        lakeSurfaces: null,
      },
    );
  }
  if (edgeFixture) addEdgeRuler(world.world.scene, edgeFixture.anchors.ruler);

  const adapter = new BattleActionAdapter(createLiveObservationSource(game, wasm.memory));
  let catalog = world.soldierAssets;
  let timeline = new ActionTimeline(catalog);
  let observations: readonly ActionObservation[] = [];

  // This overlay shows engagement reach, not a fabricated strike or injury event.
  const attackArcs = (): Float32Array => {
    if (camera.zoom <= 2.5) return new Float32Array();
    const n = game.soldier_count();
    const pos = new Float32Array(wasm.memory.buffer, game.positions_ptr(), n * 2);
    const face = new Float32Array(wasm.memory.buffer, game.facings_ptr(), n);
    const curWeapon = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), n);
    const sUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), n);
    const info = unitInfo();
    const [wx0, wy1] = camera.screenToWorld(0, 0) ?? [-Infinity, Infinity];
    const [wx1, wy0] = camera.screenToWorld(ctx.canvas.width, ctx.canvas.height) ?? [
      Infinity,
      -Infinity,
    ];
    const tris: number[] = [];
    let budget = 900;
    for (let i = 0; i < n && budget > 0; i++) {
      if (!observations[i]?.alive || !observations[i].fighting) continue;
      const x = pos[2 * i];
      const y = pos[2 * i + 1];
      if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue;
      const u = sUnit[i];
      const cls = info[u * STRIDE + UNIT_INFO.classId];
      const w = adapter.classSpecs[cls]?.weapons[curWeapon[i]];
      if (!w) continue;
      const team = info[u * STRIDE + UNIT_INFO.team];
      const [r, g, b] = team === 0 ? [0.55, 0.85, 1.0] : [1.0, 0.72, 0.35];
      const alpha = 0.26;
      const half = Math.max(w.arc, 0.18) / 2;
      const segs = w.arc > 1.2 ? 5 : 3;
      const f0 = w.braced ? info[u * STRIDE + UNIT_INFO.facing] : face[i];
      const R = w.reach + 0.45;
      for (let s = 0; s < segs; s++) {
        const a0 = f0 - half + (s / segs) * w.arc;
        const a1 = f0 - half + ((s + 1) / segs) * w.arc;
        tris.push(
          x,
          y,
          r,
          g,
          b,
          alpha,
          x + Math.cos(a0) * R,
          y + Math.sin(a0) * R,
          r,
          g,
          b,
          0.04,
          x + Math.cos(a1) * R,
          y + Math.sin(a1) * R,
          r,
          g,
          b,
          0.04,
        );
      }
      budget--;
    }
    return new Float32Array(tris);
  };

  // Tactical lines (scene.ts tacticalLineFrame port, sim-driven parts):
  // selection rings (gold glow), order-progress pies, projectiles.
  const selected = params.get("select") === "1" ? firstPlayerUnit() : -1;
  function firstPlayerUnit(): number {
    const info = unitInfo();
    for (let u = 0; u < game.unit_count(); u++) {
      if (info[u * STRIDE + UNIT_INFO.team] === 0 && info[u * STRIDE + UNIT_INFO.alive] > 0)
        return u;
    }
    return -1;
  }
  const unitCenter = (u: number): [number, number] => {
    const n = game.soldier_count();
    const pos = new Float32Array(wasm.memory.buffer, game.positions_ptr(), n * 2);
    const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), n);
    const sUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), n);
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (sUnit[i] !== u || !a[i]) continue;
      cx += pos[2 * i];
      cy += pos[2 * i + 1];
      count++;
    }
    const info = unitInfo();
    return count > 0
      ? [cx / count, cy / count]
      : [info[u * STRIDE], info[u * STRIDE + UNIT_INFO.y]];
  };
  // ?fx=1: a deterministic overlay fixture at the first player unit — an
  // order-progress pie + projectile streaks (effect lines) and a pair of
  // attack-arc fans (debug triangles), so the overlay ports are verifiable
  // without scripting a live melee.
  const fxAt = params.get("fx") === "1" ? unitCenter(firstPlayerUnit()) : null;
  const fxArcs = (): Float32Array => {
    if (!fxAt) return new Float32Array();
    const [x, y] = fxAt;
    const tris: number[] = [];
    for (const [f0, r, g, b] of [
      [Math.PI / 2, 0.55, 0.85, 1.0],
      [-Math.PI / 2, 1.0, 0.72, 0.35],
    ] as const) {
      const reach = 2.4;
      for (let s = 0; s < 3; s++) {
        const a0 = f0 - 0.5 + s / 3;
        const a1 = f0 - 0.5 + (s + 1) / 3;
        tris.push(
          x,
          y,
          r,
          g,
          b,
          0.26,
          x + Math.cos(a0) * reach,
          y + Math.sin(a0) * reach,
          r,
          g,
          b,
          0.04,
          x + Math.cos(a1) * reach,
          y + Math.sin(a1) * reach,
          r,
          g,
          b,
          0.04,
        );
      }
    }
    return new Float32Array(tris);
  };

  const tacticalFrame = (): BattleTacticalLineFrame => {
    const groundCues: number[] = [];
    const rings: number[] = [];
    // Effects are (x, y, z, r, g, b) per vertex — ground cues (pies included)
    // are (x, y, r, g, b, a) and live in groundCues, which drapes onto the terrain.
    const effects: number[] = [];
    const info = unitInfo();
    if (fxAt) {
      pushPie(groundCues, fxAt[0], fxAt[1], 0.66, 7, 1, 1, 1, 1);
      for (let i = 0; i < 6; i++) {
        const px = fxAt[0] - 18 + i * 7;
        const py = fxAt[1] + 14 + i * 2;
        effects.push(px - 0.7, py, 0.5, 0.92, 0.92, 0.83, px + 0.7, py, 0.5, 0.92, 0.92, 0.83);
      }
    }
    for (let u = 0; u < game.unit_count(); u++) {
      const o = u * STRIDE;
      if (info[o + UNIT_INFO.orderProgress] > 0)
        pushPie(
          groundCues,
          info[o],
          info[o + UNIT_INFO.y],
          info[o + UNIT_INFO.orderProgress],
          7,
          1,
          1,
          1,
          1,
        );
    }
    if (selected >= 0) {
      const [cx, cy] = unitCenter(selected);
      rings.push(cx, cy, 8.5, 1.0, 0.78, 0.22, 1);
      rings.push(cx, cy, 5.4, 1.0, 0.92, 0.45, 1);
    }
    const pCount = game.projectile_count();
    if (pCount > 0) {
      const px = new Float32Array(wasm.memory.buffer, game.projectile_x_ptr(), pCount);
      const py = new Float32Array(wasm.memory.buffer, game.projectile_y_ptr(), pCount);
      const pk = new Uint8Array(wasm.memory.buffer, game.projectile_kind_ptr(), pCount);
      for (let i = 0; i < pCount; i++) {
        const stone = pk[i] === 2;
        const len = stone ? 1.4 : 0.7;
        const c = stone ? 0.25 : 0.92;
        effects.push(
          px[i] - len,
          py[i],
          0.4,
          c,
          c,
          c * 0.9,
          px[i] + len,
          py[i],
          0.4,
          c,
          c,
          c * 0.9,
        );
      }
    }
    return {
      groundCues: new Float32Array(groundCues),
      rings: new Float32Array(rings),
      effects: new Float32Array(effects),
    };
  };

  const debugBlocks = params.get("debug") === "blocks";
  const running = params.get("run") === "1";
  const fixedT = params.has("t") ? Number(params.get("t")) : null;
  const publish = createPhotorealStatsPublisher(world.world, "photoreal-battle", () => {
    const s = world.stats();
    return {
      renderStats: s,
      soldiers: s.soldiers,
      expectedSoldiers: s.expectedSoldiers,
      groundDetail: s.groundDetail,
      edgeFixture: edgeFixture?.telemetry ?? null,
      isolation: { only, grassVisible: isolationGrassVisible },
    };
  });

  const pitchOverride = params.has("pitch") ? Number(params.get("pitch")) : null;
  const yawOverride = params.has("yaw") ? Number(params.get("yaw")) : null;
  const cameraSnapshot = () => {
    const [x, y] = camera.viewCenter();
    const camera3d = camera.params();
    if (pitchOverride !== null && Number.isFinite(pitchOverride)) camera3d.pitch = pitchOverride;
    if (yawOverride !== null && Number.isFinite(yawOverride)) camera3d.yaw = yawOverride;
    return { x, y, zoom: camera.zoom, zoomT: camera.zoomT, camera3d };
  };

  let accumulator = 0;
  let last = performance.now();
  const t0 = last;
  const loop = (now: number) => {
    const seconds = fixedT ?? (now - t0) / 1000;
    world.setTime(seconds);
    if (running) {
      accumulator += Math.min((now - last) / 1000, 0.25);
      let ticks = 0;
      while (accumulator >= TICK_DT && ticks < 4) {
        accumulator -= TICK_DT;
        ticks++;
      }
      if (ticks > 0) {
        game.advance_ticks(ticks);
        simTick += ticks;
      }
    }
    last = now;
    camera.clampView(); // production scene.ts clamps every frame (panWorld)
    const replaced = catalog !== world.soldierAssets;
    if (replaced) {
      catalog = world.soldierAssets;
      timeline = new ActionTimeline(catalog);
    }
    const adapted = adapter.read(simTick);
    if (replaced || observations !== adapted.observations)
      timeline.update(simTick, adapted.observations);
    observations = adapted.observations;
    const playback = timeline.sample(running ? simTick + accumulator / TICK_DT : simTick);
    const n = game.soldier_count();
    const positions = new Float32Array(wasm.memory.buffer, game.positions_ptr(), n * 2);
    const snapshot = cameraSnapshot();
    if (!isolationGrassVisible) world.setGrassVisible(false);
    const alive = Float32Array.from(observations, (observation) => (observation.alive ? 1 : 0));
    world.draw(positions, adapted.facings, playback, alive, n, snapshot);
    const arcs = attackArcs();
    world.drawTris(arcs.length > 0 ? arcs : fxArcs(), snapshot);
    if (debugBlocks) {
      world.uploadDebugBlocks(buildDebugBlockTriangles(game, wasm.memory.buffer));
    }
    applyOnly();
    applyClayMode();
    world.drawTacticalLines(tacticalFrame(), snapshot);
    const s = publish(now);
    const rs = world.stats();
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-battle (${s.substrate})</td></tr>
      <tr><td>environment</td><td>${s.environment}</td></tr>
      <tr><td>sea</td><td>${rs.sea.source} (${rs.sea.tier})</td></tr>
      <tr><td>map</td><td>${edgeFixture ? "synthetic-edge" : generatedMap ? `gen:${generatedSeed}` : ["A", "B", "C"][mapIndex]}</td></tr>
      <tr><td>soldiers</td><td>${rs.soldiers} / ${rs.expectedSoldiers}</td></tr>
      <tr><td>seating</td><td>match=${rs.seating.matches} span=${rs.seating.span}</td></tr>
      <tr><td>grass records</td><td>${rs.terrain?.grass.recordCount ?? 0}</td></tr>
      <tr><td>grass tris</td><td>${rs.terrain?.grass.submittedTriangles ?? 0}</td></tr>
      <tr><td>scenery</td><td>${rs.terrain?.scenery ?? 0}</td></tr>
      <tr><td>sea planes</td><td>${rs.terrain?.sealedEdges.join(", ") || "none"}</td></tr>
      <tr><td>clay</td><td>${clayMode ? "on" : "off"}</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>median ms</td><td>${s.stats.medianMs?.toFixed(2) ?? "warmup"}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? "pending"}</td></tr>
    </table>`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function addEdgeRuler(scene: THREE.Scene, anchor: [number, number]): void {
  const [x, y] = anchor;
  const vertices: number[] = [x, y, 0.45, x + 10, y, 0.45];
  for (let meter = 0; meter <= 10; meter++) {
    const tick = meter % 5 === 0 ? 1.8 : 0.9;
    vertices.push(x + meter, y - tick, 0.45, x + meter, y + tick, 0.45);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const ruler = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: new THREE.Color(1, 0.76, 0.08),
      depthTest: false,
      depthWrite: false,
    }),
  );
  ruler.name = "battle-edge-ruler";
  ruler.renderOrder = 20;
  ruler.frustumCulled = false;
  scene.add(ruler);
}

function heightForPhotorealRoute(height: Float32Array, generatedMap: boolean): Float32Array {
  if (!generatedMap) return height;
  const out = new Float32Array(height.length);
  const scale = 1 / BATTLE_RELIEF_EXAGGERATION;
  for (let i = 0; i < height.length; i++) out[i] = height[i] * scale;
  return out;
}

// The production ?debug=blocks triangles (renderer.ts buildDebugBlockTriangles).
function buildDebugBlockTriangles(
  game: {
    soldier_count(): number;
    unit_count(): number;
    positions_ptr(): number;
    alive_ptr(): number;
    soldier_unit_ptr(): number;
    unit_info_ptr(): number;
    unit_info_stride(): number;
  },
  buffer: ArrayBuffer,
): Float32Array {
  const n = game.soldier_count();
  const positions = new Float32Array(buffer, game.positions_ptr(), n * 2);
  const alive = new Uint8Array(buffer, game.alive_ptr(), n);
  const soldierUnit = new Uint32Array(buffer, game.soldier_unit_ptr(), n);
  const stride = game.unit_info_stride();
  const info = new Float32Array(buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const bounds = new Map<
    number,
    { x0: number; y0: number; x1: number; y1: number; team: number }
  >();
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const unit = soldierUnit[i];
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    const prev = bounds.get(unit);
    if (prev) {
      prev.x0 = Math.min(prev.x0, x);
      prev.y0 = Math.min(prev.y0, y);
      prev.x1 = Math.max(prev.x1, x);
      prev.y1 = Math.max(prev.y1, y);
    } else {
      bounds.set(unit, { x0: x, y0: y, x1: x, y1: y, team: info[unit * stride + 6] });
    }
  }
  const verts: number[] = [];
  for (const b of bounds.values()) {
    const pad = 2.4;
    const color: [number, number, number, number] =
      b.team === 1 ? [0.88, 0.2, 0.16, 0.88] : [0.18, 0.44, 1.0, 0.88];
    const [x0, y0, x1, y1] = [b.x0 - pad, b.y0 - pad, b.x1 + pad, b.y1 + pad];
    verts.push(x0, y0, ...color, x1, y0, ...color, x1, y1, ...color);
    verts.push(x0, y0, ...color, x1, y1, ...color, x0, y1, ...color);
  }
  return new Float32Array(verts);
}
