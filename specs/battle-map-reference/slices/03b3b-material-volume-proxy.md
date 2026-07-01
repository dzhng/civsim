# Slice 03B3B — material-only meadow volume proxy

## Contract

Decide whether the meadow material can supply convincing soft meadow volume before
foreground blade geometry. Either make the zero-blade material crop read as a
soft, clumped grass mass, or record an evidence-backed decision that true volume
belongs to `03b4-false-earth-blade-accents.md`.

## Approach

Keep the same frozen inputs as 03B3A: field records, camera, terrain, cliffs,
water, sky, fog, and `grassBlades=0`. Do not add foreground geometry in this
slice.

Try material-only volume only through the field/ground material seam:

- clump-weight shadow/lift pockets;
- broad non-directional mottle and density falloff;
- short, low-strength material thatch only if it does not become screen speckle
  or combed rows;
- explicit stats for any new texture/control that changes material ownership.

Build candidates as separable material components so the next pass can tell what
helped:

- **Base mass:** broad field-weighted green/olive coverage inherited from 03B3A.
- **Root pockets:** low-frequency darkening near clump-heavy cells, faded by
  distance so it does not become dot noise.
- **Lift centers:** soft lighter strokes or patches inside clumps, not long
  directional combs.
- **Short thatch:** optional, very low-contrast and broken by clump phase; remove
  it if `compare-screenshots` or critique calls out rows/speckle.
- **Distance blend:** foreground volume can be more textured, but midground must
  dissolve into tone rather than a strip of bright stipple.

Reject paths already tried unless a new reason changes them:

- long directional ridge/streak detail: reads as combed rows;
- high `fieldFloor` alone: washes the surface rather than adding volume;
- wider field records alone: improves coverage telemetry but not volume;
- foreground blade count: belongs to 03B4.

If a quick candidate matrix is useful, compare a tiny set of named variants:
`base-only`, `root-pockets`, `root-plus-lift`, and `root-lift-short-thatch`.
Do not keep piling terms into one shader until the image looks busy; pick the
least-wrong material component and record the rejected ones here.

## Approach Log

Known wrongness from the current zero-blade material:

- foreground is too smooth and reads as painted ground;
- directional flow becomes visible as combed rows;
- midground still has a hard material/density boundary;
- the isolated workbench can show a phase/texture-region change between softer
  mottle and regular banding;
- the target has much stronger fine/medium edge structure than the candidate
  (`compare-screenshots` foreground `edgeEnergyRatio ~= 0.208`, midground
  `~= 0.490`).

Future acceptance should come from a visible improvement in the target crops plus
a neutral critique saying the zero-blade material is no longer the main blocker.
If that does not happen after focused material-only variants, stop and record the
handoff: 03B3 supplies field-owned base coverage; 03B4 supplies apparent volume
with near-field blade accents.

Handoff decision (2026-07-01): material-only volume is rejected. The latest
zero-blade crop improves coverage but still reads as a flat painted/combed plane.
Dalton's neutral critique says B is still blocked for this slice: continuous green
coverage exists, but there is no clumped density transition, fuzzy depth, or
convincing falloff from foreground into midground. Do not keep adding shader terms
to hide this; 03B3 supplies base coverage, and 03B4 must supply apparent volume.

## Accept / Reject

Use the target foreground and midground crops. Accept only if:

- the candidate no longer reads as a painted flat terrain layer;
- clumps and soft root pockets create apparent meadow mass before blades;
- no hard material seam is visible in the midground;
- no visible row/UV/combing artifacts dominate the workbench;
- `bladeInstances === 0` and `drawCalls === 0` remain true.

If repeated material-only attempts still fail, stop broadening the shader and
write the handoff decision here: 03B3 covers field-owned base mass, while 03B4
must create the remaining volume with geometry/false-earth-style accents.

## Verification

- `battle-grass-field` and `battle-map-reference` screenshot gates.
- `compare-screenshots` foreground/midground crops; record edge energy and the
  less-wrong verdict, not just pass/fail.
- Fresh `screenshot-critique` scoped to material-only volume. It must classify
  missing individual blade silhouettes as later-slice debt unless the absence
  hides whether the material base works.

## Next Slice

Move to `03b4b-clump-root-shadow-volume.md`; 03B4 owns volume/foreground
silhouettes explicitly, starting with clump root mass before near blade ribbons.
