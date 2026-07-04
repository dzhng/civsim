# Slice 12b - horizon and band camera

## Contract

Pin the battle reference camera before more art work. The perspective shot must
place the implied terrain/sky horizon at the vertical middle of the frame, with
clear foreground, midground, and background review bands.

## Status

Accepted 2026-07-04 as a camera/framing gate, not final scene art.

## Slice Variable

Camera composition only.

- **Judge:** horizon height, foreground/midground/background crop stability, and
  whether the camera still sits on the small hill.
- **Do not judge:** grass density, cliff texture, fog mood, water, or final
  color.
- **Grass input:** keep the foreground grass state current for this camera
  checkpoint enabled so composition is judged with real lower-frame mass, not
  with a sparse placeholder. Do not treat this slice's texture-carrier parameter
  set as the accepted Slice 14 grass look.

## Architecture

- Use the existing battle heightmap route and shared projection helpers.
- Publish camera telemetry: pitch, yaw, eye, target, FOV/zoom, implied horizon
  screen Y, and crop rectangles for foreground, midground, and background.
- Keep the camera deterministic for screenshot gates.
- Do not compensate for camera problems by stretching terrain, fog, or grass.
- Reuse the foreground grass foundation parameters from Slice 14a while keeping
  grass out of the acceptance decision. Slice 14 may replace those parameters
  with the better field-owned close-grass stack as long as the horizon and
  review bands stay fixed.

## Review Surface

- Hilltop perspective shot with optional simple clay/material diagnostic.
- Overlay or sidecar telemetry showing:
  - horizon Y ratio target: `0.50 +/- 0.03`
  - foreground crop: lower band containing close grass
  - midground crop: soft meadow band
  - background crop: cliff/mountain masses

## Verification

- Add or update a scene gate that asserts the horizon Y ratio and publishes the
  crop rectangles used by later slices.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against `assets/style-references/current-band-composition-2026-07-04.png` for
  composition only: horizon placement and band separation, not material quality.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to camera/framing only.

## Evidence

- Route:
  `/renderer/battle-terrain-3d?gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&cameraProfile=horizon-band&environment=overcast-foggy&grassTechnique=field-accent&grassPrimitiveFamily=texture-carrier&geometryProbe=midground-valley&grassRadius=360&grassFieldCell=1.8&grassFieldRecords=20000&grassMinNormalZ=0.72&grassAccentClumps=20000&grassAccentTufts=20000&grassAccentFootprint=2.4&grassBlades=4&grassBladeHeight=0.78&grassBladeWidth=0.084`
- Scene gate:
  `VERIFY_GPU=1 UPDATE_SHOTS=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-horizon-band-camera`
- Artifacts:
  `assets/slice-12b-horizon-band-camera/horizon-band-camera.png`,
  `assets/slice-12b-horizon-band-camera/horizon-band-camera-crops.png`,
  `assets/slice-12b-horizon-band-camera/route-stats.json`,
  `assets/slice-12b-horizon-band-camera/compare-current-band-side-by-side.png`,
  and
  `assets/slice-12b-horizon-band-camera/compare-current-band-telemetry.json`.
- Current telemetry: `horizonYRatio=0.5071`, `horizonError=0.0071`,
  `targetZ=19.414`, foreground crop `{x=0.06,y=0.72,w=0.88,h=0.25}`,
  midground crop `{x=0.06,y=0.56,w=0.88,h=0.16}`, and background crop
  `{x=0.02,y=0.24,w=0.96,h=0.32}`.

## Findings

- The route now points the shared chart/camera3d camera at the actual terrain
  height under the hilltop camera instead of a flat `z=0` target. Without that,
  an exact middle horizon could put clear color under the foreground.
- The shot used the texture-carrier grass foundation as input for the camera
  checkpoint. That path is now a control/baseline, not the destination. If the
  camera makes foreground blades hard to inspect, Slice 14 should carry a
  separate close workbench gate while keeping this horizon-band camera fixed.
- The visible horizon gate measures the far terrain perimeter rather than sky
  color, so later fog/sky/cliff work cannot accidentally pass the camera gate by
  changing colors.
- Compare-screenshots judged the new candidate less wrong for the slice
  variable because the implied horizon is centered; the old/current-band
  screenshot had more visible terrain but a higher horizon.
- Fresh screenshot critique still flags the accepted shot as visually weak:
  foreground is flat, the foreground-to-midground transition is abrupt, the
  midground aliases into a noisy horizontal strip, background cliffs are
  compressed/edge-weighted, and overall scan readability is low. Those are
  blockers for Slices 13-15 and 17, not for this camera gate.

## Accept / Reject

Accept if the horizon is centered vertically, foreground/midground/background
bands are stable, and the camera still reads as standing on a small hill looking
across the valley.

Reject if the horizon drifts high/low, if the camera becomes top-down, if the
foreground band disappears, or if later slices would need custom crops to hide a
bad composition.

## Next

Run `13-cliff-material-relief.md`.
