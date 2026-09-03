# 16 — packages-alias

**Contract unlocked:** `web` imports packages through one alias declared in
one place; no `../../../packages/` paths remain.

## Seam

- `@packages/*` → `../packages/*/src` declared in `web/tsconfig.json` `paths`,
  `web/vite.config.ts` (alias beside the existing `three` alias at 24-35;
  `fs.allow` at :41 already covers `../packages`), and `web/vitest.config.ts`
  via `mergeConfig(viteConfig)` so the two cannot drift. `apps/renderer-lab`
  gets the same alias through its own config.
- Rewrite the 70 relative imports in `web/src` (mechanical).
- Alternative considered: root `package.json` `workspaces: ["web",
  "packages/*", "apps/*"]` with real package names. Rejected for this spec:
  packages have no `package.json` today and vite's `fs.allow` already treats
  the tree as one project; an alias removes the debt without inventing
  publishable packages.

## Decisions resolved here

Alias name `@packages/*`; declared in exactly three configs, vitest deriving
from vite.

## Delegated to the implementer

None.

## Verification

- G0, `bun run build`, G-verify (dev server resolves), G-lab
  (`_renderer-contract.mjs` reads files by path, unaffected).
- `grep -rn "\.\./\.\./\.\./packages/" web/src apps` → 0.

## Must stay green

Everything; zero behaviour change.

## Feedback that would change this slice

David preferring real workspaces → do that instead; same grep proof.
