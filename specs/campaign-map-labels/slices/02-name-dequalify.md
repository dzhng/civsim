# Slice 02 — Drop the qualifier when the base name is unique (bake-owned)

**Contract:** for every rendered display name, parse `Base (Qualifier)`. If
`Base` is unique across the final rendered population → render `Base`. If shared
→ render `Base Qualifier` (single space, **no parentheses**). Paren-free names
untouched. Deterministic, idempotent, pure over the node/faction set.

Examples: `Apamea (Pisidia)` → `Apamea` (unique base); the two `Caesarea`s →
`Caesarea Cappadocia` / `Caesarea Phrygia` (shared base, qualifier kept, parens
dropped).

**API seam / owner:** a single **final mapgen post-step**, invoked from
`crates/mapgen/src/main.rs` **after** `prune-cities.mjs` (prune removes cities,
changing which bases are unique) **and after** `leagues.mjs` (a league's
engraved name is literally its lead city's name — it must get the same
treatment). The step owns parse + frequency-count + rewrite of `node.name` and
`faction.name`, then the bake re-writes `web/public/data/campaign-map.json`.
**Do not** fold this into `build.rs`: it runs pre-prune, pre-league, so its
uniqueness accounting would be wrong. The frontend keeps rendering
`node.name` / `faction.name` verbatim — no runtime string surgery.

**Scope trap:** non-city features carry descriptive parentheticals
(`Alpheos (river)`) and sea names are hardcoded in `mapPass.ts`, not in the
JSON. Scope the rewrite to city nodes + faction/league names; leave waterway
annotations and sea labels alone.

**Structural exemption:** a league name == its lead-city name is expected
(a league *is* named after its city) — allowlist that identity, don't "resolve"
it. Any genuine same-base-same-qualifier duplicate goes in an explicit
known-duplicate ledger, not silently collapsed.

**Deliverable:** re-baked `campaign-map.json`; a diff of every changed name for
human review.

**Gates:**
- `cargo test -p mapgen` — new unit test on a synthetic set (unique→base,
  collision→base+qualifier-no-parens, `(river)` untouched); extend
  `baked_campaign_map_satisfies_mapgen_invariants` (`main.rs`) to assert no `(`
  or `)` in any city/faction name and no unexpected city-name collision
  (allowlist for structural faction==city).
- `cargo fmt` (rustup toolchain PATH); re-bake `cargo run -p mapgen --release`.
- `campaignRenderMask.test.ts` green (positions unchanged, only strings).
- `render-probe.mjs` green (shorter labels shift collisions but must not
  re-offshore any marker — Slice 01's drawn-rect gate covers this).
- **screenshot-critique** on a fresh overview: no stray parens, no lost
  disambiguation, no new collisions.

**Human checkpoint (non-blocking):** review the full name-diff before
committing the re-baked JSON (David reviews bake output, never hand-edits).

**Feedback that would change this:** if David wants a qualifier kept for a
famous city even when its base is unique (taste), add a small keep-list to the
post-step — still one owner, still bake-side.
