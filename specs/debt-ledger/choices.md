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

- slice 22 — `covered_fighting_files` accepts the sim's native `alive: &[u8]`, `fighting: &[u8]`, and `soldier_slot: &[u32]` slices so extracting the duplicated loops preserves their dead-soldier filter exactly; alternative convert those arrays to the slice sketch's `&[bool]` and `&[usize]` three-argument signature; why conversion would allocate copies in two hot paths and omitting `alive` would change behavior because dead entries may retain a prior fighting flag.
- slice 23 — `Tracer::record` accepts an optional caller-supplied `before`, using `None` for a ready delta and `Some(before)` for a capped before/after sample; alternative separate `record_delta` and `cap` methods; why one instrumentation method meets the slice contract while retaining the existing vectors and explicit `pre`/`post` cap diagnostics without inferring cap semantics from a channel or tag.
- slice 24 — `weave_shots` includes `tests/common` by path and consumes its shared weave perturbations; alternative expose a `sim::testkit` module behind the `shots` feature; why the geometry remains test-owned and the production crate API does not gain helpers used only by tests and the review-only shot tool.
- slice 25 — `SpawnSpec` orders placement and formation fields before tactical identity, resolved stats, render look, and team; alternative group `class`, `stats`, and `look` before geometry; why callers usually resolve geometry first while the adjacent identity fields still make the class/stats/look relationship auditable.
- slice 25 — `SpawnSpec.look` stays explicit on every spawn, including the common case where it equals the class id; alternative make look optional and derive it from class; why campaign doctrines can render two units of the same tactical class differently, and an explicit field keeps that visual choice visible without a second defaulting owner.
- slice 25 — headless auto-resolution lives in each consuming crate's test-common module; alternative keep `Battle::auto_resolve` as a production method solely for cross-crate test reuse; why no shipped caller auto-resolves through the battle runner and duplicating the small test driver avoids retaining a production API whose only consumers are tests.
- slice 25 — the raw `spawn_unit` test convenience preserves its historical neutral-body arrays and LightSpear combat vocabulary while delegating allocation to `spawn`; alternative silently make its custom formations inherit the full LightSpear body stats; why 25a requires an unchanged golden hash and the existing mechanics fixtures use custom spacing/drill as neutral bodies, not real LightSpear units.
