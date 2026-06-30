# Slice 0 — Stack setup (React + Vite plugin + Tailwind v4)

## Contract unlocked
`web/` builds, type-checks, and runs on React + Tailwind v4 with **nothing migrated yet** —
one throwaway React canary mounted into `#ui-root` and removed at slice end. Proves the
toolchain (and that it doesn't break the wasm/canvas/isolation setup) before any surface moves.

## API seam
- `web/package.json` += `react`, `react-dom`, `@vitejs/plugin-react`, `tailwindcss@4`,
  `@tailwindcss/vite`. New script `"typecheck": "tsc --noEmit"` (there is none today — `vite
  build` uses esbuild and does NOT type-check).
- `web/vite.config.ts` += `react()` and the Tailwind plugin — **keep the COOP/COEP
  `server`/`preview` headers verbatim**.
- `web/tsconfig.json` += `"jsx": "react-jsx"`.
- `web/src/ui/` created with a no-op `<Canary/>`; `index.html` gets `<div id="ui-root"></div>`.
  No scene touched.

## What a human can run / see
`npm --prefix web run dev` boots the unchanged app; the canary renders; `npm --prefix web run
build` and `npm --prefix web run typecheck` pass.

## Verification
- `tsc --noEmit` + `vite build` green.
- The full existing scene suite is **byte-unchanged** (no DOM moved) — run `card-bar`,
  `menu-renderer-shell-visual`, `battle-renderer-visual` and confirm **no re-bless**.
- Assert `crossOriginIsolated === true` in dev (a Vite plugin must not strip the headers).

## Must stay green
Every existing scene/baseline; the wasm build; the renderer (untouched).

## Human review checkpoint (non-blocking)
"Stack boots, all baselines unchanged, isolation headers intact." Open nothing visual to
review (no pixels moved); David eyeballs `npm run dev` once if he wants.

## Alternatives
Tailwind **v4** (CSS-first `@theme`, `@tailwindcss/vite`, no PostCSS config) vs v3 (JS config +
PostCSS). **v4** — co-locates with the token CSS in S1. Fall back to v3 only if a stack plugin
pins PostCSS.
