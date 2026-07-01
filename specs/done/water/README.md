# Water — one animated water material across civsim's three surfaces

Civsim has three places water appears, and they used to be three unrelated shaders:
the battle **open-sea horizon** past a sealed map edge, the battle **on-field water**
(rivers, lakes, shallows, shore that soldiers fight beside), and the campaign
**strategic sea**. They now share **one material**, `civsimWaterColor`, so a river can
flow into the sea with no seam, the look is single-sourced, and the whole thing is
analytic (no GPU compute, runs on every adapter).

The starting requirement was to replicate the wave geometry, whitecap foam, and
sun-glint of a WebGPU IFFT ocean
([`assets/reference-ifft-ocean-dusk.png`](assets/reference-ifft-ocean-dusk.png), from
`Spiri0/Threejs-WebGPU-IFFT-Ocean`) in civsim's 2.5D tilted-ortho renderer and
Bronze-Age Aegean palette — but driven by civsim's lighting preset, not the reference's
dusk mood.

## What shipped

- **One material.** `CIVSIM_WATER_COLOR_WGSL` in
  `packages/game-renderer/src/water/waterMaterialWgsl.ts` defines
  `fn civsimWaterColor(p, depth01, haze01, agitation, swash)`. Every water surface is
  this one function; two surfaces meeting cannot show a stripe if they pass matching
  arguments. `agitation` is the single dial from a glassy shallow (0: flat swell, no
  whitecaps, cut glint) to the open sea (1: steep swell, whitecaps, the broad glitter
  track). It composes the frozen look pieces: the analytic wave field
  (`gerstnerField.ts`), the neutral Aegean albedo × environment preset
  (`waterPalette.ts` × `waterEnvironment.ts`), and `waterShade` (the lighting +
  glint + foam + haze).
- **Battle on-field water** is per-fragment on the existing ground mesh
  (`battle/groundPass.ts` via `water/fieldWaterWgsl.ts`), keyed by a box-filtered
  water-weight vertex attribute. The mesh z is untouched, so soldiers and props still
  seat on the collision heightfield. It is `civsimWaterColor` at agitation 0 plus a
  thin swash line at the waterline.
- **Battle open sea** is a displaced `WaterPlanePass` per ocean edge
  (`battle/horizonPass.ts`), seated at the shoreline height datum, keyed on
  distance-from-shore. It is the *same* `civsimWaterColor`, ramping agitation up from
  0 at the shore, so the field↔sea shoreline is one material and the seam cannot exist.
- **Campaign strategic sea** is a subtle, zoom/pitch-gated shimmer in the map raster
  (`campaign/mapPass.ts`): the glint waves crawl on `cam.time`, gated so the map is a
  still painted chart from altitude and comes gently alive zoomed in close.

## The reason it works this way

- **The shoreline seam is closed by material identity, not by caulking.** The first
  battle-integration attempt drew the sea plane and the field water as two different
  shaders meeting at the shore, and no amount of feathering hid the stripe — because a
  seam between two *materials* cannot be caulked, only removed. So the field water was
  moved onto the shared material *first*, and the open sea was dropped onto that same
  material second; at the shoreline both evaluate `civsimWaterColor` with matching
  depth/agitation, so there is nothing to seam. This is the load-bearing decision of
  the whole spec.
- **The battle sea is a calm golden coast, not the rough deep-ocean reference.** The
  IFFT reference is the *lab* look target (matched in isolation on the open-sea plane).
  The in-battle target is `battle-advance-coast` from the `aesthetics` references — a
  pale, calm Aegean sea with a turquoise shallow shelf. So the coastal water is paler
  and calmer than the reference, and its whitecaps only build far offshore near the
  horizon. Depth and agitation ramp on *different* distances (a short one for the
  visible shallow→deep shelf, a long one for the calm surface) — tying them to one
  ramp made the sea read flat and its depth inverted.
- **Gerstner, not IFFT.** At this camera (distant horizon plane, small coastal
  patches, 2.5D ortho) IFFT's true dispersion is largely invisible while its compute
  cost and weak-GPU risk are real. Gerstner is analytic sum-of-waves, needs no compute
  or per-frame upload, and therefore runs on every adapter — it is its own weak-GPU
  fallback. The Slice-1 bake-off built both and confirmed it on visual + perf evidence.
- **The campaign is deliberately subtle.** The campaign map is an antique painted
  chart; a realistic animated ocean would fight the labels, sea-lanes, and borders. So
  the campaign gets only a gated shimmer over the raster sea mask — never displacement,
  never the deep-ocean look.

## Principles & invariants (must stay true)

- **One material at every shore.** Field water and open sea must both be
  `civsimWaterColor` with matching depth/agitation at the boundary. A second water
  authority (a separate sea shader, a revived `CampaignWaterPass`) reintroduces the
  seam this spec exists to remove.
- **Field water never displaces the collision surface.** On-field water is a
  per-fragment normal + foam on the ground mesh; soldiers/props ride the untouched
  `terrain/heightField.ts`. The seating gate (`battle-terrain-elevation`, soldiers seat
  at `match=true`, byte-identical) proves it. Only the open-sea plane (no units on it)
  displaces.
- **Animated water is deterministic at a fixed clock.** Every visual gate snaps at a
  fixed `cam.time` (`shell.setTime`). Battle scenes pass `?t=`; the campaign freezes at
  `fixedTime = 0`, so its `cam.time` sea-drift term is 0 and every campaign map snapshot
  stays byte-identical while runtime animates.
- **The lab open-sea look is frozen.** The six `web/scenes/system/water-*.mjs`
  scenes (silhouette, foam, glint, albedo, haze, rhythm) are the reference-matched look
  and stay byte-identical; changes to the shared material must reproduce agitation-1
  exactly (the `WaterPlanePass` lab path).
- **MSAA-safe.** Every battle water pipeline calls `gpuMultisample(shell.sampleCount)`.

## Pointers into the code

- The material: `water/waterMaterialWgsl.ts` (`CIVSIM_WATER_COLOR_WGSL`, `WATER_SHADE_WGSL`).
- The field: `water/gerstnerField.ts`; the kept firewall seam `water/waterField.ts`
  (`WaterFieldSource`, `createWaterField`).
- Palette / preset / ramps: `water/waterPalette.ts`, `water/waterEnvironment.ts`,
  `water/waterShoreRamp.ts` (`FIELD_WATER_RAMP`, `LAB_OPEN_SEA_RAMP`, `BATTLE_OCEAN_RAMP`).
- Surfaces: `water/fieldWaterWgsl.ts` + `battle/groundPass.ts` (field);
  `water/waterPlanePass.ts` + `battle/horizonPass.ts` (open sea); `campaign/mapPass.ts`
  (the `seaMotion`/`drift` gate, consuming `CAMPAIGN_SEA_PALETTE_WGSL` from
  `waterPalette.ts`) + `web/src/campaign/renderer.ts` (`shell.setTime`).
- Gates: `web/scenes/system/water-*.mjs` (lab look), `web/scenes/battle/water-coastal.mjs`
  + `water-open-sea.mjs` (battle), `web/scenes/campaign/water-sea.mjs` (campaign).

## Dead ends (do not re-walk)

- **IFFT (JONSWAP spectrum → compute IFFT → texture).** Built as the Slice-1 bake-off
  candidate B, lost to Gerstner, deleted entirely (`water/ifftField/`, the
  `computeOceanSupported` capability). Its dispersion is invisible at this camera; its
  compute cost and weak-GPU risk are not.
- **Caulking a two-material shoreline seam.** The first battle attempt kept the sea
  plane and field water as different shaders and tried to feather the boundary; the
  stripe survived. Unify the material instead.
- **A pitch-only animation gate.** The campaign lab presets are all top-down (pitch 0),
  so a `cosP`-only gate never opened; the shipped gate opens on *either* zoom or pitch.
- **Tying depth and agitation to one offshore ramp.** Pushing agitation far out (for a
  calm sea) also flattened the depth grade, so the sea read uniform with an inverted
  near-dark/far-light gradient. They ramp on separate distances now.
- **Judging the sea at a grazing/top-down camera.** The grazing `view=west` and the
  top-down `view=sea` compress every distance ramp and make the frozen sun-glitter track
  read as a false "seam." Judge at the 3/4 gameplay camera; there is no material
  discontinuity by construction.

## Visual provenance

- [`assets/reference-ifft-ocean-dusk.png`](assets/reference-ifft-ocean-dusk.png) —
  the deep-ocean IFFT render (from `Spiri0/Threejs-WebGPU-IFFT-Ocean`) that defined the
  **lab open-sea** look: wave geometry, whitecaps everywhere, a sun-glint streak. The
  six `water-*.mjs` lab scenes are matched against it. It is explicitly **not** the
  battle or campaign target.
- The **battle** coastal target is the `aesthetics` skill's
  `references/battle-advance-coast.jpg` (Total War Saga: Troy) — the pale, calm Aegean
  sea with a turquoise shelf that the in-battle water was pulled toward, away from the
  darker reference.
- [`visualizations/roadmap.html`](visualizations/roadmap.html) — the slice roadmap the
  build followed.
- Living result baselines are committed under `web/shots/` (battle:
  `water-coastal/`, `water-open-sea/`, `terrain-blockers/`; campaign:
  `campaign/water/`; lab: `misc/water/`).
