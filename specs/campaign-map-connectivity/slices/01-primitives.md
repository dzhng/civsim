# S1 — `connectivity.rs` primitives (pure, tested)

## Contract
Three deterministic pure functions with unit tests, no pipeline wiring yet — the
computed classifier exists and is trustworthy before it drives any mutation.

## API seam
New `crates/mapgen/src/connectivity.rs` (module in `main.rs`):
- `pub fn landmass_labels(raster: &Raster) -> Vec<u32>` — 8-neighbour union-find /
  flood over land cells (`is_land_cell`), one O(cells) pass; deterministic
  (row-major).
- `pub fn main_component(map: &Value, capitals: &[NodeId]) -> BTreeSet<NodeId>` —
  BFS from the playable capitals over **road AND sea** edges (sorted adjacency).
- `pub fn is_reconnectable(city_pos, in_m: bool, m_nodes, labels, raster) -> bool`
  — the shared predicate: `!in_m && ∃ m_node on the same landmass label within
  `RECONNECT_MAX_GAP_KM` straight-line`. No A\* (kept cheap for the invariant).
- `landroute::astar_land_path` made `pub` (drawing only; used in S3).

## Human runs / sees
`cargo test -p mapgen connectivity::`.

## Verification (unit tests on synthetic rasters — assert values, not counts)
- **Two-landmass-one-lane:** two land rects separated by a carved water channel,
  bridged by ONE sea edge → `main_component` spans both landmass labels; a city on
  each is `in_m`.
- **Britain shape:** a third rect with an internal 2-city road loop and no lane →
  its own landmass, `∉ M`, and `is_reconnectable == false` (no near `M` node).
- **Same-landmass-far-node island:** a city on the SAME land rect as an `M` node
  but beyond `RECONNECT_MAX_GAP_KM` → `is_reconnectable == false` (pins the
  Crimea/mega-landmass case).
- **Near mainland port:** a city on an `M` landmass within the cap →
  `is_reconnectable == true`.

## Human review checkpoint
Confirm the fixtures encode Britain (multi-city, degree > 0, out of `M`) and the
same-landmass-far-node island — the two cases the old degree-0 check missed.

## What must stay green
Existing `cargo test -p mapgen`; **map artifacts must not change** (`git diff
web/public/data` empty — this slice adds no bake step).

## What would change this slice
S0 shows a global cap can't separate the sets → `is_reconnectable` takes a
per-landmass cap instead of one constant.

## Firewalls inherited
Determinism (BFS sorted-id, flood row-major); one land-truth owner (`is_land_cell`);
no I/O in the pure functions.
