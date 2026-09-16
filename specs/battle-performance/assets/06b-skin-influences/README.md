# Exact-zero skin influence experiment — not adopted

Skipping unused bone weights is mathematically valid but does not establish a
GPU saving. The authored infantry sample mostly uses one or two nonzero weights;
[weight-distribution.json](weight-distribution.json) records exact source-mesh
hashes and counts. The CPU reference already ignores exact-zero weights.

The experiment in 3303d369 conditionally loaded the second, third and fourth
palette matrices while preserving accumulation order. Actual Three-generated
WGSL puts those loads inside branches for both beauty and shadow materials.
The same change was made in the common native soldier body. Neither version is
retained: no measured benefit justifies the extra shader control flow. This is
not proof that native backends cannot benefit; their cost was not measured.

## Correctness evidence

The real Three helper passes eighty numerical GPU checks before and after,
including zero first weights, gapped slots and a weight just below one. The
shared native body passes eight position/normal/tangent cases plus validation,
including nonzero palette rows and a non-unit sum. A real shader mutation pairing
the second weight with the wrong joint fails the second case by about 0.13.
These are numerical correctness results, not speed measurements.

[Reference](reference/report.json) and [candidate](candidate/report.json) contain
twelve frozen production-asset poses across sword, phalanx and cavalry. Eleven
images match exactly; phalanx death differs at three pixels by one channel value.
Each capture repeats exactly within its own run. Independent unprimed inspection
of all twelve pairs found no visible pose, equipment, shading or grounding change
at their supplied scale. Stills do not establish animation or camera continuity.
The directories retain PNGs and actual emitted shader modules.

Independent Codex review of 3303d369 found no actionable regressions; focused
shader-generation tests and the main-worktree TypeScript check passed. Native
correctness was additionally executed by the integrating agent, not merely
inferred from Claude's implementation report. Diagnostic scenes remain scratch
research fixtures because the optimization was not adopted.

## Cost and rejection boundary

[cost-summary.json](cost-summary.json) and [raw records](cost-report.json.gz)
retain a Three ABABA control at the canonical tick-9000 contact hash. Each arm
rebuilds materials from the same catalog, warms five seconds and measures eight
seconds at each of three stationary views. Only the helper selection changes;
the intercepted module body is retained in the raw report. Simulation stays
paused while rendering continues. This is not the live Menu benchmark.

| GPU union median, ms | Original A0 | Candidate B1 | Original A2 | Candidate B3 | Original A4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tactical | 45.69 | 57.37 | 48.28 | 68.02 | 66.77* |
| Action | 36.44 | 44.65 | 42.51 | 54.82 | 50.69 |
| Horizon | 47.66 | 60.06 | 57.40 | 72.46 | 61.27 |

The candidates establish no benefit. Original-arm drift is substantial; spot
process inspection also observed external CodexRunway/Battle.net work. There was
no full-window quiet-host audit, so do not assign a causal slowdown percentage.
GPU records are joined to measured submissions; incomplete tails are excluded
and coverage is reported. Our builds, bakes and tests were stopped during timed
windows; the independent typecheck ended during battle preparation.

*Final tactical A4 has the same final camera and visible total but different LOD
history (phalanx L0 1081 versus 1230), so it is not a matched return control.
All earlier tactical arms agree; action/horizon counts agree across all arms.
Future stationary controls must establish identical starting LOD history after
the camera settles, rather than assuming an identical endpoint gives an
identical path. These limitations are reasons not to adopt, not permission to
claim a definitive shader regression. Prioritize the independently demonstrated
main-geometry opportunity next.
