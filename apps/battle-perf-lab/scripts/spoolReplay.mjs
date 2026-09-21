import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
const root = new URL("../../../", import.meta.url);
const { chromium } = await import(new URL("web/node_modules/playwright/index.mjs", root).href);
const { PNG } = await import(new URL("web/node_modules/pngjs/lib/png.js", root).href);
const base = process.argv[2] ?? "http://127.0.0.1:5189";
const output = process.argv[3];
const archive = process.argv[4];
const backend = process.argv[5] ?? "typegpu";
if (!output || !archive || !["raw", "typegpu", "vgpu"].includes(backend))
  throw Error(
    "Usage: spoolReplay.mjs <replay-url> <empty-output> <archive> [raw|typegpu|vgpu] [atlas-catalog]",
  );
const atlasCatalog =
  process.argv[6] ??
  "/@fs/" +
    fileURLToPath(new URL("specs/battle-performance/assets/02-full-atlas/catalog.json", root));
if (resolve(archive) === resolve(output))
  throw Error("Replay requires a separate archive input and empty output directory");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length)
  throw Error("Use an empty output directory for a new bounded replay");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-unsafe-gpu", "--enable-features=WebGPU"],
});
// A queued GPU/browser promise must not bypass the existing replay deadline.
const boundedBrowserCall = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), Math.max(1, milliseconds));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const findings = [],
  packets = [],
  errors = [];
const resources = {};
const history = { frames: 0, failedFrames: 0, failures: [], publications: [] };
let previousPublication;
let status,
  diskBytes = 0;
const boundedWrite = async (name, bytes) => {
  if (typeof bytes === "string") bytes = Buffer.from(bytes);
  // Reserve a small durable failure report even when the payload cap is reached.
  if (diskBytes + bytes.length > 1024 * 1024 * 1024 - 65536) throw Error("1 GiB disk cap reached");
  await writeFile(`${output}/${name}`, bytes);
  diskBytes += bytes.length;
};
const sink = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", base);
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") {
    response.end();
    return;
  }
  const resource = /^\/resource\/((?:base|ring)-\d+-\d+)$/.exec(request.url ?? "");
  if (request.method !== "GET" || !resource) {
    response.writeHead(400).end();
    return;
  }
  try {
    response.end(await readFile(`${archive}/resource-${resource[1]}.bin.gz`));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => sink.listen(0, "127.0.0.1", resolve));
const sinkUrl = `http://127.0.0.1:${sink.address().port}`;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const manifest = JSON.parse(await readFile(`${archive}/manifest.json`, "utf8"));
  packets.push(...manifest.packets);
  status = manifest.status;
  const identity = manifest.identity;
  Object.assign(resources, manifest.resources);
  const inputs = gunzipSync(await readFile(`${archive}/inputs.json.gz`), {
    maxOutputLength: 128 * 1024 * 1024,
  }).toString();
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.goto(`${base}/replay.html`);
  await boundedBrowserCall(
    page.evaluate(
      async ({ url, inputs, sinkUrl, resources, backend, atlasCatalog }) => {
        const { createSpoolReplay } = await import(url);
        window.__spoolReplay = await createSpoolReplay(
          inputs,
          sinkUrl,
          resources,
          atlasCatalog,
          backend,
        );
      },
      {
        url:
          "/@fs/" + fileURLToPath(new URL("apps/battle-perf-lab/src/nativeSpoolReplay.ts", root)),
        inputs,
        sinkUrl,
        resources,
        backend,
        atlasCatalog,
      },
    ),
    180000,
    "Replay initialization exceeded 3 minutes",
  );
  if (createHash("sha256").update(inputs).digest("hex") !== identity.inputsHash)
    throw Error("Static input hash changed");
  const replayIdentity = await page.evaluate(() => window.__spoolReplay.identity());
  if (
    !isDeepStrictEqual(replayIdentity.appearances, identity.appearances) ||
    replayIdentity.groundHash !== identity.groundHash
  )
    throw Error("Loaded appearance or generated ground identity changed");
  const replayDeadline = Date.now() + 600000;
  let lastReplayLog = 0;
  for (const packet of packets) {
    if (Date.now() > replayDeadline) throw Error("Offline replay exceeded 10 minutes");
    const compressed = await readFile(`${archive}/${packet.name}.json.gz`);
    if (createHash("sha256").update(compressed).digest("hex") !== packet.sha256)
      throw Error("Packet hash changed");
    const text = gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 }).toString();
    status = { phase: "native-replay", packet: packet.id };
    const result = await boundedBrowserCall(
      page.evaluate(async (text) => {
        const result = await window.__spoolReplay.present(text);
        let png = null;
        if (result.image) {
          const a = new Uint8Array(await result.image.arrayBuffer());
          let s = "";
          for (let i = 0; i < a.length; i += 8192)
            s += String.fromCharCode(...a.subarray(i, i + 8192));
          png = btoa(s);
        }
        return { ...result, image: undefined, png };
      }, text),
      replayDeadline - Date.now(),
      `Replay deadline reached in packet ${packet.id}`,
    );
    if (Date.now() - lastReplayLog > 10000) {
      console.log({
        stage: "offline-replay",
        packet: packet.id,
        totalPackets: packets.length,
        frameId: result.frameId,
        elapsedMs: result.selection.elapsedMs,
      });
      lastReplayLog = Date.now();
    }
    history.frames++;
    const cameraMatches = isDeepStrictEqual(result.source.camera, result.replay.camera);
    const crowdMatches =
      result.source.crowd.instances === result.replay.crowd.instances &&
      isDeepStrictEqual(
        result.source.crowd.visibleTierHistogram,
        result.replay.crowd.visibleTierHistogram,
      ) &&
      isDeepStrictEqual(
        result.source.crowd.shadowTierHistogram,
        result.replay.crowd.shadowTierHistogram,
      );
    const grassMatches =
      typeof result.source.terrain.grass.recordHash === "string" &&
      result.source.terrain.grass.recordHash === result.replay.terrain.grass.recordHash;
    const nativeHealthy = !result.native.errors.length && result.native.gpuRecordsMatch !== false;
    if (!cameraMatches || !crowdMatches || !grassMatches || !nativeHealthy) {
      history.failedFrames++;
      if (history.failures.length < 32)
        history.failures.push({
          frameId: result.frameId,
          elapsedMs: result.selection.elapsedMs,
          cameraMatches,
          crowdMatches,
          grassMatches,
          nativeHealthy,
        });
    }
    for (const publication of result.publications) {
      const key = JSON.stringify([
        publication.baseRevision,
        publication.ringRevision,
        publication.pending,
        publication.baseMask,
      ]);
      if (key !== previousPublication) {
        history.publications.push({
          frameId: result.frameId,
          elapsedMs: result.selection.elapsedMs,
          ...publication,
        });
        previousPublication = key;
      }
    }
    if (!result.selection.window) continue;
    const item = {
      summary: { ...result, ...result.selection, elapsedMs: result.selection.elapsedMs },
      frame: text,
      source: packet.snapshot
        ? (await readFile(`${archive}/${packet.name}-source.png`)).toString("base64")
        : null,
      replay: result.png,
    };
    const name = `${result.selection.window}-${String(result.selection.windowIndex).padStart(2, "0")}`;
    const sourceBytes = item.source ? Buffer.from(item.source, "base64") : null;
    const replayBytes = item.replay ? Buffer.from(item.replay, "base64") : null;
    let changedPixels = null,
      sum = 0,
      max = 0;
    if (sourceBytes && replayBytes) {
      const source = PNG.sync.read(sourceBytes),
        replay = PNG.sync.read(replayBytes);
      changedPixels = 0;
      if (
        source.width !== 2880 ||
        source.height !== 1800 ||
        replay.width !== 2880 ||
        replay.height !== 1800
      )
        throw Error("Canonical framebuffer changed");
      for (let i = 0; i < source.data.length; i += 4) {
        let diff = false;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(source.data[i + c] - replay.data[i + c]);
          sum += d;
          max = Math.max(max, d);
          diff ||= d !== 0;
        }
        changedPixels += diff;
      }
    }
    const finding = {
      name,
      window: item.summary.window,
      elapsedMs: item.summary.elapsedMs,
      frameId: item.summary.frameId,
      simTick: item.summary.simTick,
      changedPixels,
      rgbMae: changedPixels === null ? null : sum / (2880 * 1800 * 3),
      maxChannelDifference: max,
      camera: item.summary.source.camera,
      sourceGrass: item.summary.source.terrain.grass.rebuild,
      grassDrawsMatch: packet.snapshot ? isDeepStrictEqual(packet.draws, result.draws) : null,
      sourceGrassDraws: packet.draws,
      replayGrassDraws: result.draws,
      native: result.native,
      sourceGrassRecordHash: item.summary.source.terrain.grass.recordHash,
      replayGrassRecordHash: item.summary.replay.terrain.grass.recordHash,
      grassRecordHashMatches:
        typeof item.summary.source.terrain.grass.recordHash === "string" &&
        item.summary.source.terrain.grass.recordHash ===
          item.summary.replay.terrain.grass.recordHash,
      replayGrass: item.summary.replay.terrain.grass.rebuild,
      cameraMatches: isDeepStrictEqual(item.summary.source.camera, item.summary.replay.camera),
      crowdMatches:
        isDeepStrictEqual(
          item.summary.source.crowd.visibleTierHistogram,
          item.summary.replay.crowd.visibleTierHistogram,
        ) &&
        isDeepStrictEqual(
          item.summary.source.crowd.shadowTierHistogram,
          item.summary.replay.crowd.shadowTierHistogram,
        ) &&
        item.summary.source.crowd.instances === item.summary.replay.crowd.instances,
      sourceShadowCrowd: item.summary.source.crowd.shadowTierHistogram,
      replayShadowCrowd: item.summary.replay.crowd.shadowTierHistogram,
      sourceCrowd: item.summary.source.crowd.visibleTierHistogram,
      replayCrowd: item.summary.replay.crowd.visibleTierHistogram,
      frameHash: createHash("sha256").update(item.frame).digest("hex"),
    };
    if (sourceBytes && replayBytes) await boundedWrite(`${name}-replay.png`, replayBytes);
    findings.push(finding);
    findings.sort((a, b) => a.frameId - b.frameId);
    console.log({
      name,
      elapsedMs: finding.elapsedMs,
      changedPixels,
      sourcePending: finding.sourceGrass.pending,
      replayPending: finding.replayGrass.pending,
    });
    await boundedWrite("findings.json", JSON.stringify(findings, null, 2));
  }

  errors.push(
    ...(await boundedBrowserCall(
      page.evaluate(() => window.__spoolReplay.finish()),
      replayDeadline - Date.now(),
      "Replay deadline reached while draining final submission",
    )),
  );
  await page.evaluate(() => window.__spoolReplay.dispose());
  await boundedWrite("history.json", JSON.stringify(history, null, 2));
  await boundedWrite("browser-errors.json", JSON.stringify(errors, null, 2));
  console.log({ frames: findings.length, packets: packets.length, diskBytes, errors });
  if (
    errors.length ||
    history.failedFrames ||
    findings.some(
      (f) =>
        f.changedPixels ||
        !f.cameraMatches ||
        !f.crowdMatches ||
        !f.grassRecordHashMatches ||
        f.grassDrawsMatch === false,
    )
  )
    process.exitCode = 1;
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      { error: String(error).slice(0, 8192), status, diskBytes, packets: packets.length },
      null,
      2,
    ),
  );
  throw error;
} finally {
  sink.close();
  await browser.close();
}
