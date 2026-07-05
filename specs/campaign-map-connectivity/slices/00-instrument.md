# S0 — Instrument the disconnection (measure the cap)

**Instrument-first** (repo memory: trace every force to its source before
hypothesizing; no knob sweeps). This slice produces the data that sets
`RECONNECT_MAX_GAP_KM` and validates the mainland/island partition, *before* any
road is drawn or any const is deleted.

## Contract
A printable table of every post-descope city **not** in the main component `M`:
`{name, landmass_id, in_M, nearest_M_node, straight_gap_km, astar_path_km|none,
currently_in_SEA_ONLY_CITIES}`. The table must show a **clean numeric gap** in
`straight_gap_km` between the reconnect set (Prusias, Malaca, Sinope, Populonium,
Panormus/Syracusae/Agrigentum/…) and the island set (Britain, Cyprus, Sardinia,
Corsica, Crete, Rhodes, Balearics, Aegean + Crimea/Caucasus outliers).

## API seam
- A `mapgen connectivity-report` subcommand (parallels the existing `probe`
  subcommand in `main.rs:22`), reusing the draft `connectivity` primitives from
  S1 (or inline scaffolding folded into `connectivity.rs` at S1). Owner:
  `connectivity.rs` (temporary reporting entry point).
- Reads the **committed** map + rehydrates the committed PNG via
  `raster::Raster::from_rgba` (same as the invariant), computes `M` by BFS from
  the 6 playable capitals over road+sea edges, labels landmasses, and for each
  non-`M` city finds the nearest `M` node on its own landmass.

## Human runs / sees
`cargo run -p mapgen --release connectivity-report` → the table. Britain prints
as a 14-city component (degree > 0, no near `M` node → island). Prusias prints
degree 0, ~N km to Nicaea/its Bithynian hinterland → reconnect.

## Verification
- No automated gate (telemetry only). Existing `cargo test -p mapgen` stays green
  (nothing mutated).
- Assert only informational sanity: exactly one `M`, and all 6 capitals ∈ `M`.

## Blocking human checkpoint
Open the table for David. He confirms the reconnect/island split and the chosen
`RECONNECT_MAX_GAP_KM` (a value inside the numeric gap). This is the plan's go/no-go
— it fixes the reconnect target list. Non-blocking fallback per repo norms: if David
is away, pick the cap at the midpoint of the widest gap in the measured distribution,
record the value + rationale here, and proceed; the S3 island-roster review is the
second gate that can still catch a bad cap.

## What must stay green
`baked_campaign_map_satisfies_mapgen_invariants`, `committed_mask_probe_matches_regenerated_probe`.

## What would change this slice
No clean gap exists (e.g. Sinope's gap overlaps a Crimean outlier's) → escalate
from a single global cap to a **per-landmass** rule, and reslice S1's predicate.

## Firewalls inherited
Determinism (sorted output, BFS/flood in fixed order); one land-truth owner
(`raster::rgb_is_land`); artifacts untouched.
