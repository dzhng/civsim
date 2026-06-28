---
name: close-spec
description: When a spec under specs/<feature>/ is done shipping (a feature-slicing build, or any planned task that produced a spec), archive it to specs/done/ and rewrite it from a build-plan into a durable rationale — the why, the principles, the invariants — pointing back to the real code for the how. Use when implementation has landed and the plan no longer matches what shipped, or the user says a feature/spec is finished. Pairs with [feature-slicing](../feature-slicing/SKILL.md) (the plan this closes) and [review](../review/SKILL.md) (run before closing).
---

# Close Spec

A spec is a **build plan** while you're building and a **rationale record**
once you've shipped. Closing flips it from one to the other. The plan was a
ladder of slices and predictions; the record is the layer of meaning the code
can't hold — why this exists, what it must never break, what you tried that
failed. The code is the single source of truth for *how*; the closed spec is
the source of truth for *why*, and a map into the code.

Do not summarize the implementation. Anyone can read the code. If a paragraph
restates what a function does, cut it and point at the function instead.

## Workflow

1. **Confirm it shipped.** The feature is merged or working in-tree and its
   tests/screenshot gates are green. If slices remain unverified, it isn't
   done — finish or [review](../review/SKILL.md) first.

2. **Diff plan against reality.** Read the spec's README and slices, then read
   what actually landed. Note every place the build diverged from the plan:
   dropped slices, renamed seams, a mechanic that turned out different, an
   assumption that broke. The divergences are the most valuable thing to
   record — they're exactly what a future reader would otherwise re-derive.

3. **Move it.** `specs/<feature>/` → `specs/done/<feature>/` (use `git mv`).
   Single-file specs: `specs/<feature>.md` → `specs/done/<feature>.md`.

4. **Rewrite the README as a record**, not a plan. Keep:
   - **Overview & purpose** — what shipped and the problem it solves, in
     present tense ("the economy settles monthly"), not future ("will add").
   - **The reason** — why it works this way and not the obvious alternatives;
     the constraints and trade-offs that forced the shape. This is the part
     the code cannot tell you.
   - **Principles & invariants** — the rules the implementation must keep
     honoring. What must stay true; what would silently break if violated.
   - **Pointers into the code** — greppable module/type/function names, file
     paths, and the tests that pin the behavior. Send the reader to the code
     for mechanics; name the entry points so they can find it in one grep.
   - **Dead ends** — approaches tried and rejected, with the reason, so nobody
     re-walks them.

   Cut: slice-by-slice build order, "next we will…", scaffolding instructions,
   per-slice verification checklists, and any prose that re-narrates code.

5. **Collapse the slices.** They were the build ladder; once shipped they're
   sediment. Fold anything durable (a divergence, a dead end, an invariant a
   slice established) into the README, then delete `slices/`. Keep
   `visualizations/` or `assets/` only if they still help a reader judge the
   result.

6. **Fix references.** Update links that pointed at the old path. If `[[memory]]`
   notes or other skills referenced the spec, repoint them.

7. **Audit every statement, unbiased.** Spawn sub-agents that did not write the
   spec and lack the conversation, and have them check the final document
   claim by claim against the actual code and tests. Fan out — one agent per
   section, or split the claim list across agents — so no single biased pass
   waves it through. Each agent returns a verdict per statement:
   - **Pointer** (a named module/type/function/file/test) — does it exist and
     say what the spec says? Flag stale names and wrong paths.
   - **Invariant / principle** — is it actually enforced in the code, or just
     asserted? Flag claims the code contradicts or doesn't back.
   - **Overview / reason** — is it consistent with what shipped, present tense,
     no leftover "will"/"next"/slice numbers?

   Treat unsupported, contradicted, or stale statements as defects: fix the
   spec (or the pointer) and re-audit the changed claims. The spec is not
   closed while any statement is unverified.

## Smell Test

- Could a reader reconstruct this paragraph by reading the code? → cut it,
  leave a pointer.
- Does it say "will" or "next" or name a slice number? → it's still a plan.
- Did a real decision diverge from the plan and go unrecorded? → that's the
  one thing worth keeping; add it.

## Done

The spec lives under `specs/done/`, reads as why-and-what-must-hold rather than
how, names the code that implements it, and every statement has survived an
unbiased audit against the code. A fresh reader gets the intent and the
invariants without the code — and the mechanics by following the pointers
into it.
