# Pack stable target-scan inputs

Integrated as bdafeda2 from worker1bc2c7a5. The combat pass copies stable body-grid
fields once, in exactly the grid's entry order, into reusable scratch storage.
Target searches retain bucket order, caps, ties, full team IDs and float inputs.
Fighting state and attacker positions remain live; earlier combat can change them.
This exchanges a bounded linear copy and roughly28 bytes per body for fewer
scattered reads in repeated searches. Quiet passes avoid the copy.

The serialized release-WASM ABBA passed the predeclared adoption rule: both
candidates beat both controls at both windows, with all five canonical hash
assertions unchanged. These are Node feasibility measurements, not browser FPS.

| Run | Early ms/tick | Later ms/tick |
| --- | ---: | ---: |
| A0 control | 24.994 | 48.507 |
| B1 packed | 24.079 | 47.351 |
| B2 packed | 24.227 | 48.094 |
| A3 control | 25.158 | 49.331 |

The late margin is small relative to run variability. No stable percentage gain
is claimed. Owned builds/tests/GPU jobs were serialized outside this timing
window; external host load was uncontrolled. Load samples bracket the early
window only. Late combat still exceeds the33.3ms simulation budget.

Control WASM SHA256: fd2fef9df9b05b33c7ee8fa8df8b7fc9c68b323576dd4332be4a1835af3d9674.
Candidate and integrated production WASM SHA256:
b42782f4d67ff8b2efca21978166267e500111102f233b68af06e1f9f5f365e1.
The integrated production build is byte-identical to the measured candidate.

Root verification passed23 library tests and canonical worker/direct comparison
across all309 ticks9000–9308, including observation/render-facing parity. Worker
focused and broader mechanics/scenario/balance checks and independent Codex
review passed. The existing golden0x68f4569d1cc8116f remains unrepinned.

Six new tests pin packed/eager body equivalence, full team IDs, same-pass live
fighting, stable target body positions, live attacker positions, and a mounted
target's nearer body. Existing expectations were not changed. Mutations exercised
these distinctions; reversed bucket order was caught by the existing golden,
not by a claimed new narrow ordering test. Existing clippy approximate-constant
errors remain inherited and were not fixed in this pass.

The manifest identifies and hashes every decompressed raw report, driver, build
record and review log; all compressed contents were round-trip verified. All
four run exits are recorded in runs/outcomes.json.gz. Tick9300's hash is asserted
by the driver, while the other window endpoint hashes also appear in reports.
