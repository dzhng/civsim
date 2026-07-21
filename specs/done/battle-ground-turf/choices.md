# Battle ground turf — choices audit

Audit date: 2026-07-21. Scope: the decisions introduced between `9a18f22e`
and the final turf branch, including the archived spec and its evidence. This
ledger audits decisions, not implementation correctness.

## Sound choices

### Kill the baked strand texture

- **When:** Slice 00, before production integration (`0772029a`).
- **Choice, ELI5:** The first idea painted fake grass strokes into a repeating
  picture. At real battle cameras it looked like straw and tiling, so the whole
  picture-based path was deleted instead of hidden behind the later solution.
- **Gap:** The spec delegated a kill-or-commit verdict but did not predetermine
  which verdict the visual evidence would support.
- **Reach:** High — it changed the planned texture owner, sampler, tests, and
  integration slices.
- **Verdict:** **sound**. The retained critiques and shots document the failed
  binding visual gate, and deleting the losing abstraction avoided two turf
  systems.
- **Confidence:** High.

### Let real blades own nearby fine turf

- **When:** Slice 03 correction (`c90f905a`).
- **Choice, ELI5:** Nearby grass detail comes from the existing real grass
  blades. The flat ground supplies broad meadow variation and distant fill,
  rather than drawing counterfeit hair-like marks into the soil.
- **Gap:** Once the bake was killed, the spec allowed the integration technique
  to narrow but did not prescribe this exact ownership split.
- **Reach:** High — it determines the visual result, shader composition, and
  verification contract at every camera distance.
- **Verdict:** **sound**. It reuses the established geometry owner, preserves
  the grass density/LOD firewall, and removes parallel synthetic-fiber paths.
- **Confidence:** High.

### Centralize one meadow palette

- **When:** Slice 01 (`36d89dd4`).
- **Choice, ELI5:** Ground, blades, vista, and distance quads now pick their
  olives and dry colors from one family instead of keeping nearly matching
  private copies.
- **Gap:** The spec required a single owner but left the exact grouping and
  consumer API to implementation.
- **Reach:** Medium — many render owners consume it, but it does not change
  simulation or campaign behavior.
- **Verdict:** **sound**. The dependency direction stays renderer-to-game
  renderer, and categorical rock/scree/debug colors remain explicit exceptions.
- **Confidence:** High.

### Preserve the legacy vertex stride

- **When:** Edge-slice preparation (`936582b2`).
- **Choice, ELI5:** New photoreal color and surface data travel beside the old
  interleaved ground vertices, so the legacy renderer reads exactly the layout
  it already understands.
- **Gap:** The spec locked legacy behavior but did not dictate the concrete data
  layout used to protect it.
- **Reach:** Medium — it shapes mesh APIs shared by legacy and photoreal ground.
- **Verdict:** **sound**. It contains the feature to the photoreal consumer and
  avoids a stride migration with no product benefit.
- **Confidence:** High.

### Escalate earth edges to one two-channel SDF

- **When:** Slice 04 (`978a13b7`).
- **Choice, ELI5:** The coarse ground grid could not draw a clean one-to-two
  metre muddy edge. One small map stores distance to earthy ground and distance
  to road, so the playable ground can feather both without extra draw calls.
- **Gap:** The spec authorized an SDF only if the zero-texture vertex path failed;
  RG8, two channels, 2× sampling resolution, and a 32 m signed range were
  implementation choices.
- **Reach:** High — it adds the feature's only texture resource and owns mud/road
  edge quality.
- **Verdict:** **sound**. The primary path's faceting and halo are documented,
  the escalation is compact and load-time-only, and measured edge widths stay
  inside the locked 1–2 m range without detached islands.
- **Confidence:** High on the mechanism; medium on the exact 2×/32 m tuning,
  which is empirically pinned rather than derived from a broader scale model.

### Classify road using authored roughness and speed

- **When:** Slice 04 (`978a13b7`).
- **Choice, ELI5:** Tint 6 means both road and scree, so a cell counts as road
  only when its authored surface is also smooth and fast. Missing or invalid
  values never become road by accident.
- **Gap:** The spec required a pinned classifier but left the finite-value policy,
  epsilon handling, and exact cutoffs to implementation.
- **Reach:** Medium — it controls road edge color/feathering but not movement.
- **Verdict:** **sound**. The rule follows the campaign fixture semantics and
  tests distinguish road, scree, boundary values, missing values, and non-finite
  inputs.
- **Confidence:** High.

### Keep wide-distance terrain as a distinct style

- **When:** Slices 02–03 (`09da0a56`, `c90f905a`).
- **Choice, ELI5:** The far terrain quad still gets a slightly broader, calmer
  meadow treatment because fine nearby variation would shimmer or disappear at
  distance.
- **Gap:** The original spec explicitly left open whether the wide-detail style
  still earned its existence after removing synthetic flecks.
- **Reach:** Medium — it affects distant composition and future palette tuning.
- **Verdict:** **sound**. The style has a distinct minification job and shares
  the central palette; it is not an alternate fine-turf implementation.
- **Confidence:** Medium.

### Keep diagnostics separate from binding visual gates

- **When:** Closeout reconciliation (`f7c50e20`) and review cleanup.
- **Choice, ELI5:** Numbers such as full-frame edge energy can help explain an
  image, but they do not get to call grass missing when the blade-specific checks
  and stable screenshots say it is present.
- **Gap:** The spec required telemetry but did not define which measurements were
  causal enough to be pass/fail oracles.
- **Reach:** Medium — it changes one verification contract and how future failures
  are interpreted.
- **Verdict:** **sound**. The retained gates measure blade retention, occupancy,
  profile, and deterministic production pixels; the confounded metric remains
  visible as diagnostic evidence.
- **Confidence:** High.

### Do not bless the carried-red smoke frame

- **When:** Slice 05 (`b361a819`, `f7c50e20`).
- **Choice, ELI5:** A smoke screenshot was already failing before this feature.
  The branch recorded it and left it red instead of pretending turf work fixed
  or owned the timing-sensitive smoke difference.
- **Gap:** The carried-red policy required attribution but left the final handling
  of each inherited failure to the closeout pass.
- **Reach:** Low — evidence and baseline policy only.
- **Verdict:** **sound**. It preserves provenance and prevents an unrelated bless.
- **Confidence:** High.

## Needs user awareness

### Treat the hard hardware gate as merge-blocking and the ultra-tight A/B delta as noisy evidence

- **When:** Post-main review on 2026-07-21.
- **Choice, ELI5:** The original and final trees both stay below 33 ms under the
  full 30,560-soldier workload. A single newly corrected A/B pair misses the
  spec's tiny +0.3 ms GPU / +1.5 ms rAF delta at one stop, while the earlier
  same-hardware pair moved in the opposite direction. The merge proceeds on the
  hard production gate and records the disagreement instead of selecting the
  favorable sample.
- **Gap:** The spec defines a one-pair soft delta but no repeat count, variance
  model, confidence interval, or rule for contradictory same-hardware runs.
- **Reach:** High — it affects whether performance evidence alone blocks merge.
- **Verdict:** **needs-user**. Provisional rule: retain the hard 33 ms gate as
  binding, label the soft delta inconclusive, and follow up by defining a repeated
  benchmark statistic before using sub-millisecond A/B thresholds again. This is
  reversible as a policy/documentation decision; the raw reports are retained.
- **Confidence:** High that one sample cannot justify a sub-millisecond claim;
  medium that the hard gate is the right temporary ship criterion.

## Unsound choices corrected during review

### Treat deterministic baselines as final aesthetic acceptance

- **When:** Original closeout (`b361a819` through `9452599a`).
- **Choice, ELI5:** Stable screenshots and numeric checks were allowed to stand
  in for the harder question of whether the turf actually looked natural and
  cohesive.
- **Gap:** The spec required a final unprimed aesthetic verdict, but the archived
  acceptance did not remain robust when a new unprimed reviewer saw only the
  production images.
- **Reach:** High — it determines whether the feature and spec can be called done.
- **Verdict:** **unsound, unresolved**. The post-main review rejects oversized
  strip-like blades, visible distance bands, camouflage-like top-down masking,
  and painted earth transitions. The archive now records that rejection, but the
  product defects require a new visual iteration and another fresh-eyes pass.
- **Confidence:** High that the completion claim is invalid; medium on the exact
  redesign needed.

### Compare final performance to a mid-feature commit

- **When:** Original closeout report (`432c09a7`).
- **Choice, ELI5:** The archived report called `8c34d402` the baseline even though
  the feature's true starting point was `9a18f22e`.
- **Gap:** The spec required comparison with the pre-feature report; the chosen
  baseline silently narrowed the amount of work being measured.
- **Reach:** High — it supported the archived soft-budget claim.
- **Verdict:** **unsound, corrected**. Review reran the real original and final
  trees on the same Apple/Metal adapter, records the raw results, and removes the
  unconditional soft-budget-pass claim.
- **Confidence:** High.

### Verify ground ownership by comparing hardcoded declarations

- **When:** Slice 03 closeout scenario, removed during post-main review.
- **Choice, ELI5:** Production published a list saying which meshes used ground
  detail, and the test checked that same list. Both could agree while the shader
  wiring was broken.
- **Gap:** The spec required ownership proof but did not prescribe an observable
  runtime signal for every material path.
- **Reach:** Medium — it overstated scenario coverage and added stale telemetry.
- **Verdict:** **unsound, corrected**. The declaration and assertion were removed;
  source ownership checks and deterministic rendered snapshots cover the paths.
- **Confidence:** High.

### Give vista meshes a fake distance field to satisfy a broad type

- **When:** SDF integration (`978a13b7`), removed during post-main review.
- **Choice, ELI5:** Vista ground never samples earthy edges, but it carried a dummy
  1×1 map because the shared mesh type demanded one.
- **Gap:** The implementation reused the playable-ground type beyond its actual
  contract.
- **Reach:** Low to medium — no visual effect, but it obscured resource ownership
  and invited accidental vista sampling.
- **Verdict:** **unsound, corrected**. The material now receives an optional real
  distance field; only the playable ground passes it, and vista mesh data no
  longer invents a resource.
- **Confidence:** High.
