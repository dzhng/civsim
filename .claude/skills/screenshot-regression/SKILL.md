---
name: screenshot-regression
description: How to take screenshots of the game and use pixel-exact snapshot regression in the verify harnesses. Use when verifying UI/rendering changes, adding a new visual feature, re-blessing baselines after an intentional visual change, or debugging a snapshot failure.
---

# Screenshots and pixel-level regression testing

Both verify harnesses compare screenshots against committed baselines at
**zero tolerance** — a single differing pixel fails. This works because every
snapshot is taken at a *deterministic moment*; the discipline below is what
keeps it that way.

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

## Adding a regression snapshot

One call in `verify.mjs` or `verify-campaign.mjs`:

```js
import { snapCheck } from './snapshot.mjs';
await snapCheck(page, 'my-snap-name', check);
```

First run creates `web/shots/baseline/my-snap-name.png` and passes
("baseline created") — **commit the baseline**. Every later run compares
exactly and writes `web/shots/diff/<name>.png` (highlighted) plus
`<name>-actual.png` on failure (`shots/diff/` is gitignored).

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
UPDATE_SHOTS=1 VERIFY_URL=http://localhost:5174 node verify.mjs
```

4. Suspected nondeterminism → run the harness twice; if the second run isn't
   `0 px differ`, something on screen escaped the freeze path. Track it down
   rather than loosening tolerance — `snapCheck` accepts per-snap
   `{ threshold, maxDiffRatio }` overrides, but only use them for a *proven*
   noise source you can name in a comment.

## Verifying the checker still checks

After touching `snapshot.mjs` or the freeze paths, run a mutation test: make
a small visible change (a shader color constant, a marker size), run the
harness, and confirm the snapshot FAILS. A subtle real change once slipped
under pixelmatch's default 0.1 threshold — that's why comparisons are exact.
Baselines are per-platform (font/GPU rasterization differs across OSes); they
are blessed on this Mac, headless chromium.
