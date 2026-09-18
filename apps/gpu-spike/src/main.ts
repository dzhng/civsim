import {
  createFrameShell,
  type FrameGraphCommands,
} from "../../../packages/renderer-core/src/frameShell";
import { makeVertexBuffer } from "../../../packages/renderer-core/src/gpuBuffers";
import { quadData, type BackendName, type Camera } from "./contract";
import { makeFixture } from "./fixture";

const params = new URLSearchParams(location.search);
const backendName = params.get("backend") ?? "raw";
if (!["raw", "typegpu", "vgpu"].includes(backendName))
  throw new Error(`Unknown backend ${backendName}`);
const mode = params.get("mode") ?? "raw-msaa4";
const count = Number(params.get("count") ?? 9);
if (!Number.isInteger(count) || count < 0 || count > 30000)
  throw new Error("count must be 0..30000");
const status = document.querySelector<HTMLPreElement>("#status")!;
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const failures: string[] = [];

async function start() {
  const sampleCount = mode === "raw-msaa1" ? 1 : 4;
  const shell = await createFrameShell(canvas, {
    sun: { sunAzimuth: 0.4, sunElevation: 0.7 },
    sampleCount,
    enableGpuTimer: true,
    onFatalError: (error) => failures.push(error.message),
  });
  shell.device.addEventListener("uncapturederror", (event) => failures.push(event.error.message));
  const large = count > 9;
  const columns = large ? Math.ceil(Math.sqrt(count)) : 3;
  const rows = Math.ceil(count / columns);
  const spacing = large ? 1.6 : 3;
  const extent = large ? Math.max(columns, rows) * spacing * 0.6 : 8;
  const camera: Camera = {
    camera3d: {
      target: [0, 0, 0],
      distance: extent * 2.7,
      pitch: mode === "raw-msaa1" ? 1.05 : 0.65,
      yaw: -1.2,
      fovY: 0.8,
      aspect: 1.5,
      near: 0.1,
      far: extent * 20,
    },
    x: 0,
    y: 0,
    zoom: 1,
    width: 900,
    height: 600,
    time: 2.5,
    sunAzimuth: 0.4,
    sunElevation: 0.7,
  };
  shell.resize({ width: 900, height: 600, dpr: 1 });
  const data = new Float32Array(Math.max(1, count) * 4);
  for (let i = 0; i < count; i++)
    data.set(
      [
        ((i % columns) - (columns - 1) / 2) * spacing,
        (Math.floor(i / columns) - (rows - 1) / 2) * spacing,
        large ? 0.7 : 1.15,
        0,
      ],
      i * 4,
    );
  const quad = makeVertexBuffer(shell.device, "shadow-quad", quadData);
  const instances = makeVertexBuffer(shell.device, "shadow-instances", data);
  const fixture = makeFixture(shell, extent, params.get("occluders") !== "0");
  const module = await {
    raw: () => import("./raw"),
    typegpu: () => import("./typegpu"),
    vgpu: () => import("./vgpu"),
  }[backendName as BackendName]();
  const setupStart = performance.now();
  const backend = await module.makeBackend(shell, quad, instances, count, camera);
  const setupMs = performance.now() - setupStart;
  const commands: FrameGraphCommands = {
    clear: { r: 0.12, g: 0.16, b: 0.18, a: 1 },
    passes: [
      {
        id: "fixture-world",
        role: "world-opaque",
        phase: "world-depth",
        depth: "read-write",
        draw: (pass) => fixture.draw(pass),
      },
      {
        id: "shared-shadow",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => backend.draw(pass),
      },
    ],
  };
  function render() {
    shell.setCamera(camera);
    backend.updateCamera(camera);
    shell.drawFrame(commands);
  }
  async function settle() {
    await shell.device.queue.onSubmittedWorkDone();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  render();
  await settle();
  const api = {
    failures,
    backend: backendName,
    mode,
    count,
    setupMs,
    details: backend.details,
    stats: () => shell.stats(),
    async move() {
      camera.camera3d.yaw += 0.4;
      camera.camera3d.target = [1, -0.5, 0];
      camera.x = 1;
      camera.y = -0.5;
      render();
      await settle();
    },
    async resize() {
      camera.width = 720;
      camera.height = 480;
      canvas.style.width = "720px";
      canvas.style.height = "480px";
      shell.resize({ width: 720, height: 480, dpr: 1 });
      render();
      await settle();
    },
    async setCount(next: number) {
      backend.setCount(next);
      render();
      await settle();
    },
    async benchmark(frames = 120, dynamic = false) {
      const cpu: number[] = [],
        gpu: number[] = [];
      for (let i = 0; i < frames + 20; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const begin = performance.now();
        if (dynamic) backend.setCount(count - (i % 2));
        render();
        const elapsed = performance.now() - begin;
        await shell.device.queue.onSubmittedWorkDone();
        if (i >= 20) {
          cpu.push(elapsed);
          const ms = shell.stats().gpuTimeMs;
          if (ms !== null) gpu.push(ms);
        }
      }
      function distribution(a: number[]) {
        a.sort((a, b) => a - b);
        return {
          median: a[Math.floor(a.length / 2)] ?? null,
          p95: a[Math.floor(a.length * 0.95)] ?? null,
          samples: a.length,
        };
      }
      return { cpuSubmitMs: distribution(cpu), gpuFrameMs: distribution(gpu) };
    },
    async dispose() {
      backend.destroy();
      // An imported-device wrapper must leave the shell's device usable.
      const probe = shell.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST });
      shell.device.queue.writeBuffer(probe, 0, new Uint32Array([7]));
      await shell.device.queue.onSubmittedWorkDone();
      probe.destroy();
      fixture.destroy();
      quad.destroy();
      instances.destroy();
      shell.destroy();
      return { failures: [...failures] };
    },
  };
  Object.assign(window, { spike: api });
  status.textContent = JSON.stringify(
    { backend: backendName, mode, count, setupMs, details: backend.details, stats: shell.stats() },
    null,
    2,
  );
}
start().catch((error) => {
  failures.push(String(error));
  status.textContent = String(error.stack ?? error);
  Object.assign(window, { spikeError: String(error.stack ?? error) });
  console.error(error);
});
