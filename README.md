# Battle Sim

A Total War-style mass battle simulator: tens of thousands of soldiers in
formation-based units where maneuvering and unit cohesion matter. Runs in the
browser — simulation core in Rust compiled to WebAssembly, rendering/UI shell
in TypeScript.

## Architecture

- `crates/sim` — pure simulation logic (formations, movement, cohesion).
  No wasm dependencies; unit-tested natively.
- `crates/sim-wasm` — thin wasm-bindgen boundary. JS issues rare small calls
  (orders); bulk state is read zero-copy via pointers into wasm memory.
- `web` — Vite + TypeScript shell: WebGL2 instanced renderer, camera, input,
  HUD. Served cross-origin-isolated so SharedArrayBuffer/threads work later.
- `web/verify.mjs` — Playwright harness that loads the game headless and asserts on
  behavior, performance, and screenshots.

Core design: the player issues *intent*; each unit's formation controller
realizes it over time, rate-limited by **cohesion**. Cohesion is *measured*
from physical soldier state (slot error vs. the intended formation), never
stored as a freestanding scalar — so it can't drift from what's on screen.

## Develop

```sh
# one-time / after Rust changes
npm --prefix web run build:wasm

# dev server (http://localhost:5173)
npm --prefix web run dev

# native sim tests (fast inner loop)
cargo test -p sim

# browser verification (needs dev server running)
npm --prefix web run verify
```

Controls: drag select · right-click move/attack (double-click = run) ·
right-DRAG paint a line · shift+right-click withdraw · WASD pan · wheel zoom ·
R run · F othismos/fence · C charge · G reform · H pursue · V fire-at-will ·
P pause · 1/3 speed · hold Space for anchors/paths. Full mechanics: MANUAL.md
(also in-game via the Manual button). `?map=B` for the meeting engagement;
`?ai=off` disables the enemy commander.
