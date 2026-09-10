import * as THREE from "three/webgpu";
import { attribute, mix, sin, step, uniform, uv, vec3 } from "three/tsl";
import { PhotorealWorld } from "../../../packages/photoreal-renderer/src/world";
import { applyCamera3d } from "../../../packages/photoreal-renderer/src/cameraBridge";
import { STANDARD_WAVE_BACK_LOBE } from "./wave/samples";
import type { BackendName } from "./contract";

async function start() {
  const backend = (new URLSearchParams(location.search).get("backend") ?? "raw") as BackendName;
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const world = await PhotorealWorld.create(canvas, { antialias: false });
  world.resize(900, 600, 1);
  const camera = new THREE.PerspectiveCamera();
  applyCamera3d(camera, {
    target: [1.5, 0, 1.2],
    distance: 6.6,
    pitch: 0.3,
    yaw: -1.08,
    fovY: 0.8,
    aspect: 1.5,
    near: 0.1,
    far: 100,
  });
  world.scene.background = new THREE.Color(0.12, 0.16, 0.18);
  const position = attribute<"vec3">("position", "vec3");
  const weight = attribute<"float">("weight", "float");
  const time = uniform(0);
  let displacement: THREE.Node<"float">;
  let computeResult: unknown = null;
  const device = (world.renderer.backend as unknown as { device: GPUDevice }).device;
  const failures: string[] = [];
  device.addEventListener("uncapturederror", (event) => failures.push(event.error.message));
  if (backend === "raw") {
    // Literal TSL counterpart from production standardMaterial. CPU reference
    // and the two compute probes pin the same six-argument mathematical contract.
    const primary = sin(time.mul(2.15).add(0.7).add(position.x.mul(5.2)).add(position.z.mul(1.25)));
    const secondary = sin(
      time
        .mul(3.1)
        .add(0.7 * 0.71)
        .add(position.x.mul(9.4))
        .sub(position.z.mul(0.52)),
    );
    const wave = primary.mul(0.74).add(secondary.mul(0.26)).toVar();
    displacement = weight.mul(0.7).mul(mix(wave, wave.mul(STANDARD_WAVE_BACK_LOBE), step(0, wave)));
  } else {
    const bridge = await (backend === "typegpu"
      ? import("./wave/typegpu-bridge")
      : import("./wave/vgpu-bridge"));
    computeResult = await bridge.probe(device);
    displacement = bridge.waveNode(position, weight, time) as THREE.Node<"float">; // Both bridges erase the function's f32 return type.
  }
  const positions: number[] = [],
    weights: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= 24; row++)
    for (let column = 0; column <= 48; column++) {
      const x = (column / 48) * 3,
        z = (row / 24) * 2;
      positions.push(x, 0, z);
      weights.push(column / 48);
      uvs.push(column / 48, row / 24);
    }
  for (let row = 0; row < 24; row++)
    for (let column = 0; column < 48; column++) {
      const i = row * 49 + column;
      indices.push(i, i + 1, i + 49, i + 1, i + 50, i + 49);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("weight", new THREE.Float32BufferAttribute(weights, 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.positionNode = vec3(position.x, position.y.add(displacement), position.z);
  const checks = uv().mul(12).floor();
  const band = checks.x.add(checks.y).mod(2);
  material.colorNode = mix(vec3(0.35, 0.05, 0.035), vec3(0.8, 0.55, 0.16), band);
  const mesh = new THREE.Mesh(geometry, material);
  world.scene.add(mesh);
  const poleGeometry = new THREE.CylinderGeometry(0.035, 0.035, 2.3, 12);
  poleGeometry.rotateX(Math.PI / 2);
  const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x8c6b37 });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.set(-0.03, 0, 1);
  world.scene.add(pole);
  async function render(value: number) {
    time.value = value;
    world.setTime(value);
    world.render(camera);
    await world.settlePresentedFrame();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await render(0);
  Object.assign(window, {
    threeSpike: {
      backend,
      computeResult,
      failures,
      stats: () => world.stats(),
      render,
      dispose() {
        geometry.dispose();
        material.dispose();
        poleGeometry.dispose();
        poleMaterial.dispose();
        world.dispose();
      },
    },
  });
  document.querySelector("#status")!.textContent = JSON.stringify(
    { backend, computeResult, stats: world.stats() },
    null,
    2,
  );
}
start().catch((error) => {
  document.querySelector("#status")!.textContent = String(error.stack ?? error);
  Object.assign(window, { spikeError: String(error.stack ?? error) });
  console.error(error);
});
