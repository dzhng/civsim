# Complete gameplay catalog admission

Gameplay initial load and reload now require every canonical appearance descriptor,
including equipment-state variants. The generic bundle loader and explicit
`gameplay: false` workbench remain subset-capable. Existing admission calls run
before GPU preparation/publication, so a missing appearance cannot discard the
last-good crowd. No renderer, animation, engine or asset changes.

## Verification and changed-test ledger

- New real-loader initial-load tracer: a valid one-row catalog formerly reached
  GPU preparation; now rejects missing appearance 1 first.
- New reload tracer: a catalog missing current appearance 14 formerly reached
  replacement preparation; now rejects and retains the original assets/crowd.
  The test uses the production no-`activePose` reload call.
- New positive controls: complete gameplay initialization and manual subset
  initialization reach the GPU boundary; manual subset reload still publishes.
- Existing admission test no longer blesses an invented one-row gameplay
  catalog. Manual-only rejection is tested against the complete shipped catalog;
  source/sampled clip mismatch checks remain unchanged.

Removing only the new completeness loop produces exactly two failures in the four
consumer tests; both manual controls remain green. Restoring it passes. The loader
reads real shipped bundle bytes through a mocked fetch boundary; GPU factories
are mocked, and reload starts from an already-admitted world shell. This is CPU
admission/publication evidence, not a new browser/render verification claim.

From `web/`: `./node_modules/.bin/vitest run tests/gameplayCatalogAdmission.test.ts
tests/animationState.test.ts tests/appearanceBundle.test.ts` — 3 files, 12 tests,
exit 0. `./node_modules/.bin/tsc --noEmit` — exit 0. Sparse worktree dependencies
and public asset bytes are read-only links to the integration checkout.

Focused independent Codex review: clean, no concrete functional/test-quality
finding. Its attempted test run was blocked by read-only temporary-directory
permissions; the successful runs above were performed separately. Main-agent
shape review found no duplicate owner or compatibility layer.

Decision: derive required IDs from the existing descriptor array rather than
copying a count/list or tightening the generic loader. High confidence; this
implements the complete gameplay roster contract and preserves explicit manual
inspection semantics. No new user choice or performance waiver.
