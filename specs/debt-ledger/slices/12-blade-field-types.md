# 12 — blade-field-types

**Contract unlocked:** `bladeFieldLayer.ts` has typed uniforms, a transition
snapshot instead of twenty getters, and no per-frame 200k-record CPU stride.

## Seam

`packages/photoreal-renderer/src/battle/battleTsl.ts`:

```ts
export function typedUniform<T extends number | THREE.Vector2 | THREE.Vector3>(v: T): UniformNode<T>;
```

Replaces the 34 `as unknown as FloatUniformNode` casts (`bladeFieldLayer.ts:141-147,
206-215, 450-456`). The twenty four-line transition getters (1680-1830) become
`transition(): Readonly<BladeFieldTransition>`. The stats mirror that strides
every record each frame (779-848, "STATS ONLY") moves to rebuild time or is
sampled; measure `stats()` cost before and after and write the numbers in this
file.

## Decisions resolved here

Stats are computed when records change, not when the frame renders.

## Delegated to the implementer

Sampling stride if a per-frame figure is genuinely needed by a scene (grep
`web/scenes` for the field names first; delete any no scene reads).

## Verification

- G0. G-photo at **0 px**. `web/tests/turfTelemetry.test.ts` (vitest after 15).
- `grep -c "as unknown as" bladeFieldLayer.ts` → 0.

## Must stay green

Battle scenes byte-identical.

## Feedback that would change this slice

None.
