// Photoreal ladder lab routes (slice 07): the 06 bake-off's verdict-grade
// three.js probes, promoted onto the packages/photoreal-renderer substrate
// (PhotorealWorld + cameraBridge + environment + stats):
//   /renderer/photoreal-pbr    — 7×7 metal×roughness sphere grid under real
//                                PMREM IBL from the golden preset.
//   /renderer/photoreal-crowd  — 30,400 VAT-skinned soldiers + 200k grass
//                                blades + 3k trees (?cam=mid|vista, ?count= up
//                                to the 60k stress mode, ?t= fixed time).
// All animation keys off PhotorealWorld.setTime — the TSL `time` node is banned
// (byte-determinism; see packages/photoreal-renderer/src/world.ts).
import * as THREE from 'three/webgpu';
import {
  attribute, cos, floor, fract, int, ivec2, mix, positionLocal, sin,
  textureLoad, transformNormalToView, varying, vec3, vec4,
} from 'three/tsl';
import { PhotorealWorld } from '../../../packages/photoreal-renderer/src/world';
import { BattlePostChain } from '../../../packages/photoreal-renderer/src/post/postChain';
import { applyCamera3d } from '../../../packages/photoreal-renderer/src/cameraBridge';
import { applyCivsimEnvironment } from '../../../packages/photoreal-renderer/src/environment';
import { createPhotorealStatsPublisher } from '../../../packages/photoreal-renderer/src/stats';
import { CIVSIM_ENVIRONMENTS } from '../../../packages/game-renderer/src/environment/environment';
import type { Camera3DParams } from '../../../packages/renderer-core/src/camera3d';
import { loadPlaceholderVat } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../packages/soldier-assets/src/soldierMesh';
import type { VatBake } from '../../../packages/soldier-assets/src/schema';

interface PhotorealRouteContext {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

// Camera presets carried over from the 06 bake-off contract (same framing the
// verdict shots and frame-time tables were judged at). Aspect is filled from
// the live canvas; only applyCamera3d may turn these into a three camera pose.
const YAW = -Math.PI / 2; // eye south of target, looking north (+y)
const PBR_CAMERA = { target: [0, 0, 2], distance: 42, pitch: 0.5, yaw: YAW, fovY: 0.7, near: 1, far: 5000 } as const;
const SHADOW_PROBE_CAMERA = { target: [0, 0, 1.5], distance: 34, pitch: 0.58, yaw: -2.35, fovY: 0.72, near: 0.1, far: 500 } as const;
const CROWD_CAMERAS = {
  mid: { target: [0, 40, 0], distance: 380, pitch: 0.8, yaw: YAW, fovY: 0.68, near: 1, far: 8000 },
  vista: { target: [0, 90, 0], distance: 210, pitch: 0.3, yaw: YAW, fovY: 0.83, near: 1, far: 8000 },
} as const;

const FACTION_BLUE: [number, number, number] = [0.20, 0.42, 0.88];
const FACTION_RED: [number, number, number] = [0.84, 0.24, 0.20];

function camera3dFor(
  preset: { target: readonly number[]; distance: number; pitch: number; yaw: number; fovY: number; near: number; far: number },
  aspect: number,
): Camera3DParams {
  return {
    target: [preset.target[0], preset.target[1], preset.target[2]],
    distance: preset.distance,
    pitch: preset.pitch,
    yaw: preset.yaw,
    fovY: preset.fovY,
    aspect,
    near: preset.near,
    far: preset.far,
  };
}

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  return { width: canvas.clientWidth || 1000, height: canvas.clientHeight || 600 };
}

// Deterministic LCG so fixed-time frames (and their snapshots) are stable.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function startLoop(world: PhotorealWorld, params: URLSearchParams, frame: (nowMs: number) => void) {
  const fixedT = params.has('t') ? Number(params.get('t')) : null;
  const t0 = performance.now();
  const loop = (now: number) => {
    world.setTime(fixedT ?? (now - t0) / 1000);
    frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// /renderer/photoreal-pbr — metal by row (south→north 0→1), roughness by column
// (west→east 0.05→1), bronze dielectric base over a neutral ground plane, lit
// by the golden preset's sun + real PMREM IBL.

export async function routePhotorealPbr(ctx: PhotorealRouteContext) {
  const world = await PhotorealWorld.create(ctx.canvas);
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(PBR_CAMERA, width / height));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.45, 0.42, 0.34), roughness: 0.95, metalness: 0.0 }),
  );
  world.scene.add(ground);

  const grid = 7;
  const spacing = 4.0;
  const sphereGeo = new THREE.SphereGeometry(1.5, 48, 32);
  const baseColor = new THREE.Color(0.72, 0.45, 0.20);
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const material = new THREE.MeshStandardNodeMaterial({
        color: baseColor.clone(),
        metalness: row / (grid - 1),
        roughness: 0.05 + (col / (grid - 1)) * 0.95,
      });
      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.position.set((col - (grid - 1) / 2) * spacing, (row - (grid - 1) / 2) * spacing, 2);
      world.scene.add(mesh);
    }
  }

  const spheres = grid * grid;
  const publish = createPhotorealStatsPublisher(world, 'photoreal-pbr', () => ({ spheres }));
  startLoop(world, ctx.params, (now) => {
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-pbr (${s.substrate})</td></tr>
      <tr><td>environment</td><td>${s.environment}</td></tr>
      <tr><td>spheres</td><td>${spheres}</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr>
    </table>`;
  });
}

// ---------------------------------------------------------------------------
// /renderer/photoreal-shadow-probe — minimal three/WebGPU shadow sampler probe.
// Use:
//   ?post=off           direct renderer.render(scene,camera)
//   ?post=on            same scene through BattlePostChain's pass() pipeline
//   ?shadows=off        light.castShadow=false and renderer shadow map disabled
//   ?shadows=on         shadow map enabled before post construction (default)
//   ?shadows=late       disable during post construction, enable before first render

export async function routePhotorealShadowProbe(ctx: PhotorealRouteContext) {
  const world = await PhotorealWorld.create(ctx.canvas, { antialias: false });
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(SHADOW_PROBE_CAMERA, width / height));

  const postEnabled = ctx.params.get('post') === 'on';
  const shadowMode = ctx.params.get('shadows') ?? 'on';
  const lateEnable = shadowMode === 'late';
  const shadowsEnabled = shadowMode !== 'off';
  if (!shadowsEnabled || lateEnable) world.renderer.shadowMap.enabled = false;
  world.renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = world.scene;
  scene.background = new THREE.Color(0.78, 0.84, 0.92);
  scene.add(new THREE.HemisphereLight(new THREE.Color(0.9, 0.96, 1.0), new THREE.Color(0.35, 0.3, 0.22), 0.35));

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.62), 4.0);
  sun.position.set(-14, -10, 22);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadowsEnabled;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.00003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.64, 0.58, 0.42),
      roughness: 0.92,
      metalness: 0,
    }),
  );
  ground.name = 'shadow-probe-ground';
  ground.receiveShadow = true;
  scene.add(ground);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(4, 4, 5),
    new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.72, 0.24, 0.14),
      roughness: 0.75,
      metalness: 0,
    }),
  );
  box.name = 'shadow-probe-caster';
  box.position.set(0, 0, 2.5);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  if (postEnabled) {
    const post = new BattlePostChain(world.renderer, scene, camera);
    post.enabled = true;
    post.setBloomEnabled(false);
    world.post = post;
  }

  if (lateEnable) {
    world.renderer.shadowMap.enabled = true;
    sun.castShadow = true;
  }

  const publish = createPhotorealStatsPublisher(world, 'photoreal-shadow-probe', () => ({
    post: postEnabled ? 'on' : 'off',
    shadows: shadowMode,
    rendererShadowMapEnabled: world.renderer.shadowMap.enabled,
    sunCastShadow: sun.castShadow,
    sunShadowMapAllocated: Boolean(sun.shadow.map),
  }));
  startLoop(world, ctx.params, (now) => {
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-shadow-probe</td></tr>
      <tr><td>post</td><td>${postEnabled ? 'on' : 'off'}</td></tr>
      <tr><td>shadows</td><td>${shadowMode}</td></tr>
      <tr><td>shadow map</td><td>${world.renderer.shadowMap.enabled ? 'enabled' : 'disabled'} / ${sun.shadow.map ? 'allocated' : 'pending'}</td></tr>
      <tr><td>draw calls</td><td>${s.stats.drawCalls}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr>
    </table>`;
  });
}

// ---------------------------------------------------------------------------
// /renderer/photoreal-crowd — soldiers and grass are plain Mesh +
// InstancedBufferGeometry with the whole per-instance transform done in the TSL
// positionNode. TRAP (from the 06 verdict): a custom positionNode silently
// DISCARDS InstancedMesh's `instanceMatrix` (which is also zero-initialized, so
// naive code renders nothing) — never mix a custom positionNode with
// InstancedMesh; own the instance attributes instead. Trees use classic
// InstancedMesh + setMatrixAt (default position pipeline, so instanceMatrix works).

function inFormation(x: number, y: number): boolean {
  return Math.abs(x) < 115 && (Math.abs(y - 70) < 55 || Math.abs(y + 70) < 55);
}

function buildSoldierGeometry(count: number): { geo: THREE.InstancedBufferGeometry; placed: number } {
  const mesh = createPlaceholderSoldierMeshes(FACTION_BLUE)[0];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 4));
  geo.setAttribute('bone', new THREE.BufferAttribute(mesh.bones, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

  // Mark the authored upper sword-arm band so the faction tint replaces only it.
  const vcount = mesh.positions.length / 3;
  const accent = new Float32Array(vcount);
  for (let i = 0; i < vcount; i++) {
    const dr = Math.abs(mesh.colors[i * 4] - FACTION_BLUE[0]);
    const dg = Math.abs(mesh.colors[i * 4 + 1] - FACTION_BLUE[1]);
    const db = Math.abs(mesh.colors[i * 4 + 2] - FACTION_BLUE[2]);
    accent[i] = dr + dg + db < 0.01 ? 1 : 0;
  }
  geo.setAttribute('accent', new THREE.BufferAttribute(accent, 1));

  // Two formation blocks, 190 columns, spacing 1.15; block A (faction 0) at
  // y=-70, block B (faction 1) at y=+70; recentered for reduced ?count= runs.
  const half = Math.floor(count / 2);
  const cols = 190;
  const rows = Math.ceil(half / cols);
  const rowOff = (rows - 1) / 2;
  const rng = makeRng(20260702);
  const pose = new Float32Array(count * 4); // worldX, worldY, facing, phase
  const clip = new Float32Array(count * 3); // clipStart, clipFrames, faction
  let placed = 0;
  for (let block = 0; block < 2; block++) {
    const center = block === 0 ? -70 : 70;
    const facing = block === 0 ? 0 : Math.PI; // mesh forward is +Y
    const sign = block === 0 ? 1 : -1;
    for (let i = 0; i < half && placed < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const o = placed * 4;
      pose[o] = (col - 94.5) * 1.15;
      pose[o + 1] = center + sign * (row - rowOff) * 1.15;
      pose[o + 2] = facing;
      pose[o + 3] = rng();
      clip[placed * 3 + 2] = block;
      placed += 1;
    }
  }
  geo.setAttribute('iPose', new THREE.InstancedBufferAttribute(pose.subarray(0, placed * 4), 4));
  geo.setAttribute('iClip', new THREE.InstancedBufferAttribute(clip.subarray(0, placed * 3), 3));
  geo.instanceCount = placed;
  return { geo, placed };
}

function buildSoldierMaterial(world: PhotorealWorld, vat: VatBake, geo: THREE.InstancedBufferGeometry) {
  const vatTex = new THREE.DataTexture(new Float32Array(vat.data), vat.width, vat.height, THREE.RGBAFormat, THREE.FloatType);
  vatTex.minFilter = THREE.NearestFilter;
  vatTex.magFilter = THREE.NearestFilter;
  vatTex.generateMipmaps = false;
  vatTex.needsUpdate = true;

  const clipDef = vat.clips.find((c) => c.name === 'march') ?? vat.clips[0];
  const clipAttr = geo.getAttribute('iClip');
  for (let i = 0; i < clipAttr.count; i++) {
    clipAttr.setX(i, clipDef.start);
    clipAttr.setY(i, clipDef.frames);
  }
  clipAttr.needsUpdate = true;
  const cycleHz = vat.fps / clipDef.frames;

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.0 });

  // Explicit generics: @types/three widens the inferred node type to `string`
  // otherwise, losing the swizzle/operator surface.
  const iPose = attribute<'vec4'>('iPose', 'vec4');
  const iClip = attribute<'vec3'>('iClip', 'vec3');
  const bone = attribute<'float'>('bone', 'float');
  const rawPos = attribute<'vec3'>('position', 'vec3');
  const rawNrm = attribute<'vec3'>('normal', 'vec3');
  const vcol = attribute<'vec4'>('color', 'vec4');
  const accent = attribute<'float'>('accent', 'float');

  const frame = iClip.x.add(floor(fract(iPose.w.add(world.uTime.mul(cycleHz))).mul(iClip.y.sub(1.0))));
  const col = int(frame);
  const row0 = int(bone).mul(4);
  // 4 consecutive texel rows = the 4 columns of the bone's mat4 at this frame.
  const c0 = textureLoad(vatTex, ivec2(col, row0));
  const c1 = textureLoad(vatTex, ivec2(col, row0.add(1)));
  const c2 = textureLoad(vatTex, ivec2(col, row0.add(2)));
  const c3 = textureLoad(vatTex, ivec2(col, row0.add(3)));
  const sp = c0.mul(rawPos.x).add(c1.mul(rawPos.y)).add(c2.mul(rawPos.z)).add(c3).xyz.toVar();
  const sn = c0.mul(rawNrm.x).add(c1.mul(rawNrm.y)).add(c2.mul(rawNrm.z)).xyz.toVar();

  const cf = cos(iPose.z);
  const sf = sin(iPose.z);
  material.positionNode = vec3(
    sp.x.mul(cf).sub(sp.y.mul(sf)).add(iPose.x),
    sp.x.mul(sf).add(sp.y.mul(cf)).add(iPose.y),
    sp.z,
  );
  const worldNrm = vec3(
    sn.x.mul(cf).sub(sn.y.mul(sf)),
    sn.x.mul(sf).add(sn.y.mul(cf)),
    sn.z,
  );
  // normalNode expects a VIEW-space normal (documented nowhere upstream):
  // transformNormalToView in the vertex stage + varying() to interpolate it.
  material.normalNode = varying(transformNormalToView(worldNrm)).normalize();

  const tint = mix(vec3(...FACTION_BLUE), vec3(...FACTION_RED), iClip.z);
  const armBand = mix(tint, vec3(0.42, 0.34, 0.26), 0.35);
  material.colorNode = varying(vec4(mix(vcol.rgb, armBand, accent), 1.0));
  return material;
}

function buildGrass(world: PhotorealWorld, count: number): { mesh: THREE.Mesh; placed: number } {
  const geo = new THREE.InstancedBufferGeometry();
  // Tapered blade in the XZ plane, z-up: 0.08 wide at the root, 0.9 tall.
  const positions = new Float32Array([
    -0.04, 0, 0, 0.04, 0, 0, 0.012, 0, 0.9, -0.012, 0, 0.9,
  ]);
  const heights = new Float32Array([0, 0, 1, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('bladeH', new THREE.BufferAttribute(heights, 1));
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
  geo.setAttribute('gData', new THREE.InstancedBufferAttribute(data.subarray(0, placed * 4), 4));
  geo.setAttribute('gCol', new THREE.InstancedBufferAttribute(cols.subarray(0, placed * 3), 3));
  geo.instanceCount = placed;

  // Unlit: bakes a root-shadow/sun-tip gradient instead of per-pixel lighting.
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const gData = attribute<'vec4'>('gData', 'vec4');
  const gCol = attribute<'vec3'>('gCol', 'vec3');
  const hf = attribute<'float'>('bladeH', 'float');
  const cy = cos(gData.z);
  const sy = sin(gData.z);
  const local = positionLocal.mul(gData.w);
  const rx = local.x.mul(cy).sub(local.y.mul(sy));
  const ry = local.x.mul(sy).add(local.y.mul(cy));
  const sway = hf.mul(hf).mul(0.14).mul(sin(world.uTime.mul(1.6).add(gData.x.mul(0.3)).add(gData.y.mul(0.17))));
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
function mergeColoredParts(parts: { geo: THREE.BufferGeometry; rgb: [number, number, number] }[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const { geo } of parts) {
    vertexCount += geo.getAttribute('position').count;
    indexCount += geo.getIndex()?.count ?? 0;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vo = 0;
  let io = 0;
  for (const { geo, rgb } of parts) {
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
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
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function treeGeometry(kind: 'conifer' | 'broadleaf'): THREE.BufferGeometry {
  const trunkBrown: [number, number, number] = [0.30, 0.20, 0.11];
  if (kind === 'conifer') {
    return mergeColoredParts([
      { geo: new THREE.ConeGeometry(1.7, 5.8, 8).rotateX(Math.PI / 2).translate(0, 0, 2.2 + 2.9), rgb: [0.12, 0.24, 0.11] },
      { geo: new THREE.CylinderGeometry(0.30, 0.42, 2.4, 6).rotateX(Math.PI / 2).translate(0, 0, 1.2), rgb: trunkBrown },
    ]);
  }
  return mergeColoredParts([
    { geo: new THREE.SphereGeometry(2.1, 10, 8).rotateX(Math.PI / 2).translate(0, 0, 4.4), rgb: [0.20, 0.32, 0.13] },
    { geo: new THREE.CylinderGeometry(0.34, 0.48, 3.4, 6).rotateX(Math.PI / 2).translate(0, 0, 1.7), rgb: trunkBrown },
  ]);
}

function buildTrees(total: number): { meshes: THREE.InstancedMesh[]; placed: number } {
  const rng = makeRng(777001);
  const counts = [Math.round(total * 0.6), total - Math.round(total * 0.6)];
  const kinds: ('conifer' | 'broadleaf')[] = ['conifer', 'broadleaf'];
  const meshes: THREE.InstancedMesh[] = [];
  const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
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

export async function routePhotorealCrowd(ctx: PhotorealRouteContext) {
  const soldierCount = Math.max(2, Number(ctx.params.get('count')) || 30400);
  const grassCount = Math.max(0, Number(ctx.params.get('grass')) || 200000);
  const treeCount = Math.max(0, Number(ctx.params.get('trees')) || 3000);
  const camName = ctx.params.get('cam') === 'vista' ? 'vista' : 'mid';

  const [world, vat] = await Promise.all([PhotorealWorld.create(ctx.canvas), loadPlaceholderVat()]);
  const { width, height } = canvasSize(ctx.canvas);
  world.resize(width, height, Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, camera3dFor(CROWD_CAMERAS[camName], width / height));
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1500),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.42, 0.44, 0.26), roughness: 1.0, metalness: 0.0 }),
  );
  ground.position.set(0, 450, 0);
  world.scene.add(ground);

  const { geo: soldierGeo, placed: soldiers } = buildSoldierGeometry(soldierCount);
  const soldierMesh = new THREE.Mesh(soldierGeo, buildSoldierMaterial(world, vat, soldierGeo));
  soldierMesh.frustumCulled = false;
  world.scene.add(soldierMesh);

  const { mesh: grassMesh, placed: grassBlades } = buildGrass(world, grassCount);
  world.scene.add(grassMesh);

  const { meshes: treeMeshes, placed: trees } = buildTrees(treeCount);
  for (const tree of treeMeshes) world.scene.add(tree);

  const publish = createPhotorealStatsPublisher(world, 'photoreal-crowd', () => ({
    cameraPreset: camName,
    soldiers,
    trees,
    grassBlades,
  }));
  startLoop(world, ctx.params, (now) => {
    world.render(camera);
    const s = publish(now);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>photoreal-crowd (${s.substrate})</td></tr>
      <tr><td>environment</td><td>${s.environment}</td></tr>
      <tr><td>camera</td><td>${camName}</td></tr>
      <tr><td>soldiers</td><td>${soldiers}</td></tr>
      <tr><td>grass blades</td><td>${grassBlades}</td></tr>
      <tr><td>trees</td><td>${trees}</td></tr>
      <tr><td>median ms</td><td>${s.stats.medianMs?.toFixed(2) ?? 'warmup'}</td></tr>
      <tr><td>gpu ms</td><td>${s.stats.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr>
    </table>`;
  });
}
