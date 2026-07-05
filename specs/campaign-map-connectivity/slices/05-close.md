# S5 — Consolidation, determinism, close-spec

**Contract:** the model reads as one owner (not bolted on), the bake is
deterministic, the map is bug-swept, and the spec is archived.

**Work:**
- **refactor-clean** pass: `grep SEA_ONLY_CITIES` / `grep descope` return
  nothing; no dead `island_cities` branch; lane truth lives only in `SEA_LANES`;
  strait truth only in `STRAIT_CARVES`/`carve_straits`; connectivity only in
  `connectivity.rs`. Update `main.rs` header comment (post-step list) and
  `ROAD_FERRY_CROSSINGS` to the post-carve reality.
- **BAKE-DETERMINISM:** double `cargo run -p mapgen --release` → byte-identical
  `campaign-map.json` + `campaign-bg.png`; committed probe == regenerated.
- **review** pass over the whole diff.
- **close-spec:** archive `specs/campaign-map-connectivity/` to `specs/done/`,
  rewritten from build ladder to rationale record.

**Gate:** full `cargo test -p mapgen`, full campaign scene suite, find-map-bugs
clean.

**Human checkpoint (non-blocking):** final full-map screenshot review.
