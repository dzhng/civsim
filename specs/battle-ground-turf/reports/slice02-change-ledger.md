# Slice 02 change ledger

| Test | Previous behavior | New behavior | Why it changed |
|---|---|---|---|
| `battle-ground-turf` production meadow fixture (`web/scenes/battle/battle-ground-turf.mjs`) | The scene covered only the rejected baked-strand workbench and four unchanged snapshots. | The full-tier scene also boots fixed seed 7 through the production battle world, checks finite ground-crop telemetry, and pins RTS, top-down, far-band, and seven owning attribution images. | Contrast now has a production-camera contract and auditable term ownership rather than a lab-only visual claim. **[moved]** |
| `battle-ground-turf` mottle/canopy attribution | No world-applied term-off assertion or attribution baseline existed. | Lab-only `detail=mottle|canopy` must be reported by world stats; both term-off crops publish finite telemetry and have RTS/top-down baselines. | This identifies the guilty material term before tuning and proves the route reports applied state rather than echoing a query. **[moved]** |
| `battle-ground-turf` quad attribution | Quad flecks and scrub had no owning capture or pixel-effect assertion. | Both default/wide quad styles are stacked; disabling quad flecks changes 146,259 pixels and disabling scrub changes 217,871 pixels. | Quad-only terms need evidence from the material family that owns them, including both zoom-selected styles. **[moved]** |
| `turfTelemetry` (`web/tests/turfTelemetry.test.ts`) | No pure telemetry contract existed. | Five tests pin linear-sRGB luminance, percentile/span behavior, radius-2 versus radius-12 bandpass RMS, OKLab hue/chroma, and stable neutral-hue spread. | The acceptance thresholds must be reproducible without browser or GPU variance. **[moved]** |
| `battle-genmap-smoke` snapshot | The generated seed-7 battlefield showed high-contrast, camouflage-like mottling across open turf. | The same deterministic battlefield keeps its terrain, units, props, and HUD while open turf becomes a restrained low-amplitude canopy. | The production ground material now owns calmer contrast at tactical overview distance. **[moved]** |
| `battle-photoreal-shadows` scenery snapshots (golden, noon, dusk, overcast) | Grove crops inherited the same blotchy turf beneath otherwise stable trees and shadows. | Four environment-specific grove crops retain their lighting and shadow response over the calmer turf material. | These tight crops exercise the changed production ground material under every lighting preset. **[moved]** |

No sim tests, unit stats, or campaign behavior were re-pinned. Passing full-frame and
shadow-contact baselines were left untouched; the four baked-strand workbench snapshots
remain byte-identical.
