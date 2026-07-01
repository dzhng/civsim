// Bake-off probe: Bronze-Age Aegean open sea to a real horizon.
// Custom TSL water (WaterMesh in r185 needs a normal-map texture asset and a
// planar reflector — wrong register and wrong cost for this probe), plus a
// custom gradient sky dome so the horizon seam is exactly the haze color.
import * as THREE from 'three/webgpu';
import {
  Fn, cameraPosition, clamp, cos, dot, float, length, max, mix, normalize,
  positionLocal, positionWorld, pow, reflect, sin, smoothstep, time, vec3, vec4,
} from 'three/tsl';
import {
  addGoldenHourLights, createOrbitCamera, createRenderer, createStatsTracker,
  handleResize, HAZE_COLOR, SUN_DIR,
} from './shared';

const PRESET = { target: [0, 140, 0] as [number, number, number], distance: 190, yaw: -Math.PI / 2, pitch: 0.22, fovY: 0.78 };

const sunDir = vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);

// Zenith-to-haze gradient with a warm sun glow; shared by sky dome and water reflection.
const skyColor = Fn(([dir]: [ReturnType<typeof vec3>]) => {
  const d = normalize(dir);
  const zen = clamp(d.z, 0.0, 1.0);
  const haze = vec3(HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b);
  const zenith = vec3(0.19, 0.35, 0.64);
  const base = mix(haze, zenith, pow(zen, 0.75));
  const sunAmt = max(dot(d, sunDir), 0.0);
  const glow = vec3(1.0, 0.74, 0.44).mul(pow(sunAmt, 8.0).mul(0.4));
  const disc = vec3(1.0, 0.92, 0.72).mul(pow(sunAmt, 1400.0).mul(8.0));
  return base.add(glow).add(disc);
});

// 4 summed directional sine swells. Analytic height + gradient so the fragment
// normal is exact even where the vertex grid is coarse.
const WAVES = [
  { amp: 0.35, len: 34, dir: [0.94, 0.34], speed: 1.1 },
  { amp: 0.22, len: 21, dir: [-0.37, 0.93], speed: 1.5 },
  { amp: 0.12, len: 13, dir: [0.71, -0.71], speed: 2.0 },
  { amp: 0.06, len: 8, dir: [0.20, 0.98], speed: 2.6 },
];

const waveHeight = Fn(([xy]: [ReturnType<typeof vec3>]) => {
  let h = float(0.0);
  for (const w of WAVES) {
    const k = (Math.PI * 2) / w.len;
    const phase = xy.x.mul(k * w.dir[0]).add(xy.y.mul(k * w.dir[1])).add(time.mul(w.speed));
    h = h.add(sin(phase).mul(w.amp));
  }
  return h;
});

const waveNormal = Fn(([xy]: [ReturnType<typeof vec3>]) => {
  let ddx = float(0.0);
  let ddy = float(0.0);
  for (const w of WAVES) {
    const k = (Math.PI * 2) / w.len;
    const phase = xy.x.mul(k * w.dir[0]).add(xy.y.mul(k * w.dir[1])).add(time.mul(w.speed));
    const slope = cos(phase).mul(w.amp * k);
    ddx = ddx.add(slope.mul(w.dir[0]));
    ddy = ddy.add(slope.mul(w.dir[1]));
  }
  return normalize(vec3(ddx.negate(), ddy.negate(), 1.0));
});

async function main() {
  const renderer = await createRenderer();
  const scene = new THREE.Scene();
  const camera = createOrbitCamera(PRESET, window.innerWidth / window.innerHeight, 25000);
  addGoldenHourLights(scene);
  scene.fog = new THREE.Fog(HAZE_COLOR.clone(), 2500, 9500);

  // Sky dome — must meet the sea at a level horizon in exactly the haze color.
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  skyMat.fog = false;
  skyMat.colorNode = skyColor(normalize(positionWorld));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(11000, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // Water plane: XY plane at z=0 (PlaneGeometry is already XY facing +Z).
  const waterGeo = new THREE.PlaneGeometry(12000, 12000, 256, 256);
  const waterMat = new THREE.MeshBasicNodeMaterial();

  const distXY = length(positionLocal.xy.sub(cameraPosition.xy));
  const displaceFade = float(1.0).sub(smoothstep(600.0, 2200.0, distXY));
  waterMat.positionNode = vec3(positionLocal.x, positionLocal.y, waveHeight(positionLocal.xy).mul(displaceFade));

  const shading = Fn(() => {
    const n = waveNormal(positionWorld.xy);
    const v = normalize(cameraPosition.sub(positionWorld));
    const ndv = max(dot(n, v), 0.0);
    const fresnel = float(0.02).add(pow(float(1.0).sub(ndv), 5.0).mul(0.78));
    const r = reflect(v.negate(), n);
    const refl = skyColor(vec3(r.x, r.y, max(r.z, 0.03))).mul(0.82);
    // Depth turbidity: paler/greener near, deep blue-green far.
    const dist = length(positionWorld.xy.sub(cameraPosition.xy));
    const water = mix(vec3(0.05, 0.24, 0.24), vec3(0.012, 0.09, 0.15), smoothstep(40.0, 1400.0, dist));
    // Warm sun specular streak (Blinn lobe pair, GGX-ish tail).
    const h = normalize(v.add(sunDir));
    const ndh = max(dot(n, h), 0.0);
    const spec = pow(ndh, 720.0).mul(2.4).add(pow(ndh, 48.0).mul(0.12));
    const sunTint = vec3(1.0, 0.66, 0.34);
    return vec4(mix(water, refl, fresnel).add(sunTint.mul(spec)), 1.0);
  });
  waterMat.colorNode = shading();

  const water = new THREE.Mesh(waterGeo, waterMat);
  water.frustumCulled = false;
  scene.add(water);

  handleResize(renderer, camera);
  const tick = createStatsTracker('three-water', renderer);

  const loop = (now: number) => {
    renderer.render(scene, camera);
    tick(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error('[three-water] fatal', err);
  document.body.textContent = String(err);
});
