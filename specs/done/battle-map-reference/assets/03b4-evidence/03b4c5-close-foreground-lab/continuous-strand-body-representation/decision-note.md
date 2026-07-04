# B4B1A1V decision - rejected

Verdict: reject both continuous strand body candidates.

Target from first principles: the close crop should read as one connected soft
foreground grass body with visible fine strand direction throughout the lower
foreground. It should not depend on atlas cards, marker-post source spacing,
perimeter clumps, or flat fan patches to create body.

Candidates:

- `field-strand-mat`: useful renderer plumbing. It replaces upright source posts
  with a non-textured `continuous-strand-mat` representation and emits `7200`
  field-subcell records / `900` source cells / `691200` submitted triangles /
  `0` texture bytes. Visually rejected: it creates flat fan patches at the crop
  sides and leaves the center mostly smooth.
- `field-woven-mat`: useful renderer plumbing. It replaces upright source posts
  with a non-textured `interwoven-strand-mat` representation and emits `6720`
  field-subcell records / `840` source cells / `645120` submitted triangles /
  `0` texture bytes. Visually rejected: it is slightly less chaotic than
  `field-strand-mat`, but still reads as perimeter pasted fan/card patches over
  blank ground.

Comparison notes:

- Against the target close crop, `field-strand-mat` records
  `edgeEnergyRatio=0.58440`; `field-woven-mat` records
  `edgeEnergyRatio=0.40593`. Both remain far below the target's close-grass edge
  density and continuity.
- Against the rejected B4B1A1U subcell crop, `field-strand-mat` records
  `edgeEnergyRatio=2.93872`; `field-woven-mat` records
  `edgeEnergyRatio=2.04124`. That proves the representations add structure, but
  the added structure is the wrong structure: fan patches, not continuous grass
  body.
- Neutral critique rejected all candidates. The critique called out an empty
  center, marker-post spacing, oversized flat fan/card artifacts, wrong scale,
  and pasted perimeter clumps. It judged `field-woven-mat` slightly less chaotic
  than `field-strand-mat`, but still a fail.

Learning:

Changing the mesh representation per source is still not enough. The fixed
field-subcell source topology does not cover the close crop as a continuous
domain; source-attached geometry remains localized around selected source cells
and either reads as posts or as perimeter fan patches. The next close-body slice
must test a continuous field-owned body layer, likely driven by a density/coverage
field or procedural material domain, before returning to perf, coverage, palette,
LOD, camera-relative generation, or final reference compose.
