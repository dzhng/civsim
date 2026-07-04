# Slice 13 - background cliff height and silhouette

## Contract

Make the background cliffs and mountain shoulders read as terrain-owned masses.
Compared with the current shot, the cliff/mountain forms should be roughly 3x
higher and more assertive before material polish is judged.

## Status

Accepted 2026-07-04 as a terrain-owned cliff height/silhouette pass, not as
final rock material, fog, or full composition.

## Slice Variable

Background cliff geometry and silhouette.

- **Judge:** height, ridge outline, terrain ownership, slope/passability
  consistency, and whether cliffs block some sky above the centered horizon.
- **Do not judge:** foreground grass, midground grass LOD, distance fog, or final
  rock texture.

## Inputs

- Start after Slice 12b fixes the camera/horizon gate.
- Use the heightmap/topology source from Slices 10-12.
- Use the top-down heightmap reference only as a loose guide for mountain masses
  and valley containment.

## Architecture

- Keep cliffs in the heightfield/terrain source. Do not add separate backdrop
  cards, cliff walls, or detached meshes.
- Keep passability derived from slope/normal data. Steep terrain becomes rock and
  impassible; transition bands can become scree/slow ground.
- Raise/background-sharpen the cliff/mountain masses intentionally, not by
  changing camera pitch after Slice 12b accepts.
- Preserve the central valley as playable/passable terrain.

## Review Surface

- Background crop from the accepted horizon camera.
- Top-down diagnostic showing cliff/passability mask alignment.

## Verification

- Publish cliff telemetry: max height, background height percentile, cliff mask
  ratio, impassible ratio, valley passable ratio, and ridge screen bounds.
- Assert background cliff height/relief increased materially from the current
  shot. The visual target is about 3x taller cliff/mountain presence, not an
  exact numeric match to the reference.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the current band-composition screenshot for cliff silhouette only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to terrain-owned cliff height/silhouette only.

## Evidence

- Route:
  `/renderer/battle-terrain-3d?gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&cameraProfile=horizon-band&environment=overcast-foggy&grassTechnique=off&groundDiagnostic=cliff-material&geometryProbe=midground-valley`
- Scene gate:
  `VERIFY_GPU=1 UPDATE_SHOTS=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-cliff-material-relief`
- Regression check:
  `VERIFY_GPU=1 UPDATE_SHOTS=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-horizon-band-camera`
- Artifacts:
  `assets/slice-13-cliff-material-relief/cliff-material-vista.png`,
  `assets/slice-13-cliff-material-relief/cliff-material-crops.png`,
  `assets/slice-13-cliff-material-relief/cliff-material-topdown.png`,
  `assets/slice-13-cliff-material-relief/background-cliffs.png`,
  `assets/slice-13-cliff-material-relief/center-ridge.png`,
  `assets/slice-13-cliff-material-relief/route-stats.json`, and
  `assets/slice-13-cliff-material-relief/compare-current-band-silhouette/`.
- Current telemetry: map-space cliff `maxHeight=125.473`,
  `p90Height=106.831`, `p98Height=113.879`, `relief=111.888`,
  background cliff `cliffMaskRatio=0.6756`, background impassible ratio
  `0.6756`, projected ridge `topYRatio=0.2700`, `horizonYRatio=0.5071`,
  and `skyBlockHeightRatio=0.2371` versus the pre-Slice-13 shelf metric
  `0.0927`.
- Passability survived: `valleyFloorPassableRatio=0.9659`,
  `valleyCorridorReachable=true`, and west/east cliff bands still isolate the
  valley edges.

## Findings

- The accepted change raises the background highland shoulders inside
  `referenceHighlandHeightmap.ts`; no global vertical scale, camera pitch,
  fog, backdrop cards, or detached meshes were used.
- Fresh screenshot critique correctly flagged a flat center gap and two
  disconnected side slabs in the first pass, then a still-mound-like center in
  the second. The final pass raises/roughens the terrain-owned far central ridge
  and the scene now guards that crop directly.
- Slice 12b still passes after the taller terrain: `horizonYRatio=0.5071`, the
  same centered-horizon camera target is used, and the background crop keeps sky
  visible (`clearRatio=0.660`).
- Compare-screenshots was run on matched background-band crops against
  `assets/style-references/current-band-composition-2026-07-04.png`. The
  distance remains visible (`parityDistance=0.40666`) because the candidate is a
  diagnostic cliff shot, but the later passes moved in the intended direction:
  a much taller terrain silhouette with more continuous background mass instead
  of the old low shelf.
- Remaining visual debt: the central midground is still too flat, cliff tops
  read shelf-like, and the streaky cliff material is diagnostic. Carry those
  forward to the midground LOD, distance fog, and later cliff texture/style
  passes rather than changing this slice's camera or terrain ownership.

## Accept / Reject

Accept if the background reads as high terrain, not a low shelf, while the slope
mask and impassibility still agree with the visual cliffs.

Reject if the cliffs become detached presentation geometry, if valley gameplay
space collapses, if the camera moves to fake height, or if material/fog is used
to hide weak geometry.

## Next

Run `14-foreground-dense-grass-band.md`.
