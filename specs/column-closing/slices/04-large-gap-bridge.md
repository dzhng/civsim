# Slice 4 — bridge gaps without reforming the whole unit

## Contract this unlocks

The conservative starting point is that single-file notches remain real while a
unit fights, while a **large adjacent gap** — two or more empty files side by
side — is allowed to narrow during combat. If the same local reserve rule proves
clean enough, it may also fill single-file gaps. Either way, the bridge happens
only through a local reserve rule: seed the lane with a small number of rear/deep
men near the gap edge, then let `compact_columns` pull those men forward in their
newly assigned files.

This is not a return to `reassign_slots`. It must not ask every soldier in the
rank to slide sideways, left-pack the formation, or erase a wrapped/dimpled
sheet's neighbour identity.

## Candidate design

Detect runs of empty files after ordinary `compact_columns`:

```text
empty_run = adjacent files with no living soldier
threshold = 2 to start; may become 1 only after visual/test sign-off
if empty_run.len >= threshold and unit is engaged/advancing:
    choose at most one or two donor soldiers this beat
    donors come from rear/deep ranks of the nearest live files beside the gap
    rewrite only those donor slot ids into rear slots of the empty run
    compact_columns later pulls them forward inside those new files
```

Deterministic donor preference:

- Prefer deepest living rank, because the front should not crab sideways.
- Prefer the nearest gap edge; alternate left/right deterministically for wide
  gaps so one flank does not drain first.
- Never take an engaged/front-clear fighter if an unengaged rear donor exists.
- Cap the number of lateral movers per beat by gap width, not unit size.

The important shape: a gap gets **seeded**, not instantly healed. The front still
shows battle damage, but the hole stops reading as an impossible permanent
corridor through a deep formation. If threshold `1` wins, the one-file gap should
still close by a bounded rear donor, not by making every neighbouring file crab
sideways.

## What the human can run / see

- A focused `mechanics_formation` test: wipe one file and verify either that it
  stays a notch under the conservative threshold, or that it is bridged by the
  same bounded donor rule if threshold `1` is chosen; wipe two adjacent files and
  verify only bounded rear/deep donors move laterally into the lane.
- Recreated weave shots for column bulge / penetration / deep-push cases.
- Recreated browser battle vibe shots for `penetration` and `offense`, inspected
  by eye before blessing any baselines.
- An unprimed `screenshot-critique` subagent review of the comparison sheet and
  tight crops. The subagent should not be told which threshold or behavior is
  expected to win.

## Tests that pin it

1. **One-file behavior is explicit.** Either a single wiped file stays empty
   until disengage/Reform, or it is filled by the same bounded local donor rule.
   Do not leave this implicit.
2. **Two-file lane gets local donors.** After a 2+ adjacent file wipe, only a
   small bounded number of rear/deep soldiers change file; the rest of the unit's
   lateral slot map is unchanged.
3. **No whole-rank crab.** Rear-line lateral travel may spike only for the chosen
   donors; non-donor soldiers stay at the push-only floor.
4. **Bridge is gradual.** The lane is seeded from the rear and fills forward over
   subsequent column compaction; it does not instantly become a clean rectangle.

## What must stay green

- Slice 2 and 3 gates, especially the rear-line no-crab metric.
- `mechanics_weave` wrap/drape probes. A local bridge must not make attacking
  sheets rigid or stop them from wrapping.
- Battle/weave shots must look same-or-better: fewer artificial lanes, no new
  global blob, no visible full-unit sideways shuffle.
- High-confidence `screenshot-critique` findings are blockers unless fixed or
  explicitly carried as follow-up with the reason they are acceptable for now.

## Latest checkpoint

The local bridge idea is mechanically pinned but still not visually accepted.
The first conservative 2+ file bridge seeded adjacent empty-file lanes with at
most two rear/deep donors from the nearest live files and left one-file notches
alone. A later scaled variant tried the more intelligent wide-lane version:
seed one rear/deep donor per empty file, up to six donors per adjacent gap run,
alternating from the nearest live edges so a four-file lane gets four donors
without moving a whole rank. The scalar contracts passed (`mechanics_formation`,
bridge/compact unit tests, `mechanics_melee::attack_latch_behaves_like_a_move_order`,
`mechanics_disengage`, and the full `scripts/test-mechanics` sweep), but the
visual gate did not pass.

Fresh browser `vibe/penetration`, `vibe/offense`, and weave shots were captured
for both bridge versions, compared against `HEAD`, and sent to unprimed
`screenshot-critique` explorers with `fork_context: false`. The two-donor pass
failed with high-confidence current regressions: ordered blue column loss at
`t084/t120/t192`, isolated blue stragglers/side clusters, ambiguous
blue/gray/red contact layering, and dark detached offense figures. The scaled
wide-lane pass also failed: current `penetration` `t084` breaks into scattered
blue islands, `t120/t192` smears the contact band, `t192` fragments the red
right flank into detached clumps, and current `offense` has dark brown trailing
figures that read like a third faction. The critique also noted that `HEAD`
looks too rigid/barcode-like, so the desired endpoint is not the exact old grid;
it is an ordered, living formation that stays readable without global lateral
crab. Treat this bridge as mechanically useful substrate, not accepted slice
completion, until a later contact-order fix makes the battle-vibe shots
same-or-better.

## Feedback that would change this slice

- If rear donors make the back line visibly teleport or comb sideways, slow the
  cadence or require donors to be farther from contact.
- If the bridge closes too aggressively and erases useful battle damage, raise
  the threshold back to two files or lower the donor cap.
- If the bridge still leaves a column-width highway through deep formations, seed
  from both edges of the gap, but keep the bounded-donor rule.
