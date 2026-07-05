# Slice 02 — Family A/A′: equilibrium near impassable terrain

## Contract unlocked

A unit ordered next to (or into) impassable geometry comes to rest like any
other unit: the frame settles on reachable ground, every living man reaches
a reachable slot, and no force keeps pulling once he is there. The 90s–∞
milling at the seed-1 cliff pocket dies; the marginal-corridor buzz dies
with it or is measurably re-attributed to slice 03's cycle.

## The measured root (start here, don't re-derive)

- Force ledger at the churn (probe `probe_trace_cliff_churn_forces`):
  SlotPull net (+478, +275) and WeaveNet net (+49, +385) NONZERO at rest —
  the lattice is permanently pulled toward men/slots it cannot reach. Worst
  straggler: 64m from his slot, TerrainProject in his ledger (wall contact).
- `audit_slots` map: men and slots separated across wall arms; the march
  split the unit around geometry and the survivors' slot map still bonds
  across the wall.
- The at-ease reform beat re-sorts every 45 ticks while cohesion < 0.9,
  churning ~800 slot labels / 10s — symptom, not root (disable experiment:
  churn persists without it).

## The design question this slice answers

**Which force fails to reach zero, and what is the physical rule that zeros
it?** Candidate directions, in doctrine order (forces before assignments,
assignments before beats):

1. **Weave bonds must not act through impassable ground.** Two slot-adjacent
   men separated by a wall pull each other into it forever. A bond whose
   straight segment crosses `speed_at <= 0` cells is not a physical
   neighbour relation — drop or reroute it. This is a force-level fix and
   the most first-principles candidate.
2. **Slot assignment must respect reachability.** `reassign_slots` sorts by
   frame-local coordinates and will happily hand a wall-split straggler a
   slot on the far side. Assignment against reachable geometry (or
   re-anchoring the straggler cohort) removes the unreachable target
   entirely.
3. **The frame's resting place**: `clamp_to_passable` clamps the ORDER
   target, but the arrival + escape-creep can still leave individual slots
   in wall shadow (`slot_world` on blocked/slow cells → the A′ corridor
   case). The halted-frame escape slide (sim.rs "slides itself clear") owns
   this; check whether it converges or oscillates against the corridor
   width machinery.

Instrument first (force-trace, per-channel budgets at the churn), pick the
mechanism the ledger convicts, and fix THAT. If the fix wants a new clamp,
flag, or threshold — stop, re-read tweak-mechanics "forces and bodies,
never walls," and reslice.

## Shipped (02a, pass 2)

Both convicted mechanisms fixed force-level in `steer_soldiers`:
weave/pivot bonds skip when stretched > rest + 2m AND
`Terrain::segment_passable` fails between the two men (the stretch gate is
a cheapness gate — an unstretched adjacent bond cannot span a wall);
a slot > 3m away whose straight segment is blocked stops pulling. The slot
gate is additionally conditioned on the frame being at REST
(`move_target.is_none() && frame_speed < 0.05`): first attempt gated it
unconditionally and stranded marchers behind boulders
(`anchor_routes_around_a_rock` red) — mid-march, the through-rock pull
composed with the terrain slide is exactly what walks a man around an
obstacle. Halt-gating is the accepted scalpel family (a state a march can
never be in), not a positional wall. Golden held; force nets at the pocket
collapsed ~100x; margins 12/14/18 settle to baseline in one window.

Remaining in 02b: the frame-level oscillator when resting slots are
unstandable or wall-tight — gates `settle_with_frame_slots_in_wall`
(margins 10/12, episodic bursts) and `settle_inside_marginal_corridor`
(edge-file buzz, zero separation records, IdleSettleDamp constantly
firing). Instrument one margin-10 burst (files_eff/anchor/escape-slide
over time) before designing.

## API seam

Whatever mechanism is convicted, the change lives in sim core
(`unit.rs` slot logic / `sim.rs` steer-weave / `movement.rs` frame law) with
NO new tunable unless the force needs a physical constant — and then it
gets a name, a comment stating the physical fact, and a sweep showing the
gates hold across a range (no knife-edge).

## Verification

- Un-ignore `settle_near_impassable_pocket` → green.
- `settle_inside_marginal_corridor`: green, or — if the ledger shows its
  cycle is the slice-03 shape (steer-vs-separation, not terrain) — record
  that attribution here and move its un-ignore to 03. Attribution, not
  hope: show the channel budget.
- Add the margin sweep as one test body (10/12/14/18m) — the fix must hold
  across the pocket depths, not the one pinned margin.
- ALL slice-01 green gates stay green byte-similar (containment).
- Golden holds (open-ground marches never touch walls). If it moves, find
  the leak; a deliberate re-pin needs its cause in the commit.
- Full `cargo test -p sim --no-fail-fast` — provenance for every red per
  tweak-mechanics (stash-run for carried-in, toggle for yours).

## What the human can run

The gate test with `--nocapture` prints the settle windows; the probe
file's ASCII map before/after makes a readable before/after in the pass
summary.

## Stays green

Every mechanics/scenario/balance test not named above. This slice does not
touch morale, combat, charge, or missile code.

## Human feedback that would change this slice

If David prefers doctrine option 2 (reachable slot assignment) over 1
(passability-aware bonds) as the primary mechanism — both may be needed;
the ledger decides the order. Non-blocking checkpoint: present the
convicted mechanism + intended fix in the pass summary before implementing
if the pass has budget to pause; otherwise implement, and present the
evidence with the diff.
