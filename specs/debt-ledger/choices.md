# debt-ledger — choices ledger

Decisions implementing agents made that the spec did not resolve. One entry
per decision: slice, what was decided, the alternative, why. Reviewed with
audit-choices before close-spec.

## Planning (2026-09-02)

- **Archive semantics** — delete + rationale record; alternatives "move
  source into specs/done/assets" and "keep behind a lab-only flag" rejected
  by David.
- **Scope** — slice-narrative sweep, dispose investigation, HUD store in;
  closing the seven idle specs and any repo-weight/.git work out (David).
- **Pins** — may move for bound radius and campaign sun; re-bless
  individually (David).
- **Compat** — none anywhere (David).
- Planning-time resolutions with their alternatives are in README →
  "Decisions (planning)".

## Implementation

_(append below, newest last)_

- slice 28 — run exactly 400 ticks with commander AI disabled and two existing hostile armies placed on adjacent tiles of the committed map, then resolve the resulting battle through the campaign estimator; alternative run the whole map autonomously until contact; why the scripted contact exercises encounter and rout traversal deterministically in 0.02 s instead of depending on a slow, seed-sensitive commander search.
- slice 28 — hash the specified army movement and stance state, ordered city owners, faction treasuries, and every encounter payload plus `next_encounter_id`, with collection lengths and enum tags as delimiters; alternative hash serialized `CampaignState` wholesale; why the explicit projection pins the campaign behaviors the following slices may move without coupling the golden to unrelated save-schema fields.
- slice 28 — use campaign seed 7; alternative choose a new arbitrary fixed seed; why 7 is already the fixed-seed reference in the campaign determinism tests and also drives the scripted encounter seed.
- slice 28 — use the sim golden's word-wise FNV-1a convention and initial hash value; alternative introduce canonical byte-wise FNV-1a just for campaign; why matching the repository's existing golden makes float-bit and integer mixing consistent across both simulation crates.
- slice 29 — delete the parallel-route test and its single-use diamond-map fixture with the road-level behavior; alternative rebase the test on a tile-feature cost difference; why existing path tests already exercise feature-weighted route planning, while retaining a bespoke parallel fixture would preserve test-only code for a deleted production distinction.
- slice 30 — name the flood callbacks `pass` and `visit` and return the location that requested `Stop`; alternative return a visit count with `can_enter` and `on_visit` callbacks; why stop-location semantics directly answer the early-exit consumers while depth remains available to the visit callback.
- slice 30 — (orchestrator note) the campaign `test_map()` literal moved to `crates/campaign/tests/fixtures/test-map.json` loaded via `include_str!`, so the lib seam test and `tests/common` share one fixture; alternative keep two inline copies; why one owner for the test map, and JSON is the wire format the real map already uses.
