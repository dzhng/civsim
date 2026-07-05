# Campaign Map Connectivity

Give the campaign map ONE coherent connectivity model, owned by ONE computed
step. Every *reachable* city is on the main network (roads + the 3 sea lanes);
every *unreachable* city is a true island held as a passive neutral faction that
teases a future sea-travel expansion. No fake land bridges, no hand-maintained
allow-list, no silently-stranded mainland city.

> **The straits + lanes + Rhegium + solid-lane render already SHIPPED** (on
> `main`, commit range `a8b24000..71e19b71`). See "Shipped" below. This spec now
> covers the **remaining** connectivity work: reconnect the land-reachable
> cities, keep true islands as neutral holdings, and make the invariant honest.

## The model (definition of done)

- **3 sea lanes**, each joining two CITIES: Gades↔Tingi (Gibraltar),
  Constantinopolis↔Nicomedia (Bosphorus), Rhegium↔Messana (Sicily). *(Shipped.)*
- **Main component `M`** = BFS from the 6 playable capitals over **road + sea**
  edges. A sea lane bridges two landmasses, so Africa, Asia Minor, and Sicily are
  all *in* `M` via their lane endpoints.
- **Reconnect, don't delete or strand.** Every disconnected city that is
  land-reachable to `M` gets a road along a real land path (`astar_land_path` on
  the carved raster). Sicily's interior reconnects to Messana; Prusias→Nicaea,
  Malaca→Corduba, Sinope, Populonium, etc. Reconnect runs *after* the ownership
  flood, so reconnected cities stay their existing neutral `league_*` owner — no
  recolor, no armies (goal below).
- **Keep true islands as passive neutral holdings — DO NOT DELETE.** A city with
  no land path to `M` within the cap (Britain's 14, Cyprus, Crete, Sardinia,
  Corsica, Rhodes, the Balearics, the Aegean islets, the Crimea/Black-Sea/Caucasus
  outliers) stays exactly as it is today: owned by a non-playable `league_*`
  faction with `ai_persona: 'neutral'` (garrisons, never marches), and armed by no
  `start_armies` entry. **This state is ALREADY correct in the bake — the feature
  changes nothing about islands except to stop lying about them.** They tease a
  future expansion; David chose to keep their current muted neutral-league look.
- **The invariant is computed, not hand-listed.** The bake and the test share ONE
  predicate. A disconnected **mainland** city (reachable-but-unconnected) is a
  BUG the test fails on; a true island is allowed. The 57-name `SEA_ONLY_CITIES`
  allow-list, `validate_sea_only_cities`, and the degree-0 exemption are retired.

## The island predicate (the load-bearing decision)

`is_reconnectable(city)` = **(city ∉ `M`) AND (∃ a node of `M` on the SAME raster
land-component, within `RECONNECT_MAX_GAP_KM` straight-line).** An **island** is a
city that is `∉ M` and NOT reconnectable.

Both halves are required, and each half kills a specific wrong answer:

1. **Same raster land-component** (8-neighbour flood over the *carved* land mask)
   — so a reconnect road never crosses water. Europe/Anatolia are distinct
   landmasses (Bosphorus/Hellespont carved), correctly bridged only by lanes.
2. **Distance cap to nearest `M` NODE** — because "same landmass" alone is NOT
   enough: the Afro-Eurasian mainland is ONE continuous 8-connected land region
   (Anatolia → Colchis → Pontic steppe → Crimea via Perekop). Tanais / Olbia
   Borysthenes / Pantikapaion sit on the *same landmass* as Antiochia yet are true
   islands — a pure-landmass rule would wrongly draw a ~1000 km steppe road to
   them. The cap is what separates "mainland-coastal that lost its sea link"
   (Sinope, Amastris — near a mainland node) from "effective island" (Crimea /
   Caucasus outliers — far from any node). **The cap is the one knob, and it is
   measured from data in Slice 0 — never guessed, never swept** (instrument-first).

**The merge is ITERATIVE (Prim-to-fixpoint), and that is what makes a single cap
work.** A city need not be within the cap of the *original* network — only within
the cap of the *growing* set. Sicily's Lilybaeum is 270 km from Messana but chains
in via short intra-Sicily hops once Syracusae bridges the first 131 km; Cape
Tainaron is 164 km from Corinthus but only 33 km from Gythion (which reconnects
first). So `is_reconnectable` is the **outcome of the iterative same-landmass
merge**, not a static per-city gap. The invariant runs the same cheap straight-line
merge (no A\*, ~71 cities); A\* only *draws* the road in the bake, which **panics**
if a merged city has no A\* path.

## Measured ground truth (S0 `connectivity-report`, committed map)

328 of 399 cities are in `M`; 71 are off-main (Britain's 14-city component + 57
degree-0). The report's **first-hop gaps show a clean break at 133↔158 km**:

- **Reconnect (~28):** mainland-coastal on landmass 6 with a first hop ≤133 km
  (Prusias 48, Sinope 132, Malaca 133, Cnidus 130, Gythion 132, Amastris 92, …),
  Cape Tainaron (33 km to Gythion), and all 6 Sicily-interior cities (landmass 77:
  Syracusae 131 → then Camarina/Panormus/Agrigentum/Selinus/Lilybaeum chain).
- **Island (~43):** the Black-Sea/Caucasus/Crimea rim whose first hop is ≥158 km
  (Tyras 158, Phasis 210, Dioscurias 250, Olbia Borysthenes 277 … Tanais 706),
  **plus** every offshore landmass with no `M` node at all (`nearest_main=NONE`):
  Britain-14, Cyprus (Paphos/Salamis/Amathous/Lapethos), Sardinia, Corsica,
  Balearics, the Aegean isles (Chios/Mytilene/Samos/Thasos), Crete, Rhodes, Malta,
  Cephalonia, Corfu, Djerba.

**`RECONNECT_MAX_GAP_KM = 140` km** (in the 133↔158 gap) — recorded in
`connectivity.rs`. Britain's 14-city component is an island (no `M` node on its
landmass) — the old degree-0 check was blind to it.

**Borderline cities the real 2 km-raster land-A\* must still adjudicate at draw
time:** Corcyra (Corfu — `NONE`, island), Chalcis (Euboea 24 km — reconnect if a
land bridge exists), Cyzicus (70 km), Sestus (29 km), and the snap-exempt
peninsula ports (Cnidus, Tainaron Pr., Meninge, Perinthus) — S3 retries A\* at
`margin_cells=0` then panics or islands per case.

## The single computed owner: `crates/mapgen/src/connectivity.rs`

One module owns "descope → reconnect → is-this-an-island," used by BOTH the bake
and the invariant (the `probe.rs` pattern: one function, verified against the
committed artifact).

```
pub const KEEP_SEA_LANES: &[(&str,&str)] =
    &[("Gades","Tingi"),("Constantinopolis","Nicomedia"),("Rhegium","Messana")];
pub const RECONNECT_MAX_GAP_KM: f64 = /* chosen from Slice 0 data */;

pub fn landmass_labels(raster:&Raster) -> Vec<u32>;      // 8-conn land flood, deterministic
pub fn main_component(map:&Value) -> BTreeSet<u32>;      // BFS from capitals over road+sea
pub fn is_reconnectable(city_pos,in_m,&m_nodes,&labels,raster) -> bool;   // predicate (no A*)
pub fn descope_and_reconnect(out_dir,raster,rivers,mountains,bb);         // bake driver
```

**Retirement map** (one owner, no sediment):
- `descope-sea-lanes.mjs` → `connectivity::descope_sea_lanes` (Rust); file deleted.
- `landroute::SEA_ONLY_CITIES` + `landroute::validate_sea_only_cities` → deleted.
- The invariant's `island_cities` exemption + `sea_only_actual == SEA_ONLY_CITIES`
  block → replaced by `is_reconnectable`.
- The 3-lane constant, today triplicated (`descope KEEP`, `prune-cities.mjs`
  `LANE_ENDPOINTS`, `raster::STRAIT_CARVES` names) → one `KEEP_SEA_LANES`.

## Slice graph

```
S0 instrument ─▶ S1 primitives ─▶ S2 fold-descope (artifact-identical)
                                        └─▶ S3 reconnect + honest invariant (coupled)
                                                 ├─▶ S4 campaign guardrail (pin islands)
                                                 └─▶ S5 (optional) ownership re-flood
```

- **S0 — Instrument** (`slices/00-instrument.md`): `mapgen connectivity-report`
  subcommand prints every non-`M` city with `{landmass, in_M, nearest_M_node,
  straight_gap_km, astar_km|none}`. **Blocking checkpoint:** confirm a clean gap
  between the reconnect set and the island set; pick `RECONNECT_MAX_GAP_KM`. No
  behavior change.
- **S1 — Primitives** (`slices/01-primitives.md`): `landmass_labels`,
  `main_component`, `is_reconnectable` — pure, unit-tested on synthetic fixtures
  (two-landmass-one-lane; the Britain shape; a same-landmass-far-node island). No
  pipeline wiring.
- **S2 — Fold descope into Rust, artifact-identical** (`slices/02-fold-descope.md`):
  `connectivity::descope_sea_lanes` reproduces the `.mjs` exactly; `main()` calls
  it instead of the node step; the file is deleted. **Gate: committed map
  byte-identical** (pure relocation).
- **S3 — Reconnect + honest invariant, coupled** (`slices/03-reconnect-honest.md`):
  the load-bearing slice. `descope_and_reconnect` injects A\* roads for every
  reconnectable city (fixpoint, sorted, panic-on-unroutable) and the invariant is
  rewritten to the computed predicate; `SEA_ONLY_CITIES` + `validate_sea_only_cities`
  deleted. Reconnect and the invariant swap land together because reconnect breaks
  the old assert and the new assert can't pass until reconnect runs.
- **S4 — Campaign guardrail** (`slices/04-guardrail.md`): a `cargo test -p campaign`
  that pins every non-`M` city as non-playable + `Neutral` persona + absent from
  `start_armies`, so a future change can't arm/road/re-persona an island.
- **S5 — (optional) Ownership re-flood** (`slices/05-reflood-optional.md`):
  decide whether power-claimed reconnected cities (Panormus→Carthage in
  `overrides.cities`) should be absorbed by the ownership flood (needs reconnect
  *before* `build`). **Default: NO** — reconnect-after-flood, islands+reconnects
  stay neutral, no visual change. Deferred pending David.

## Single-owner invariants (every slice inherits)

1. **`connectivity.rs` owns "connected + island."** ONE predicate
   (`is_reconnectable`) shared by bake and test; ONE lane const (`KEEP_SEA_LANES`);
   the descope graph surgery lives here. No hand-list of islands exists anywhere.
2. **Component-membership, not degree-0, is the predicate.** A disconnected
   multi-city component (Britain) is an island; a disconnected *mainland* city or
   cluster is a bug. The test checks `∉ M`, never `degree == 0`.
3. **Reconnect is post-flood.** Adding a road never redraws territory, so
   reconnected mainland cities keep their neutral `league_*` owner — the "keep the
   muted neutral look" guarantee.
4. **One land-truth owner.** `landmass_labels` / `is_reconnectable` / the invariant
   read land only through `raster::classify_rgb` (TWIN of `terrain.ts` PALETTE),
   re-hydrating the committed PNG via `Raster::from_rgba` — the same pixels the
   bake used, no second water test.
5. **Islands are untouched downstream.** No `crates/campaign` or frontend change:
   `leagues.mjs` already makes ownerless cities neutral, `AiPersona::Neutral`
   already garrisons-only, `start_armies` already arms only powers. The feature
   only stops the bake from lying about which disconnections are intentional.

## The honest invariant (S3 writes it; it must bite)

Re-derive `M` and `landmass_labels` from the committed graph + committed PNG, then
assert **every city `∉ M` is NOT `is_reconnectable`** (a reachable-but-disconnected
city fails with its name). Prove it bites, temporarily: (a) delete one reconnect
road → the freed mainland city FAILS; (b) move a Black-Sea outlier's position onto
the near-Anatolian coast → FAILS. Keep the existing water-city, margin-water,
road-on-water, ferry-ledger, `sea_edges == 3`, junction-degree asserts unchanged.

**The one-way trapdoor:** `is_reconnectable` *allowing* an island can hide a bug
(a real mainland port spuriously islanded by a raster water gap or a bad snap).
The only defense is the human review of the *computed island roster* at S0 and S3
— any name David expects to be mainland is a red flag to investigate, not accept.

## Firewalls

- **Bake determinism** — descope/reconnect are pure functions of source + consts;
  sorted iteration, integer A\* keys, no RNG, no wall-clock. Double bake →
  byte-identical `campaign-map.json` + `campaign-bg.png`; committed probe ==
  regenerated probe.
- **Never hand-edit `campaign-map.json` / `campaign-bg.png`** — bake artifacts.
- **Reconnect roads pass `make_committed_roads_land_safe`** — it runs after
  reconnect; any unledgered water run panics the bake.
- **Battle untouched** — no `crates/sim`, battle scenes, or battle render passes.
- **Every visual slice** (S3's map shots) runs
  [find-map-bugs](../../.claude/skills/find-map-bugs/SKILL.md) on the reconnect
  regions + island crops, then
  [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md) as the
  last unprimed check, and
  [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) against
  the pre-reconnect baseline. Re-bless campaign baselines via
  [screenshot-regression](../../.claude/skills/screenshot-regression/SKILL.md)
  (headless Chromium + SwiftShader, `VERIFY_GPU=1`, per-worktree `VERIFY_URL`).

## Recon facts the plan is built on

- **Bake pipeline** (`main.rs::main`): load sources → `apply_extra_geography` →
  `raster::paint` → `carve_straits` → `build::build` (ownership flood over roads
  only; writes json/png) → post-steps `leagues.mjs` → `prune-cities.mjs` →
  `dequalify-names.mjs` → **`descope-sea-lanes.mjs`** → `make_committed_roads_land_safe`
  → `write_committed_probe`. Reconnect slots in where descope is (after dequalify,
  before landroute), so injected roads are made land-safe.
- **`descope-sea-lanes.mjs` is what strands the 57** — it deletes every sea edge
  but the 3 lanes and prunes orphan junctions. Reconnect must run after it.
- **Reconnect primitives** already exist: `landroute::astar_land_path` (private →
  make `pub`; deterministic; detour cap `straight_gap*5 + 60`; `MAX_EXPANDED_CELLS
  = 300k`; needs land-cell endpoints), `build::classify_route_tiles` + `build_river_grid`
  (already `pub`), `make_committed_roads_land_safe` (`pub`). New reconnect edges are
  ordinary `EdgeJson{a:cityId, b:targetId, kind:"road", via:[a.pos,…A*…,b.pos], tiles}`
  — no new junction nodes.
- **Islands are already neutral/army-less/inert:** `leagues.mjs` → `ai_persona:'neutral'`;
  `mapdata::AiPersona::Neutral.campaigns() == false`; `start_armies` arms only the
  12 power cities. Verified — no downstream change in scope.

## Next Agent Prompt

**Status (2026-07-05):** Straits/lanes/Rhegium/render SHIPPED on `main`. **S0+S1
DONE** (codex; `connectivity.rs` primitives + `connectivity-report` subcommand;
`cargo test -p mapgen` 7/7 green; artifacts untouched). **Cap measured:
`RECONNECT_MAX_GAP_KM = 140` km** (clean 133↔158 gap; see Measured ground truth) —
awaiting David's non-blocking sign-off on the ~28-reconnect / ~43-island partition.
Next pickup: **S2** (fold descope, artifact-identical — no cap needed, safe to
build now), then **S3** (reconnect + honest invariant — needs the cap; refine
`is_reconnectable` into the iterative same-landmass merge).

**Blocker/warning for S3:** `is_reconnectable` is currently a *static per-city*
gap. Before drawing roads, wrap it in the iterative Prim merge (a city joins if
within 140 km of the growing set on the same landmass), so Sicily's interior and
Cape Tainaron chain in. The invariant classifies by the merge OUTCOME.

**Update this section before ending your pass.**

### Global TODO
- [x] **S0** `mapgen connectivity-report`; `RECONNECT_MAX_GAP_KM = 140` measured; partition sign-off pending (non-blocking)
- [x] **S1** `connectivity.rs` primitives (`landmass_labels`, `main_component`, `is_reconnectable`) + synthetic-fixture unit tests
- [ ] **S2** fold `descope-sea-lanes.mjs` into `connectivity::descope_sea_lanes` — artifact-identical, delete the `.mjs`
- [ ] **S3** iterative merge + `descope_and_reconnect` + honest computed invariant; retire `SEA_ONLY_CITIES` + `validate_sea_only_cities`; re-bless; find-map-bugs
- [ ] **S4** `cargo test -p campaign` guardrail: islands stay non-playable + Neutral + army-less
- [ ] **S5** (optional) ownership re-flood decision — default NO
