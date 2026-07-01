# Slice 03B3A — field meadow coverage and transition floor

## Contract

Lock the field-owned meadow coverage path without foreground blades: field records
drive a ground-material meadow texture, and field/no-field transitions do not form
hard horizontal or radial bands in the reference grass crop.

## Approach

Start from `BattleGroundPass.setMeadowFromGrassField(...)`: RGBA field texture,
explicit meadow telemetry, and `fieldFloor`. Keep the
workbench strict (`fieldFloor: 0`) so it proves field ownership, but allow the
reference fixture a small transition floor if it removes a visible material seam.

Make coverage/falloff explicit instead of treating it as a colour-tuning side
effect:

- preserve the raw field mass channel so telemetry still proves field ownership;
- derive a separate soft coverage channel for transitions, using dilation/blur,
  neighborhood max, or another deterministic field-space smoothing step;
- keep `fieldFloor` as a named transition control, not an invisible fallback;
- keep the reference camera, terrain, lighting, and `grassBlades=0` fixed while
  comparing candidates;
- if adding a debug view helps, expose only the field mass / soft coverage /
  final meadow weight channels, then remove or clearly route-gate it before
  accepting the slice.

The variable under judgment is **coverage/falloff only**:

- lower-third meadow coverage is broad and continuous;
- field/no-field transition is soft enough that it does not read as a mask;
- midground coverage fades into tone rather than a bright green strip;
- route stats prove mass is not coming from foreground blade count.

Do not chase blade silhouettes, final color, cliffs, water, fog, or sky here.

## Current Evidence

The accepted coverage/falloff path passes telemetry and scenes:

- `battle-grass-field` with `mode=field-meadow` publishes `source: 'field'`,
  raw/soft field coverage, average density/coverage, directional coverage, and
  `fieldFloor`.
- `battle-map-reference?grassTechnique=field-meadow` remains the zero-blade proof
  path with `bladeInstances === 0` and `drawCalls === 0`.
- Parameter spikes showed wider field focus and higher `fieldFloor` increase
  coverage telemetry, but do not by themselves remove the painted-surface read.

Latest result: the softened coverage channel landed and this coverage/falloff
piece is complete enough to hand off. The reference fixture now reports raw
`fieldCoverage ~= 0.076`, `softCoverage ~= 0.170`, `avgCoverage ~= 0.152`, and
`fieldFloor ~= 0.07`. The visible bright horizontal band is reduced; remaining
wrongness is material volume / painted-plane read, owned by 03B3B/03B4 rather than
more coverage smoothing.

## Approach Log

Rejected or insufficient approaches:

- Wider field focus / higher record cap: improves `fieldCoverage` but the visible
  band remains.
- Higher `fieldFloor`: softens some no-field gaps but washes the meadow into flat
  terrain colour.
- Directional ridges and screen-space thatch: can raise edge metrics, but also
  adds combed rows and distracts from the coverage/falloff question.

Accepted approach:

- Added a field-space soft coverage channel and compared raw mass vs softened
  coverage in the same crop.
- Lowered `fieldFloor` so the floor is no longer a hidden full-crop carpet.
- Kept acceptance scoped to "did the band reduce while field-owned coverage stayed
  broad?" and moved the remaining painted-plane/volume problem out of 03B3A.
- Raw R channel remains field ownership; softened G channel drives the
  transition/falloff.
- `field-meadow` route keeps `bladeInstances === 0` and `drawCalls === 0`.

## Verification

- `UPDATE_SHOTS=1 VERIFY_URL=... VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-grass-field battle-map-reference`
- `VERIFY_URL=... VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- `compare-screenshots` on foreground and midground grass crops. Judge the band
  and coverage/falloff, not blade detail.
- Fresh `screenshot-critique` scoped to coverage/falloff only.

## Next Slice

Continue through the recorded 03B3B handoff to
`03b4b-clump-root-shadow-volume.md`.
