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
