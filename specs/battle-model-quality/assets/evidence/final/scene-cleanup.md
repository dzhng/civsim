# Independent scene resource cleanup

The existing runner now closes its browser contexts in each scene's `finally`,
not only when the entire batch ends. This covers both `ctx.newPage` and direct
`ctx.browser.newContext` callers. Context closure releases their pages; scenes
that already closed their resources remain safe. All closure attempts settle,
and a rejected closure is reported without skipping other contexts. The runner
still owns final browser shutdown. No timeout, readiness or image gate changed.

The actual `runSelected` loop regression uses a mocked Playwright browser edge.
Before the fix the next scene observed two live contexts from a throwing scene;
afterward it observes none. The following successful scene also leaves no live
contexts, the original throw still returns failure, and a self-closing successful
run returns success. Assertions run outside the runner's caught scene callbacks.

`vitest run scene.test.mjs snapshot.test.mjs`: 2 files, 5 tests, exit 0.
Web `tsc --noEmit`: exit 0. Independent focused Codex review: clean, no concrete
correctness findings. The test was subsequently moved beside its `.mjs` runner
and included in Vitest, avoiding an artificial TypeScript declaration wrapper.
No GPU/browser capture was performed. This prevents failed-batch resource
competition; it does not diagnose or excuse the original startup timeout.
