# B4B1A1W decision - rejected

Verdict: reject both field-owned strand material-domain candidates.

Target from first principles: the close crop should read as one connected soft
foreground grass body with fine field-space strand direction through the lower
foreground. Moving ownership from per-source geometry to a field domain should
fill the center without producing source-local fan/card patches, marker posts,
or a flat painted/combed carpet.

Candidates:

- `field-material-body`: useful renderer plumbing. It adds a material-only
  `field-strand-material` body domain to the field meadow texture path with
  `0` submitted body-domain triangles, `1920` body-domain texture bytes,
  `bodyDomainCoverageAvg=0.936`, `bodyDomainCoverageMedian=1.000`, and
  `bodyDomainExposedGround=0.004`. Visually rejected: the crop is continuous,
  but it is smooth painted ground with marker rods still exposed, not grass body.
- `field-material-fine`: same field-owned material-domain route with a finer
  procedural frequency and stronger material response. It reports the same domain
  coverage/bytes/zero-geometry envelope. Visually rejected: it is nearly
  indistinguishable from `field-material-body` and still reads as flat carpet.

Comparison notes:

- Against the resized target close crop, `field-material-body` records
  `edgeEnergyRatio=0.04921`; `field-material-fine` records
  `edgeEnergyRatio=0.05199`. Both are far below the target's close-grass edge
  and strand density.
- Against the rejected B4B1A1V strand-mat crop, `field-material-body` records
  `edgeEnergyRatio=0.08441`; `field-material-fine` records
  `edgeEnergyRatio=0.08919`. This proves the material domain removes the loud fan
  patches by deleting almost all visible body structure.

Neutral critique:

- Full selected view: all field-domain candidates read as sparse marker posts
  over flat green, not as close foreground grass body. No center fill or strand
  mass is visible.
- `field-material-body`: high-confidence failure. Center is mostly flat paint;
  posts/strands are isolated vertical ticks with regular marker spacing.
- `field-material-fine`: high-confidence failure. Slightly more fine texture,
  but still no real strand density or body continuity; texture is combed/flat.
- B4B1A1V context: high-confidence failure for source-local fan/card artifacts,
  empty middle, and pasted clumps.

Learning:

Continuous field ownership is necessary, but material-only colour/texture on the
ground plane is not sufficient. It solves source-local fan/card artifacts and
center coverage, but collapses the close foreground back into a flat painted
surface. The next close-body slice must keep field/domain ownership while adding
real near-body silhouette or height cues from the domain itself, not from
per-source emitters: a domain-owned shell, heightfield-strand layer, or
continuous grid/tile strand geometry that can create body without marker/fan/card
artifacts. Do not proceed to B4B1A2 perf, B4B2 coverage, B4B5 palette, B4C
camera-relative generation, B4D LOD, or final compose from this result.
