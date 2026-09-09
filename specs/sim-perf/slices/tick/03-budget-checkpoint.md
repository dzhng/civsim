# tick/03 — Budget checkpoint

David explicitly revised the native 30k fighting target to **≤35 ms** on
2026-09-09 and accepted the measured result as good enough. The former
25 ms target is superseded. Further optimization must be simple; do not
trade substantial architecture or maintenance cost for additional speed.

Revised weapon repel measured 34.896 ms, with serial controls at 38.022 and
37.771 ms, unchanged hashes, and no small-battle or idle regression. This
meets the revised performance target. Retain this small pass and stop
optimization. Close sleeping, steering and projection without integration.

Remaining work is verification and cleanup: integrate the retained pass,
make the standing gate measure its supported native configuration, preserve
opening and developed window coverage and at least 30k living soldiers,
complete the 15.5k/30k/60k idle and fighting telemetry sweep, and run the
required combined correctness checks. No new optimization ladder opens if
host variation moves a repeat around 35 ms; report that evidence against
the accepted result and the explicit simplicity constraint.

`idle` means commanders disabled on the same deployment grid. Report living
fighters so initial contact is visible. The 60k result is telemetry, not a
new target to optimize toward. Historical raw measurements retain their
original thresholds and dates.
