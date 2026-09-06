import * as THREE from "three/webgpu";

import { attribute, cos, mix, positionLocal, sin, varying, vec3, vec4 } from "three/tsl";
import { PhotorealCrowd } from "@packages/photoreal-renderer/src/battle/crowdLayer";
import type { CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { loadAppearanceCatalog } from "@packages/soldier-assets/src/appearanceBundle";

import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";

import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";

import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";

import { createPhotorealStatsPublisher } from "@packages/photoreal-renderer/src/stats";

import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";

import {
  type PhotorealRouteContext,
  YAW,
  camera3dFor,
  canvasSize,
  startLoop,
} from "../labPhotoreal";

const CROWD_CAMERAS = {
  mid: { target: [0, 40, 0], distance: 380, pitch: 0.8, yaw: YAW, fovY: 0.68, near: 1, far: 8000 },
  vista: {
    target: [0, 90, 0],
    distance: 210,
    pitch: 0.3,
    yaw: YAW,
    fovY: 0.83,
    near: 1,
    far: 8000,
  },
} as const;

// Deterministic LCG so fixed-time frames (and their snapshots) are stable.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function inFormation(x: number, y: number): boolean {
  return Math.abs(x) < 115 && (Math.abs(y - 70) < 55 || Math.abs(y + 70) < 55);
}

function buildSoldiers(count: number): CrowdInstance[] {
  // Two blocks retain the original 190-column layout and deterministic phase spread.
  const half = Math.floor(count / 2);
  const cols = 190;
  const rows = Math.ceil(half / cols);
  const rowOff = (rows - 1) / 2;
  const rng = makeRng(20260702);
  const instances: CrowdInstance[] = [];
  for (let block = 0; block < 2; block++) {
    const center = block === 0 ? -70 : 70;
    // Production instances express world heading; mesh +Y corresponds to PI/2.
    const facing = block === 0 ? Math.PI / 2 : -Math.PI / 2;
    const sign = block === 0 ? 1 : -1;
    for (let i = 0; i < half && instances.length < count; i++) {
      const col = i % cols,
        row = Math.floor(i / cols);
      const phase = rng();
      instances.push({
        x: (col - 94.5) * 1.15,
        y: center + sign * (row - rowOff) * 1.15,
        facing,
        classId: 0,
        faction: block === 0 ? 0 : 1,
        alive: true,
        frame: 1,
        clip: "march",
        phase,
        seed: phase,
        mounted: false,
        lod: 0,
        elevation: 0,
      });
    }
  }
  return instances;
}

function buildGrass(world: PhotorealWorld, count: number): { mesh: THREE.Mesh; placed: number } {
  const geo = new THREE.InstancedBufferGeometry();
  // Tapered blade in the XZ plane, z-up: 0.08 wide at the root, 0.9 tall.
  const positions = new Float32Array([-0.04, 0, 0, 0.04, 0, 0, 0.012, 0, 0.9, -0.012, 0, 0.9]);
  const heights = new Float32Array([0, 0, 1, 1]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("bladeH", new THREE.BufferAttribute(heights, 1));
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const rng = makeRng(90210);
  const data = new Float32Array(count * 4); // x, y, yaw, scale
  const cols = new Float32Array(count * 3);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 20) {
    guard += 1;
    const x = -450 + rng() * 900;
    const y = -150 + rng() * 1050;
    if (inFormation(x, y)) continue;
    const o = placed * 4;
    data[o] = x;
    data[o + 1] = y;
    data[o + 2] = rng() * Math.PI * 2;
    data[o + 3] = 0.7 + rng() * 0.6;
    cols[placed * 3] = 0.35 + rng() * 0.15;
    cols[placed * 3 + 1] = 0.42 + rng() * 0.13;
    cols[placed * 3 + 2] = 0.16 + rng() * 0.08;
    placed += 1;
  }
  geo.setAttribute("gData", new THREE.InstancedBufferAttribute(data.subarray(0, placed * 4), 4));
  geo.setAttribute("gCol", new THREE.InstancedBufferAttribute(cols.subarray(0, placed * 3), 3));
  geo.instanceCount = placed;

  // Unlit: bakes a root-shadow/sun-tip gradient instead of per-pixel lighting.
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const gData = attribute<"vec4">("gData", "vec4");
  const gCol = attribute<"vec3">("gCol", "vec3");
  const hf = attribute<"float">("bladeH", "float");
  const cy = cos(gData.z);
  const sy = sin(gData.z);
  const local = positionLocal.mul(gData.w);
  const rx = local.x.mul(cy).sub(local.y.mul(sy));
  const ry = local.x.mul(sy).add(local.y.mul(cy));
  const sway = hf
    .mul(hf)
    .mul(0.14)
    .mul(sin(world.uTime.mul(1.6).add(gData.x.mul(0.3)).add(gData.y.mul(0.17))));
  material.positionNode = vec3(gData.x.add(rx).add(sway), gData.y.add(ry), local.z);
  const lightFactor = mix(0.55, 1.05, hf);
  material.colorNode = varying(vec4(gCol.mul(lightFactor).mul(vec3(1.0, 0.97, 0.85)), 1.0));

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, placed };
}

// Concatenate indexed position/normal geometries into one, painting each part a
// flat vertex colour (a hand-rolled mergeGeometries — the three addon needs an
// alias into web/node_modules and types of its own; two-part trees don't).
function mergeColoredParts(
  parts: { geo: THREE.BufferGeometry; rgb: [number, number, number] }[],
): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const { geo } of parts) {
    vertexCount += geo.getAttribute("position").count;
    indexCount += geo.getIndex()?.count ?? 0;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vo = 0;
  let io = 0;
  for (const { geo, rgb } of parts) {
    const pos = geo.getAttribute("position");
    const nrm = geo.getAttribute("normal");
    const idx = geo.getIndex();
    positions.set(pos.array as Float32Array, vo * 3);
    normals.set(nrm.array as Float32Array, vo * 3);
    for (let i = 0; i < pos.count; i++) colors.set(rgb, (vo + i) * 3);
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo;
      io += idx.count;
    }
    vo += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function treeGeometry(kind: "conifer" | "broadleaf"): THREE.BufferGeometry {
  const trunkBrown: [number, number, number] = [0.3, 0.2, 0.11];
  if (kind === "conifer") {
    return mergeColoredParts([
      {
        geo: new THREE.ConeGeometry(1.7, 5.8, 8).rotateX(Math.PI / 2).translate(0, 0, 2.2 + 2.9),
        rgb: [0.12, 0.24, 0.11],
      },
      {
        geo: new THREE.CylinderGeometry(0.3, 0.42, 2.4, 6)
          .rotateX(Math.PI / 2)
          .translate(0, 0, 1.2),
        rgb: trunkBrown,
      },
    ]);
  }
  return mergeColoredParts([
    {
      geo: new THREE.SphereGeometry(2.1, 10, 8).rotateX(Math.PI / 2).translate(0, 0, 4.4),
      rgb: [0.2, 0.32, 0.13],
    },
    {
      geo: new THREE.CylinderGeometry(0.34, 0.48, 3.4, 6).rotateX(Math.PI / 2).translate(0, 0, 1.7),
      rgb: trunkBrown,
    },
  ]);
}

function buildTrees(total: number): { meshes: THREE.InstancedMesh[]; placed: number } {
  const rng = makeRng(777001);
  const counts = [Math.round(total * 0.6), total - Math.round(total * 0.6)];
  const kinds: ("conifer" | "broadleaf")[] = ["conifer", "broadleaf"];
  const meshes: THREE.InstancedMesh[] = [];
  const material = new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
  });
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  let placed = 0;
  for (let k = 0; k < 2; k++) {
    const mesh = new THREE.InstancedMesh(treeGeometry(kinds[k]), material, counts[k]);
    let i = 0;
    let guard = 0;
    while (i < counts[k] && guard < counts[k] * 30) {
      guard += 1;
      const x = -450 + rng() * 900;
      const y = -150 + rng() * 1050;
      if (inFormation(x, y)) continue;
      quat.setFromAxisAngle(zAxis, rng() * Math.PI * 2);
      const s = 0.7 + rng() * 0.7;
      m4.compose(new THREE.Vector3(x, y, 0), quat, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m4);
      i += 1;
    }
    mesh.count = i;
    placed += i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return { meshes, placed };
}

export async function route(ctx: PhotorealRouteContext) {
  const soldierCount = Math.max(2, Number(ctx.params.get("count")) || 30400);
  const grassCount = Math.max(0, Number(ctx.params.get("grass")) || 200000);
  const treeCount = Math.max(0, Number(ctx.params.get("trees")) || 3000);
  const camName = ctx.params.get("cam") === "vista" ? "vista" : "mid";

  const [world, assets] = await Promise.all([
    PhotorealWorld.create(ctx.canvas),
    loadAppearanceCatalog(new URL("/assets/soldiers/catalog.json", location.href).href),
  ]);
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(CROWD_CAMERAS[camName], width / height));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1500),
    new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.42, 0.44, 0.26),
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  ground.position.set(0, 450, 0);
  world.scene.add(ground);

  const instances = buildSoldiers(soldierCount);
  const soldiers = instances.length;
  const crowd = await PhotorealCrowd.create(world.renderer, world.scene, assets);
  const march = assets[0].animation.clips.find((clip) => clip.name === "march");
  if (!march || march.duration <= 0) throw new Error("Crowd fixture requires a timed march clip");

  const { mesh: grassMesh, placed: grassBlades } = buildGrass(world, grassCount);
  world.scene.add(grassMesh);

  const { meshes: treeMeshes, placed: trees } = buildTrees(treeCount);
  for (const tree of treeMeshes) world.scene.add(tree);

  const publish = createPhotorealStatsPublisher(world, "photoreal-crowd", () => ({
    cameraPreset: camName,
    soldierRenderer: "production-crowd",
    soldierAssets: "complete-catalog",
    appearanceIds: Object.keys(assets).map(Number),
    crowd: crowd.stats(),
    soldiers,
    trees,
    grassBlades,
  }));
  startLoop(world, ctx.params, (now) => {
    for (const instance of instances)
      instance.phase = (instance.seed + world.uTime.value / march.duration) % 1;
    // Full-detail submission preserves this substrate benchmark's workload; production owns the skin/material path.
    crowd.upload(instances);
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-crowd (${s.substrate})</td></tr>
      <tr><td>environment</td><td>${s.environment}</td></tr>
      <tr><td>camera</td><td>${camName}</td></tr>
      <tr><td>soldiers</td><td>${soldiers}</td></tr>
      <tr><td>grass blades</td><td>${grassBlades}</td></tr>
      <tr><td>trees</td><td>${trees}</td></tr>
      <tr><td>median ms</td><td>${s.stats.medianMs?.toFixed(2) ?? "warmup"}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? "pending"}</td></tr>
    </table>`;
  });
}
