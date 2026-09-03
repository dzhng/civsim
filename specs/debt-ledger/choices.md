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
- slice 26 — tick orchestration calls free functions owned by `steer`, `separation`, and `combat::run`, while `Sim` retains only the pipeline order; alternative spread new inherent `Sim` methods across those domain modules; why free functions make the ownership cut visible and prevent the orchestration type from remaining the implicit owner of the extracted policies.
- slice 26 — `UnitPre` and `SoldierCtx` carry only the fields named by the seam, with `broad_press` retaining its native boolean type; alternative add convenience fields or coerce the flag to the seam sketch's `f32`; why every extracted section can read its existing inputs directly and preserving the flag's type avoids inventing a numeric encoding during a golden-identical move.
- slice 26 — steering remains in `steer/mod.rs`, while collision sections are named `separation/{bodies,weapon_repel,walls}.rs` and combat orchestration is named `combat/run.rs`; alternative create one file per helper or retain the old `collision.rs` and `combat.rs` owners; why the chosen names follow the slice's domain vocabulary and leave each old god-function path with one obvious replacement owner.
- slice 26 — `steer_soldiers` is an ordering loop over banner-delimited helpers for soldier preparation, route intent, weave/corridor composition, magnetism, velocity refinement, and final integration/facing; alternative pass one mutable context object through a generic steering pipeline; why explicit calls preserve the original floating-point evaluation order and keep each policy's inputs visible at its owner boundary.
- slice 26 — `separation::bodies` owns distinct grid rebuild, momentum staging, impact resolution, and pair-separation functions, while `weapon_repel::apply` and `walls::apply` own their complete passes; alternative retain one cross-module callback-driven collision loop; why the extracted passes match the existing execution banners and preserve the exact pass order without compatibility wrappers.
- slice 26 — `combat::run_combat` delegates staged damage, target selection, impale, and swing resolution at the existing phase boundaries; alternative split by weapon kind into parallel combat runners; why phase helpers preserve the single target/attack ordering ledger and avoid duplicating shared eligibility rules.
- slice 26 — the no-feature `Tracer` carries the same lifetime shape as the force-trace implementation; alternative duplicate every extracted helper signature behind feature gates; why one signature keeps the extracted owners identical in both builds while the no-feature tracer remains a zero-behavior type.
- slice 26 — the global 300-line ceiling is met by splitting the class registry into stat families, morale neighborhood measurement from morale mutation, threat measurement from order/reflex delivery, and foundation scenarios from the shots driver; alternative exempt pre-existing non-slice overages outside steering/separation/combat; why the follow-up explicitly applies the ceiling to every function under `crates/sim/src`, and these are mechanical phase/data-family cuts with no arithmetic or tunable changes.
- slice 26 — steering policy arguments are carried by owner-specific argument structs that retain `SoldierCtx` and `UnitPre` as the shared soldier/unit seams; alternative one mutable god-context spanning the entire steering pass; why narrow argument bundles expose each owner's actual read/write surface without recreating the god object the file split removes.
- slice 26 — separation uses `PairCtx`, `ImpactCtx`, `MomentumCtx`, `WeaponRepelCtx`, and `WallsCtx`, while combat uses `TargetSearch`, `Attack`, and `SwingNeighborhood`; alternative keep positional parallel slices or pass all of `Sim` into every helper; why per-pass contexts keep same-typed arrays named, preserve disjoint borrowing, and make mutation ownership explicit without hiding it behind unrestricted simulation access.
- slice 26 — `accumulate_slot_and_pivot_bonds` retains the slot-neighbour stretch, pivot, and compression calculations in their original single walk, then `apply_enemy_bond` extends that accumulator; alternative split pivot and compression into additional neighbour walks; why keeping one walk preserves both iteration and floating-point accumulation order while naming the friendly- and enemy-bond owners.
- slice 26 — `corridor_term` owns the opposing-formation corridor scan and `apply_magnet` remains the separate enemy-seek owner; alternative fold both directional constraints into one steering helper; why their iteration domains, outputs, and force-trace channels are distinct even though composition consumes both.
- slice 26 — (orchestrator) the third follow-up was requested on a mis-measurement: my size scan missed `pub(super)` functions and read weave_forces as 688 lines when it was already ~150; the extra split (four-line orchestrator + accumulate/enemy-bond/corridor owners) was kept because it held the golden and made the owners explicit. By a visibility-agnostic fn-boundary measure the largest function is now `deliver_orders_and_reflexes` at 302 lines (Codex's brace-aware measure: 296).
