# Slice 18b - grass LOD from evidence

## Contract

Introduce grass LOD only after Slice 18 has covered the entire slope-eligible
terrain with the retained False Earth grass architecture and published perf
numbers. The LOD design should answer measured cost/readability problems, not
preemptively simplify the scene.

## Slice Variable

Evidence-led grass LOD.

- **Judge:** which distances or terrain bands need cheaper representation,
  whether the LOD preserves coverage/readability, and whether perf improves.
- **Do not judge:** cliff scale, fog, terrain topology, camera framing, or final
  whole-frame style parity.

## Architecture

- Keep one terrain-owned grass system. LOD levels are representations of the
  same slope-eligible grass field, not separate visual systems.
- Preserve the foreground False Earth/fiber-shell look where it is visible.
- Mid/far representations may collapse into cheaper meadow mass only where
  Slice 18 proves full fibers are too costly or visually unresolved.
- No `field-subcell` stipple or texture-carrier carpet may become the accepted
  LOD unless it beats the retained grass foundation in both visual review and
  perf telemetry.

## Verification

- Compare Slice 18 full-terrain baseline versus the LOD candidate using the
  same camera, crops, and perf telemetry.
- Publish per-band record counts, draw calls, triangles, instance bytes, frame
  timing, and visible coverage deltas.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the Slice 18 baseline for grass coverage/readability and perf-driven
  LOD only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to LOD transitions, missing grass, rings, and noisy carpets.

## Accept / Reject

Accept if LOD preserves the Slice 18 coverage contract while improving measured
perf or visual readability.

Reject if LOD hides missing grass, introduces visible rings, turns the field
into stipple/carpet, or weakens the foreground grass foundation.

## Next

Run `19-background-cliff-scale-bases.md`.
