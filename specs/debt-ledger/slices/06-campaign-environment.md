# 06 — campaign-environment

**Contract unlocked:** the campaign renderer has one environment owner for sun
and haze, and one sun direction. Today three passes inline
`normalize(vec3f(-0.42,-0.34,0.84))` while the production skinned pipeline
reads `sunDirection()` from the camera uniform, seeded from
`(-0.40,-0.28,0.87)` — the chart renders with two suns.

Two sub-slices; only the second moves pixels.

## 06a — plumbing, zero pixels

`packages/game-renderer/src/campaign/environment.ts`:

```ts
export interface CampaignEnvironment {
  sunAzimuth: number; sunElevation: number;   // radians, the camera-uniform convention
  hazeColor: [number, number, number];
}
export const CAMPAIGN_ENVIRONMENT: CampaignEnvironment;
// The shell takes its sun at construction: createFrameShell(canvas, { sun: CAMPAIGN_ENVIRONMENT }).
// No apply helper: a second setter made the CALL ORDER decide the picture (merge incident, README).
export function campaignEnvironmentWgsl(env?: CampaignEnvironment): string;   // haze constant
```

- Seed with **two named constants** so 06a is provably zero-pixel: the
  pass-literal sun for `entityPass.ts:48`, `sceneryPass.ts:58`,
  `standardPass.ts:111`, and the camera-uniform sun for the skinned pipeline.
  The three passes stop inlining and read their named constant through the
  owner; `cameraUniform.ts:69-70 DEFAULT_SUN_*` is deleted and
  `FrameShellOptions.sun` becomes required — the environment owns the default,
  not the uniform packer.
- Haze: `horizonPass.ts:30 HAZE` — measure whether the CPU layout builder
  (238-271) feeds it to photoreal. If unread after slice 02, delete; if read,
  it becomes `env.hazeColor` for the campaign and the photoreal consumer keeps
  its own environment's value (one owner per renderer).
- Consumers: `web/src/campaign/renderer.ts` init, `apps/renderer-lab/src/labShell.ts`.

Gate: G0, G-camp at **0 px** (two constants reproduce today's frame exactly).

## 06b — one sun

Replace the pass-literal constant with the camera-uniform vector and have the
three passes call `sunDirection()` from `cameraWgsl.ts:44`. One visual
variable: lit-face direction on entities, scenery, standards. Crop for
judging: a campaign region with settlements and a standard, lower-right
quadrant; ignore terrain, water, labels.

Expected movers: `shots/campaign/*.png`, `shots/campaign/water/*`,
`shots/models/campaign/{entities,labels,terrain}/*`,
`shots/models/shared/standards/**`, any `shots/ui/*` snapped by
`campaign-visual`. Photoreal baselines must not move (they use
`CIVSIM_ENVIRONMENTS`).

Protocol per moved scene: `compare-screenshots` old baseline vs actual, then
`screenshot-critique` on the new frame, then `UPDATE_SHOTS=1` for that scene
only, then Read the PNG. `change-report` at the end.

**Human checkpoint (non-blocking):** open the before/after pair for
`campaign-visual` and `campaign-models` with preview-shots. Wait ~5 min. If
silent, keep the camera-uniform sun (README decision), record it in
`choices.md`, close the shots, continue.

## Decisions resolved here

Canonical sun = camera-uniform vector `(-0.40,-0.28,0.87)`. Alternative
rejected: the pass literal.

## Delegated to the implementer

Azimuth/elevation derivation from the vector; whether haze is a uniform or a
spliced constant.

## Verification

06a: G-camp 0 px. 06b: G-camp with the re-bless protocol; G-lab; G-photo at
0 px; `grep -rn "normalize(vec3f(-0\.4" packages` → 0 hits.

## Must stay green

Everything not on the mover list.

## Feedback that would change this slice

David preferring the pass-literal look in the checkpoint → swap the constant,
same protocol.
