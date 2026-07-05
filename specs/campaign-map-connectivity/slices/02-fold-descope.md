# S2 — Fold `descope-sea-lanes.mjs` into Rust (artifact-identical)

Move the sea-lane pruning into the Rust owner with **zero behavior change** — the
safest possible first mutation, and it establishes `connectivity.rs` as the graph
owner before S3 adds reconnection.

## Contract
`connectivity::descope_sea_lanes(map: &mut Value)` reproduces the `.mjs` exactly:
keep only the 3 `KEEP_SEA_LANES`, drop other sea edges, drop the replaced
Constantinopolis↔Nicomedia road ferry, iteratively prune junction dead-ends (≤1
edge), remap `ambush_spots` via original-index tags. `main()` drops the
`post_step("…descope-sea-lanes.mjs")` and calls the Rust step (after
`dequalify-names.mjs`, before `make_committed_roads_land_safe`). The `.mjs` file
is deleted; the 3-lane const now lives once as `KEEP_SEA_LANES` (retire
`descope`'s `KEEP`; update `prune-cities.mjs`'s `LANE_ENDPOINTS` cross-ref).

## API seam
`connectivity::descope_sea_lanes`; called from `main.rs`. Owner: `connectivity.rs`.
Reuses no JS. Final serialization stays serde in Rust, so JS-vs-Rust key ordering
never reaches the artifact.

## Human runs / sees
`cargo run -p mapgen --release`; then `git diff web/public/data/campaign-map.json`.

## Verification
- **Gate: committed `campaign-map.json` byte-identical** to pre-S2 (pure
  relocation — the strongest gate). If a legitimate sort-order difference appears,
  fall back to: invariant + mask probe green AND campaign screenshots unchanged,
  and mirror the JS iteration order to recover byte-identity.
- Full `cargo test -p mapgen` green (this slice adds no reconnection, so
  `sea_edges == 3` and `SEA_ONLY_CITIES` still matches).
- Port the ambush `_oi` remap under a Rust unit test.

## Human review checkpoint
Confirm zero artifact drift from the diff; confirm no other `.mjs` post-step
assumed the descope ran in JS.

## What must stay green
`baked_campaign_map_satisfies_mapgen_invariants`, `committed_mask_probe_matches_regenerated_probe`.

## What would change this slice
Byte-identity is uneconomical to reach → keep it as a thin fallback (leave
`descope-sea-lanes.mjs` and have `connectivity.rs` consume its output); S3 still
delivers the full win. Record the decision here if taken.

## Firewalls inherited
Never hand-edit artifacts (bake regenerates); determinism (BTreeSet order replaces
JS Map order); battle untouched.
