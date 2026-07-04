# Slice 16 - band camera/composition lock

## Contract

Lock the current review shot before changing more art. The camera must show the
same three bands the user called out: close foreground grass, middle-distance
LOD meadow/rolling terrain, and background cliffs, with the true horizon at the
vertical middle of the frame.

This slice is a camera and crop contract only. It exists so later slices cannot
move the camera to hide weak grass, flat midground, short cliffs, or missing
fog.

## Status

Accepted 2026-07-04 as a camera/crop contract, not an art-quality pass.

## Slice Variable

Camera framing and band ownership.

- **Judge:** horizon position, visible foreground/midground/background crops,
  stable camera target, and whether all three bands can be reviewed from one
  shot.
- **Do not judge:** grass density, midground softness, cliff material/height,
  fog, final colors, or whole-frame vibe.

## Architecture

- Reuse the terrain-aware hilltop camera profile from Slice 12b, but relock it
  against the current composed route after the Slice 13-15 terrain/grass work.
- Publish explicit crop rectangles for:
  - foreground grass: lower frame where close blades are expected,
  - midground LOD meadow: middle band where strands collapse into field mass,
  - background cliffs: upper/middle band where terrain blocks sky.
- Keep camera parameters named and route-owned. Do not bury per-shot magic values
  in tests.
- If the horizon cannot be centered while all bands are visible, reslice before
  changing art.

## Review Surface

- Full perspective shot.
- Band contact sheet with foreground, midground, background, and sky/horizon
  guide overlays.
- Route stats with horizon ratio and crop occupancy.

## Evidence

- Scene gate:
  `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-band-camera-composition-lock`
- Affected crop consumers were refreshed and reverified:
  `battle-map-reference-horizon-band-camera`,
  `battle-map-reference-midground-grass-lod-collapse`, and
  `battle-map-reference-cliff-material-relief`.
- Artifacts:
  `assets/slice-16-band-camera-composition-lock/band-camera-composition-lock.png`,
  `assets/slice-16-band-camera-composition-lock/band-camera-composition-lock-bands.png`,
  `assets/slice-16-band-camera-composition-lock/foreground-band.png`,
  `assets/slice-16-band-camera-composition-lock/midground-band.png`,
  `assets/slice-16-band-camera-composition-lock/background-band.png`,
  `assets/slice-16-band-camera-composition-lock/route-stats.json`, and
  `assets/slice-16-band-camera-composition-lock/compare-current-band-framing/`.
- Current telemetry: `horizonYRatio=0.5071`, `horizonError=0.0071`,
  `targetZ=19.414`, foreground crop `{x:0.06,y:0.72,w:0.88,h:0.25}`,
  midground crop `{x:0.06,y:0.56,w:0.88,h:0.16}`, and background crop
  `{x:0.02,y:0.24,w:0.96,h:0.32}`.
- Occupancy evidence: foreground `greenRatio=1`, midground `greenRatio=1`, and
  background `greenRatio=0.633` / `skyRatio=0.367`, so the background crop
  includes cliff/base content instead of mostly empty sky.
- Compare-screenshots against
  `assets/style-references/current-band-composition-2026-07-04.png` reports
  `parityDistance=0.27940`, `edgeEnergyRatio=1.21489`, and
  `avgLuminanceDelta=21.23933`. This is distance telemetry only; the accepted
  movement is that the candidate explicitly exposes the horizon guide and
  non-overlapping review bands.

## Findings

- Fresh screenshot critique rejected earlier background crops that were mostly
  sky or overlapped the midground. The accepted crop contract fixes those
  camera-scope issues with distinct bands: background `0.24-0.56`, midground
  `0.56-0.72`, foreground `0.72-0.97`.
- Final critique still flags visual-content debt: foreground and midground are
  too similar/flat without the debug boxes, the bright horizon seam remains, and
  cliffs are laterally clipped and tonally uneven. Carry those to Slices 17-20
  instead of moving the camera again.

## Verification

- Assert `horizonYRatio` is `0.50 +/- 0.03`. Cliffs may block sky, but the
  mathematical terrain horizon must remain centered.
- Assert each crop has non-empty terrain pixels and that foreground, midground,
  and cliff masks occupy their intended vertical bands.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against `assets/style-references/current-band-composition-2026-07-04.png` for
  camera/band placement only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to camera framing only.

## Accept / Reject

Accept if the camera gives one stable review shot with horizon centered and all
three visual bands visible.

Reject if the shot hides the foreground, crops out cliffs, moves the horizon off
center, or accepts art changes as a substitute for a clean camera contract.

## Next

Run `17-foreground-grass-band-integration.md`.
