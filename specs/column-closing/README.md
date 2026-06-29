# Column-closing — a fighting line closes FORWARD, never crabs sideways

When a soldier dies, the survivors should close the hole by moving **forward in
their own file** — never by sliding laterally across the rank. A man holds his
column for the whole fight. If a whole column is wiped, its frontage is left as
a notch. A unit only re-evens laterally (closes the notches into a clean
rectangle) when it **stops fighting** or the player issues **Reform**.

This kills the "back lines shuffling sideways" that David sees today: it is not
physics (a push), it is the **slot-reassignment passes relabelling
`soldier_slot[i]`**, after which the weave faithfully drags each man sideways to
chase his new slot. Stop relabelling laterally while engaged and the crab stops.

## Next Agent Prompt

**Status:** Slice 1 shipped: `unit::compact_columns` is written, pure, unwired,
and covered by direct unit tests in `crates/sim/src/unit.rs` for front death,
mid-column death, wiped-file notch, file preservation, determinism, and
idempotence. The tests live beside the helper instead of in
`crates/sim/tests/mechanics_formation.rs` because the helper is `pub(crate)` and
slice 1 should not add a public test hook just to reach an internal primitive.

**Pickup point:** Begin at `slices/02-wire-and-gate.md` — wire
`compact_columns` into the drumbeat while engaged/advancing, delete
`compact_slots_preserving_order`, add the disengage clear-beat re-even, and
re-pin the golden hash once the behavior is proven.

**Locked decisions (from the grilling):**
- A wiped column leaves a **persistent frontage notch** mid-fight — do NOT slide
  neighbours over to close it. (Only disengage/Reform evens it.)
- **Deep blocks obey the same rule**: rear men flow forward within their own
  file (this IS the anti-pancake flow) — no lateral re-form while engaged.
- The auto lateral re-even fires **after a short clear beat** out of contact
  (reuse `quiet_ticks`), not the instant melee ends.

**Blockers / warnings:**
- The golden hash (`golden.rs::golden_state_hash_stable`) WILL move in slice 2.
  Re-pin it once, in that commit, after confirming your change is the only mover
  (it may already be red on this branch — diff against a clean baseline first).
- `cargo build -p sim` warns that `compact_columns` is unused after slice 1.
  That warning is intentional substrate debt and should disappear when slice 2
  wires the helper; do not hide it with an allow/expect attribute.
- Concurrent sessions share the working tree (see `specs/standoff-double-push.md`
  process notes): never `git stash`/`checkout` over the tree; `git add` by path.
- Rebuild wasm before any browser/renderer-lab check.

**Global TODO** (each item owned by a slice):
- [x] `compact_columns` written + unit-tested, pure, unwired — slice 1
- [ ] Drumbeat rewired: column-close while engaged/advancing; remove the engaged
      `reassign_slots` path; delete `compact_slots_preserving_order` — slice 2
- [ ] Disengage one-shot re-even via `quiet_ticks` clear-beat — slice 2
- [ ] `reassign_slots` confirmed reachable ONLY by pivot / files-change /
      reform / rally / at-ease recovery / disengage — slice 2
- [ ] Golden re-pinned once; weave/charge/impact/disengage buckets green — slice 2
- [ ] Rear-line lateral-travel-while-engaged metric test pinned — slice 3
- [ ] Human-viewable proof (slot-occupancy timeline + renderer-lab scene) — slice 3

**Before you end your pass, update this section** (status, pickup point, checked
boxes) so the next agent can resume cold.

## How the formation actually moves (measured facts, do not re-derive)

All formation state is in the `sim` crate.

- A soldier owns ONE integer slot, `soldier_slot[i]` (`sim.rs:196`). The grid is
  **rank-major**: `file = slot % files_eff`, `rank = slot / files_eff`
  (`unit.rs:234-240`). `slot_world` (`unit.rs:279-284`) turns that into a world
  target; the **weave** (the spring net, `sim.rs:~1765` slot pull + file/rank
  neighbour bonds `sim.rs:~1896-1934`) physically pulls each man toward it. The
  weave is faithful — **lateral motion only happens when the slot MAP changes.**
- A death (`combat.rs:1045 kill_with`) only marks the corpse and bumps
  `deaths_since_reform`. It does NOT reshuffle slots itself.
- The reshuffle is the per-tick drumbeat in `Sim::tick` (`sim.rs:892-948`). It
  picks between two routines in `unit.rs`:
  - `reassign_slots` (`unit.rs:362`) — full geometric re-sort: re-ranks by depth,
    re-sorts each rank laterally. **Relabels files → lateral crab.**
  - `compact_slots_preserving_order` (`unit.rs:405`) — repacks survivors into
    slots `0..n` in **reading order**. Because the grid is rank-major, closing a
    hole pulls the next man *across the rank* into it. **This is ALSO lateral.**
- The "engaging" signal already exists: per-unit `engaged: usize` (men in melee
  last tick, `unit.rs:120`), rebuilt each tick by `refresh_contact_engagement`
  (`sim.rs:970`). `quiet_ticks` (`unit.rs:127`) counts ticks with no contact.
- The explicit Reform command is `set_reform` → `reseat` → `reassign_slots`
  (`sim.rs:758-792`); a rally forces a full re-form via
  `deaths_since_reform = alive_count` (`morale.rs:430`). `files_eff` corridor
  narrowing and `set_files` also call `reassign_slots` (`sim.rs:1162, 748`).

**The gap:** there is no column-major closer. The fix is one — `compact_columns`
— plus gating so it is the ONLY thing that runs while a unit fights.

## The shape of the change

```
on a soldier's death:           deaths_since_reform++          (unchanged)

reform drumbeat (sim.rs ~892):
  if casualties to close AND (engaged OR advancing):
        compact_columns(...)        ← NEW: forward-only, file-fixed, gaps kept
  reassign_slots(...) reached ONLY by:
        pivot · set_files · corridor files_eff · set_reform/reseat · rally
        · at-ease recovery drumbeat · NEW disengage one-shot (clear-beat)
```

`compact_columns` is the whole behavioural idea: per file, take the living men
and pack them into ranks `0,1,2,…` of that **same file**. A man never leaves his
column; vacancies close toward the front; an emptied file stays empty.

## Slice graph

| # | Slice | Unlocks | Verify | Type |
|---|-------|---------|--------|------|
| 1 | [compact-columns](slices/01-compact-columns.md) | `unit::compact_columns` — pure column-major closer, file-fixed, gap-leaving, deterministic, unwired | `mechanics_*` unit tests on `block(files,ranks)`: front-death pulls the file up, mid-death moves only men behind in-file, wiped file stays empty, no man changes file, idempotent | substrate |
| 2 | [wire-and-gate](slices/02-wire-and-gate.md) | drumbeat uses `compact_columns` while engaged/advancing (deep blocks too); `reassign_slots` only on pivot/files/reform/rally/at-ease/disengage; `compact_slots_preserving_order` deleted; disengage one-shot via `quiet_ticks` | weave/charge/impact/disengage/posture buckets green; golden re-pinned once; a deep engaged block taking front losses shows rear-rank lateral travel ≈ 0 | behavior |
| 3 | [prove-no-crab](slices/03-prove-no-crab.md) | metric test pinning rear-line lateral travel while engaged < ε; human-viewable slot-occupancy timeline + renderer-lab scene showing notch-persists-then-evens-on-disengage | the metric test; the artifact David can open and judge by eye | behavior + visible |

Slice 1 is pure substrate (no behavior change). Slice 2 is the first behaviour
change and the golden re-pin. Slice 3 is the proof David's eye signs off on and
the anti-regression watch.

## Sacred contracts (must stay green)

- **Determinism.** Same seed → byte-identical. `golden_state_hash_stable`
  re-pinned ONCE in slice 2; `compact_columns` sorts on a deterministic key
  (rank then soldier index — never `Math.random`/position noise).
- **Physics is untouched.** No change to the weave forces, `slot_pull`,
  separation, `weapon_repel`, the braced standoff/weld, or `slot_local`/
  `slot_world` geometry. We change only *which slot a man is assigned*, never the
  forces that carry him there or where a slot sits.
- **Lateral motion from a PUSH stays.** Being shoved sideways by bodies/charge is
  physics and is explicitly allowed — only *reassignment-driven* lateral motion
  is removed.
- **Braced standoff.** `mechanics_weave::two_braced_walls_*`,
  `the_fronts_stay_welded_*`, `a_braced_block_holds_its_grid_under_a_press` green.
- **The wrap/bent-sheet identity.** `compact_columns` is strictly lateral-free,
  so it preserves a wrapped sheet's neighbour identity at least as well as the
  old order-preserving compaction it replaces. The `mechanics_weave` wrap probes
  stay green.
- **Charge absorption is the watched risk.** While engaged we no longer
  relabel-to-absorb a shoving charge (men hold their file slots). `mechanics_charge`
  and `mechanics_impact` must stay green; if a line now feels too rigid under
  impact, that is the knob to revisit (a known unknown, not a silent regression).
- **Reform/pivot/corridor unchanged.** The explicit Reform, pivot, `set_files`,
  and corridor `files_eff` narrowing still do a full lateral `reassign_slots`.

## Firewalls / non-goals

- **Change the slot MAP, not the substrate.** No edits to the weave, separation,
  slot geometry, or any force magnitude beyond reading them.
- **No new order types.** Reform's public API is unchanged.
- **No balance/economy.** This is a `mechanics_*` engine-geometry change on
  immortal fakes; no real class stats involved (see `tests/README.md` creed).
- **Corridor narrowing keeps its lateral re-form.** Squeezing `files_eff` to fit
  a defile is a deliberate maneuver, not casualty-closing — it stays on
  `reassign_slots`.

## Known unknowns (the slices resolve these)

- **Does forward-only-while-engaged feel too rigid under a charge?** Removing the
  absorb-relabel may make lines springy/stiff on impact. Slice 3's eye check and
  `mechanics_charge` answer it; the fix, if needed, is in HOW the charge displaces
  bodies, not in re-adding lateral relabelling.
- **Cadence.** `compact_columns` is cheap and lateral-free, so it could run on
  every death instead of the 2% `deaths_since_reform` drumbeat. Start on the
  existing trigger; relax in slice 2 only if a grind visibly lags its closing.
- **The clear-beat length.** How many `quiet_ticks` before the disengage re-even
  fires — long enough to ignore a momentary lull, short enough to look prompt.
  Tune in slice 2.
- **Deep-grind pancaking.** Forward in-file flow should refill front losses and
  prevent the pancake the old engaged reflow guarded against; slice 3 watches a
  deep block to confirm.

## How to start cold

Read "How the formation actually moves" above, then begin at
`slices/01-compact-columns.md`. Each slice names its seam, the test that pins it,
and what a human can run to judge it. Update the Next Agent Prompt before you stop.
