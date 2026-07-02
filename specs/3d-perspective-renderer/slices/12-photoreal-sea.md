# Slice 12 — Photoreal sea

## 12a MINI-VERDICT (reviewer, 2026-07-02): GERSTNER-TSL WINS; full IFFT port REJECTED on this evidence

Three-way hardware bake-off at the judging framing (`?map=A&zoom=6&cx=900&cy=-180&pitch=0.22&yaw=0`,
fixed t; shots in `assets/bakeoff-{gerstner,ifft}-y0.png` + `assets/baseline-webgpu-ocean.png`):

- **gerstner-tsl (WINNER):** irregular displaced chop, believable sparkle, disciplined
  sun band — the only prong that reads as an Aegean coastal sea.
- **ifft-tsl-spectral-spike:** engaged on hardware (3×256² cascades, 12.6 MB storage)
  but reads COMBED — long anisotropic streaks + smeared sun track (the corduroy
  failure mode). Loses decisively to the tuned Gerstner. Per the spike's decision
  rule, the full compute-butterfly port is NOT justified; 12b removes the spectral
  implementation and keeps the `SeaDisplacementSource` seam + tier machinery (one
  owner, swappable) so a future real-IFFT attempt has a socket — it must beat the
  12b-improved Gerstner to earn it.
- **Stock `webgpu_ocean` baseline (WaterMesh+SkyMesh, David's bar):** structurally
  flat — normal-map distortion with zero displacement; our Gerstner beats it on wave
  body at any exposure. (Reviewer's harness over-exposed the baseline shot — lighting
  mismatch noted honestly; the structural verdict is exposure-independent.
  `web/baseline-ocean.html` + `public/spike/waternormals.jpg` kept as the reference
  harness.)

Codex deliverable verified: seam/tier/stats contract clean, gate scene ALL PASS on
SwiftShader (ifft→gerstner fallback asserted) AND hardware (ifft engaged). Recorded
traps: (1) scene-harness `VERIFY_URL` defaults to :5173 — every parallel worktree
MUST pin its own port or it silently tests another worktree's server (cost one
false-negative debugging round); (2) grazing-distance sparkle aliasing confirmed in
shots → `12b` distance-faded normal detail; (3) the battle sea plane's far edge is
visible from seaward bearings → `12d` extent/shore work.


## Contract unlocked

The sea sells the setting (aesthetics rule 4): a photoreal Aegean sea at the true
horizon — displacement, Fresnel sky reflection, disciplined sun track, honest foam,
and a sand→turquoise→deep shore ramp. **`seaLayer.ts` becomes the single water
owner** for battle; the bespoke `gerstnerField.ts`/`WaterPlanePass` WGSL stays
campaign/legacy-only until `16`/`17`. Deps: `10` (a real sky to reflect); parallel
with `13`/`14` after `11`.

## API seam

`packages/photoreal-renderer/src/battle/seaLayer.ts` — one seam, swappable
displacement source (the three-side analogue of `WaterFieldSource`), never parallel
water paths.

- **12a — technique spike: Gerstner-in-TSL vs PORTED `Spiri0/Threejs-WebGPU-IFFT-Ocean`.**
  The water spec's old IFFT rejection is **void twice over**: dispersion was invisible
  under the fake 2.5D camera (dead since `02`), and "replicate, don't port" died when
  `06` picked three.js — the repo is three.js/TSL, so porting its JONSWAP→IFFT
  cascades is now on the table. Port the tuned `gerstnerField.ts` spectrum/params as
  the TSL Gerstner prong. Judge at the true-horizon framing from `02` (`yaw −π/2`,
  oblique out-to-sea) under the `10` sky, via `compare-screenshots` vs
  `battle-coastal-vista.jpg` + hardware ms. Record a 06-style mini-verdict here.
  **Whatever wins, Gerstner is the guaranteed SwiftShader fallback tier** (IFFT
  compute is a flagged CI risk), asserted by scene + stats identity.
  **Baseline prong (David, 2026-07-02): the bake-off ALSO compares against the
  stock three.js `webgpu_ocean` example** —
  <https://threejs.org/examples/?q=ocean#webgpu_ocean>
  (`examples/webgpu_ocean.html`: `WaterMesh` normal-map distortion water + `SkyMesh`,
  no displacement). It is the "free from the ecosystem" bar: a custom prong that
  doesn't visibly beat it at our framing does not justify existing. The
  `waternormals.jpg` texture it needs is NOT in the npm package — the reviewer
  supplies it (fetched from the three.js repo) when building the baseline harness;
  judge all three at matched framing under the `10` sky where feasible (the stock
  example brings its own sky — note the lighting mismatch in the verdict rather
  than pretending it away).
- **12b — PBR surface:** Fresnel reflection of the *actual* `10` sky/IBL (one sky
  source), GGX sun glint track, deep-water color. Fix the 06 critique's flagged
  three-prong flaws: blobby glint track, horizon moiré (distance-faded normal detail).
- **12c — foam/whitecaps:** agitation/crest-driven (Jacobian if IFFT), **no blanket
  foam** — the 06 critique's bespoke failure mode.
- **12d — shore blending:** tan sand → pale turquoise → deep blue, depth turbidity
  against the terrain heightfield; replaces the `08a` parity sea edge.
- **12e — glint discipline:** specular sparkle sizing/threshold — pairs with `15a`
  bloom (bloom must not re-break a disciplined glint; shots at both slices).

## What the human can run / see

`/battle` on a coastal map; battle scenes `water-coastal` / `water-open-sea`;
`/renderer/photoreal-battle` at the vista framing.

## Verification

- One visual variable per sub-slice, named crops in NEW scene
  `web/scenes/battle/photoreal-sea.mjs`: 12b **`sea-horizon`**, 12c **`sea-mid`**,
  12d **`shore-line`**, 12e **`sun-glint`**. Sample the near sea below the
  horizon-haze band (the `02` lesson: haze is not whitecaps). Out of scope: sky
  (`10`), terrain (`13`).
- **The existing `web/scenes/system/water-*` gates are re-derived or retired BY NAME**
  — `water-foam`, `water-albedo`, `water-glint`, `water-haze`, `water-rhythm`,
  `water-silhouette`, `water-horizon-real` — each accounted for: keep its assert
  *intent* (blue dominance, foam band, haze honesty, level horizon) re-pointed at the
  photoreal sea, or record why it retires. None silently dropped. Decide
  `/renderer/water-bakeoff`'s fate (the original motivating route) here too.
- `compare-screenshots` vs `battle-coastal-vista.jpg` (master sea reference) and vs
  the retiring look. `screenshot-critique` last on every shot.
- Standing gates: perf gate + ledger entry (IFFT compute budget explicit if chosen),
  SwiftShader fallback tier green, seating tripwire, campaign byte-identical.

## Must stay green

Standing gates 08b→17. `seaLayer` is the only battle water owner — no second sea
path outside its displacement seam.

## Research

- <https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean> (primary: JONSWAP→IFFT,
  storage-buffer cascades).
- Tessendorf, *Simulating Ocean Water*; three `webgpu_ocean` example.
- `packages/game-renderer/src/water/gerstnerField.ts` for wave-parameter parity;
  the `02` framing decisions in the README.

## Human feedback that would change this slice

Default sea state — David rejected the cold/rough register in 06; bias calm
golden-hour. Shore-ramp hue is a taste knob (`preview-shots`, non-blocking, ~5 min).
