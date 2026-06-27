---
name: feature-slicing
description: Break large features into independently verifiable, human-reviewable slices under specs/<feature>/. Use for risky or multi-step feature work that needs upfront questioning, API seams, browser-playable checkpoints, HTML visualizations, screenshot gates, or staged implementation plans. Pairs with [write-scene](../write-scene/SKILL.md) and [screenshot-regression](../screenshot-regression/SKILL.md) (the browser checkpoints and screenshot gates) and [review](../review/SKILL.md) (audit each slice before it lands).
---

# Feature Slicing

Turn a large feature into a ladder of small contracts. Each rung should be
understandable to the human, testable by an agent, and useful before the
whole feature is done.

## First Principles

1. **Grill before planning.** Ask one question at a time until you know the
   desired outcome, non-goals, review surface, sacred contracts, missing
   assets, and first useful playable checkpoint. Give your recommended
   answer with each question so the user can accept, reject, or edit it.
   Inspect the repo instead of asking questions the code can answer.

2. **Slice at API seams.** Each slice should behave like a tiny library where
   possible: named module boundary, typed inputs/outputs, deterministic
   fixtures, and tests at the seam. If a slice needs three unrelated systems
   booted before it can be checked, sharpen the seam.

3. **Make progress visible.** For visual or interactive work, every slice
   should produce something playable: a route, fixture page, harness, CLI
   probe, or HTML visualization the human can run, inspect, screenshot, and
   critique. Tests prove contracts; demos expose taste and intent.

4. **Optimize feedback loops.** Slice so the next useful question can be
   answered quickly. Prefer tiny runnable surfaces, hot-reloadable harnesses,
   sample fixtures, and self-contained workbenches over plans that require the
   whole feature to exist before anyone can learn from it. For asset-heavy
   work, plan an asset app/workbench where humans and artists can add samples,
   upload replacements, preview them live, and see validation failures fast.

5. **Use the repo's natural shape.** If the repo is a monorepo, plan apps and
   packages instead of forcing everything into the current app. Give each
   testable surface a first-class route or command; avoid piling new behavior
   behind opaque query flags when a small dedicated app would be clearer.

6. **Do not block on missing inputs.** If art, data, credentials, or external
   assets are missing, plan generated placeholders plus a replacement contract.
   The feature should advance with placeholders, while a separate handoff path
   explains exactly what the human or external partner must provide later.

## Workflow

1. **Interview:** keep asking until you can name the slices without
   hand-waving. Stop when remaining unknowns can safely be discovered by the
   first slice.
2. **Recon:** read the relevant code and existing tests. Record measured
   facts, failed approaches, and scope firewalls with greppable file/test
   names.
3. **Map:** define the slice graph, package/app boundaries, dependencies, API
   seams, playable deliverables, verification gates, and human review
   checkpoints.
4. **Materialize:** create `specs/<feature>/` when the feature has more than
   one slice or needs assets/visualizations.
5. **Build slice by slice:** leave each slice with a runnable artifact and
   verification before depending on it. Keep each artifact small enough to
   iterate on quickly.

## Plan Folder

Use `specs/<feature>.md` only for a small, single-slice problem. Large
features live in:

- `specs/<feature>/README.md` — goal, context, slice graph, review map,
  contracts, firewalls, and known unknowns.
- `specs/<feature>/slices/<NN>-<name>.md` — one independently verifiable
  slice per file.
- `specs/<feature>/visualizations/*.html` — roadmap diagrams, prototypes,
  harness mockups, or other human-reviewable artifacts.
- `specs/<feature>/assets/` — reference images, fixtures, captures, and
  other inputs needed to judge the work.

## Slice File Contract

Each slice file answers:

- What contract does this unlock?
- What is the API seam: module, functions/types, data shape, ownership?
- What can the human run or see?
- What tests, scenarios, screenshots, probes, or perf gates verify it?
- What must stay green?
- What feedback from the human would change this slice?

## Done

The feature plan is done when a fresh agent can start at slice 1 without the
conversation, and the human can review the roadmap without reverse-engineering
a wall of text.
