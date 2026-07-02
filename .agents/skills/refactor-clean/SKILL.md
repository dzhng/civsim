---
name: refactor-clean
description: Refactor cleanly instead of layering sediment. Use when a change reveals duplicated concepts, local adapters, obsolete owners, compatibility wrappers, parallel abstractions, or "just tack this on" pressure in any code area.
---

# Clean Refactoring

Replace the old shape with the simpler shape the codebase would want if it were
designed today. Refactoring is not adding a compatibility layer beside the problem;
it is moving ownership until there is one concept with clear consumers.

## Workflow

1. Name the duplicated concept. Identify the thing that should have one owner:
   environment, pricing rule, geometry source, state machine, data contract,
   renderer phase, API shape, UI state, or test oracle.
2. Find every current owner and consumer. Treat wrappers, aliases, pass-local
   constants, copied structs, and "temporary" branches as sediment until proven
   otherwise.
3. Promote the concept to its natural home. Pick the module that would own it from
   scratch, then make old call sites consume that owner directly.
4. Delete or collapse the stale path in the same pass when feasible. If a bridge must
   remain, make it tiny, named as compatibility, and give it a removal condition.
5. Verify behavior through consumers, not just the new module. A clean refactor is
   only proven when the surfaces that used to diverge now report or exercise the
   same source of truth.

## Rules

- **Do not over-weigh the sunk cost of the existing architecture.** "It already
  exists and works" is not an argument for keeping a shape — coding agents make
  large architecture switches cheap, so size a refactor by the quality of the end
  state, not by the volume of code it replaces. When behavior must survive, pin it
  with tests at the consumer surface and swap the architecture underneath — though
  most of the time even the old seams shouldn't survive verbatim: a big refactor is
  the chance to redraw them into the shape the codebase would want today, not to
  faithfully rebuild the old interfaces on a new foundation.
- Prefer one shared primitive over N adapters. An adapter is acceptable only at an
  external boundary or as a short-lived migration seam.
- Do not preserve dev-only compatibility by default. Unshipped scaffolding should
  move to the clean contract immediately.
- Make ownership visible in stats, tests, or debug output when divergence was the
  bug class.
- Update the spec or handoff with the new invariant, not the mechanical file list.
- If the refactor starts widening into unrelated behavior, slice it: land the shared
  contract first, then port consumers in reviewable passes.
