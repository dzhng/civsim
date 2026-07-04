# B4B1A1Y field-owned micro-strand silhouette decision

Verdict: **rejected**.

This pass kept the B4B1A0 close-lab camera, terrain, meadow/root material,
palette, lighting, crop windows, and source context frozen. It tested whether a
field-owned domain could create close grass body by replacing X's large shell
swipes with target-scale micro-strand geometry.

## What Worked

- The visible owner is field-domain, not source records:
  `grassPrimitiveDomainId=field-domain-micro-strand` and
  `grassPrimitiveDomainSourceAttached=false`.
- The selected candidate emits `1450` domain cells, `36` strands per cell,
  `52200` micro-strands, and `417600` submitted triangles.
- The tall candidate emits `1300` domain cells, `40` strands per cell,
  `52000` micro-strands, and `416000` submitted triangles.
- Strand scale telemetry stayed small: selected width `0.005`-`0.013`, height
  `0.083`-`0.212`; tall width `0.006`-`0.014`, height `0.101`-`0.258`.

## Why It Failed

The crop still reads as flat painted ground plus isolated yellow fleck clusters.
The field-domain ownership seam is correct, but per-domain-cell micro geometry
still groups visible detail into local patches instead of creating continuous
close grass body across the center.

`compare-screenshots` telemetry:

- Against target close crop:
  - `micro-strand-field`: `edgeEnergyRatio=0.19531`, `parityDistance=0.34655`
  - `micro-strand-tall`: `edgeEnergyRatio=0.19231`, `parityDistance=0.34573`
- Against rejected B4B1A1W material-only crop:
  - `micro-strand-field`: `parityDistance=0.15709`, edge-energy ratio `3.63785`
  - `micro-strand-tall`: `parityDistance=0.15658`, edge-energy ratio `3.58207`
- Against rejected B4B1A1X shell crop:
  - `micro-strand-field`: `parityDistance=0.04874`, edge-energy ratio `1.16389`
  - `micro-strand-tall`: `parityDistance=0.04467`, edge-energy ratio `1.14605`

The useful reading is that Y adds more small edges than W's flat material, but
it is visually very close to X's failed field-domain shell crop. It changes the
artifact shape, not the field read.

Unprimed screenshot critique also rejected the pass, citing sparse coverage,
poor body continuity, source-local-looking vertical patches, flat/debuggy ground,
chunky scale mismatch, saturated yellow flecks, pixel-like artifacts, and missing
close-grass texture outside the clumps.

## Next

Do not move to perf, coverage, palette, LOD, camera-relative generation, or final
compose. Continue with
`slices/03b4c5b4b1a1z-field-owned-continuous-strand-texture.md`: keep field
ownership but test a continuous domain-spanning strand/nap texture rather than
per-domain-cell clustered geometry.
