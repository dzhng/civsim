---
name: implement-spec
description: Spec pass for building an existing specs/<feature>/ plan. Use when the user says implement <spec>, continue a spec, read the README and follow the spec, work through slices, /review each pass, or ship a planned feature without preserving development-only compatibility.
---

# Implement Spec

Build the active spec one reviewable pass at a time. The spec is the source of
truth, but the architecture is allowed to improve when the code teaches you the
plan is stale.

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
5. Run [review](../review/SKILL.md) before committing. Apply simplifications
   found in review, rerun the affected checks, then commit only the focused
   changes from this pass.
6. Update the spec README's "Next Agent Prompt" before ending: status,
   completed work, next pickup point, blockers, changed gates, and any
   architecture decision that changed the plan.

## Rules

- Treat backward compatibility as non-goal for unshipped/dev scaffolding. Delete
  old paths, wrappers, aliases, fallback modes, and stale tests when the new
  architecture replaces them.
- Do not let tests get easier by accident. A split harness or new runner must
  preserve the old default coverage unless the spec explicitly changes it.
- Commit every clean pass. If a pass is not green, do not commit it as finished;
  report the failing contract and exact evidence.
- Keep visual evidence honest: contact sheets, GIFs, screenshots, and
  baselines must show the thing being judged at the intended camera/framing.
- Sweep every player-visible surface implied by the slice. A model, state, or
  data change is not done if the battlefield, cards, menus, reports, and
  verification fixtures now tell different stories.
- When the implementation touches shared behavior, leave docs or spec rationale
  using [write-docs](../write-docs/SKILL.md) principles: durable invariants and
  pointers, not copied inventories.

## Done

A pass is done when code, spec handoff, verification evidence, review cleanup,
and a focused commit all agree on the same current truth.
