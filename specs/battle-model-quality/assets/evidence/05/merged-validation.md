# Merged production validation

The observation adapter and controller are integrated. The rebuilt WASM passes
four native composition tests; the simulation golden remains
`0x46c3732a78dc549c`. Typechecking and all248 web tests across50 files pass.

The production workbench rerun (`VERIFY_GPU=1 VERIFY_URL=http://localhost:5174
node web/scene.mjs battle-model-workbench`) passes all checks, including all five
existing zero-difference snapshots, material controls and atomic reload failures.
The default battle scene also passes its frozen-tick and same-tick reload cache
checks. These are integration proofs, not new model or motion-quality acceptance.

## Changed-test ledger

| Test                                        | Previous behavior                                           | New behavior                                                                                                          | Why                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Missing presentation clip, real HTTP loader | Rejected a missing name without checking diagnostic detail. | Requires both the action role and missing source clip in the error; observed red before the message fix, green after. | Authors need to identify the broken binding.                                                              |
| Workbench incompatible active-clip reload   | Expected the later active-selection admission error.        | Accepts earlier presentation admission and verifies the last good class0 / march / phase0.25 plus retained clip.      | Canonical role validation now correctly rejects the malformed catalog earlier; rollback remains required. |

Independent review found no issue in the diagnostic/rollback patch; its sandbox
could not bind the HTTP test server, so the main unrestricted run supplies that
test result. No baseline or tolerance changed.

The gait scene exposed a separate scheduling weakness and then a zero-motion
pixel crop; that gate remains open pending a deterministic real-render fix.
Workbench action replay, applicable performance checks and the focused visual
checkpoint also remain open. Slice05 is not complete.
