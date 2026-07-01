# Slice 03B4C5B4B1A1Z - field-owned continuous strand texture

## Contract

Test whether the field-owned domain can produce close grass body when the visible
primitive is a continuous domain-spanning strand/nap texture instead of
per-domain-cell clustered geometry.

B4B1A1Y proved that many pixel-scale micro-strand meshes per field cell are not
enough. They publish good ownership and scale telemetry, but visually remain
isolated yellow fleck clusters on flat ground. This slice owns the next hidden
variable: **continuity across the field domain**.

## Approach

- Start from the fixed B4B1A0 lab and the rejected B4B1A1W, B4B1A1X, and
  B4B1A1Y evidence.
- Keep ownership in the field/domain seam. The visible body must come from a
  field-domain texture or terrain/decal layer, not source records,
  field-subcell emitters, or per-cell clumped geometry.
- Generate one or two deterministic continuous strand/nap candidates: a
  domain-aligned high-frequency fiber texture, line/noise field, or shallow
  terrain-attached decal layer that spans across domain cell boundaries.
- Telemetry must prove continuity and cost: domain id, texture width/height,
  cell size, field/domain coverage min/median/avg, exposed-ground estimate,
  strand/fiber frequency, texture bytes/material bytes, submitted triangles,
  and whether any visible element is source-attached.
- If the candidate needs camera, palette, fog, terrain, atlas art, density,
  coverage, LOD, or final-route tuning to look plausible, stop and reslice
  again. This slice is about continuous representation, not polish.

## Fixed Inputs

- Do not change camera, target images, crop windows, terrain, meadow/root
  material, lighting, palette, fog, water, cliffs, sky, atlas content, or final
  reference-route constants.
- Do not tune final coverage, palette, wind, LOD, camera-relative generation, or
  final compose.
- Do not accept material-only flat carpet, per-cell fleck clusters, shell/card
  swipes, source-local fans, marker posts, texture-volume curtains, or pure pixel
  noise as a solution.

## Accept / Reject

Accept if the close crop shows continuous fine grass body/nap across the center
field, with target-scale strand texture visible in the foreground and no obvious
cell/source clumps, cards, shells, or isolated debris.

Reject if the result becomes flat painted terrain, repeated texture wallpaper,
screen-door noise, disconnected flecks, hard cell seams, oversized strokes, or
an unbounded texture/triangle cost before the continuous body appears.

## Verification

- Archive full lab shots, target/rejected/candidate crop sheet, tight crops,
  stats JSON, strand-texture telemetry, comparison reports, and decision note
  under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/field-owned-continuous-strand-texture/`.
- Use `compare-screenshots` against the target close crop, rejected B4B1A1W
  material-domain crop, rejected B4B1A1X shell-domain crop, and rejected
  B4B1A1Y micro-strand crop. Judge only continuous center body fill,
  field-spanning strand/nap texture, visible element scale, and absence of
  source/cell clustering.
- Run unprimed `screenshot-critique` scoped to: "Does this field-owned
  continuous strand texture create close grass body across the field without
  flat paint, source-local marks, cell clumps, shell/card strokes, or pixel
  noise?"
- Open the variant sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `bun run --cwd web typecheck` green.

## Next Slice

If accepted, continue to
`03b4c5b4b1a2-close-body-perf-envelope.md`. If rejected, reslice close-body
ownership/representation again before perf, coverage, palette, LOD,
camera-relative generation, or final compose.
