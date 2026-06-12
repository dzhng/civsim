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

## Formulas read the physical world — a hard rule

Every formula in the sim takes its inputs in physical units: **men, mass,
measured motion**. Never banners, commanded state, or classifier counts.
Each historical violation of this rule produced the same bug — an effect
wildly out of proportion to what's actually happening on the field:

- A "flanked" morale penalty counted *contact-direction groups* (a
  classifier that flickers in any honest scrum) and flash-routed healthy
  units 19x faster than the blood being spilled justified.
- Intimidation read *per-soldier class mass*, so five surviving horses
  terrified a line like a full wing; and it read the *commanded* frame
  speed, so a unit pinned in a jam "charged" on paper.
- Rout contagion and rally relief counted *units* in a radius, so an
  8-man broken remnant panicked neighbors like a 300-man collapse — and
  reorganizing the same men into more, smaller units changed the morale
  economics of the whole army.

The test for any new term: if you double the men but keep the banners, or
freeze the bodies but keep the orders, does the term respond to the men
and the bodies? If not, it's reading bookkeeping, and its scale is a lie
waiting for a context that exposes it. Discrete classifications (counts,
thresholds, flags) may *gate* or *amplify* a physical quantity, but must
never be a drain or force of their own.

## Units know only what they can see — a hard rule

The sibling rule, about *whose* state a formula may read. A unit's
behavior may read of OTHER units only what a man standing on the field
could observe: positions, measured motion, facing, formation extent,
visible fighting, men running away. Never another unit's orders, mode,
flags, internal clocks, or reserves — that information exists only
inside the other unit's head.

The canonical violation: the skirmisher screen read the enemy's
`charging` flag to widen its flee distance — reacting to a charge
*before the horses moved*. Telepathy. The fix reads the pursuer's
measured speed instead; the anticipation a real screen gets comes from
real signs (the speed developing), not from the enemy's intent.

The test for any cross-unit read: could a soldier standing there know
this? Intent must be inferred from motion, or not at all. The AI
commander counts as a player and obeys the same rule — it reads the
field, not the opposing player's orders.

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
