# Below-camera aerial lighting

The atmospheric integration endpoint must use the same normalized ray as the integration samples. Clamping the incoming below-horizon vertical component changes that ray's length. Computing the atmosphere intersection from the pre-normalized component overextends the march near the downward pole, skips dense air near the observer, and bakes an artificially dark block into the sky LUT. Aerial perspective exposes that block where the camera looks nearly straight down.

The correction belongs to the shared SkyModel, so campaign aerial haze and battle sky/IBL consume the same corrected radiance. It changes no environment settings, map geometry, fog policy, or water material.

## Diagnosis evidence

The production overview is frozen at its existing camera and DPR1. The original shadow toggle changed 39,260 whole-frame pixels and zero pixels in the reported water ROI. Disabling political tint and gameplay fog retained the rectangle.

The valid continuous-render controls preserve app updates and apply temporary switches immediately before the renderer draws:

- [Terrain only](terrain-only.png): hide all physical meshes except terrain and sky; rectangle remains.
- [No environment lighting](no-environment.png): rectangle remains.
- [No aerial perspective](no-aerial.png): rectangle disappears.

Two earlier controls are rejected and not retained as visual evidence: live adapter updates overwrote mesh visibility in the first; blocking adapter rendering produced blank presentation in the second. Neither supports a diagnosis.

[CPU reconstruction](cpu.json) uses the actual production camera, TerrainField and campaign landscape builder. The center and neighboring water probes have identical height, normal, coverage and capped offshore distance. [Ray reconstruction](ray.json) shows the mismatch: the reported center ray previously ended at 438.03 km altitude despite the atmosphere ending at 100 km; using the normalized direction ends at exactly 100 km.

## Visual contract

[Before](overview-before.png) and [after](overview-after.png), with [enlarged before](libya-before-3x.png) and [enlarged after](libya-after-3x.png), retain the existing overview camera, geography, atmosphere and faction presentation. Fresh independent review accepted the continuous water gradient and found no new map, coastline, label or HUD defect. Existing broad haze and stepped distant shorelines remain.

The existing overview scene now measures three equally spaced, water-only patches across the reported rectangle. The center's RGB-mean depression against the mean of its neighbors was 34.12 before and 11.70 after. A maximum of 20 permits the existing smooth directional gradient while rejecting the deep rectangular trough. This is a local visual defect gate, paired with the full-frame exact snapshot; it is not a generic water-color quality metric.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Campaign physical overview: below-camera sea | Accepted baseline contained a 34.12-level center trough. | Requires trough below 20; corrected capture measures 11.70. | The normalized ray now reaches the atmosphere boundary instead of overshooting it. **moved** |
| Battle sky preset identity | Duplicated golden turbidity 2.6 disagreed with the current canonical 2.9. | Reads the expected turbidity from the shared preset, retaining the identity check. | The gate checks renderer/preset agreement rather than a stale copied value. **carried-in** |

Environment CPU checks and typecheck pass. Independent Codex review found no concrete correctness or maintenance issues. The ad-hoc fixed frame repeats byte-identically.

The four-preset battle run retained deterministic frames, nonblank output, preset mood separation and no page errors. Its legacy camera now points down at terrain, so its named sky bands are not accepted as sky evidence. [Measured baseline drift](stale-battle-baselines.json) is recorded without reblessing those twelve old images. A bounded oblique golden-hour comparison isolates the corrected intersection separately; no claim of full battle sky snapshot acceptance is made here.

The official overview repeat passes every behavior and shader-warning check, its new trough check measures 11.7047, and the full snapshot differs by zero pixels.

The [old intersection](battle-old.png) and [corrected intersection](battle-fixed.png) use the same explicit oblique golden-hour camera and Chrome hardware configuration. Only the old expression is substituted in the control browser's served module. [Comparison telemetry](battle-comparison.json) confirms one substitution, identical cameras, no errors, mean RGB difference 0.003985 across the full frame, and maximum summed RGB difference 3. Fresh independent review found the two images visually equivalent, with continuous sky/haze and layered terrain. Existing yellow haze and subdued contrast are retained; this frame supports no combat-readability claim. An earlier bundled-Chromium hardware attempt produced black images and is rejected, not used in the comparison.

Review kept the correction in the existing shared atmosphere owner, without a new shader branch, fallback, setting or material. The only maintained visual baseline updated here is the corrected campaign overview.
