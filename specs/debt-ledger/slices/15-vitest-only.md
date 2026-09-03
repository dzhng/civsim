# 15 — vitest-only

**Contract unlocked:** `web` has one test runner. Lands first in lane W: it is
the gate every later web slice runs under.

## Seam

- `web/vitest.config.ts`: include globs `src/**/*.test.{ts,tsx,mjs}`,
  `tests/**/*.test.ts`, `snapshot.test.mjs` (replaces the hand-listed
  `tests/vitest/*` entries — today a new file there is silently skipped).
  `environmentMatchGlobs` or per-file `// @vitest-environment node` for the
  non-DOM suites (the config is jsdom-global at `:39`; package tests that
  import `three/webgpu` need node).
- Port `import test from "node:test"` → `import { test } from "vitest"` in the
  20 `tests/*.test.ts`, the 3 `.mjs` under `src/`, and `web/snapshot.test.mjs`.
  `node:assert/strict` works unchanged.
- Delete `web/tests/register-ts-extension-loader.mjs`,
  `web/tests/ts-extension-loader.mjs` (and its `WEB_ANCHOR` hack), scripts
  `test:ui` and `test:unit`. Root `test:web` = `bun run --cwd web test`.
- `web/tsconfig.json` `include` gains `tests` so they typecheck.

## Decisions resolved here

Vitest for everything; no second runner survives.

## Delegated to the implementer

Whether environment is set per file or by glob.

## Verification

- `bun run --cwd web test` runs 30 files (6 + 20 + 3 + 1) — count must equal
  the HEAD sum across the three runners.
- G0.

## Must stay green

Every existing assertion unchanged (this slice does not rewrite what tests
assert).

## Feedback that would change this slice

None.
