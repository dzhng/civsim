# Battle map style + procedural generator

Make every battle map read in the style family of the reference vista — tall
background cliffs walling the map edges, a rolling grass sea with pockets of
water, heavy aerial haze — and replace the three hand-painted maps with a
seeded, deterministic, sim-side **procedural battle map generator**. This is a
style-family target, **not** image replication: the predecessor spec burned on
exact-match chasing and was closed (see Provenance).

Reference images (in `assets/` and the aesthetics skill):

- `.claude/skills/aesthetics/references/battle-overcast-highland.png` — the
  perspective style target. Per the aesthetics skill this is a *lighting
  condition over the shared Aegean materials*, not a separate art style.
- `assets/topdown-heightmap-inspiration.png` — loose macro-topology
  inspiration (eroded ridge walls at the flanks, rolling central plains, a lake
  pocket, drainage traces, open plains at north and south). Guides the
  generator's *layout grammar*, never a pixel target.
- `assets/target-battle-map.png` — the predecessor's perspective reference,
  kept for continuity.

## Next Agent Prompt

**Status 2026-07-05: slices 00–06, 10–18 DONE (live-verified except noted).** The
generated-map pipeline is feature-complete for the compose gate: seeded
seal grammar (organic cliff/forest/water flanks), certified corridors and
deployments, one natural lake pocket rendering as real water, passable
field-texture variety in the corridor, fracture-rock walls, the TW vista
apron + fog ring, production blade grass, and three curated named generated
maps in the Quick Battle picker. The compose gate accepted the
overcast-highland register. Next pickup: [19-campaign-seam](slices/19-campaign-seam.md).
Read the recorded traps: slice 10 TSL hazards, slice 11
integration findings, slice 04 shoreline lessons, slice 15 water-classifier
notes, slice 18's curated-seed pins, and 00's camera/oracle amendments.

Before writing any code, read:

1. **The rejection ledger** — `specs/done/battle-map-reference/README.md`.
   ~25 grass primitive families were tried and rejected there. They are
   **banned re-entries**. The only grass architecture this spec permits is the
   salvaged False Earth source-storage core (see Salvage Map). If a grass gate
   fails, the fix is parameters/records/budgets inside that architecture, or a
   reslice memo — never a new primitive family.
2. **The salvage map** below — substantial working code exists on the local
   git ref `pr-3-review` (read with `git show pr-3-review:<path>`). Do not
   rebuild what it already proves.
3. The `renderer` skill before touching TSL; the `aesthetics` skill before
   choosing any visual constant; `tweak-campaign` only if slice 19 is active.

**Global TODO** (update this list and the status line before ending any pass):

- [x] 00 — Composition + oracle lock (judging apparatus pinned before art)
- [x] 01 — Genmap skeleton (seed → playable battle, end to end)
- [x] 02 — Landform (macro mask × warped noise, clay verdict; real-pipeline
      clay + apron-dish debts routed to slice 03)
- [x] 03 — Passability from landform (BFS certificates)
- [x] 04 — Hydrology (priority-flood lakes, descending rivers, fords)
      CODE-LANDED BMS04-SLICE-B6D9; corrected BMS04-FIX-D2C7 after browser
      evidence; orchestrator still owes browser run and passability-mask
      baseline blessing.
- [x] 05 — Edge grammar + deployment guarantees
      CODE-LANDED BMS05-SLICE-A9E1; seed 7 remains cliff/cliff. Slice 06
      intentionally moved the generated terrain hash. Orchestrator still owes browser run and
      `battle-genmap-seeds` + generated elevation baseline blessing.
- [x] 06 — Seed variety + seed browser
      CODE-LANDED BMS06-SLICE-C1F4; seed 7 hash moved to
      `0x5b0bcb8dd7e7f22f` after BMS17B-A6E9 raised flank/vista ranges. Browser scene
      exists and the seed-browser artifact was generated via wasm-only Node
      fallback because Playwright Chromium is blocked in this sandbox; the
      orchestrator still owes a real scene run/human checkpoint.
- [x] 10 — False Earth grass port (close-gate ratification)
- [x] 11 — Grass battle integration (swap + delete tuft path, perf gate)
  CODE-LANDED BMS11-SLICE-E9C4; orchestrator still owes battle scenes, vista +
  close-gate crops, battle baseline re-bless, perf:30k hardware, elevation
  tripwire, and wind GIF.
- [x] 12 — Grass LOD budgets at 30k
- [x] 13 — Cliff material
- [x] 14 — Vista backdrop (DECIDED: render-only apron, world = 2× playable)
- [x] 15 — Lake render
      CODE-LANDED BMS15-SLICE-B8D2; orchestrator still owes browser run,
      golden + overcast lake baseline blessing, screenshot-critique,
      perf:30k hardware, and the battle-terrain-elevation tripwire.
- [x] 16 — Haze / mood preset
      CODE-LANDED BMS16-SLICE-D5A3; overcast-highland preset + fog runway
      + fade-to-skybox aerial blend + generated-map default scene landed.
      Orchestrator still owes browser run/blessing, unprimed critique, and
      final affected-baseline approval.
- [x] 17 — Compose gate (round 3 ACCEPTED for overcast-highland; 3 polish debts routed — see slice)
- [x] 18 — Curated seeds in the catalog
      CODE-LANDED BMS18-SLICE-F7C3; curated Quick Battle entries:
      Shore & Crags (seed 1 water flank), Highland Vale (seed 7 pinned
      cliff/cliff), Wooded Pass (seed 8 forest flank). Cargo genmap pins
      hashes/certificates. Orchestrator still owes browser run/blessing for
      `battle-genmap-curated` and non-blocking visual review.
- [ ] 19 — Campaign seam (cuttable; may move to a successor spec)
- [ ] 20 — Retire the hand maps (David-gated; golden re-bless is the cost)

## Slice graph

Two decoupled tracks meet at the compose gate. G-track ships gameplay value
with zero style work; V-track ships style value on the existing hand maps with
zero generator work. Neither track's rejections stall the other.

```text
00 composition/oracle lock ─┬──────────────────────────────┐
                            │                              │
G: 01 skeleton → 02 landform → 03 passability → 04 hydrology → 05 edges → 06 variety
                     │ (clay judged via 00)                     │            │
V: 10 grass port → 11 grass swap → 12 grass LOD ────────────────┼──► 17 compose
   13 cliff material → 14 vista backdrop (dep 02/05) ───────────┤       │
   15 lake render (dep 04) ── 16 haze/mood (dep 11,13 accepted) ┘       │
                                                                        ▼
Adoption: 18 curated seeds → 19 campaign seam (cuttable) → 20 retire hand maps
```

## Architecture invariants (one owner per concept)

- **The sim owns terrain truth.** The generator is `crates/sim/src/genmap/`
  (module, not a crate): `generate(&MapRecipe) -> Terrain`, pure and
  deterministic, writing `height/speed/rough/tint` fields directly (never
  stacked paint ops). The renderer is a pure consumer of `BattleTerrainGrid`;
  it never derives or reinterprets passability.
- **The rendered world follows the Total War tile-map model** (David,
  2026-07-04). One height function spans the full extent, sampled in three
  bands: the playable `Terrain` at 4 m cells; a render-only `VistaGrid` at
  16 m cells out to 2× the playable rect; a far fog ring at 64 m cells out to
  ~3–4×, where fog always reaches full opacity before the outer edge
  (band-limited, seam-welded, shared-source normals — slice 14; fog values —
  slice 16). Units are confined by the invisible wall at the playable
  boundary, which must sit inside the visual footprint of the E/W terrain
  seals. The sim never reads the vista bands.
- **One canonical vertical scale.** Generated maps author true meters and
  render at relief exaggeration **1.0**; passability derives from the same
  meters the renderer draws. `BATTLE_RELIEF_EXAGGERATION = 1.6` becomes a
  per-source value that only the three hand maps use — a named short-lived
  seam removed by slice 20.
- **Determinism is a contract.** Integer-hash value noise only — no
  transcendentals in any field that feeds `speed` — so wasm and native cannot
  drift. Same seed → byte-identical `Terrain`, pinned by golden-hash tests.
- **Acceptance is a certificate, not a vibe (G-track).** Every generated map
  must pass BFS certificates: N–S corridor connected at ≥ army-frontage
  width, W/E flank bands unreachable, deployment bands passable and
  slope-bounded, water level-set and descending. Certificates are library code
  in `genmap/certify.rs`, called by cargo tests over multi-seed sweeps and
  debug-asserted in `generate`.
- **One grass data owner, one grass render owner.** Data:
  `packages/game-renderer/src/battle/grassField.ts` (`GrassFieldRecord`,
  16-float pack — maps 1:1 onto the False Earth 64-byte blade record). Render:
  one blade layer in `packages/photoreal-renderer` (slice 11 deletes the tuft
  path in the same slice that lands the replacement — no parallel grass
  abstractions, no long-lived flags).
- **One mood owner, one aerial owner.** Extend `CIVSIM_ENVIRONMENTS` /
  `applyCivsimEnvironment`; all haze through `scene.fogNode`. No
  material-local fog, no albedo tinting to fake mood, ever. Fog lands last
  (16) so it can never launder failed geometry or grass.
- **One water surface family.** Lakes generalize `seaLayer`'s material to
  per-basin levels; no second water material.
- **One oracle.** The salvaged grass-legibility lib + its calibration scene
  judge every grass crop. Acceptance always pairs positive and negative
  anchors (target passes, grass-off and known false-positives fail) or the
  metric will be gamed — that is recorded history, not a hypothetical.
- **TSL rules stand.** `time` node banned (owned time uniform only); `three`
  version pinned; no new render code in `packages/game-renderer/src/battle/*`
  (data owners there stay).

## Style contract

- **Register:** the aesthetics skill's Bronze-Age Aegean world under the
  `battle-overcast-highland` lighting condition. Materials stay neutral and
  shared; the environment preset owns the mood. The same map must also read
  correctly under `golden-hour`.
- **Foreground:** dense tall grass with visible blade structure at the close
  camera, collapsing into meadow mass with distance — the False Earth
  architecture, green/olive from the shared battle palette.
- **Flanks:** terrain-owned cliff/ridge walls (with optional forest or water
  seals), never detached backdrop cards. Gaps are allowed — the sim closes the
  boundary — but seals must be *visually* motivated where passability says
  blocked.
- **North/south:** open plains where the armies arrive, dissolving into haze.
- **Water:** lake pockets sitting in real hollows with physically consistent
  shorelines.
- **Depth:** aerial perspective does the composition work — far terrain lifts,
  desaturates, and flattens into the high-key sky.

## Salvage map (local git ref `pr-3-review`)

| Asset | Where | Take |
|---|---|---|
| False Earth grass core | `apps/renderer-lab/src/falseEarthCloseGrass.ts` | Only the source-storage core (~600 of 2301 lines): packed 4×vec4 blade records, camera-snap placement, Voronoi clumps, compute reset/route → 3 indirect LOD tiers (15/5/2 segs @ 0–5/5–20/20–64 m), Bézier spine + view-thickness, ramp/AO/desat material. CPU records only (GPU generator hash mismatches). Palette is RED — use the shared battle palette instead. Wind is baked static — drive from the owned time uniform. |
| Passability algorithms | `packages/game-renderer/src/battle/referenceHighlandHeightmap.ts` | The *algorithms*, re-expressed in Rust: slope field → cliff seed + dilation → edge-connected highland cap (border BFS over a height threshold) → speed mask; BFS reachability certificates. Discard the 150-magic-number hand-sculpted height field itself. Fix its two flaws: drainage must follow the gradient; passability must use the canonical vertical scale. |
| Legibility oracle | `web/scenes/battle/battle-map-reference-grass-legibility-lib.js` | Carry verbatim; recalibrate thresholds once in slice 00 against the new target crops; keep the calibration scene pattern. |
| Verification patterns | slice docs + scenes on the ref | Camera/crop lock, clay-first landform review, passability mask colored from sim speed, close-gate (≈12 px/blade) vs vista (≈4.5 px/blade) ratification split, stratified LOD budgets, screen-coverage probes. |

## Research (primary sources; captured 2026-07-04)

Generator: macro control-map × detail noise with a detail budget clamped in
the playable corridor (the Total War "Low Frequency Map" pattern,
https://wiki.totalwar.com/w/Terry_-_Low_Frequency_Map); ridged multifractal +
one domain warp for the flank walls (https://iquilezles.org/articles/warp/,
https://iquilezles.org/articles/fbm/); slope-erosion via analytical
derivatives and a sharpness blend from No Man's Sky's uber-noise (GDC 2017,
https://github.com/flo-bit/uber-noise); optional thermal relaxation at the
passable talus angle (~1–3 ms) as a passability convergence tool; **skip
droplet erosion** — at 4 m cells its dendritic signature is sub-Nyquist and
fights the rolling-plains read. Hydrology: priority-flood depression filling
(Barnes et al. 2014) — fill-diff *is* the lake mask; D8 flow accumulation →
threshold → carve rivers with fords where the corridor crosses
(https://github.com/redblobgames/mapgen4). TW battle fields are ~1–2 km²
playable inside a much larger visual tile — our 2400×1600 m playable rect plus
a vista band matches the convention. Grass: Ghost of Tsushima GDC 2021
(Bézier blades, tile compute, cull → indirect draw,
https://gdcvault.com/play/1027033) and a TSL implementation at ~1.18 M blades
/ one draw call / 120 fps (https://aleksandargjoreski.dev/blog/growing-my-grass-shader/)
— blade ring ~150–250 m around the camera target, stochastic distance
thinning, terrain texture beyond; haze eats the LOD seam. Vista/out-of-bounds
terrain: Total War renders ~8 km around a ~2 km playable square, vista as a
low-frequency heightmap (https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro,
https://wiki.totalwar.com/w/Terry_-_Low_Frequency_Map); crack-free two-rate
seams and transition morphs from geometry clipmaps
(https://hhoppe.com/geomclipmap.pdf); fog must saturate at or before the vista
edge; vista excluded from shadow casting with CSM fit to playable bounds
(https://gpuopen.com/learn/optimizing-terrain-shadows/).

## Verification rules

- Every visual slice runs **screenshot-critique** (unprimed) as the last check
  before acceptance, and **compare-screenshots** whenever there is a target or
  prior look to judge against. Metrics guard; the less-wrong verdict decides.
- Visual slices judge **one variable through the slice's named crop/mask**;
  whole-frame verdicts wait for slice 17.
- Human checkpoints are **non-blocking**: open shots with preview-shots, wait
  ~5 min, then decide on evidence, record the decision in the spec, close the
  shots, and proceed.
- Standing gates every slice: `perf:30k` (web) — 30k soldiers ≤ 33 ms on
  hardware; the `battle-terrain-elevation` seating tripwire; full cargo suite;
  deliberate snapshot re-bless only.
- G-slices never touch renderer look constants; V-slices never write
  `speed`/`rough`; nobody touches sim combat mechanics or the three hand maps'
  bytes before slice 20.

## Provenance

Supersedes `specs/done/battle-map-reference/` (closed 2026-07-04 as
superseded, not shipped) — its README carries the grass rejection ledger and
the exact-replication post-mortem. The battle-side work of closed PR #3
(`codex/battle-map-reference-source-pr`) is preserved on the local ref
`pr-3-review`; its campaign-side diffs are a stale-worktree revert and must
never be cherry-picked.
