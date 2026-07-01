---
name: screenshot-regression
description: Take, inspect, and maintain deterministic screenshot baselines for visual changes through the shared snapCheck primitive. Use when verifying UI, campaign, battle, model, animation, or rendering changes; adding or re-blessing snapshots; comparing before/after captures; or debugging a visual snapshot failure. Pairs with [write-scene](../write-scene/SKILL.md), [write-vibe](../write-vibe/SKILL.md), and [write-model-sheet](../write-model-sheet/SKILL.md) because all visual gates snap through this primitive.
---

# Screenshots and pixel-level regression testing

**One primitive, every shot.** `snapCheck` (`web/snapshot.mjs`) is the single
path every visual artifact flows through: verify harnesses, scene runners, vibe
timelines, model sheets, contact sheets, and focused visual workbenches. A
committed baseline under `web/shots/<name>.png` is at once the picture
you review, the image a PR diff shows, and the gate. There is no "review-only"
tier: every shot is a regression target, so a downstream mechanics change is
visible as a red frame with a highlighted diff, not just a number that moved.

The verify UI snaps compare at **zero tolerance** — a single differing pixel
fails — because each is a *deterministic moment* (the discipline below is what
keeps it that way). Any nonzero tolerance must name the source it absorbs, such
as a documented headless raster wobble, and must not hide unknown visual drift.

Each harness owns a folder under `shots/`: `battle/`, `campaign/`, `ui/`,
`models/{battle,campaign,shared}/`, and `vibe/<scenario>/`. Scene files are
organized the same way under `web/scenes/<owner>/`; the scene runner writes
baselines to the matching owner folder.

`web/vibe/shots/` is obsolete. Current review artifacts live under `web/shots/`:
committed baselines in per-harness folders (`battle/`, `campaign/`, `ui/`,
`models/`, `vibe/`, `weave/`), and failure diffs in `web/shots/diff/`.

## ALWAYS look at the screenshot before you respond

A green harness run is NOT verification. Pixel regression only proves the
output didn't change from the baseline — it says nothing about whether the
output is *correct*, and a freshly-blessed baseline can bless a bug. Before
you tell the user a visual change is done, **open the actual PNG with the Read
tool and look at it yourself.** Confirm with your own eyes that the thing you
changed looks the way you claimed (the road stops at the army, the ring is
green, the model is bigger). If you re-blessed a baseline, look at the new
baseline too — you are certifying it as ground truth for every future run.
Never report a visual result you have only inferred from "the script passed."

**For a time series — a vibe timeline, or any folder of frames — read EVERY
frame, in order, and always ship a looping GIF.** Both rules (and how the GIF is
emitted) live in [write-vibe](../write-vibe/SKILL.md); follow them for anything
that snaps over time.

**Crop and upscale before you theorise.** A unit is ~16 px in a 1280 px frame —
you cannot diagnose a soldier-rendering bug by eyeballing the whole shot, and
guessing the cause (mipmap? blend? lighting?) from a thumbnail wastes turns.
Cut the suspect region and nearest-neighbour upscale it 4–8× (pngjs: copy each
source pixel into a `scale×scale` block, write a new PNG), then Read it. Seeing
a clean black rectangle vs. a dark-blue-with-edges blob tells you in one look
whether it's coverage/mip darkening or something else. Let the pixels, not a
hypothesis, name the bug.

## Visual acceptance gates

A screenshot change is not accepted just because the harness is green. Prove:

1. **Behavior:** the user flow or fixture still reaches the intended state.
2. **Readability:** the changed object is clear at the intended camera, zoom,
   device pixel ratio, and UI state.
3. **Regression scope:** unrelated scenes did not change, or each change is
   intentional and recorded.
4. **Human evidence:** the current PNGs, focused crops, and any before/after
   contact sheet are small enough for a reviewer to inspect.

For migrations or renderer swaps, compare old and new captures only when they
share the same scene, camera, viewport, DPR, frozen tick/time, browser, and
hardware. Use `compare-screenshots` when a human review needs quantitative
support, but never optimize only for a similarity score.

Every visual surface must use the same determinism discipline. If a path adds
GPU-driven animation, simulation interpolation, async uploads, temporal effects,
random noise, water, haze, clouds, impostor phase, shader time, or any other
time-dependent effect, wire it to an existing freeze hook or add a documented
freeze hook before snapshotting it. "It only jitters a few pixels" is a bug
until the source is named and intentionally tolerated.

## Rebuild the wasm before you trust ANY screenshot

The browser loads the **prebuilt** wasm under `web/src/wasm`, never your live
Rust source. If you touched anything in `crates/`, run `bun run build:wasm` from
`web/` FIRST — otherwise every screenshot, and every green `verify`, reflects a
STALE binary. This has shipped a boot-crashing regression past a passing verify:
a new unit class was in the sim source but not in the wasm the browser actually
ran, and `class_specs` panicked the moment a real build loaded it.

## Taking a screenshot (ad-hoc, to look at something)

Browser mode is part of the baseline contract. For exact screenshot regression,
use the same browser channel, adapter, and headful/headless mode that blessed the
baseline; do not swap to headless and treat the diffs as product signal until a
same-scene parity run proves `0 px differ`. On this Mac, WebGPU battle baselines
match hardware Chrome in headful mode; headless Chrome can capture artifacts but
does not currently match those baselines, and bundled headless Chromium may not
boot WebGPU scenes. Use headless for non-regression evidence only, or after an
intentional re-baseline to headless. The review surface is still the saved
PNG/GIF artifacts, not the live browser window.

Dev server first (5173 is usually taken by the old `/Users/david/dev/game`
checkout — don't kill it):

```sh
cd web && bunx vite --port 5174 --strictPort   # then VERIFY_URL=http://localhost:5174
```

Drive the game with Playwright through the same debug hooks the harnesses use:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5174');           // menu
await page.click('#menu-new-campaign');             // or ?map=A&ai=off for battle
await page.waitForFunction(() => window.__campaignReady === true); // battle: window.__ready
await page.evaluate(() => window.__campaign.freeze());             // battle: __game.freeze()
await page.evaluate(() => window.__campaign.cam(-456, 446, 2.5));  // x km, y km, px-per-km
await page.waitForTimeout(250);                     // let a frame render
await page.screenshot({ path: 'shots/whatever.png' });
```

Useful camera presets: whole map `(-100, 250, 0.16)`, Roma 3D `(-456, 446, 2.5)`,
Gaul `(-1020, 938, 2.5)`, Egypt/Nile `(1131, -686, 2.5)`, Alps `(-450, 1080, 1.8)`.
Scratch screenshots go in `web/shots/` but DELETE them before committing —
`shots/` is tracked; only harness-written artifacts belong there.

## Controlled visual stages

Prefer a controlled fixture before the full game when the bug is about one
visual contract: label spacing, prop depth, road continuity, terrain color,
selection contrast, unit readability, animation pose, or fog visibility. A good
fixture has one camera, one frozen time/tick, a tiny set of objects, and a
clear pass/fail crop. After the fixture passes, add the full-scene snapshot that
proves the same contract survives real data.

For campaign marker work, `?campaign=test` and the `window.__campaign` debug
hooks provide a deterministic fake map. For battle work, prefer small duel or
fixture scenes before dense army timelines.

## Measuring content, not just exact-match (LOD / colour bugs)

Exact-match snapshots catch *change*; they don't assert the picture is *good*.
For "a unit must read as its team colour at every zoom" the right test renders
ONE unit in isolation and measures its own pixels. Spawn a duel
(`?battle=duel&a=0&b=0&ai=off` — one unit per side, enemy idle), frame unit 0's
centroid, and at each zoom compute the screen AABB of its men
(`worldToScreen` over `soldierPos`) and classify pixels inside it: `darkFrac`
(near-black) and, among non-grass pixels, the team-colour share. Assert across a
zoom sweep `[1,2,4,6,9]`. This is the `LOD z*` stage in the `battle-lod` scene; it
catches both the far-zoom **black-block** bug and the mid-zoom **faint-soldier**
bug with one metric, and isn't fooled by legitimate grass between ranks (the
flaw in any whole-box "mean colour" check).

Root-cause checks should stay renderer-neutral. If a zoomed model turns into a
dark block, inspect the crop and then check the current renderer's actual
coverage, mip, alpha, depth, and outline path. Keep the metric tied to visible
pixels; put renderer-specific discoveries in the feature spec or code comments
near the shader they affect.

## Testing input/selection — and the device-pixel-ratio trap

Click-to-select and drag-box are real input paths; drive them with
`page.mouse.click` / `page.mouse.down|move|up` and read the live selection
(`window.__game.selected()`), not the `select()` shortcut. Two traps:

1. **dpr=1 hides Retina selection bugs.** The headless default is
   `deviceScaleFactor: 1`, where CSS px == device px and every dpr factor
   cancels. The renderer, camera, and input code must agree on whether the
   canvas backing store is CSS- or device-sized. Always add a
   `deviceScaleFactor: 2` page to the input stage; dpr 1 alone is worthless
   here.
2. **Click the TRUE rendered pixel, not `worldToScreen`.** To find where to
   click, project from the canvas BACKING store:
   `cssX = ((wx-camx)*zoom + canvas.width/2) * (canvas.clientWidth/canvas.width)`
   (and the y-flip / `cosP` for north). Do NOT use `worldToScreen` — it carries
   the SAME dpr assumption as the input handler, so a self-consistent error
   cancels and your click lands exactly where the broken pick expects it: the
   test passes while the real game is broken. Centre the camera OFF the unit
   (a centred unit sits at the screen midpoint where every scale error is zero).

## Running just one snapshot

> Battle, campaign, model, and focused visual workbench verification should use
> addressable **scenes** (one runner over `web/scenes/<owner>/*.mjs`). Compatibility
> wrappers may remain, but new work should have a named scene. See
> `specs/scenes.md` and the `write-scene` skill for the target architecture.

For battle work, run the smallest scene by name:
`node scene.mjs battle-ai --full`, `node scene.mjs banner-gallery`, or
`node scene.mjs battle-cavalry-plow --full`. `bun run verify` runs the packaged
battle-acceptance subset over those scenes.

Within a selected scene, set `SNAP=<substr>` to compare only snaps whose name
contains the substring (comma-separated = OR), skipping the rest (no compare, no
diff written). Snapshots behind `--full` still need `--full` or an explicit
scene name. For campaign-marker work, prefer a deterministic fake campaign map
over the full live campaign when one exists. For battle visuals, prefer a small
duel/fixture before dense timelines. If a harness rewrites unrelated tracked
scratch shots, remove or restore those unrelated changes before committing.

## Adding a regression snapshot

One call in a verify harness, a vibe scenario, or the model sheet:

```js
import { snapCheck } from './snapshot.mjs';     // from web/; vibe/ uses '../snapshot.mjs'
await snapCheck(page, 'my-snap-name', check);
await snapCheck(page, 'vibe/my-scenario/t020s', check, { threshold: 0.1, maxDiffRatio: 0.004 });
await snapCheck(null, 'models/12-foo', check, { shot: pngBuffer });  // compare a buffer you already hold
```

First run creates `web/shots/<name>.png` and passes ("baseline
created") — so a first run never spuriously fails; **commit the baseline**.
Every later run compares and writes `web/shots/diff/<name>.png` (highlighted)
plus `<name>-actual.png` on failure (`shots/diff/` is gitignored). Pass an
already-captured `shot` buffer (a composited contact sheet, a reused frame) to
skip the internal `page.screenshot()`.

- **Campaign/visual:** a `ctx.check` + `ctx.snap` in a scene under
  `web/scenes/<owner>/`.
- **Vibe timeline:** don't call `snapCheck` directly — `vibeCapture` does it per
  frame; see [write-vibe](../write-vibe/SKILL.md).
- **Model sheet:** snap-checks one composited contact sheet per class; see
  [write-model-sheet](../write-model-sheet/SKILL.md).

### The determinism checklist — every snapshot must satisfy ALL of these

1. **Fixed viewport** — harnesses use 1280×800; never snap at a default size.
2. **Fixed camera** — set it explicitly (`__campaign.cam(...)`); never trust
   whatever the scene booted with if any input may have run first.
3. **Frozen clocks** — anything wall-clock-driven must be pinned:
   - campaign: `window.__campaign.freeze()` pins the water/foam clock
     (`Terrain3D.fixedTime`); the campaign boots paused already.
   - battle: `window.__game.freeze()` pauses the sim, pins the ground-shader
     clock, and freezes the HUD `fps/tick` line. Call `freeze(false)` after
     the snap if later stages expect real time.
   If you add a new animated effect, wire it to the SAME freeze path, or
   every snapshot containing it goes flaky.
4. **No seed-dependent state on screen** — campaign snaps happen on Day 1
   *before any tick* (the campaign seed is random per boot; the boot state is
   seed-independent, anything after `tick()` is not). Battle uses a fixed
   seed, but real-time ticking starts at boot — freeze first, then snap.
5. **Wait ~250 ms after moving the camera** so a frame actually renders; the
   `cam()` hook updates the projection synchronously but the canvas repaints
   on the next rAF.
6. **Record adapter provenance when SwiftShader is unavailable.** The canonical
   WebGPU baseline device is SwiftShader. If this Mac cannot obtain a
   SwiftShader adapter and you must capture with hardware/Metal, prove the shot
   is deterministic on that adapter with a second run, record the exact adapter
   env, and warn that stone-dense model or terrain sheets may need a one-time
   SwiftShader re-bless in CI. Do not treat a hardware-vs-baseline diff over the
   2% budget as a product regression until you have compared against pre-change
   code or a canonical SwiftShader capture.

## When a snapshot fails

1. Open `web/shots/diff/<name>.png` — the highlighted pixels tell you whether
   it's a real regression (your change leaked into an unrelated view), an
   intentional change, or new nondeterminism (diff differs run to run).
2. Real regression → fix the code.
3. Intentional visual change → re-bless and commit the new baselines:

```sh
UPDATE_SHOTS=1 VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs campaign-lod
UPDATE_SHOTS=1 VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs battle-renderer-default
```

Vibe and model-sheet re-blesses clear their baseline folder first (and the vibe
timeline refuses a `SNAP=`-filtered regen) — those folder-clearing rules live in
[write-vibe](../write-vibe/SKILL.md) and [write-model-sheet](../write-model-sheet/SKILL.md).

4. Suspected nondeterminism → run the harness twice; if the second run isn't
   `0 px differ`, something on screen escaped the freeze path. Track it down
   rather than loosening tolerance — `snapCheck` accepts per-snap
   `{ threshold, maxDiffRatio }` overrides, but only use them for a *proven*
   noise source you can name in a comment.
   - **A living formation is the classic culprit.** Idle men carry a fidget
     sway that re-rolls every few *ticks* (deterministic in tick count, not
     wall-clock). `freeze()` pins the clock but NOT the tick the sim landed on
     when ~1s of real-time elapsed, so consecutive runs catch adjacent sway
     windows and the snapshot *alternates* 0 px / N px. Fix: freeze at a FIXED
     absolute tick, such as `window.__game.freezeAtTick(240)` or the route-owned
     equivalent, so the deployment is byte-identical every run. Don't paper over
     it with a looser ratio.
   - A higher-contrast render can *expose* latent jitter a darker one masked (a
     1-px sway flips far more pixels when soldiers read bright-blue than
     near-black). The jitter was always there; still pin the tick, don't raise
     the threshold.

## Verifying the checker still checks

After touching `snapshot.mjs` or the freeze paths, run a mutation test: make
a small visible change (a shader color constant, a marker size), run the
harness, and confirm the snapshot FAILS. A subtle real change once slipped
under pixelmatch's default 0.1 threshold — that's why comparisons are exact.
Baselines are per-platform and per browser mode (font/GPU rasterization differs
across OSes, adapters, channels, and headful/headless capture).
