import { fileURLToPath } from "node:url";
export const meta = {
  name: "grass-upload-ranges",
  kind: "flow",
  world: "isolated-grass-storage",
  tier: "quick",
  snapshots: [],
  describe: "A grass edit uploads only its range once across repeated GPU consumers.",
};
const layerPath = fileURLToPath(
  new URL("../../../packages/photoreal-renderer/src/battle/bladeFieldLayer.ts", import.meta.url),
);
export async function run(ctx) {
  const page = await ctx.newPage();
  const warnings = [];
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) warnings.push(m.text());
  });
  await page.route(`${ctx.target}/__grass-upload-probe`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Grass upload probe</title>",
    }),
  );
  await page.goto(`${ctx.target}/__grass-upload-probe`);
  const result = await page.evaluate(async (layerPath) => {
    const url = `/@fs${layerPath}`,
      source = await (await fetch(url)).text();
    const threeUrl = source.match(/import \* as THREE from ["']([^"']+)["']/)?.[1];
    if (!threeUrl) throw Error("Grass layer Three import missing");
    const THREE = await import(threeUrl);
    const { PhotorealBladeFieldLayer } = await import(url);
    const renderer = new THREE.WebGPURenderer();
    await renderer.init();
    const device = renderer.backend.device,
      records = new Float32Array(257 * 16),
      writes = [];
    let recordBuffer;
    const create = device.createBuffer.bind(device);
    device.createBuffer = (descriptor) => {
      const buffer = create(descriptor);
      if (descriptor.size === records.byteLength) recordBuffer = buffer;
      return buffer;
    };
    const write = device.queue.writeBuffer.bind(device.queue);
    device.queue.writeBuffer = (buffer, offset, data, start, size) => {
      if (buffer === recordBuffer) {
        const unit = data.BYTES_PER_ELEMENT ?? 1;
        writes.push({ offset, bytes: (size ?? data.byteLength / unit - (start ?? 0)) * unit });
      }
      return write(buffer, offset, data, start, size);
    };
    const layer = new PhotorealBladeFieldLayer(new THREE.Scene());
    const apply = (edits) =>
      layer.applyRecordEdits({ edits, recordCount: 257, visible: true, recordHash: "probe" });
    const route = () => layer.routeGpu(renderer, [0, 0, 5], [0, 0]);
    try {
      layer.adoptRecordBuffer(records);
      apply([]);
      route();
      await device.queue.onSubmittedWorkDone();
      writes.length = 0;
      records[3 * 16] = 123;
      apply([{ start: 3, count: 1 }]);
      route();
      await device.queue.onSubmittedWorkDone();
      const edited = writes.slice();
      writes.length = 0;
      for (let frame = 0; frame < 3; frame++) {
        await new Promise(requestAnimationFrame);
        route();
      }
      await device.queue.onSubmittedWorkDone();
      const unchanged = writes.slice();
      const read = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      let gpuValue;
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(recordBuffer, 3 * 64, read, 0, 4);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        gpuValue = new Float32Array(read.getMappedRange())[0];
      } finally {
        read.destroy();
      }
      return { edited, unchanged, gpuValue };
    } finally {
      layer.dispose();
      renderer.dispose();
    }
  }, layerPath);
  ctx.check(
    "one edited record uploads exactly 64 bytes once",
    result.edited.length === 1 &&
      result.edited[0].offset === 3 * 64 &&
      result.edited[0].bytes === 64,
    JSON.stringify(result.edited),
  );
  ctx.check(
    "camera-only GPU routing does not reupload records",
    result.unchanged.length === 0,
    JSON.stringify(result.unchanged),
  );
  ctx.check(
    "the edited value reached GPU storage",
    result.gpuValue === 123,
    String(result.gpuValue),
  );
  ctx.check("no GPU warnings", warnings.length === 0, warnings.join("\n"));
}
