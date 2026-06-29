# Slice 05: Docs and Height-Seating Audit

## Contract

Close the feature by making the shared terrain/model helper ownership legible
and by auditing prop placement for hard-coded flat-ground assumptions.

This slice does not add more visual features. It proves the new shared helpers
are discoverable, documented at the right level, and not undermined by local
`z: 0` seating shortcuts in battle or campaign fixtures.

## API Seam

Write or update project docs using the `write-docs` rule: docs explain why a
helper exists, what kind of code belongs there, and where the source of truth
lives. They must point to registries and folders instead of copying exact model
lists, scene rosters, map tables, command matrices, class ids, or constants.

The docs should cover these ownership principles:

- shared scenery models belong to shared renderer model ownership, while
  battle/campaign passes own surface-specific density, scale, and placement;
- the terrain height sampler is the canonical seating API for props, soldiers,
  shadows, labels, roads, and future vision/projectile code;
- battle map presentation metadata lives in the map catalog, while menu code and
  renderer scenes consume it;
- Quick Battle army setup owns budgets, validation, and prebuilt templates
  without duplicating campaign recruitment rules;
- visual review scenes are gates, not the primary documentation of every helper.

Recommended doc placement: update the nearest existing renderer or web docs hub
if one exists; otherwise add a concise focused doc under `docs/` and link it
from the nearest root README. Prefer one durable hub over several overlapping
notes.

## Human Review Surface

Add a short implementation note or PR summary section that reports the
height-seating audit by category:

- fixed placement shortcuts: prop/entity/scenery code that used `z: 0` and now
  samples terrain height;
- acceptable zero-height hits: camera ground-plane comments, label anchor
  descriptions, coordinate-system docs, deliberate flat-map declarations, or
  non-placement math;
- follow-up candidates: anything that is still intentionally flat but should
  become height-aware in a separate feature.

The audit should be source-only and exclude generated bundles such as
`web/dist/`. It should explicitly include the campaign polish scenes that David
called out: `polish-label-spacing` and `polish-green-swatch`.

Current planning audit, before implementation: the suspicious production-source
pattern is the controlled campaign `testStageScenery` fixture path in
`web/src/campaign/renderer.ts`, which hard-codes campaign polish props at
`z: 0`. Comments in label/camera code and coordinate-system docs are not by
themselves placement bugs.

## Verification

- Source audit for placement shortcuts, excluding generated output:
  `rg -n "\bz\s*:\s*0\b|\bz\s*=\s*0\b|baseZ\s*=\s*0|elevation\s*:\s*0\b" web/src packages crates web/scenes specs -g '!web/dist/**' -g '!*node_modules*'`.
- Every remaining `z: 0`-style hit is classified as acceptable non-placement
  usage or has an issue/comment pointing to a specific owner.
- `polish-label-spacing` and `polish-green-swatch` render campaign props seated
  on sampled terrain height.
- Battle terrain placement scenes from slice 03 still prove soldiers, shadows,
  and scenery share the same sampled height source.
- Docs review follows `write-docs`: no copied helper inventories, scene rosters,
  exact command matrices, or map tables; docs point to the source registry that
  owns those facts.
- Root or hub docs link to the focused shared-terrain/model documentation so a
  new agent can find the principles before editing helpers.

## Must Stay Green

- Existing scene names and snapshot ownership stay in code; docs only point to
  the owner.
- Shared helper docs do not become a changelog for this feature.
- Any deliberately flat fixture or map is declared as flat at the map/fixture
  boundary, not hidden inside prop placement as `z: 0`.
- Generated bundles are not edited to satisfy the audit.

## Feedback That Changes This Slice

If the audit finds widespread flat-ground assumptions outside terrain placement,
split the fixes by owner. Do not let the docs slice become a broad renderer
refactor; fix prop seating that blocks the feature, then file follow-ups for
separate camera, label, or projectile semantics.
