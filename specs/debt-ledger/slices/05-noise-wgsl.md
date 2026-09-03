# 05 — noise-wgsl

**Contract unlocked:** WGSL noise has one owner, spliced the way the camera
WGSL already is.

## Seam

`packages/renderer-core/src/noiseWgsl.ts`:

```ts
/** fn hash(p: vec2f) -> f32; fn vnoise(p: vec2f) -> f32; fn fbm(p: vec2f, w: vec3f) -> f32 */
export const NOISE_WGSL: string;
```

`fbm` takes its octave weights as a parameter because the four existing copies
use different weights; callers pass their current weights verbatim so no
site's math changes. `atmospherePass` keeps its two named signals
(`cloudFbm`, `fogFbm`) if they differ beyond weights — those are different
signals, not duplicates.

Sites after slice 03 (the frameShell copies died with the lab terrain):
`campaign/mapPass.ts:178, 385`, `campaign/atmospherePass.ts:36, 100`. Splice
`NOISE_WGSL` beside `WORLD_CAMERA_WGSL` in each pass and delete the inline
bodies. The `vnoise` variant that splats `vec2f(3.0)` is arithmetically
identical to the scalar form.

## Decisions resolved here

Byte-identical bodies; parameterised, never "harmonised" weights.

## Delegated to the implementer

Whether `ridge` (if present in any copy) joins the module.

## Verification

- G0. G-camp at **0 px** on every campaign baseline; any diff means a body was
  not identical — stop and diff the WGSL text, do not re-bless.
- `grep -rn "fn hash(p: vec2f)" packages` → exactly one hit.
- The new file must not declare `struct Camera` (scanner firewall).

## Must stay green

Campaign scenes byte-identical.

## Feedback that would change this slice

None.
