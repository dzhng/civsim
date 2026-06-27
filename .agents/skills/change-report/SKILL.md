---
name: change-report
description: After a change that moved tests, produce a CHANGE LEDGER for David — every test whose behavior moved, each with {test, previous behavior, new behavior, why}, so he can see what the system now does differently and interrogate any line. Use when wrapping up a sim physics/balance/refactor change, when David asks "what changed / what did you touch / summarize the diff", or whenever you re-pinned, rewrote, deleted, or flipped (carried-red→green) one or more tests. Invoke proactively at the end of such a change.
---

# Change report (the behavior-change ledger)

Hand David one row per test whose behavior moved, so he can audit what the
system now does differently. The value is **trust**: the ledger is worthless if
it silently omits a moved test or guesses a value. Exhaustive and measured, or
not worth writing.

## Each row has exactly four fields

- **Test** — the function name and file.
- **Previous behavior** — what it asserted / measured BEFORE, as a concrete
  value, not "it passed". (`heavy surv ≈97%, floor ≥0.92`; `CAV_CHARGE 9.54`;
  `coh recovered to 0.28 (< 0.4)`.)
- **New behavior** — what it asserts / measures now, same concreteness.
- **Why it changed** — the traced mechanism in one or two sentences, ending in a
  **provenance tag** (below). Not a plausible story — the cause you verified.

## Tag every row with its provenance

David's first question is "is this real or pre-existing?" Answer it in the tag:

- **carried-in** — already red at HEAD before your change (prove it: `git
  stash -u`, run the one test, read the value). You re-derived it; you didn't
  cause it.
- **your-regression** — your change broke a green test (you bisected it). Say
  what real bug it exposed and how you fixed the mechanism.
- **moved** — a sound change shifted a tracked value; you re-pinned it. Name the
  mechanism and confirm the qualitative contract still holds.
- **rebuilt-on-fakes** — migrated off real classes onto reference units; note if
  the assertion stayed the same or was re-derived.

## Build it exhaustively — reconcile, don't recall

Memory drops rows. Reconcile against the diff so the count is honest:

1. `git diff --stat` over `crates/sim/tests/` and `golden.rs` — every touched
   test file must be represented (or explained: a rename, a pure-fakes swap with
   identical asserts).
2. Re-read each test diff for changed assertions / pins / thresholds — one row
   each.
3. Add carried reds you flipped to green even if you changed no assertion (the
   engine fix is the "new behavior").
4. For previous values, read HEAD (`git stash`) or your run logs — never
   estimate.

## Also ledger the UNIT STAT changes (the inputs)

The test rows above are OUTCOMES — what the system now does. Stat-table edits are
the INPUTS that drove them, and they get their own ledger: a balance reviewer
reads the stat delta to predict the matchup shifts, and an outcome that moved
with NO stat change means a MECHANIC moved — flag that, don't let the reviewer
hunt for a stat edit that isn't there.

- Reconcile against `git diff` over the stat tables — `crates/sim/src/class.rs`,
  the weapon/missile consts, `crates/contract` pricing. One row per changed field.
- Each row: **unit + field**, **old → new**, **why** (the physical/design reason).
  `HeavySword.health 2.4 → 2.0 (band rescaled [1,2.4]→[1,2])`;
  `LightSpear weapon +impales (a spear now stops a charge run onto it)`.
- A weapon kind/capability change IS a stat change: `pike kind Braced → Hedge`,
  `spear base MELEE → SPEAR (+impales)`.
- If a matchup flipped but no stat moved, write the row anyway as a NOTE:
  "ShockCav vs MediumSpear flipped on the rider-exposure MECHANIC, no stat edit".

## Done

Every moved/re-pinned/rewritten/flipped test has a row; every changed stat-table
field has a row; each test row's four fields are concrete and measured; each
carries a provenance tag; the test rows match the test diff and the stat rows
match the class/weapon/pricing diff — no silent omissions.
