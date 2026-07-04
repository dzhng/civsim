# Slice 18 - full-terrain False Earth grass perf

## Contract

Cover the whole slope-eligible heightmap terrain with the retained False Earth
grass architecture before doing any new LOD work. This is a baseline and perf
slice: prove that the same terrain-owned grass foundation can occupy foreground,
midground, and far terrain, then measure what it costs.

Do not tune only the foreground. Do not collapse mid/far grass into meadow yet.
Do not change camera, cliffs, fog, terrain shape, environment, or palette to
make the result look better.

## Slice Variable

Whole-terrain grass coverage and performance.

- **Judge:** eligible-terrain grass coverage, terrain/slope ownership, visible
  continuity across foreground/midground/far field, instance/triangle/memory
  cost, draw calls, and browser frame timing.
- **Do not judge:** LOD quality, midground blur, cliff scale, fog, terrain
  topology, camera framing, or final style parity.

## Architecture

- Reuse the existing field-owned grass stack: `sampleGrassField`,
  `field-fiber-shell` / `field-near`, terrain normals, slope eligibility,
  green/olive palette, and the False Earth close-grass learnings.
- The accepted baseline is still terrain-owned grass, not a detached screen
  overlay, texture-carrier carpet, `field-subcell` stipple, or a separate
  decorative meadow layer.
- Coverage should be camera-aware for density/perf measurement but not
  foreground-only. The sampled records must cover every slope-eligible terrain
  band in the locked camera and the top-down eligibility view.
- Instrument first, optimize second. LOD decisions belong to Slice 18b only
  after this slice publishes concrete perf and coverage evidence.

## Implementation Order

1. **Coverage mode:** add a whole-terrain grass mode for the battle heightmap
   route using the retained False Earth / `field-fiber-shell` architecture.
2. **Coverage telemetry:** publish slope-eligible cells, sampled records,
   rejected slope cells, foreground/midground/background projected coverage, and
   any ungrassed eligible holes.
3. **Perf telemetry:** publish draw calls, instances, triangles, buffer bytes,
   CPU prep time if available, browser frame timing, and GPU timing where the
   harness can measure it.
4. **Evidence sheet:** capture the locked perspective shot plus foreground,
   midground, and far/background crops, with a top-down eligibility/coverage
   view if available.
5. **Stop there:** record whether the full-terrain baseline is affordable. Do
   not add LOD in this slice.

## Review Surface

- Locked Slice 16 full perspective shot.
- Foreground, midground, and far/background crops from the same camera.
- Top-down slope-eligible coverage view or telemetry table.
- Perf report for at least the current machine/browser harness.

## Verification

- Run the focused scene with `VERIFY_GPU=1` and publish evidence under
  `assets/slice-18-full-terrain-false-earth-grass-perf/`.
- Include counts for field records, accent records, draw calls, submitted
  triangles, instance bytes, and projected coverage for each camera band.
- Include frame timing or GPU timing evidence. If exact GPU timing is not
  available, state the harness limitation and use browser frame timing plus
  submitted geometry counts.
- Run
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  only to confirm the candidate adds grass coverage across bands versus the
  previous shot. Do not accept or reject on distance score alone.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to whole-terrain grass coverage/readability only.

## Accept / Reject

Accept if the whole slope-eligible terrain is visibly and measurably covered by
the retained False Earth grass architecture, with honest perf numbers and no
camera/fog/cliff/terrain changes.

Reject if the pass only improves the foreground, uses a different grass
primitive to fake coverage, leaves large slope-eligible holes unexplained, or
adds LOD before measuring the full-terrain baseline.

## Next

Run `18b-grass-lod-from-evidence.md`.
