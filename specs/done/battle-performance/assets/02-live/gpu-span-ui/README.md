# GPU span wording

The chart displays the selected submission's complete, finite, nonnegative
`observedGpuSpanMs` as **GPU span (includes gaps)**. Missing, incomplete or invalid
spans are explicitly unavailable, including when the frame has no GPU submission.
It never substitutes the overlapping pass-time sum. Measurement details explain
that exported pass totals may overlap and are not elapsed GPU time. FPS formulas,
recordings, chart bins and default graphics are unchanged.

Verification: 12 chart tests pass; full web TypeScript check passes. Applying the
new tests to the original chart produced seven failures and five passes; restoring
the change passed all 12. Independent CLI review found no concrete defect.

The DOM-only fixture renders the existing source Menu report with an illustrative
12.34 ms span injected into complete results, solely to check the UI. It does not
measure GPU performance. Same data, selection, 1440×900 viewport and DPR1 were
captured before/after via `snapCheck`, in headless Chromium with `--disable-gpu`;
no WebGPU world or battle was started. The fixture lives in the isolated worktree's
ignored `throwaway/gpu-span-ui/`. The original code was taken from `521361fe`.
Screenshots show the complete result, expanded details and enlarged tooltip crops.
The text change affects 1,742 pixels; metric/chart content and action bounds remain
unchanged. All actions occupy y809–873 inside the 900-pixel viewport.

Fresh independent image review found no layout regression: the span label and
expanded explanation fit, and all buttons remain visible. The initial scroll
position clips the phase legend at the fixed footer in both variants; scrolling
reveals it. Small monospace chart text is shared by both variants. Root inspection
agrees; these are existing layout characteristics, not concealed content or new
regressions. Browser and fixture server were closed after capture.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `GPU hover uses the selected submission instead of the latest asynchronous result` in `BenchmarkFrameChart.test.tsx` | Submission101/102 display pass totals3.00/8.00ms as “Matched GPU passes”. | Submission101/102 display observed spans2.00/5.00ms as “GPU span (includes gaps)”. | Hardware evidence shows overlapping pass totals cannot represent elapsed GPU time; selected-submission matching remains intact. **moved** |

New guards cover unavailable/invalid/incomplete spans, absent results/submissions,
and measured zero. No pre-existing test thresholds were weakened.
