# Implementation checkpoint and handoff

The overall spec remains in progress; detailed candidates remain manual-only with
`presentation: null`. Engine observations remain canonical. No gameplay states,
combat timing or simulation mechanics were changed by this checkpoint.

## Saved work

- Heavy sword-effort and hit studies are composed into the fitted heavy source,
  preserving its ten prior actions. Restrained weight transfer and crowded sword
  release remain art limitations; integration is not final animation acceptance.
- Medium held-pike ready C is retained provisionally alongside its seven prior
  actions. It expresses the engine's held hedge, not the unobserved physical brace
  ramp. Its seated/upright support and rigid upper body remain open.
- [Death G](assets/evidence/13/rejected-death-g/review.md) is archived as a rejected
  study, not installed into the candidate catalog. No further fall revision or
  full motion film is included in this checkpoint.

## Final verification

The independent merged-tree normal run passed all 3,607 checks and 935 snapshots
(577 heavy, 358 medium), each with zero differing pixels, no failures and no page
errors. No baselines or tolerances were changed during this run. The
[raw report](assets/evidence/12/final-actions-merged.json) records both scenes.
This used SwiftShader for correctness, not a hardware performance claim.

Both candidate bake checks passed. The six animation/pose/basis/tangent/bounds/
presentation suites passed after medium integration; the heavy integration also
passed the full 354 web tests and TypeScript check before that source-only merge.
These gates preserve the visual limitations above rather than accepting them.

## Remaining work, not started here

The medium thrust and subsequent roster authoring remain open. The existing
renderer adds a procedural corpse roll after the authored pose; a read-only probe
shows that this can drive a grounded native fall through the floor. Correct that
shared renderer/bounds convention with regression coverage before evaluating live
death grounding. Do not compensate by lifting a particular authored asset.

Resume from the remaining work above, preserving the original slice status and
visual caveats. The previous session's stop instruction does not pause this spec
or restrict a fresh session continuing its implementation.
