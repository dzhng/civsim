// @vitest-environment node
// The whole-map shadow control as seen from an ORDINARY lab build: it is not
// installed, the shared policy is untouched, and the transform refuses to run
// against a policy that has drifted. What the control DOES once installed is
// tested through a build that carries it
// (../src/shadow-control/tests/heldWholeMapFit.test.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// The lab has no package of its own; every tool it uses is reached through
// web/node_modules the way the lab Vite configs already do.
import { build } from "../../../web/node_modules/vite/dist/node/index.js";
import { test } from "vitest";
import {
  holdWholeMapShadowFit,
  wholeMapShadowControlPlugins,
} from "../src/shadow-control/wholeMapShadowControl";
import {
  SingleShadowPolicy,
  singleShadowFit,
  SINGLE_MAP_SIZE,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { photorealEnvironment } from "@packages/game-renderer/src/environment/physicalEnvironment";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

const POLICY_PATH = fileURLToPath(
  new URL("../../../packages/game-renderer/src/battle/shadowPolicy.ts", import.meta.url),
);
const POLICY = readFileSync(POLICY_PATH, "utf8");
const RECT: [number, number, number, number] = [-1200, -800, 2400, 1600];
const ELEVATION: [number, number] = [-3, 12];
const SUN = photorealEnvironment(CIVSIM_ENVIRONMENTS.golden).sunDirection;
const TACTICAL: Camera3DParams = {
  target: [0, 0, 0],
  distance: 10,
  pitch: 0.3,
  yaw: -Math.PI / 2,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
};

test("an ordinary lab build installs nothing", () => {
  assert.deepEqual(wholeMapShadowControlPlugins(undefined), []);
  assert.deepEqual(wholeMapShadowControlPlugins("fitted"), []);
  assert.equal(wholeMapShadowControlPlugins("whole-map").length, 1);
  // A typo must not read as "leave the default alone" — this control's whole
  // value is that a build either measures B or refuses to be called B.
  assert.throws(() => wholeMapShadowControlPlugins("whole map"), /BATTLE_SHADOW_FIT/);
  assert.throws(() => wholeMapShadowControlPlugins("original"), /BATTLE_SHADOW_FIT/);
});

test("without the control the shared policy still spends its map on the camera", () => {
  const policy = new SingleShadowPolicy(SUN);
  policy.setWorldRect(RECT, ELEVATION, SUN);
  const whole = singleShadowFit(RECT, SUN);
  const wholeMapTexel = (whole.right - whole.left) / SINGLE_MAP_SIZE;
  policy.update(TACTICAL, SUN);
  const settled = policy.refits;
  assert.ok(
    policy.fit.worldUnitsPerTexel < wholeMapTexel / 10,
    `the default fit resolved ${policy.fit.worldUnitsPerTexel} units/texel, no better than the whole map`,
  );
  policy.update({ ...TACTICAL, target: [600, 400, 0] }, SUN);
  assert.ok(policy.refits > settled, "the default policy stopped tracking a real pan");
});

/** A drift the control must refuse. `from` has to exist, or the case proves nothing. */
function drifted(from: string, to: string): string {
  assert.ok(POLICY.includes(from), `the drift case's own source (${from}) is already gone`);
  return POLICY.replace(from, to);
}

test("a shared policy that no longer means the original fails the build", () => {
  const cases: ReadonlyArray<readonly [string, string, RegExp]> = [
    [
      "export const SINGLE_MAP_SIZE = 1024;",
      "export const SINGLE_MAP_SIZE = 2048;",
      /map resolution/,
    ],
    [
      "export const SHADOW_NORMAL_BIAS = 0.6;",
      "export const SHADOW_NORMAL_BIAS = 0.4;",
      /normal bias/,
    ],
    ["export const SHADOW_BIAS = -0.00003;", "export const SHADOW_BIAS = -0.0001;", /depth bias/],
    [
      "const half = Math.hypot(w, h) / 2 + 40,",
      "const half = Math.hypot(w, h) / 2 + 80,",
      /rect fit/,
    ],
    ["    reach = half + 200;", "    reach = half + 500;", /rect fit/],
    ["      normalBias: SHADOW_NORMAL_BIAS,", "      normalBias: 0.6,", /whole-map fallback/],
    [
      "      mapSize: SINGLE_MAP_SIZE,",
      "      mapSize: SINGLE_MAP_SIZE, // fit",
      /camera-driven fit/,
    ],
    [
      "    this.sunAxis = [...unitSunDirection];",
      "    this.sunAxis = [...unitSunDirection]; // latch",
      /policy constructor/,
    ],
  ];
  for (const [from, to, message] of cases)
    assert.throws(
      () => holdWholeMapShadowFit(drifted(from, to), "/lab/report.ts"),
      message,
      `drifting ${from.trim()} was silently accepted`,
    );
});

test("the substituted site must exist exactly once, or the build fails", () => {
  // Already substituted: the anchored site is gone, so the control can never
  // land twice or half-way on one policy.
  const controlled = holdWholeMapShadowFit(POLICY, "/lab/report.ts");
  assert.notEqual(controlled, POLICY);
  assert.throws(
    () => holdWholeMapShadowFit(controlled, "/lab/report.ts"),
    /no longer the anchored original/,
  );

  // Two candidate sites: refuse rather than pick one and measure half a build.
  const at = POLICY.indexOf("  private viewFit(camera: Camera3DParams): ShadowViewFit {");
  const end = POLICY.indexOf("\n  }\n", at);
  assert.ok(at > 0 && end > at, "the drift case could not find the site it duplicates");
  const twice = POLICY.slice(0, end + 5) + POLICY.slice(at, end + 5) + POLICY.slice(end + 5);
  assert.throws(() => holdWholeMapShadowFit(twice, "/lab/report.ts"), /camera-driven fit/);
});

/** One real Vite build of a synthetic `entry` that imports the policy, carrying
 *  the control. Enough to prove the transform survives a real build pipeline and
 *  that `buildEnd` fails closed; it is NOT a lab bundle, and nothing here
 *  compares a default build's output to anything. */
async function controlledBuild(entrySource: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "whole-map-shadow-control-"));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(entry, entrySource);
    const result = await build({
      configFile: false,
      logLevel: "silent",
      plugins: wholeMapShadowControlPlugins("whole-map"),
      build: { write: false, minify: false, rollupOptions: { input: entry } },
    });
    const bundle = Array.isArray(result) ? result[0] : result;
    return (bundle as { output: { code?: string }[] }).output.map((c) => c.code ?? "").join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a real Vite build carries the substitution, or fails", async () => {
  const code = await controlledBuild(
    `import { SingleShadowPolicy } from ${JSON.stringify(POLICY_PATH)};\n` +
      "export const policy = new SingleShadowPolicy([0, 0.5, 0.86]);\n",
  );
  assert.ok(
    code.includes("registerWholeMapShadowPolicy"),
    "the controlled bundle shipped without the whole-map substitution",
  );
  // A policy that has moved out from under the anchor must not ship a fitted
  // build under build B's name. Standing in for that: a graph the policy never
  // reaches at all.
  await assert.rejects(
    controlledBuild("export const nothing = 1;\n"),
    /never reached the shared shadow policy/,
    "a build that never substituted the policy was accepted",
  );
});
