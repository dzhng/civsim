# 07 — mapgen fix + single re-bake

**Contract unlocked:** every city node projects onto land, and the road graph has
no dead stubs / orphan components. One Rust change, one re-bake, carrying both the
D-fix (cities on land) and the L-data fix (road hygiene). This is the spec's only
cross-cutting serialization point — it shifts positions.

## CONCRETE TARGETS (from slice 06 diagnosis)
- **Cities:** snap the 37 on-water port cities to nearest land (36 need ≤6km; all
  read as coastal ports at the waterline). **Cnidus** (@ [834,-104], 14km offshore)
  is the one genuine outlier — verify after snap; if the snap lands it oddly, give
  it a manual `crates/mapgen/overrides.json` position instead.
- **Roads:** remove the 17 degree-1 junction stubs + 83 degree-0 junctions; drop or
  reconnect the two isolated road components (25 and 5 nodes). Keep the 59 sea-ports.

## API seam (single owner — projection + build pipeline, invariant 1)
- `crates/mapgen/src/build.rs`: it already drops edge-less *sites* (~217-218);
  extend to drop degree-1 junction stubs and reconnect the two disconnected road
  components. Apply the D-fix per slice 06's verdict — `crates/mapgen/overrides.json`
  position table (lowest risk), or a `project()`/site-snap fix if 06 found a
  systematic projection error.
- **No frontend transform** — positions stay read verbatim from JSON.
- Re-bake: confirm the exact invocation (README notes `cargo run -p mapgen
  --release`, which writes `web/public/data/campaign-map.json` + the dist copy and
  runs leagues + prune-cities). Then `bun run build:wasm`.
- **Firewall:** `build.rs` pruning + overrides + projection only — do NOT re-touch
  the renderer cull (05 owns that); never hand-edit the JSON (re-bake only).

## What the human can see
- `whole-political` + coastal regionals + the fixed cities on land.

## Verification
- A cargo assertion in mapgen: degree-0 / degree-1 / component counts hit target
  and the 59 legit sea-ports are preserved (don't over-prune).
- New scene `campaign-cities-onland`: assert every city node's `pos` lands on the
  land raster.
- Re-run slice 05's road scene — holes closed.
- **compare-screenshots** vs feedback #4/#5 (cities) and #11–13 (roads).
- **screenshot-critique** last. Re-bless only the position-asserting scenes.

## Stay green
- mapgen cargo tests; campaign JSON schema/loader; all campaign scenes (positions
  will shift — re-bless deliberately, confirm nothing else moved unexpectedly).

## Feedback that would change this slice
- A city moved to the wrong land spot → adjust its override entry.
