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

7. **Draft in parallel, then synthesize.** For any multi-slice feature, don't
   trust one pass to find the right cut. Fan out a few independent drafts and
   merge the best into one plan (see the Workflow). Divergence is the point:
   blind drafts surface slices, seams, and risks a lone plan misses — and where
   they independently agree, you know the cut is solid.

## Workflow

1. **Interview:** keep asking until you can name the slices without
   hand-waving. Stop when remaining unknowns can safely be discovered by the
   first slice.
2. **Draft in parallel:** for a multi-slice feature, spawn **three independent
   subagents** to draft the whole plan — fresh context each, a git worktree
   apiece if they must run or build to validate, otherwise have them return the
   plan inline. Give each the *same* brief from the interview and nothing else
   (never another draft), so they diverge. Each one: recon the real code and
   tests (measured facts, failed approaches, scope firewalls, greppable
   file/test names), then propose the slice graph, package/app boundaries,
   dependencies, API seams, playable deliverables, verification gates, and human
   review checkpoints. Skip the fan-out only for a genuinely single-slice
   problem.
3. **Synthesize:** read every draft and build the canonical plan yourself —
   don't anoint one. Take the strongest slicing, union the seams, risks, and
   firewalls each caught alone, and where drafts disagree pick the
   better-justified call and record the genuine alternative for the human. Where
   the drafts independently agree you're on firm ground; where they split is
   where to think hardest. When the feature has any visual surface, make
   [screenshot-critique](../screenshot-critique/SKILL.md) a standing verification
   gate in the README so every visual slice inherits it: the spec must tell the
   implementing agent to run an unbiased screenshot-critique as the last check on
   any visual shot before accepting it. When a slice *changes an existing* visual
   surface, the spec must also name
   [compare-screenshots](../compare-screenshots/SKILL.md) as the gate that judges
   the before/after — the telemetry and less-wrong verdict that screenshot-critique's
   single-shot eyes do not give.
4. **Materialize:** create `specs/<feature>/` when the feature has more than
   one slice or needs assets/visualizations.
5. **Build slice by slice:** leave each slice with a runnable artifact and
   verification before depending on it. Keep each artifact small enough to
   iterate on quickly. Keep the README's "Next Agent Prompt" written as the
   handoff text a future agent should read and follow.

## Plan Folder

Use `specs/<feature>.md` only for a small, single-slice problem. Large
features live in:

- `specs/<feature>/README.md` — goal, context, slice graph, review map,
  contracts, firewalls, known unknowns, and a "Next Agent Prompt" section with
  the current status, next pickup point, global TODO checklist, and handoff
  instructions for the next pass.
- `specs/<feature>/slices/<NN>-<name>.md` — one independently verifiable
  slice per file.
- `specs/<feature>/visualizations/*.html` — roadmap diagrams, prototypes,
  harness mockups, generated reports, contact sheets, or other
  human-reviewable artifacts.
- `specs/<feature>/assets/` — reference images, fixtures, captures, and
  other inputs needed to judge the work.

For visual work, keep feature-owned visual evidence in the spec folder:
inspiration images, reference screenshots, archived baselines, comparison
contact sheets, generated candidate captures, and critique artifacts. If those
files start outside the spec folder, copy them into the spec folder when they
become part of the feature's review context. Product snapshot folders may still
hold the active regression baselines their harnesses own, but do not rely on
those mutable outputs or external paths as the only record of what the feature
was judged against.

## Slice File Contract

Each slice file answers:

- What contract does this unlock?
- What is the API seam: module, functions/types, data shape, ownership?
- What can the human run or see?
- What tests, scenarios, screenshots, probes, or perf gates verify it?
- If the slice produces any visual shot (screenshot, GIF, contact sheet, or
  on-screen render), the slice file must instruct the implementing agent to run
  [screenshot-critique](../screenshot-critique/SKILL.md) as the last check before
  the slice is accepted — an unprimed second opinion the regression gates and the
  implementer's own inspection cannot supply. Write this as an explicit
  verification step in the slice, not as a passing mention.
- If the slice *changes an existing* visual surface, the slice file must also
  instruct the agent to use [compare-screenshots](../compare-screenshots/SKILL.md)
  to judge the before/after — telemetry plus a less-wrong verdict against the
  slice's visual target, not a check that the new shot matches the old one. Write
  it as an explicit step too.
- What must stay green?
- What feedback from the human would change this slice?

## README Handoff Prompt

Every multi-slice spec README needs a "Next Agent Prompt" near the top. Write it
in second person, as the prompt a future agent should read when they resume the
feature. The README should not merely describe that it is live handoff state;
the section itself must directly tell the next agent what to do next. It should
include:

- Current status and last-updated date.
- The exact next pickup point.
- Active blockers or warnings.
- A global TODO checklist, with each item pointing to the owning slice.
- A direct instruction to the next agent to update this section before ending
  their pass.

The point is that a fresh agent can open the README and know what to do next
without reading the chat.

## Done

The feature plan is done when a fresh agent can start at slice 1 without the
conversation, and the human can review the roadmap without reverse-engineering
a wall of text.

Once the slices have all shipped, [close-spec](../close-spec/SKILL.md) archives
the plan to `specs/done/` and rewrites it from a build ladder into a durable
rationale record.
