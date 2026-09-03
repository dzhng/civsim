# 11 — blade-material-share

**Contract unlocked:** the base and ring blade-field layers share one compiled
material per tier instead of building identical TSL graphs twice.

## Seam

`PhotorealBladeFieldLayer` gains `options.materials?: BladeFieldMaterialSet`;
`BattleGrassField` builds the set once for the base layer and hands it to the
ring. Sun direction is pushed once to the shared uniforms
(`battleWorld.ts:990-994` today pushes twice).

## Decisions resolved here

Identical graphs share; the ring differs only by records and cull wedge. If
the graphs turn out not identical (a uniform differs per layer), stop and
record it — do not force the share.

## Delegated to the implementer

Whether the set is keyed by tier index or tier name.

## Verification

- Probe first: mutate each tier's uniforms independently on the shared
  material and confirm both layers respond identically before landing.
- G-photo at **0 px** (`battle-map-style*`, `battle-ground-turf`,
  `photoreal-*`). Any diff means the materials were not identical — the slice
  stops.
- Stats: shader compile count halves (publish it in `stats().rebuild`).
- `perf:30k` not worse.

## Must stay green

All battle scenes byte-identical.

## Feedback that would change this slice

None.
