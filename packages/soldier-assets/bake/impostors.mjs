import {
  appearanceDeadline,
  AppearanceTimeoutError,
  outputBudget,
  OutputQuotaError,
} from "./impostors/safety.mjs";
import { chromium } from "../../../web/node_modules/playwright/index.mjs";
import { GPU_HARDWARE_FLAGS } from "../../../web/renderer-probe-lib.mjs";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { values } = parseArgs({
  options: {
    out: { type: "string", default: "web/public/assets/soldiers/impostors" },
    classes: { type: "string" },
    all: { type: "boolean" },
    check: { type: "boolean" },
    "timeout-ms": { type: "string", default: "120000" },
    "max-output-mib": { type: "string", default: "400" },
    port: { type: "string", default: "5201" },
  },
});
if (values.all && values.classes) throw Error("Choose --all or --classes");
const source = JSON.parse(
  await readFile(resolve(root, "web/public/assets/soldiers/catalog.json"), "utf8"),
);
const ids = (
  values.all ? Object.keys(source.appearances) : (values.classes ?? "0,3,6").split(",")
).map(Number);
if (
  ids.some((id) => !Number.isSafeInteger(id) || !source.appearances[id]) ||
  new Set(ids).size !== ids.length
)
  throw Error("Unknown or repeated appearance id");
const out = resolve(root, values.out),
  port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid port");
await mkdir(out, { recursive: true });
const timeoutMs = Number(values["timeout-ms"]),
  outputLimit = Number(values["max-output-mib"]) * 1024 * 1024;
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
  throw Error("Invalid per-appearance timeout");
const budget = outputBudget(outputLimit);
const atomic = (path, bytes, options) => budget.write(path, bytes, options);
const server = spawn(
  process.execPath,
  [
    resolve(root, "web/node_modules/vite/bin/vite.js"),
    "--config",
    resolve(root, "web/vite.impostor-bake.config.ts"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let browser, closing;
const closeBrowser = () => (closing ??= browser?.close());
const browserErrors = [],
  results = [],
  failures = [];
try {
  await new Promise((accept, reject) => {
    let log = "";
    const timer = setTimeout(
      () => reject(Error(`Atlas authoring server did not start: ${log}`)),
      30000,
    );
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Atlas authoring server exited ${code}: ${log}`));
    });
    server.stderr.on("data", (chunk) => {
      log = (log + chunk).slice(-4000);
    });
    server.stdout.on("data", (chunk) => {
      log = (log + chunk).slice(-4000);
      if (log.includes("Local:")) {
        clearTimeout(timer);
        accept();
      }
    });
  });
  browser = await chromium.launch({ channel: "chrome", headless: true, args: GPU_HARDWARE_FLAGS });
  const page = await browser.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) browserErrors.push(message.text());
  });
  const base = `http://127.0.0.1:${port}`;
  await page.goto(base);
  await page.waitForFunction(() => window.__atlasAuthor !== undefined, null, { timeout: 30000 });
  const runtime = await browser.newPage();
  runtime.on("pageerror", (error) => browserErrors.push(error.message));
  runtime.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) browserErrors.push(message.text());
  });
  await runtime.goto(`${base}/runtime.html`);
  await runtime.waitForFunction(() => window.__atlasRuntime !== undefined, null, {
    timeout: 30000,
  });
  let appearances = {};
  if (!values.all) {
    try {
      appearances = JSON.parse(await readFile(resolve(out, "catalog.json"), "utf8")).appearances;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const id of ids) {
    try {
      await appearanceDeadline(
        `Appearance ${id}`,
        timeoutMs,
        async (signal) => {
          const atomic = (path, bytes) => budget.write(path, bytes, { signal });
          const inputHash = await page.evaluate((id) => window.__atlasAuthor.input(id), id);
          const name = `${inputHash}.json`,
            path = resolve(out, name);
          let cached;
          try {
            cached = JSON.parse(await readFile(path, "utf8"));
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          if (!cached) {
            if (values.check) throw Error(`Missing cached atlas ${id}; bake before --check`);
            const baked = await page.evaluate((id) => window.__atlasAuthor.bake(id), id);
            await atomic(resolve(out, baked.artifact.payload), Buffer.from(baked.gzip, "base64"));
            await atomic(path, JSON.stringify(baked.artifact, null, 2) + "\n");
          }
          const verified = await page.evaluate(
            ({ id, url, rebake }) => window.__atlasAuthor.verify(id, url, rebake),
            { id, url: `${base}/@fs${path}`, rebake: !!values.check },
          );
          if (verified.fresh) {
            const dir = resolve(out, "source-self");
            await mkdir(dir, { recursive: true });
            await atomic(
              resolve(dir, verified.fresh.artifact.payload),
              Buffer.from(verified.fresh.gzip, "base64"),
            );
            await atomic(
              resolve(dir, `${id}-${verified.fresh.artifact.contentHash}.json`),
              JSON.stringify(verified.fresh.artifact, null, 2) + "\n",
            );
            delete verified.fresh;
          }
          const loaded = await runtime.evaluate(
            ({ artifactUrl, appearanceUrl }) => window.__atlasRuntime(artifactUrl, appearanceUrl),
            {
              artifactUrl: `${base}/@fs${path}`,
              appearanceUrl: new URL(source.appearances[id], `${base}/assets/soldiers/catalog.json`)
                .href,
            },
          );
          const manifest = JSON.parse(await readFile(path, "utf8"));
          if (loaded.contentHash !== manifest.contentHash)
            throw Error(`Runtime loader ${id} changed atlas bytes`);
          results.push({
            ...verified,
            cached: !!cached,
            manifest: name,
            runtimeContentHash: loaded.contentHash,
          });
          if (values.check && !verified.verifiedFreshSource) {
            failures.push({
              id,
              error: "Fresh source bake is not byte-exact",
              sourceComparison: verified.sourceComparison,
            });
            return;
          }
          appearances[id] = name;
          console.log(
            `${id}: ${values.check ? "source-verified" : cached ? "cache-verified" : "baked and loader-verified"}`,
          );
        },
        closeBrowser,
      );
    } catch (error) {
      failures.push({ id, error: String(error) });
      if (error instanceof AppearanceTimeoutError || error instanceof OutputQuotaError) throw error;
    }
  }
  if (browserErrors.length || failures.length)
    throw Error(JSON.stringify({ failures, browserErrors }));
  await atomic(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        passed: true,
        results,
        browserErrors,
        resourceCost: {
          appearances: ids.length,
          decodedBytes: results.reduce((sum, r) => sum + r.decodedBytes, 0),
          freshOutputBytes: budget.writtenBytes,
          outputLimit,
          perAppearanceTimeoutMs: timeoutMs,
        },
        scope: "Exact offline property mip payloads; no complete-scene or performance claim",
      },
      null,
      2,
    ) + "\n",
  );
  if (!values.check)
    await atomic(resolve(out, "catalog.json"), JSON.stringify({ appearances }, null, 2) + "\n");
  await page.evaluate(() => window.__atlasAuthor.dispose());
} catch (error) {
  await atomic(
    resolve(out, "report.json"),
    JSON.stringify(
      { passed: false, results, failures, browserErrors, error: String(error) },
      null,
      2,
    ) + "\n",
    { failure: true },
  );
  throw error;
} finally {
  server.kill("SIGTERM");
  await closeBrowser();
}
