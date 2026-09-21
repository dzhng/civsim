# Whole-population seating inspection evidence

M9c producer is integrated at14de07a3; root closeout removes per-presentation
terrain-stat aggregation and detaches the returned presentation identity.
The explicit operation checks admitted CPU positions against the installed
playable terrain. It does not prove drawn GPU feet or close the raised-terrain
image gate. Browser consumers still need deliberate migration.

## Verification

Real-game raw route, seed7, CSS1440×900 atDPR2: all11 hardware checks pass.
All15,560 admitted soldiers match within the unchanged0.001m tolerance, including
finite checks and4.637m height variation. Spawn and reload checks inspect16,060.
Repeat inspection leaves frame/state unchanged; ordinary stats remain unmeasured.
Disposal rejects inspection and releases all tracked resources. No browser errors.
[Full report](hardware/report.json) records each observation.

The before/after inspection PNGs are2880×1800 and pixel-identical (zero changed
pixels, maximum channel difference0). Root inspected the displayed battlefield;
this is an inspection-side-effect check, not a new visual-quality verdict.
Original captures and runners remain in throwaway/seating-inspection-review.

A final hardware check on the root-fixed build passes all3 checks: mutating the
returned identity cannot affect the next inspection, disposal releases resources,
and no browser errors. See [identity report](identity/report.json).
These are correctness runs, not performance measurements.

Root focused suites pass49 web and54 live tests; web TypeScript passes.
The returned-identity mutation regression was reproduced red before the fix.
Independent Codex review found no actionable defects in the worker commit and
ran41 focused tests; root subsequently found and fixed the identity alias.
The worker full suite had an unrelated missing sparse-checkout campaign fixture;
this pass does not claim the full suite green.

## Review and change ledger

The crowd owns population inspection; the facade owns successful presentation
identity and lifecycle ordering. Terrain exposes its existing committed counter
without aggregating unrelated diagnostics. No new per-frame scan, retained army
copy, GPU readback, or second cache is introduced.

- Added regression: caller mutation formerly invalidated a later inspection;
  now returned identities are detached. Existing expectations were not relaxed.
- Extended terrain lifecycle tests: replacement, failed replacement and disposal
  now also prove the direct identity read follows the installed generation.
- Scene test fixtures expose that same owner operation; their behavior is unchanged.

Normal disposal rejects consistently with the facade lifecycle. Empty, unready,
or mismatched admitted/presented state cannot produce a vacuous successful result.
