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

**Measured in lane W (1,000,000 records, SwiftShader, 5,000 warmed
`window.__game.stats()` calls):** before 0.004925 ms/call median (p10 0.004825,
p90 0.007750); after 0.005450 ms/call median (p10 0.005350, p90 0.009050).
The published stats call remains effectively constant-time; the 200k-record
sample now runs once when records or transition bands change instead of on
every rendered frame.

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
