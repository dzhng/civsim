# Select candidate captures before rendering them

Candidate contact sheets are expensive because they render every frozen pose
twice. Previously `SNAP=hand-detail` skipped the final unrelated comparisons but
still rendered every unrelated pose. The shared snapshot selector now also gates
the candidate camera loop before allocation or capture. The runner, checker and
candidate scene use the same trimmed comma-OR rule; no filter still selects all.
This changes diagnostic work, not default coverage or comparison tolerances.

The new regression test first failed on the old checker: an empty comma field
matched every name and created an unwanted walk sheet. With the common selector,
only the requested head/hand files are created. All four snapshot tests pass,
including a selected one-pixel mutation that fails exact comparison and preserves
the original baseline. The two existing baseline-refresh tests retain their
original assertions. Web typecheck passes.

## Browser evidence

In the isolated hand-authoring worktree, runs32004 and47133 use
`SNAP=sword-grip,shield-grip VERIFY_GPU=1 VERIFY_URL=http://localhost:5193 node web/scene.mjs heavy-kit`.
The [before log](filtered-before.log) has20 passing checks; the [after log](filtered-after.log)
has18 passes and two expected candidate-image differences. Both render only the
eight selected grip views, repeat their frozen pixels and report no page errors.
No unrelated pose submissions occur. A prior missing-wasm boot failure is not
used as evidence for filtering. The hand model itself was rejected visually;
successful selection does not establish art quality.

The root unfiltered combined-helmet run34432 completed646 checks:634 passes
and12 expected comparisons against older unaccepted images, with no page errors.
The [coverage comparison](default-coverage.json) finds identical ordered check
names before and after filtering was introduced:316 submitted pose views, their
316 frozen repeats and12 complete sheets. The additional admission/page checks
also pass. The changed helmet explains intentional image differences; filtering
neither removes nor weakens an unfiltered check.

## Review and change ledger

Independent source review found no actionable defect and confirmed skipping
occurs before expensive sheet capture. Root reviewed ownership, settled diff and
documentation: no alternate runner, snapshot primitive or rendering path is
introduced. The [CLI attempt](cli-review.log) failed because the configured model
requires a newer CLI; the independent read-only peer review is the actual fallback.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| SNAP comma filters capture only matching names | Empty comma segments caused an unwanted walk file to be created; observed red before the fix. | Only head and hand files are created for `head, ,hand`. | Use the runner's nonempty-filter semantics consistently in the checker. **moved** |
| Selected exact snapshot mutation | No focused mutation assertion in this suite. | A one-pixel change fails and leaves the baseline bytes intact. | Prove that selecting a capture does not bypass comparison. **moved** |
| Explicitly filtered candidate camera checks | All candidate poses were rendered and checked before unrelated comparisons were skipped. | Only matching cameras are rendered and checked; default runs still select all. | Bound a focused diagnostic to requested work without weakening full coverage. **moved** |

No production behavior, simulation statistics, assets or quality thresholds change.
