// Bake-off probe: 30,400 VAT-skinned soldiers + 200k grass blades + 3k trees.
// Soldiers/grass: plain Mesh + InstancedBufferGeometry with the full per-instance
// transform done in TSL positionNode (no instanceMatrix buffer at all).
// Trees: classic InstancedMesh + setMatrixAt.
import * as THREE from 'three/webgpu';
import {
  attribute, cos, floor, fract, int, ivec2, mix, positionLocal, sin,
  textureLoad, time, transformNormalToView, varying, vec3, vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadPlaceholderVat } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshes } from '../../../packages/soldier-assets/src/soldierMesh';
import {
  addGoldenHourLights, createOrbitCamera, createRenderer, createStatsTracker,
  handleResize, HAZE_COLOR,
} from './shared';

type AnyGeometry = any;
type AnyMesh = any;
type AnyMaterial = any;

const CAM_PRESETS = {
  mid: { target: [0, 40, 0] as [number, number, number], distance: 380, yaw: -Math.PI / 2, pitch: 0.80, fovY: 0.68 },
  vista: { target: [0, 90, 0] as [number, number, number], distance: 210, yaw: -Math.PI / 2, pitch: 0.30, fovY: 0.83 },
  // Debug-only: close enough to eyeball VAT skinning; not part of the contract.
  close: { target: [0, -68, 1.4] as [number, number, number], distance: 14, yaw: -Math.PI / 2, pitch: 0.12, fovY: 0.8 },
};

const FACTION_BLUE: [number, number, number] = [0.20, 0.42, 0.88];
const FACTION_RED: [number, number, number] = [0.84, 0.24, 0.20];

// Deterministic LCG so screenshots are stable.
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

// --- soldiers -------------------------------------------------------------

function buildSoldierGeometry(count: number): { geo: AnyGeometry; placed: number } {
  const mesh = createPlaceholderSoldierMeshes(FACTION_BLUE)[0];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 4));
  geo.setAttribute('bone', new THREE.BufferAttribute(mesh.bones, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

  // Mark accent-colored vertices (shield/crest) so faction tint replaces them.
  const vcount = mesh.positions.length / 3;
  const accent = new Float32Array(vcount);
  for (let i = 0; i < vcount; i++) {
    const dr = Math.abs(mesh.colors[i * 4] - FACTION_BLUE[0]);
    const dg = Math.abs(mesh.colors[i * 4 + 1] - FACTION_BLUE[1]);
    const db = Math.abs(mesh.colors[i * 4 + 2] - FACTION_BLUE[2]);
    accent[i] = dr + dg + db < 0.01 ? 1 : 0;
  }
  geo.setAttribute('accent', new THREE.BufferAttribute(accent, 1));

  // Two blocks, 190 columns, spacing 1.15; block A (faction 0) at y=-70,
  // block B (faction 1) at y=+70.
  const half = Math.floor(count / 2);
  const cols = 190;
  const rows = Math.ceil(half / cols);
  // (row - 39.5) per spec at the default 80-row block; recentered for reduced
  // ?count= runs so both blocks stay in frame.
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

function buildSoldierMaterial(vat: { width: number; height: number; fps: number; data: number[]; clips: { name: string; start: number; frames: number }[] }, geo: AnyGeometry): AnyMaterial {
  const vatTex = new THREE.DataTexture(new Float32Array(vat.data), vat.width, vat.height, THREE.RGBAFormat, THREE.FloatType);
  vatTex.minFilter = THREE.NearestFilter;
  vatTex.magFilter = THREE.NearestFilter;
  vatTex.generateMipmaps = false;
  vatTex.needsUpdate = true;

  const clipDef = vat.clips.find((c) => c.name === 'march') ?? vat.clips[0];
  // Fill clipStart/clipFrames now that we know the clip.
  const clipAttr = geo.getAttribute('iClip');
  for (let i = 0; i < clipAttr.count; i++) {
    clipAttr.setX(i, clipDef.start);
    clipAttr.setY(i, clipDef.frames);
  }
  clipAttr.needsUpdate = true;
  const cycleHz = vat.fps / clipDef.frames;

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.0 });

  const iPose = attribute('iPose', 'vec4');
  const iClip = attribute('iClip', 'vec3');
  const bone = attribute('bone', 'float');
  const rawPos = attribute('position', 'vec3');
  const rawNrm = attribute('normal', 'vec3');
  const vcol = attribute('color', 'vec4');
  const accent = attribute('accent', 'float');

  const frame = iClip.x.add(floor(fract(iPose.w.add(time.mul(cycleHz))).mul(iClip.y.sub(1.0))));
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
  material.normalNode = varying(transformNormalToView(worldNrm)).normalize();

  const tint = mix(vec3(...FACTION_BLUE), vec3(...FACTION_RED), iClip.z);
  material.colorNode = varying(vec4(mix(vcol.rgb, tint, accent), 1.0));
  return material;
}

// --- grass ----------------------------------------------------------------

function buildGrass(count: number): { mesh: AnyMesh; placed: number } {
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
  const gData = attribute('gData', 'vec4');
  const gCol = attribute('gCol', 'vec3');
  const hf = attribute('bladeH', 'float');
  const cy = cos(gData.z);
  const sy = sin(gData.z);
  const local = positionLocal.mul(gData.w);
  const rx = local.x.mul(cy).sub(local.y.mul(sy));
  const ry = local.x.mul(sy).add(local.y.mul(cy));
  const sway = hf.mul(hf).mul(0.14).mul(sin(time.mul(1.6).add(gData.x.mul(0.3)).add(gData.y.mul(0.17))));
  material.positionNode = vec3(gData.x.add(rx).add(sway), gData.y.add(ry), local.z);
  const lightFactor = mix(0.55, 1.05, hf);
  material.colorNode = varying(vec4(gCol.mul(lightFactor).mul(vec3(1.0, 0.97, 0.85)), 1.0));

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, placed };
}

// --- trees ----------------------------------------------------------------

function colorize(geo: AnyGeometry, rgb: [number, number, number]): AnyGeometry {
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function treeGeometry(kind: 'conifer' | 'broadleaf'): AnyGeometry {
  const trunkBrown: [number, number, number] = [0.30, 0.20, 0.11];
  if (kind === 'conifer') {
    const foliage = colorize(new THREE.ConeGeometry(1.7, 5.8, 8).rotateX(Math.PI / 2).translate(0, 0, 2.2 + 2.9), [0.12, 0.24, 0.11]);
    const trunk = colorize(new THREE.CylinderGeometry(0.30, 0.42, 2.4, 6).rotateX(Math.PI / 2).translate(0, 0, 1.2), trunkBrown);
    return mergeGeometries([foliage, trunk]);
  }
  const foliage = colorize(new THREE.SphereGeometry(2.1, 10, 8).rotateX(Math.PI / 2).translate(0, 0, 4.4), [0.20, 0.32, 0.13]);
  const trunk = colorize(new THREE.CylinderGeometry(0.34, 0.48, 3.4, 6).rotateX(Math.PI / 2).translate(0, 0, 1.7), trunkBrown);
  return mergeGeometries([foliage, trunk]);
}

function buildTrees(total: number): { meshes: AnyMesh[]; placed: number } {
  const rng = makeRng(777001);
  const counts = [Math.round(total * 0.6), total - Math.round(total * 0.6)];
  const kinds: ('conifer' | 'broadleaf')[] = ['conifer', 'broadleaf'];
  const meshes: AnyMesh[] = [];
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  let placed = 0;
  for (let k = 0; k < 2; k++) {
    const mesh = new THREE.InstancedMesh(treeGeometry(kinds[k]), mat, counts[k]);
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

// --- page -----------------------------------------------------------------

async function main() {
  const params = new URLSearchParams(location.search);
  const soldierCount = Math.max(2, Number(params.get('count')) || 30400);
  const grassCount = Math.max(0, Number(params.get('grass')) || 200000);
  const treeCount = Math.max(0, Number(params.get('trees')) || 3000);
  const camParam = params.get('cam');
  const camName = camParam === 'vista' || camParam === 'close' ? camParam : 'mid';

  const [renderer, vat] = await Promise.all([createRenderer(), loadPlaceholderVat()]);
  const scene = new THREE.Scene();
  const camera = createOrbitCamera(CAM_PRESETS[camName], window.innerWidth / window.innerHeight, 8000);
  addGoldenHourLights(scene);
  scene.background = HAZE_COLOR.clone();
  scene.fog = new THREE.Fog(HAZE_COLOR.clone(), 700, 3600);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1500),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.42, 0.44, 0.26), roughness: 1.0, metalness: 0.0 }),
  );
  ground.position.set(0, 450, 0);
  scene.add(ground);

  const { geo: soldierGeo, placed: soldiers } = buildSoldierGeometry(soldierCount);
  const soldierMat = buildSoldierMaterial(vat, soldierGeo);
  const soldierMesh = new THREE.Mesh(soldierGeo, soldierMat);
  soldierMesh.frustumCulled = false;
  scene.add(soldierMesh);

  const { mesh: grassMesh, placed: grassBlades } = buildGrass(grassCount);
  scene.add(grassMesh);

  const { meshes: treeMeshes, placed: trees } = buildTrees(treeCount);
  for (const t of treeMeshes) scene.add(t);

  handleResize(renderer, camera);
  const tick = createStatsTracker('three-crowd', renderer, {
    cameraPreset: camName,
    soldiers,
    trees,
    grassBlades,
  });

  const loop = (now: number) => {
    renderer.render(scene, camera);
    tick(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error('[three-crowd] fatal', err);
  document.body.textContent = String(err);
});
