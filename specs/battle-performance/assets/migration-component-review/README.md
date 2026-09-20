# Migration obligations and focused numerical checks

The read-only audit maps primary evidence to M2/M3/M8 obligations. Root confirmed
that all eight retained complete-scene checkpoints report zero ocean and lake
planes: that fixture cannot prove water rendering. The migration ledger now
separates atmosphere from water. Existing terrain replacement/lifecycle and
pre/post frame comparisons remain useful; no broad repeat is prescribed.

Audit limits: "all24 strict frame failures" is an imprecise shorthand for the
24-case set whose aggregate verdict stays red; individual cases can fall below
the threshold. Identical relocated function bodies and matched full-frame outputs
are evidence of preserved computation, so a missing post-move standalone numerical
run is not by itself proof of a regression. New numerical probes below close some
coverage gaps without claiming complete source/raw visual parity.

At f6317f22, root built the existing water and post controls against the promoted
raw modules. Hardware Chrome, no concurrent owned GPU/timing job; CPU-only Claude
implementation could run concurrently. These are numerical correctness probes,
not elapsed-time/performance measurements. No shader or baseline changed.

- Raw post:32 cases, all maxAbs0, no nonfinite output, disposal guard passes.
  Covers four presets, changed grade/exposure, bloom and bypass. This closes the
  current standalone numerical obligation, not all M8 full-scene image differences.
- Lake: six1x cases pass the existing threshold; no errors/warnings and no retained
  textures. This is dedicated water coverage, not inferred from the empty scene.
- Ocean: six1x cases; maxAbs0.004638671875, aggregate threshold verdict remains
  false. Horizon repeats match their first comparisons. No errors/warnings and
  no retained textures. Earlier ocean controls were also red, but lighting has
  since changed, so these exact residuals are not claimed identical or attributed
  solely to the move. No reblessing or threshold change.

Full reports retain RGBA where the original control supplies it. The numerical
checks do not constitute a fresh visual readability review or a motion verdict.
Next focused obligations: real screen-to-ground/seating proof for M2, atmosphere
initialization/update ownership for M3a, ocean discrepancy diagnosis for M3b, and
inherited full-scene differences for M8. Keep other crowd/grass/effect gates open.

The selected raw sky and PMREM controls also pass their unchanged numerical
thresholds across all four presets (including three sky background directions
per preset). Inputs/output are finite, all borrowed-device checks pass, and
browser errors/warnings are empty. These are promoted-module correctness checks;
small permitted half-float differences remain, so they are not called exact.
They close the standalone atmosphere numerical gap; initialization-versus-update
ownership and composed horizon readability still need their own evidence.
