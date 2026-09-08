# Remaining spear and two-hand sword delivery

Completion-first source reuse, not renewed anatomy or cosmetic acceptance.
The existing engine selects all actions; no simulation, save or combat timing
changes. The canonical source folders and actual bindings are owned by
`blender-melee-foot.py` and `melee-foot-contract.mjs`; the shared roster baker
consumes them without a separate family bake CLI.

## Choices and limits

- **Sound, medium confidence:** spears retain fitted heavy body/left-shield
  motion, with a new right-arm axial effort. The two-hand sword retains the
  medium body's thrust and rear-hand trajectory, rather than forcing a
  one-hand sword swing beyond the support arm's reach. A new slashing study
  remains an unbuilt cosmetic alternative, not a missing melee binding.
- **Sound, high confidence:** the sword support hand uses a consistent .30 m
  purchase on its .46 m hilt. Pike poses previously slid the hand between
  +.361 m and −.160 m; unchanged reuse put it on the blade or behind the pommel.
  The shared arm solver retains the fitted hand roll for this caller. Existing
  ranged calls keep their original direction-derived orientation and arithmetic.
- **Sound, high confidence:** a falling spear is guided horizontally while
  the body rolls, instead of carrying a long tip through the floor with the
  torso. The crested heavy spear adds a small terminal head roll. These are
  authored pose corrections, never runtime root lifting or simulated forces.

## CPU and review

The original hand-to-hilt test failed on the actual exported sword; the corrected
source passes. Other than the explicitly authored arm/head channels, sampled
body/action values and fitted rest rigs remain exactly equal to their donors.
Actual presentation validation requires usable effort, reactions, locomotion,
and null projectile/pike-ready roles. Dense imported visible-mesh death checks
(169 samples per source) have minimum +0.000000259 m for all four.

Independent review first found the real hilt mismatch. Revised review session
`01a080ad-924c-7781-90b3-8089351706e6` reported no actionable source findings and
independently checked denser hand-to-hilt samples. TypeScript and the existing
ranged equipment-action control pass. Final exported-source and fourteen paired
LOD checks pass: exact rig/action transport and semantic retained materials,
including imported production tangent validation. Runtime triangle counts
(near/mid/far) are light spear 7962/986/786, heavy spear 7968/992/788,
medium spear 7962/986/788, and longsword 7980/1048/868. The three additional
pike source variants are 7984/1078/876, 7984/1072/876, and 7970/1066/870.
Far-only regeneration uses the shared exporter’s 800-triangle target; the
earlier 250-target outputs are superseded, not visually accepted. Original
editable geometry remains untouched. Visual gates are pending; this source
checkpoint deliberately enables parent integration before those gates and
does not claim visual completion.

## Changed-test ledger

- New exported-source test preserves donor body/actions while requiring the
  new sword's support hand to remain on its actual hilt, not merely reproduce
  the pike pose. It also validates the genuine melee presentation contract.
- Four class sheets add carry, ready, run, effort preparation/drive and fallen
  hold through the shared production workbench and exact repeat primitive.
- Existing ranged pose calculations move to the shared motion owner; their
  default calculation and previously exported content do not change.
