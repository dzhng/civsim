---
name: implement-spec
description: Implement an existing spec. Use when the user says implement spec.
---

# Implement Spec

Build the active spec to completion, one reviewable pass at a time. The spec is
the source of truth, but the architecture is allowed to improve when the code
teaches you the plan is stale.

A pass (usually one slice) is a **commit checkpoint, not a stopping point.** The
job is the whole spec — every slice, every global TODO — not the first green
commit. Finishing a pass means starting the next one, not handing back to the
user. Only stop when the spec is fully implemented (or a genuine blocker needs a
decision only the user can make).

## Workflow

1. Read the repo README, the spec README, and the next slice before editing.
   Load any skills named by the spec. Identify the current pickup point, global
   TODOs, required gates, and what must stay green. If a multi-slice spec lacks
   a live handoff prompt, add one before the first pass ends.
2. Reconcile the plan with the current code. If the slice would preserve a
   development-only shim, duplicated type, weak wrapper, or obsolete path,
   replace it with the simpler architecture and update the spec handoff.
3. Implement one coherent pass: usually one slice, one vertical checkpoint, or
   one architecture correction. Keep the review surface small enough to audit.
4. Verify the actual contract. For sim behavior, run the focused cargo tests
   first; for browser-visible work, use the real browser/harness and inspect
   screenshots so the subject is framed and readable, not merely nonblank.
   Never weaken an existing default gate or repin a failing contract without
   proving the old contract is wrong.
5. Run [refactor-clean](../refactor-clean/SKILL.md) at the end of every pass,
   before reviewing: collapse any sediment this pass introduced — dev-only shims,
   duplicated concepts, parallel abstractions, compatibility wrappers — into the
   clean contract with one owner, so the code reads as designed today, not tacked
   on. Then run [review](../review/SKILL.md). Apply the fixes from both, rerun the
   affected checks, then commit only the focused changes from this pass.
6. Update the spec README's "Next Agent Prompt": status, completed work, next
   pickup point, blockers, changed gates, and any architecture decision that
   changed the plan.
7. **Continue.** If any slice or global TODO is still open, go straight back to
   step 1 for the next one — same session, no pause for acknowledgement. Keep
   looping until every TODO is closed. When the last slice lands, close the spec
   with [close-spec](../close-spec/SKILL.md).

## Rules

- Treat backward compatibility as non-goal for unshipped/dev scaffolding. Delete
  old paths, wrappers, aliases, fallback modes, and stale tests when the new
  architecture replaces them.
- Do not let tests get easier by accident. A split harness or new runner must
  preserve the old default coverage unless the spec explicitly changes it.
- Commit every clean pass, then immediately begin the next one. A green commit is
  a checkpoint, not permission to stop. If a pass is not green, do not commit it
  as finished; report the failing contract and exact evidence.
- Do not stop while work remains. "Slice N is done and committed" is not a
  finished task while later slices or TODOs are open — a single completed slice is
  a reason to continue, never to hand back. The only legitimate early stops are: a
  hard blocker that needs a user-only decision, a gate that cannot be made green
  with an honest fix, or the user interrupting. Running low on context is not a
  stop — update the handoff and keep going. When you must stop, say exactly which
  slice is next and why you paused.
- Keep visual evidence honest: contact sheets, GIFs, screenshots, and
  baselines must show the thing being judged at the intended camera/framing.
- Sweep every player-visible surface implied by the slice. A model, state, or
  data change is not done if the battlefield, cards, menus, reports, and
  verification fixtures now tell different stories.
- When the implementation touches shared behavior, leave docs or spec rationale
  using [write-docs](../write-docs/SKILL.md) principles: durable invariants and
  pointers, not copied inventories.
- **Human checkpoints never block.** At a slice's review or sign-off gate, open
  the relevant shots with [preview-shots](../preview-shots/SKILL.md), state the
  decision and the options, and give the user ~5 minutes to weigh in — keep
  building other non-blocked work meanwhile, never idle. If they don't answer,
  make the call yourself on the evidence, record the decision and its rationale
  in the spec (the checkpoint's resolution), and keep going — and close the shots
  you opened (preview-shots cleans up Preview) so a long unattended run never piles
  up windows. A goal or implementation NEVER stops to wait on the user; it documents
  the assumption, keeps it reversible, and lets the user course-correct later.

## Done

A **pass** is done when code, spec handoff, verification evidence, refactor-clean
and review cleanup, and a focused commit all agree on the same current truth —
then you start the next pass.

The **spec** is done — and only then is this skill done — when every slice and
global TODO is closed, all gates are green, the handoff shows nothing left to
pick up, and the spec has been archived with [close-spec](../close-spec/SKILL.md).
Anything short of that is mid-implementation: keep going.
