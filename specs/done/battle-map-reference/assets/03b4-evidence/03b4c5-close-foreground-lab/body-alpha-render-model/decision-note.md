# B4B1A1S decision - rejected

Verdict: reject all B4B1A1S `texture-volume` alpha/render-model variants.

Target for this slice: keep the fixed B4B1A0 close-lab surface and current
`texture-volume` records/mesh shape, then change only the render/alpha model to
see whether the opaque card / curtain artifact goes away without losing close
grass body.

Render models tested:

- `opaque-card`: the rejected current path. It preserves the most visible body
  but remains separated pale card islands / curtain mats.
- `alpha-cutout`: discards low-coverage texels and removes some soft card fill,
  but leaves jagged chunk silhouettes and wide empty lanes.
- `hard-cutout`: raises the cutout threshold; it is less filled but still reads
  as hard hanging mats.
- `dither-cutout`: uses deterministic world/screen dither; it scores best
  against the target metric but still shows chunked curtain silhouettes.
- `sparse-dither`: thins harder and loses close grass body; empty ground becomes
  the main read.

Telemetry:

- Target comparison: `dither-cutout` has the lowest target distance
  (`parityDistance=0.2229`, `edgeEnergyRatio=1.00735`), but direct inspection
  shows it is still separated texture-card body, not the target's continuous
  layered grass. The lower distance is diagnostic, not acceptance.
- Rejected-current comparison: all cutout variants move away from current by
  removing some fill, but their edge energy drops to roughly `0.62-0.68` of the
  rejected current crop. That confirms the pass mostly removes body rather than
  creating the desired fine body.

Unprimed screenshot-critique agreed with rejection: no variant removes the
opaque card/curtain artifact while preserving the target's close grass body. It
called `opaque` the strongest body but disqualified it for pale card islands;
`cutout` and `hard` still have hard jagged curtain silhouettes; `dither` adds
stipple; `sparse` over-thins into empty ground.

Learning: `texture-volume` is not merely using the wrong alpha semantics. The
large texture-card carrier is the wrong body architecture for the close-lab
target. The next slice should leave texture cards behind and test a field-owned
non-atlas body primitive with many small deterministic strand/fiber elements
inside the same B4B1A0 lab before any perf, density, palette, LOD, or
camera-relative work resumes.
