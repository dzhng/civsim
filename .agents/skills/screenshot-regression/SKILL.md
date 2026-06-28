---
name: screenshot-regression
description: How to take screenshots of the game and use pixel-exact snapshot regression — across the verify harnesses, the vibe timelines, and the model turntable. Use when verifying UI/rendering changes, adding a new visual feature, re-blessing baselines after an intentional visual or mechanics change, or debugging a snapshot failure. Pairs with [write-scene](../write-scene/SKILL.md) (the scenes whose snaps obey these rules).
---

# Screenshots and pixel-level regression testing

**One primitive, every shot.** `snapCheck` (`web/snapshot.mjs`) is the single
path every visual artifact flows through — the verify harnesses, the vibe battle
timelines (`vibe/*.mjs`), and the model turntable (`vibe/turntable.mjs`). A
committed baseline under `web/shots/<name>.png` is at once the picture
you review, the image a PR diff shows, and the gate. There is no "review-only"
tier: every shot is a regression target, so a downstream mechanics change is
visible as a red frame with a highlighted diff, not just a number that moved.

The verify UI snaps compare at **zero tolerance** — a single differing pixel
fails — because each is a *deterministic moment* (the discipline below is what
keeps it that way). Full-battle scenes and the 3D models render through Babylon
on headless SwiftShader, which wobbles a handful of sub-pixel AA edges run to
run even when frozen; those callers pass a small `maxDiffRatio` (named in a
comment) that absorbs the wobble and nothing more.

Each harness owns a folder under `shots/` (the scene/campaign harnesses pass an
explicit `baseDir`; vibe/turntable carry the folder in the snap `name`):
`scenes/battle-initial.png` (scene runner), `campaign/campaign-political.png`
(verify-campaign), `vibe/<scenario>/t###s.png` (vibe timelines),
`models/<id>-<class>.png` (turntable).

`web/vibe/shots/` is obsolete. Current review artifacts live under `web/shots/`:
committed baselines in per-harness folders (`scenes/`, `campaign/`, `vibe/`,
`models/`, `models-ingame/`, `weave/`), and failure diffs in `web/shots/diff/`.

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

**For a timeline (vibe checks that snap every N seconds): read EVERY frame, in
order. Do not sample two or three and infer the story between them.** The whole
reason the harness shoots `t000s`, `t012s`, `t024s`, … is so you can *watch* the
behaviour unfold — and the in-between frames routinely tell a different story
than the endpoints. (Real miss: from a "surrounded square sallies out" test I
read t48 and t72, saw the block forward and the front enemy dying, and reported
"it breaks out of the encirclement." Reading every frame showed the square ran
off after the *front* unit at t12 and the other two attackers never made contact
at all — there was no encirclement, and the scenario was broken. Two frames + a
plausible narrative = a confident wrong conclusion.) Open `t000s.png` onward and
describe what each shows before you draw any conclusion; if a unit "wins," trace
*how* across the frames, don't assume it from the final count.

## A time series ALWAYS ships a GIF too

Reading frames one by one is how you *diagnose*; a looping GIF is how the user
*watches* the whole sequence in one glance. So whenever the artifact is a time
series, emit a GIF alongside the PNGs at **~200 ms/frame** (5 fps) — and surface
it to the user (e.g. `SendUserFile`), not just the stills. Never hand back a
stack of `t###s.png` frames with no GIF.

- **Vibe timelines do this automatically.** `vibeCapture` (`vibe/_lib.mjs`) writes
  `web/shots/vibe/<name>/timeline.gif` every run, derived from the same
  screenshots the per-frame PNGs gate on (downscaled to 640×400, 200 ms/frame).
  The PNGs stay the full-res regression baselines; the GIF is review-only and is
  committed alongside them (like `shots/anim/`). No extra step — just point the
  user at the `timeline.gif`.
- **Any other series** (an ad-hoc Playwright sweep, a folder of frames you shot
  yourself): run `node vibe/gif.mjs <dir> [out] [delayMs=200] [downscale=2]`. It
  orders frames by filename (`t000s.png`, `t012s.png`, … or `00.png`, …) and
  writes `<dir>/timeline.gif`. Name frames so they sort.
- The encoder is `vibe/_gif.mjs` (`encodeGif` / `downscaleRGBA`, dependency-free —
  no ffmpeg/imagemagick on this box). Call it directly if you're building a
  bespoke series in a script.

**Crop and upscale before you theorise.** A unit is ~16 px in a 1280 px frame —
you cannot diagnose a soldier-rendering bug by eyeballing the whole shot, and
guessing the cause (mipmap? blend? lighting?) from a thumbnail wastes turns.
Cut the suspect region and nearest-neighbour upscale it 4–8× (pngjs: copy each
source pixel into a `scale×scale` block, write a new PNG), then Read it. Seeing
a clean black rectangle vs. a dark-blue-with-edges blob tells you in one look
whether it's coverage/mip darkening or something else. Let the pixels, not a
hypothesis, name the bug.

## Rebuild the wasm before you trust ANY screenshot

The browser loads the **prebuilt** wasm under `web/src/wasm`, never your live
Rust source. If you touched anything in `crates/`, run `npm run build:wasm` from
`web/` FIRST — otherwise every screenshot, and every green `verify`, reflects a
STALE binary. This has shipped a boot-crashing regression past a passing verify:
a new unit class was in the sim source but not in the wasm the browser actually
ran, and `class_specs` panicked the moment a real build loaded it.

## Taking a screenshot (ad-hoc, to look at something)

Dev server first (5173 is usually taken by the old `/Users/david/dev/game`
checkout — don't kill it):

```sh
cd web && npx vite --port 5174 --strictPort   # then VERIFY_URL=http://localhost:5174
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

## The controlled campaign stage (`verify-campaign-visual.mjs`)

For the campaign 3D markers, prefer the **fake map** over the real one. The
real map is a bad test bed — our red armies sit on red Roman cities (no
contrast) and any move triggers a garrison battle. `?campaign=test` boots a
controlled stage (`buildTestCampaign` in `main.ts`): our city (Roma) — a road
— a neutral city (Neapolis), one mixed-roster player army, a flat green bg
synthesized in JS (no fetch). The army teleports with the debug hook
`window.__campaign.place(army, kind, a, b)` (kind 0 = node index, 1 = edge
tile), so you can pose it over the road / our city / the neutral city exactly
and deterministically. `verify-campaign-visual.mjs` snapshots all of those —
extend it when you change an army/city model. Re-bless with
`UPDATE_SHOTS=1 node verify-campaign-visual.mjs`.

## Measuring content, not just exact-match (LOD / colour bugs)

Exact-match snapshots catch *change*; they don't assert the picture is *good*.
For "a unit must read as its team colour at every zoom" the right test renders
ONE unit in isolation and measures its own pixels. Spawn a duel
(`?battle=duel&a=0&b=0&ai=off` — one unit per side, enemy idle), frame unit 0's
centroid, and at each zoom compute the screen AABB of its men
(`worldToScreen` over `soldierPos`) and classify pixels inside it: `darkFrac`
(near-black) and, among non-grass pixels, the team-colour share. Assert across a
zoom sweep `[1,2,4,6,9]`. This is the `LOD z*` stage in `verify-battle.mjs`; it
catches both the far-zoom **black-block** bug and the mid-zoom **faint-soldier**
bug with one metric, and isn't fooled by legitimate grass between ranks (the
flaw in any whole-box "mean colour" check).

Root cause that metric guards: the 2D sprite atlas is **straight-alpha with a
wide transparent margin per cell**, drawn **opaque with an alpha-test** (no
blend). The mip chain box-filters those `(0,0,0,0)` margin texels into RGB, so a
minified soldier samples near-black — and the alpha-test writes it, collapsing a
zoomed-out block of men into a solid black slab. Fix in the sprite fragment
shader: divide by coverage, `gl_FragColor = vec4(c.rgb / c.a, 1.0)`, to recover
the figure's true alpha-weighted colour. Keep per-soldier outline/shadow
*soft*, never pure black — in an opaque renderer a hard-black rim is the bulk of
what a minified man averages to.

## Testing input/selection — and the device-pixel-ratio trap

Click-to-select and drag-box are real input paths; drive them with
`page.mouse.click` / `page.mouse.down|move|up` and read the live selection
(`window.__game.selected()`), not the `select()` shortcut. Two traps:

1. **dpr=1 hides Retina selection bugs.** The headless default is
   `deviceScaleFactor: 1`, where CSS px == device px and every dpr factor
   cancels. The renderer, `camera.ts`, and `input.ts` must AGREE on whether the
   canvas backing store is CSS- or device-sized. The 2D renderer sized it device
   px (`clientWidth * dpr`); the Babylon engine defaulted to CSS px
   (`adaptToDeviceRatio` **false**) while camera/input still multiply `clientX`
   by dpr — so on a real Retina screen every click mapped to the wrong world
   point and selected nothing. Always add a `deviceScaleFactor: 2` page to the
   input stage; dpr 1 alone is worthless here.
2. **Click the TRUE rendered pixel, not `worldToScreen`.** To find where to
   click, project from the canvas BACKING store:
   `cssX = ((wx-camx)*zoom + canvas.width/2) * (canvas.clientWidth/canvas.width)`
   (and the y-flip / `cosP` for north). Do NOT use `worldToScreen` — it carries
   the SAME dpr assumption as the input handler, so a self-consistent error
   cancels and your click lands exactly where the broken pick expects it: the
   test passes while the real game is broken. Centre the camera OFF the unit
   (a centred unit sits at the screen midpoint where every scale error is zero).

## Running just one snapshot

> Battle verification now uses addressable **scenes** (one runner over
> `web/scenes/*.mjs`); campaign verification is still on the legacy flat
> harnesses. See `specs/scenes.md` and the `write-scene` skill for the
> target architecture.

For battle work, run the smallest scene by name:
`node scene.mjs battle-ai --full`, `node scene.mjs banner-gallery`, or
`node scene.mjs battle-cavalry-plow --full`. `web/verify-battle.mjs` remains
a compatibility wrapper over those scenes, so old commands still work.

Within a selected scene, set `SNAP=<substr>` to compare only snaps whose name
contains the substring (comma-separated = OR), skipping the rest (no compare, no
diff written). Snapshots behind `--full` still need `--full` or an explicit
scene name. For campaign-marker work prefer `verify-campaign-visual.mjs`
(the fake `?campaign=test` map) — it never spawns a battle, so it won't churn
the tracked battle scratch shots (`initial.png`, `manual.png`, `cluster-*.png`)
that the battle harness rewrites every run. Restore those with
`git checkout -- 'web/shots/*.png'` after a battle run.

## Adding a regression snapshot

One call in a verify harness, a vibe scenario, or the turntable:

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

- **Verify harness:** a stage in `verify-battle.mjs` / `verify-campaign*.mjs`.
- **Vibe timeline:** don't call `snapCheck` directly — `vibeCapture` does it for
  every frame; just add the scenario (copy `vibe/duel-posture.mjs`). It also
  drops a `timeline.gif` in the scenario's shot folder for free (see "A time
  series ALWAYS ships a GIF too" above).
- **Model:** the turntable snap-checks one contact sheet per class; extend
  `CLASS_H`/`STANCES` in `vibe/turntable.mjs` when the roster changes.

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

## When a snapshot fails

1. Open `web/shots/diff/<name>.png` — the highlighted pixels tell you whether
   it's a real regression (your change leaked into an unrelated view), an
   intentional change, or new nondeterminism (diff differs run to run).
2. Real regression → fix the code.
3. Intentional visual change → re-bless and commit the new baselines:

```sh
UPDATE_SHOTS=1 VERIFY_URL=http://localhost:5174 node verify-campaign.mjs
UPDATE_SHOTS=1 VERIFY_URL=http://localhost:5174 node verify-battle.mjs
```

Full vibe/turntable re-blesses clear their baseline folder before writing new
shots, so shorter regenerated timelines cannot leave stale old frames behind.
Timeline re-blesses intentionally refuse `UPDATE_SHOTS=1 SNAP=...`: a filtered
regen would skip frames after clearing the folder, while not clearing the folder
can leave stale frames behind. Unset `SNAP` and re-bless the whole timeline.

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
     absolute tick — `window.__game.freezeAtTick(240)` — so the deployment is
     byte-identical every run. Don't paper over it with a looser ratio.
   - A higher-contrast render can *expose* latent jitter a darker one masked (a
     1-px sway flips far more pixels when soldiers read bright-blue than
     near-black). The jitter was always there; still pin the tick, don't raise
     the threshold.

## Verifying the checker still checks

After touching `snapshot.mjs` or the freeze paths, run a mutation test: make
a small visible change (a shader color constant, a marker size), run the
harness, and confirm the snapshot FAILS. A subtle real change once slipped
under pixelmatch's default 0.1 threshold — that's why comparisons are exact.
Baselines are per-platform (font/GPU rasterization differs across OSes); they
are blessed on this Mac, headless chromium.
