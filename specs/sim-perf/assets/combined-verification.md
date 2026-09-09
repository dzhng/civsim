# Combined correctness verification

The integrated metadata and scratch changes pass the full workspace suite:
363 tests passed, zero failed, and 12 existing tests remained ignored across
70 test and documentation-test groups. The run completed on 2026-09-09.
This includes the mechanics, scenario and balance tests selected by the
repository's narrower runners. No test expectation was changed.

The release wasm build, default and timing-feature release profiler builds,
and the `force-trace` check passed. The [rebuilt battle timeline](visual-comparison.md)
matches the pre-change capture byte for byte.

These results establish correctness of the integrated changes. They do not
establish the native budget or worker performance verdict; those measurements
remain separate. Full command output is retained locally in
`throwaway/sim-perf/workspace-combined.log`.

## Single-body friend shortcut

The full workspace suite was rerun after integrating the single-body friend
shortcut (`ec32c09c`). It completed successfully on 2026-09-09: the same
70 groups, 363 passed, zero failed and 12 ignored. No test expectation moved.
The rebuilt wasm timeline also remains byte-identical, as recorded in the
visual comparison. The command output is retained locally in
`throwaway/sim-perf/workspace-friends.log`. This run covers the serial
implementation; the isolated parallel trials have separate verification.
