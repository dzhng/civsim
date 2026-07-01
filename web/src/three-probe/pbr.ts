// Bake-off probe: 7x7 PBR sphere grid (metalness by row, roughness by column)
// over a neutral ground plane, IBL from a procedural equirect environment.
import * as THREE from 'three/webgpu';
import {
  createOrbitCamera, createRenderer, createStatsTracker,
  handleResize, SUN_COLOR, SUN_DIR,
} from './shared';

const PRESET = { target: [0, 0, 2] as [number, number, number], distance: 42, yaw: -Math.PI / 2, pitch: 0.5, fovY: 0.7 };

// Procedural equirect environment, authored as f(worldDir) with our z-up world
// (altitude = dir.z, sun blob at the shared golden-hour direction), baked into
// three's y-up equirect parameterization so IBL lookups land correctly.
function makeEnvTexture() {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  const haze = [0.60, 0.56, 0.46];
  const zenith = [0.16, 0.28, 0.52];
  const ground = [0.20, 0.17, 0.12];
  const sun = [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const lat = (v - 0.5) * Math.PI; // dir.y = sin(lat), three equirect convention
    const dy = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const phi = (u - 0.5) * Math.PI * 2; // atan2(dir.z, dir.x)
      const dx = Math.cos(phi) * cosLat;
      const dz = Math.sin(phi) * cosLat;
      const alt = dz; // world up is +Z
      let r: number, g: number, b: number;
      if (alt >= 0) {
        const t = Math.pow(alt, 0.55);
        r = haze[0] + (zenith[0] - haze[0]) * t;
        g = haze[1] + (zenith[1] - haze[1]) * t;
        b = haze[2] + (zenith[2] - haze[2]) * t;
      } else {
        const t = Math.min(1, -alt / 0.35);
        r = haze[0] + (ground[0] - haze[0]) * t;
        g = haze[1] + (ground[1] - haze[1]) * t;
        b = haze[2] + (ground[2] - haze[2]) * t;
      }
      const s = Math.max(0, dx * sun[0] + dy * sun[1] + dz * sun[2]);
      const glow = Math.pow(s, 40) * 1.6;
      const disc = Math.pow(s, 900) * 120.0;
      r += (glow + disc) * 1.0;
      g += (glow + disc) * 0.85;
      b += (glow + disc) * 0.6;
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

async function main() {
  const renderer = await createRenderer();
  const scene = new THREE.Scene();
  const camera = createOrbitCamera(PRESET, window.innerWidth / window.innerHeight, 5000);
  // Sun only — the equirect environment supplies the ambient/hemisphere term;
  // stacking the shared hemisphere fill on top of IBL washed the grid out.
  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.5);
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const env = makeEnvTexture();
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  scene.background = env;
  scene.backgroundIntensity = 1.3;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.45, 0.42, 0.34), roughness: 0.95, metalness: 0.0 }),
  );
  scene.add(ground);

  const sphereGeo = new THREE.SphereGeometry(1.5, 48, 32);
  const baseColor = new THREE.Color(0.72, 0.45, 0.20);
  const spacing = 4.0;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const mat = new THREE.MeshStandardNodeMaterial({
        color: baseColor.clone(),
        metalness: row / 6,
        roughness: 0.05 + (col / 6) * 0.95,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set((col - 3) * spacing, (row - 3) * spacing, 2);
      scene.add(mesh);
    }
  }

  handleResize(renderer, camera);
  const tick = createStatsTracker('three-pbr', renderer);

  const loop = (now: number) => {
    renderer.render(scene, camera);
    tick(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error('[three-pbr] fatal', err);
  document.body.textContent = String(err);
});
