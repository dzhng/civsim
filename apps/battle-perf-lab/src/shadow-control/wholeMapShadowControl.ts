import { fileURLToPath } from "node:url";

/** Lab-only build-time control that holds the battle's sun shadows on the
 * ORIGINAL whole-map fit (c924e5ce `shadowRig`'s 'single' tier, which was the
 * shipped default) while the rest of the renderer stays as it is today. It
 * exists so the spec's A/B/C measurement can price build B — optimized
 * rendering at the ORIGINAL shadow quality and coverage — against build C's
 * fitted shadows.
 *
 * The substitution is two anchored replacements in the shared policy rather than
 * a copy of the fit, a production flag, or a second shadow owner: map size,
 * depth/normal bias, PCF softness, sun pose, near/far and caster views all stay
 * exactly what the shared policy computes. Only the CHOICE between the
 * camera-driven fit and the policy's own whole-map fallback changes — toward the
 * fallback the policy already keeps for unposed rigs — plus one weak
 * registration of the policy, so the lab report can be READ off the running
 * owner instead of fed by it.
 *
 * Every anchor below must match exactly once. A shared policy that has drifted
 * fails the build instead of silently measuring something else.
 */

const SHADOW_POLICY = "/packages/game-renderer/src/battle/shadowPolicy.ts";

/** The camera-driven fit, replaced. */
const VIEW_FIT_ANCHOR = `  private viewFit(camera: Camera3DParams): ShadowViewFit {
    return viewShadowFit({
      camera,
      rect: this.rect,
      elevation: this.elevation,
      unitSunDirection: this.sunAxis,
      mapSize: SINGLE_MAP_SIZE,
      stabilizer: this.stabilizer,
    });
  }`;

/** Its replacement. With the camera discarded, update() joins setWorldRect()
 *  and construction on the policy's own whole-map map: that is what holds the
 *  fit still under camera motion while a new terrain rect or a new sun still
 *  moves it. Nothing else runs here, so a controlled build pays no observer
 *  cost an uncontrolled one does not. */
const VIEW_FIT_CONTROL = `  private viewFit(_camera: Camera3DParams): ShadowViewFit {
    // battle-perf-lab whole-map shadow control: the camera is deliberately
    // discarded so every refit reproduces the original whole-map policy.
    return this.wholeMapFit();
  }`;

/** Where the policy becomes observable. */
const CONSTRUCTOR_ANCHOR = `  constructor(unitSunDirection: readonly [number, number, number]) {
    this.sunAxis = [...unitSunDirection];
    this.applied = this.wholeMapFit();
  }`;

/** Its replacement: one weak registration of the policy the build actually
 *  runs, so the lab report reads that policy's public fit and refits when
 *  someone asks, instead of the control keeping a parallel record of them. */
const CONSTRUCTOR_CONTROL = `  constructor(unitSunDirection: readonly [number, number, number]) {
    this.sunAxis = [...unitSunDirection];
    this.applied = this.wholeMapFit();
    // battle-perf-lab whole-map shadow control: weak, read-time evidence.
    registerWholeMapShadowPolicy(this);
  }`;

/** The whole-map fallback this control redirects INTO. */
const WHOLE_MAP_FALLBACK = `  private wholeMapFit(): ShadowViewFit {
    const whole = singleShadowFit(this.rect, this.sunAxis);
    const extent = whole.right - whole.left;
    return {
      ...whole,
      up: [0, 1, 0],
      extent,
      worldUnitsPerTexel: extent / SINGLE_MAP_SIZE,
      normalBias: SHADOW_NORMAL_BIAS,
      crowdNear: whole.near,
      coverage: extent,`;

/** The original rect fit itself: half-diagonal plus 40, light reach plus 200,
 *  near 1, far twice the reach — byte for byte what c924e5ce's rig computed. */
const ORIGINAL_RECT_FIT = `  const [x, y, w, h] = rect,
    cx = x + w / 2,
    cy = y + h / 2;
  const half = Math.hypot(w, h) / 2 + 40,
    reach = half + 200;
  return {
    target: [cx, cy, 0] as [number, number, number],
    position: [
      cx + unitSunDirection[0] * reach,
      cy + unitSunDirection[1] * reach,
      unitSunDirection[2] * reach,
    ] as [number, number, number],
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: reach * 2,
  };`;

/** What has to be intact for "the original whole-map fit" to still mean the
 *  fit c924e5ce shipped. Named so a failure says which part moved. */
const BASELINE_ANCHORS: ReadonlyArray<readonly [string, string]> = [
  ["single-tier map resolution", "export const SINGLE_MAP_SIZE = 1024;"],
  ["whole-map normal bias", "export const SHADOW_NORMAL_BIAS = 0.6;"],
  ["whole-map depth bias", "export const SHADOW_BIAS = -0.00003;"],
  ["original rect fit", ORIGINAL_RECT_FIT],
  ["whole-map fallback", WHOLE_MAP_FALLBACK],
];

/** Replaces the shared policy's camera-driven fit with its whole-map fallback,
 *  and makes the resulting policy observable. Throws rather than approximating
 *  when any anchor has drifted. */
export function holdWholeMapShadowFit(code: string, reportImport: string): string {
  for (const [what, anchor] of BASELINE_ANCHORS) anchorOnce(code, anchor, what);
  const sites = [
    { anchor: CONSTRUCTOR_ANCHOR, control: CONSTRUCTOR_CONTROL, what: "policy constructor" },
    { anchor: VIEW_FIT_ANCHOR, control: VIEW_FIT_CONTROL, what: "camera-driven fit" },
  ].map((site) => ({ ...site, at: anchorOnce(code, site.anchor, site.what) }));
  let held = code;
  // Last site first, so an earlier replacement cannot move a later anchor.
  for (const site of sites.sort((a, b) => b.at - a.at))
    held = held.slice(0, site.at) + site.control + held.slice(site.at + site.anchor.length);
  return `import { registerWholeMapShadowPolicy } from ${JSON.stringify(reportImport)};\n` + held;
}

function anchorOnce(code: string, anchor: string, what: string): number {
  const at = code.indexOf(anchor);
  if (at < 0 || code.indexOf(anchor, at + anchor.length) !== -1)
    throw Error(
      `Whole-map shadow control: the shared shadow policy's ${what} is no longer the anchored original`,
    );
  return at;
}

/** Lab builds only. `BATTLE_SHADOW_FIT=whole-map` installs the control; unset
 * or `fitted` leaves the default production policy alone, plugins and all. */
export function wholeMapShadowControlPlugins(request = process.env.BATTLE_SHADOW_FIT) {
  if (request === undefined || request === "fitted") return [];
  if (request !== "whole-map")
    throw Error("Set BATTLE_SHADOW_FIT=fitted|whole-map, or leave it unset for fitted");
  const report = fileURLToPath(new URL("./shadowFitControlReport.ts", import.meta.url));
  let command = "serve";
  let substituted = false;
  return [
    {
      name: "battle-whole-map-shadow-control",
      enforce: "pre" as const,
      configResolved: (config: { command: string }) => {
        command = config.command;
      },
      transform(code: string, id: string) {
        if (!id.split("?")[0].replaceAll("\\", "/").endsWith(SHADOW_POLICY)) return null;
        substituted = true;
        return { code: holdWholeMapShadowFit(code, report), map: null };
      },
      // A moved or renamed policy would otherwise ship the fitted default under
      // the control's name, and the whole A/B/C comparison with it.
      buildEnd(error?: Error) {
        if (command === "build" && !error && !substituted)
          throw Error("Whole-map shadow control build never reached the shared shadow policy");
      },
    },
  ];
}
