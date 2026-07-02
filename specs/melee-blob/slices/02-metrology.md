# Slice 02 — Metrology: turn the four symptoms into numbers

No sim behavior change. Golden hash byte-identical. Everything after this
slice is blocked on it, because the current detectors cannot see the bug
(README → Detector Blindness).

## Contract

Each symptom gets a detector, validated on a known-good state before it is
trusted (per tweak-mechanics: a metric can encode the WRONG thing — check it
on the unperturbed baseline first, and prefer continuous measures over
median-splits on a quantised lattice).

## API seam

Measurement helpers live beside their assertions in
`crates/sim/tests/mechanics_melee.rs` (plumbing-only helpers may go to
`tests/common/` per `crates/sim/tests/README.md`):

- `seam_band_depth(sim, a, b)` — bucket the shared frontage laterally (~1 m
  bins, outer wings excluded), per bucket the red/blue overlap depth along the
  engagement axis (bearing of the centroid difference), reported in
  rank-spacings; sustained p95 over a settled window, never a run-max
  (transient-vs-sustained rule).
- `engagement_rotation_deg(sim, a, b)` — bearing drift of the centroid-pair
  axis vs the spawn axis. Immune to the contact-facing freeze. Diagnostic
  sibling (not pinned): per-unit lattice orientation (best-fit rotation of
  slot offsets onto positions) — the ratchet meter slice 03 needs.
- `front_gap_profile(sim, a, b)` — per-lateral-bin min enemy surface gap
  (generalizes `min_unit_surface_gap`, mechanics_melee.rs:~721); the lens void
  = mid-bin gap minus end-bin gap.
- `silhouette_rectangularity(sim, u)` — fraction of living men inside the
  alive-scaled deployed-footprint box in the facing frame, plus
  corner-quadrant occupancy.

New probes: `blob_probe_heavy_grind`, `blob_probe_pike_grind` — immortal
fakes, `no_morale()`, `micro_rough = 0.0`, 400 s, PLUS a mortal
zero-stat-variability twin each (the casualty feed is a named unknown), a
~5-seed sweep printing the rotation sign per seed. New target pins, red today,
`#[ignore = "melee-blob: slice NN lands this"]`, thresholds set from the
physical target (David's 2–3-man band), not from current numbers:

- `a_long_grind_keeps_the_seam_band_bounded` — sustained band ≤ ~3 rank
  spacings (04 lands it).
- `a_symmetric_grind_does_not_pinwheel` — rotation < ~10° over 300 s (05).
- `a_pike_seam_holds_a_straight_front` — mid−end gap bounded (06).
- `grinding_blocks_keep_their_deployed_silhouette` (07).

## Human can run / see

`cargo test -p sim --test mechanics_melee blob_probe -- --ignored --nocapture`
and `specs/melee-blob/visualizations/seam-timeline.html` — self-contained plot
of the four series (immortal vs mortal, both matchups) with the measured
"today" table. State in the HTML where the data came from (which probe, which
commit) — machine-generated, not hand-authored.

## Verification

- Every detector reads ~0 band / ~0 drift / flat profile on a pre-contact
  approach and on a settled unperturbed block, and visibly red numbers on the
  400 s grind — both shown in the HTML.
- Full `scripts/test-mechanics` green; golden untouched (read-only slice).

## What would change this slice

If the probes show the immortal grind is already clean (band ~1–2 ranks, no
drift) and only the mortal twin blobs, the feature re-centers on the casualty
feed and slice 04's mechanism changes — that verdict belongs to 03, but flag
it in the README immediately.
