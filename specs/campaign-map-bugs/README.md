# Campaign Map Bugs — the vision-audit backlog

Fix every map defect confirmed by the `find-map-bugs` vision-audit skill across
three canonical shots (whole-map political, Black-Sea crop,
regional-italy-political): cities rendering offshore, sea names on land, labels
seaward of their markers, jagged faction coastlines, road gaps, card-anchor
defects, a broken army standard, label collisions, and scenery on water. The
root cause of half the backlog is one schism: **three land masks disagree** —
mapgen's bake raster (2 km/px, the campaign-bg.png source), the frontend
`TerrainField` 8 km downsample, and the full-res pixels the player sees via the
shader's sea classification. The plan unifies land-truth ownership first, then
fixes fan out in parallel lanes.

This spec was cut from three independent draft passes and synthesized. Every
bug below is verified with a centered crop in `assets/evidence/` — those crops
ARE the acceptance criteria: the defect visible in each must be gone.

---

## Next Agent Prompt

**Status 2026-07-03:** 00 ✓ (land-truth owners + bridge + rendered probe/red
baseline — see tools/README.md, incl. the B1-vs-B2 reconciliation: the
b1-tarraco/corinthus crops are the icon+label class, owned by 04's gate).
01 ✓ (snap to final-raster 3x3 margin, 98 cities ≤4.9 km, 8 port exemptions,
bake invariant, srcPos prune stability, id-stable league colors — full ledger
in slices/01-city-snap.md). 08 ✓ merged (marker cloth/chip grade fixes the
wash-camouflage class; 63-livery sheet gate — ledger in slices/08-standard.md).
03 ✓ merged (fitter fit the mirrored box + silently drew rejects — rewritten;
all 8 sea names on water; shared `bestPlacement` scorer exported for 04).
05 ✓ merged (territory clips to the DRAWN composite — bg+biome via terrainMix —
paint-only seaward ring; inland control byte-identical). 06 ✓ merged (scenery
gated per-instance footprint through renderLandAt; 0 on water). 07 ✓ merged
(Ostia model was never missing — the ROMA card covered its anchor; landward
card offsets; card gates in campaign-lod).
**gpu/scenery/cards lane close-out oracle: GREEN** — all gate classes absent
on the merged regional shot; report + evidence in
assets/oracle/regional-closeout-05-06-07/ (also proved 05's before/after via a
judge that accidentally audited origin/main's stale baseline — judge prompts
must mandate the absolute shot path). Confirmed non-gate findings routed:
Puteoli road-missing + Ferentinum dead-end stub → 02 (new named instances);
Roma-cluster/Minturnae-Teanum card stacks → 09; island-fidelity pill (real
island, coarse-raster lozenge) → David at 10.
**In flight:** 02 (lane-roads, :5204), 04 (lane-city-labels, :5208 — runs the
labels-lane whole-map oracle). **Next after those merge:** 09 (needs 04+07 ✓),
then 10. Cross-lane note: lanes bless from their branch point — resolve merge
conflicts by re-capturing on the merged tree (established precedent).
**You are a fresh session implementing this spec** via
[implement-spec](../../.agents/skills/implement-spec/SKILL.md). David's standing
preference: delegate well-defined mechanical edits to Codex (`codex exec`,
see the codex skill); you own verification, screenshots, and checkpoints.

**Next pickup point:** slice `00-mask-owners` (the foundation everything else
consumes), then `01-city-snap` (the re-bake that moves anchors — a human
checkpoint), then the lanes fan out (see the graph below).

**How to verify (hard-won recipes — read before running anything):**
- Start your OWN dev server: `cd web && node node_modules/.bin/vite --port 5199
  --strictPort &` and pass `VERIFY_URL=http://localhost:5199` to every scene
  run. Port 5173 usually belongs to another worktree — verifying against it
  silently tests stale code. After editing a shader/package file, vite can
  serve a stale module for one run: if a change shows 0 px diff, restart vite
  with `--force` and re-run.
- Scene gates: `VERIFY_URL=... VERIFY_GPU=1 node scene.mjs <scene>`; bless with
  `UPDATE_SHOTS=1`; filter with `SNAP=<substr>`. Baselines in
  `web/shots/campaign/`.
- Rust changes: `cargo test -p mapgen -p campaign`; re-bake via the mapgen bin
  (writes `web/public/data/campaign-map.json` + bg; **never hand-edit those**);
  `bun run build:wasm` after crates changes that feed the frontend.
- **The find-map-bugs oracle** (.agents/skills/find-map-bugs): the regression
  gate for this spec. It is EXPENSIVE (≈20 vision agents/shot) — run it at
  **lane close-outs and the final sweep only** (each slice says which); per-
  slice confidence comes from the deterministic probe (slice 00 builds it),
  cargo invariants, and scene snaps. Capture fresh shots for it; judge crops
  land in the run's workdir. Subagent fan-outs stall silently after network
  blips — if a run goes >15 min quiet, nudge/resume it rather than waiting.
- Every visual slice: screenshot-critique last; compare-screenshots vs the
  prior look and vs the slice's evidence crop.

**Active warnings:**
- origin/main carries 13 PRE-EXISTING battle failures (dc6b7e2e tuned
  crowd/camera/animation without re-blessing battle baselines: photoreal
  lighting/parity/sky/shadows, overlays, smoke, grass, banner-plant, minimap).
  Not caused by this spec. The battle firewall here = no NEW failures beyond
  those 13; campaign + campaign-models + water-sea are fully green and stay so.
- The main checkout's prebuilt `web/src/wasm` is STALE vs main's crates
  (missing `loosing_ptr`) — always `bun run --cwd web build:wasm` in a fresh
  worktree; rustfmt may need `rustup component add rustfmt`.
- `01-city-snap` re-bakes and MOVES city positions — do not build label/card/
  road work on pre-bake anchors; do not bless downstream baselines before its
  checkpoint passes.
- Battle HUD scenes are a hard firewall every slice (shared bronze tokens).
- Re-blessing discipline: only the slice's own visual variable may diff its
  baselines; an unrelated diff is a stop-the-line finding.

### Global TODO checklist
- [x] `00-mask-owners` — land-truth owners on both sides of the bake + the probe tool (red baseline)
- [x] `01-city-snap` — B1: cities snap to the rendered mask w/ margin; invariant bridge; re-bake ★human
- [ ] `02-roads` — B7b: Cosa/Tarracina/Ostia road gaps; named suspect: roadEdgeIsLandSafe whole-edge drop (in flight: lane-roads)
- [ ] `03-sea-labels` — B3: fitter honored at rendered zoom; move-before-shrink; Adriatic legible ★human (in flight: lane-sea-labels)
- [x] `04-city-labels` — B2+B8: land-aware anchor choice via the shared placement scorer ★human (shipped on lane-city-labels; ledger + close-out oracle in slices/04-city-labels.md)
- [ ] `05-territory-coast` — B4: wash conforms to the drawn coast; inland edges untouched ★human (in flight: lane-territory-coast)
- [ ] `06-scenery` — B9: scenery gated by the render mask (island beach + trees) (in flight: lane-scenery)
- [ ] `07-cards` — B5: Ostia model diagnose→fix; land-aware card anchoring (in flight: lane-cards)
- [x] `08-standard` — B6: hollow army standard repro→fix + livery model sheet
- [ ] `09-collision` — B7: one occupancy authority across canvas labels + DOM cards ★human
- [ ] `10-final-sweep` — full find-map-bugs on all three shots: zero confirmed findings ★human → close-spec

### Lane graph (parallelize after 00/01)
```
00-mask-owners  ──────────────────────────────┐
 └─ 01-city-snap ★ (moves anchors — global gate for 02/04/07)
     ├─ LANE DATA:   02-roads
     ├─ LANE LABELS: 03-sea-labels (may start after 00, parallel with 01)
     │                └─ 04-city-labels (needs 01 + 03's scorer)
     ├─ LANE CARDS:  07-cards (needs 01)
     ├─ LANE GPU:    05-territory-coast (needs only 00)
     ├─ LANE SCENERY:06-scenery (needs only 00)
     └─ LANE MODEL:  08-standard (independent)
     09-collision (needs 04 + 07 — arbitrates FINAL geometry)
     10-final-sweep (needs all)
```
Oracle budget: one find-map-bugs run per lane close-out (data: regional;
labels: whole-map; gpu+scenery+cards: regional; model: folded into final)
plus the full three-shot final sweep — ~4–5 runs total, not per-slice.

## Locked invariants (from specs/done/campaign-map-polish — do not break)
1. Map data is bake-owned: position/graph fixes go through crates/mapgen +
   re-bake. Never hand-edit the JSON; never add frontend coordinate transforms.
2. One projection: `toScreen`/`screenToWorld` only.
3. One label system: the mapPass canvas emitter + DOM cards; an entity never
   renders on both; no second labeler, no per-callsite placement forks.
4. One territory material; the wash stays 0.62; the dual faction border strips
   stay; the nearest sampler stays (no blur regression).
5. One bronze token source; battle HUD scenes green.
6. Two-color rule: icons faction-colored; allegiance = card / engraved label /
   red sword.

## New single-owner contracts this spec creates
- **Land truth has two owners, one per side of the bake, both defined as "the
  campaign-bg pixels":** mapgen's painted raster (bake side) and `TerrainField`
  (frontend side), which grows a full-resolution query beside its existing 8 km
  grid. A cargo test pins bake-vs-frontend agreement on a probe grid. The 8 km
  grid is deliberately NOT retired — it owns height/biome/territory claims;
  division of labor: point-truth → full-res, area statistics → 8 km. No caller
  anywhere classifies pixels privately; the shader-side sea classifier is
  hoisted once and shared (mapPass + territoryPass).
- **One placement scorer** in mapPass (grown from the sea-label fitter in 03,
  reused by 04): candidates × land-fraction scoring with true atlas metrics.
  A third placement implementation anywhere is a review-reject.
- **One collision authority** (09): the mapPass occupancy cull, extended with
  card rects reported from the scene loop; one exported rect-math helper; cards
  report, never arbitrate privately.

## Visual provenance
`assets/evidence/` — David's four feedback crops (`david-*.png`) plus one
centered, judge-verified crop per bug class (`b1-*` … `b9-*`), produced by the
find-map-bugs skill's adversarial pipeline. Each slice names its crops; "done"
means the defect in those crops is gone from a fresh capture of the same view.

## Bug → slice index
| Bug | What | Slice |
|---|---|---|
| B1 | 12 cities render offshore (mask schism) | 01 |
| B2 | city labels seaward of markers (Tarraco, Corinthus) | 04 |
| B3 | sea names on land (Black/Adriatic/Atlantic/Aegean) | 03 |
| B4 | jagged faction coastline | 05 |
| B5 | Ostia card floats, model missing; Minturnae overhang | 07 |
| B6 | hollow army standard | 08 |
| B7 | label/card collisions (Londinium/Arverni; Roma/Ostia cards) | 09 |
| B7b | road gaps (Cosa, Tarracina, Ostia) | 02 |
| B8 | long names overflow coast (Castrum Truentinum) | 04 (acceptance check) |
| B9 | scenery on water (island beach decal + trees) | 06 |
