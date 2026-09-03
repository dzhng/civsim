# 34 — narrative-sweep

**Contract unlocked:** code comments state invariants; history lives in
`specs/`. Last, because every earlier slice rewrites the files anyway.

## Seam

`grep -rniE "slice [0-9]|\(slice|slice-[0-9]" crates packages web/src apps
--include='*.rs' --include='*.ts' --include='*.tsx' --include='*.mjs'` → 165
hits at HEAD (47 in photoreal: `battleWorld.ts:1-16`, `crowdLayer.ts` 7,
`environment.ts` 4, `terrainLayer.ts` 4; `web/src/battle/renderer.ts` 3; the
rest across sim tests and campaign). Plus "stand-in" ×10, "parity" ×8,
"bridge" ×2, "temporary" ×1.

For each: replace with the invariant the comment protects (one sentence,
present tense), or delete. The story it told already lives in the closed spec
it names (`specs/done/3d-perspective-renderer`, `melee-blob`,
`living-meadow`, `meadow-polish`). Rust sim mechanism rationale (the 21 %
comment density in `crates/sim/src`) is not in scope — those explain physics,
not history.

Skills: write-docs (glossary of principles, not changelog), code-review.

## Decisions resolved here

A comment survives only if deleting it would let a reader break an invariant.

## Delegated to the implementer

Wording.

## Verification

- The grep → 0. `git diff --numstat` shows comment-only hunks (the
  refactor-clean size check); G0 as a formality.
- No baseline can move; if one does, the diff was not comment-only.

## Must stay green

Everything.

## Feedback that would change this slice

None. After this slice: `close-spec` on `specs/debt-ledger`.
