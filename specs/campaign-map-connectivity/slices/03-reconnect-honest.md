# S3 — Reconnect roads + honest computed invariant (coupled)

The load-bearing slice. Reconnect and the invariant swap land **together**:
reconnect breaks the old `validate_sea_only_cities` assert, and the honest
invariant can't pass until reconnect runs. Do not split them (avoids a
transitional regenerated hand-list).

## Contract
Every reconnectable disconnected city gets a real land road into `M`; the
invariant becomes computed — a disconnected **mainland** city FAILS, a true island
passes; `SEA_ONLY_CITIES` + `validate_sea_only_cities` are deleted.

## API seam
- `connectivity::descope_and_reconnect(out_dir, raster, rivers, mountains, bb)` —
  supersedes the S2 descope call in `main.rs` (still after `dequalify-names.mjs`,
  before `make_committed_roads_land_safe`). It descopes, then **Prim-to-fixpoint**:
  compute `M`; among non-`M` cities with `is_reconnectable`, repeatedly connect the
  one with the shortest `astar_land_path` to its nearest same-landmass `M` node;
  append `EdgeJson{a:cityId, b:targetId, kind:"road", via:[a.pos,…A*…,b.pos],
  tiles: classify_route_tiles(...)}`, extend `ambush_spots`, fold into `M`, iterate
  (sorted by city id → deterministic). **Panic** (with the city name) if an
  `is_reconnectable` city has no A\* path — never silently island a mainland city.
  Peninsula-port fallback: retry A\* at `margin_cells = 0` (the existing
  `landroute` pattern) before panicking.
- **Detour cap:** reconnect uses a **relaxed** cap (a new param on the now-`pub`
  `astar_land_path`), distinct from `reroute_road_via`'s tight water-reroute cap.
- **Invariant rewrite** (`main.rs`): replace the `island_cities` exemption +
  `sea_only_actual == SEA_ONLY_CITIES` block with: re-derive `M` +
  `landmass_labels` from the committed graph + PNG, then assert **every city ∉ `M`
  is NOT `is_reconnectable`**. Delete `SEA_ONLY_CITIES` + `validate_sea_only_cities`.
  Keep water-city / margin-water / road-on-water / ferry-ledger / `sea_edges == 3`
  / junction-degree asserts unchanged.

## Human runs / sees
Re-bake (`cargo run -p mapgen --release`) → roads across Sicily's interior→Messana,
Prusias→Nicaea, Malaca→Corduba, Sinope, Populonium; Britain/Cyprus/Sardinia/Rhodes/
Balearics/Aegean still roadless muted islands. Bake log: "reconnected N components,
added N roads (… km); islands: [Britain(14), Rhodes, Caralis, …]".

## Verification
- `cargo test -p mapgen` green with the computed invariant; `make_committed_roads_land_safe`
  accepts every injected road (no unledgered water run → else bake panics).
- **Prove the invariant bites** (temporary, reverted, documented not committed red):
  (a) delete one reconnect road → the freed mainland city FAILS by name; (b) move a
  Black-Sea outlier's pos onto the near-Anatolian coast → FAILS.
- **[find-map-bugs](../../../.claude/skills/find-map-bugs/SKILL.md)** on a fresh
  full-map shot + regional crops: Sicily, Bithynia (Prusias/Nicaea), Baetica
  (Malaca), Etruria (Populonium), Paphlagonia (Sinope) — no dead-end roads, no road
  over water, no road spearing mountains, no floating city; and island crops
  (Britain, Cyprus, Sardinia) showing zero phantom mainland road.
- **[compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md)**
  each reconnect crop against the pre-reconnect baseline (less-wrong verdict on the
  new roads), then
  **[screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md)** as
  the last unprimed check before accepting the shots.
- Re-bless campaign map baselines (roads are a visible change) via
  [screenshot-regression](../../../.claude/skills/screenshot-regression/SKILL.md)
  (SwiftShader/headless, `VERIFY_GPU=1`, per-worktree `VERIFY_URL`).

## Human review checkpoint (non-blocking)
Open the reconnect crops + the island roster with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md): (a) are the added
roads geographically sane (natural chains, not one long spoke to Messana)? (b) does
the island roster contain any name David expects to be mainland (→ investigate
raster/cap/snap, don't accept)? Give ~5 min; if silent, decide on the evidence,
record it here, close the shots, proceed.

## What must stay green
All existing `cargo test -p mapgen` invariants; the mask probe.

## What would change this slice
A reconnectable city keeps panicking (unroutable at raster resolution) → either
accept it as a true island (if genuinely cut) or add a short ferry-ledger entry;
record per-city. If the added roads read as unhistorical shortcuts → tighten the
cap and re-bake.

## Firewalls inherited
Bake determinism (sorted fixpoint, integer A\* keys, no RNG); reconnect roads pass
`make_committed_roads_land_safe`; reconnect is post-flood (no recolor); one land-truth
owner; never hand-edit artifacts.
