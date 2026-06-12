---
name: write-specs
description: Write a spec (specs/*.md) that hands a problem to an agent with zero context. Use when work must be deferred, handed off, or is too large for the current session. Specs capture the why, the evidence, and the failed attempts — they are deleted once implemented.
---

# Writing Specs

A spec exists so that **an agent with no context — no conversation
history, no memory of the debugging session — can catch itself up
completely** and solve the problem without re-living the journey. Judge
every line against that reader: they have the repo, the tests, and this
file. Nothing else.

Specs live in `specs/`, one problem per file. They are temporary by
design: the acceptance section ends with a postmortem note and
**deleting the file**. A spec that outlives its implementation is stale
documentation; the durable artifacts are the tests and the code
comments.

## The two things that matter most

**1. Communicate WHY, and how each decision was reached.** Not just
"do X" but "X, because we measured Y, and the alternative Z fails
because W." A context-free reader cannot evaluate an instruction they
don't understand — they can only follow it blindly, and they will
follow it off a cliff the moment reality diverges from the spec. Every
design choice carries its reasoning; every constant carries its
derivation or an honest "tuned."

**2. Record what was tried and FAILED, with the evidence.** This is
the most valuable section and the one nobody writes. Each failed
approach gets: what it was, why it seemed right, what measurably broke
(numbers, test names, commit hashes). Without this section the next
agent's first three days are spent rediscovering your dead ends — and
the failure evidence is usually the deepest insight in the document
("the phantom component is doing load-bearing work; you cannot delete
it, you must replace it").

## Structure (mirror `specs/impale.md`; earlier exemplar: received-impulse)

1. **Goal, in one sentence.** If it takes two, the spec covers two
   problems — split it.
2. **The contract it unlocks / must not break.** Name the exact tests.
   If a deferred contract already exists as an `#[ignore]`d test with a
   diagnosis in its note, reference it — that test IS the acceptance
   criterion, and the ignore-note is the breadcrumb that connects code
   to spec.
3. **"Context you don't have (read this; it is the whole reason)."**
   The mechanism background: how the relevant system actually works,
   with exact file/function/field names the reader can grep
   (`combat.rs strike()`, `kin_vx`, `press_brake_floor` — never "the
   collision code"). Include the **measured numbers** that define the
   problem (counter_press peaks at 0.36, the gate is 0.45) — operating
   points are how the implementer knows their change is working before
   any test goes green.
4. **The failed fixes — do not retry these naively.** See above. Date
   them, cite commits.
5. **The design.** Concrete formulas in terms of quantities that
   already exist. Where a decision is still open, present the options
   RANKED with the reasoning, and say which contract will arbitrate
   ("if the impale term turns sword walls into pike walls, it is
   miscalibrated").
6. **What must NOT change.** Scope firewalls: which systems another
   session owns, which behaviors are locked, what looks related but
   isn't part of this problem.
7. **Contracts table — the tests are the spec.** Two lists: tests that
   must BECOME green (the acceptance), and tests that must STAY green
   (the calibration boundary). Include tests that don't exist yet as
   one-line claims to be written. Note that the golden hash will move
   and must be re-pinned deliberately, once.
8. **Process requirements.** The operational gotchas this repo has paid
   for: cargo first, probes change float codegen, chaos-marginal tests
   wobble on any recompile, concurrent sessions edit the same tree.
   Copy the current list from the most recent spec rather than from
   memory — it accretes.
9. **Acceptance.** Checkable items, ending with: postmortem note (the
   measured before/after operating points, for the next person), then
   delete this file.

## Calibrate the spec's authority correctly

Mark clearly which parts are **measured fact** (binding — the reader
should trust the numbers and the failure evidence) and which are
**proposed design** (the author's best guess — the reader is licensed
to deviate when measurement disagrees). The received-impulse spec
proposed an impulse formula that turned out to be flattened by the
separation cap; the implementer caught it because the spec's *evidence*
section made the real constraint clear. A spec that demands obedience
to its proposals fails exactly when it matters; a spec that binds the
problem, the evidence, and the contracts survives its own mistakes.
State it explicitly if needed: "solve the problem; this design section
is a starting point."

## Style

- Greppable anchors everywhere: exact test names, field names, tunable
  names, file paths, commit hashes. The reader's first act is grep.
- Numbers over adjectives: "counter_press peaks at 0.36 against a 0.45
  gate" beats "the pressure is too low."
- Name the philosophy constraints that bound the solution space ("the
  five weapon numbers stay five", "formulas read men, mass, measured
  motion") so the reader doesn't propose something the repo's hard
  rules forbid.
- Short. The reader is an agent: completeness of *evidence* matters,
  padding costs context window. If a section has nothing hard-won in
  it, delete the section.
