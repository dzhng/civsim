# Working in this repo

Read [README.md](README.md) first: what the game is, how the repo fits together,
and how to run it. Active plans live in `specs/<feature>/README.md`; their
"Next Agent Prompt" says what to do next. If a folder you're working in has a
README, read it before continuing.

## Communicating with the user

The user is very technical but doesn't read the code day-to-day. Code and file
references are useful; introduce what a variable, function, or module does on
first mention rather than assuming familiarity.

Surface API seams and schemas. When work changes a contract between components,
lead with the contract and its change: simulation commands, worker publication
layout, GPU buffer layout, fixture data, or module boundaries.

## Worktrees: keep them cheap

Checkouts, assets, dependencies, and build output consume substantial disk and
memory. Keep worktrees limited to the task and remove them after integration.

1. Share `web/node_modules` from the main checkout when dependencies match:

   ```bash
   ln -s /Users/david/dev/game/web/node_modules web/node_modules
   ```

   Do not install through that symlink when changing dependencies: it mutates
   the main checkout's installation. Use a separate installation for such work.
2. Give each worktree its own Rust build directory under the main checkout's
   `target/`. Sharing one target directory across differing workspace sources
   can reuse the wrong build. Use a unique worktree name:

   ```bash
   export CARGO_TARGET_DIR=/Users/david/dev/game/target/wt/$(basename "$PWD")
   ```

3. Browser verification needs current WebAssembly and generated assets. Build
   with `bun run build:wasm` when absent or stale; a frontend-only worktree may
   reuse artifacts only when their source revision matches.
4. Remove the worktree and its own `target/wt/<name>` directory after integration.

This repo does not currently declare Git LFS tracking. Do not assume checkout
assets are LFS pointers or copy another project's LFS setup instructions here.

## Testing changes

Before behavior changes or bug fixes, invoke
[write-tests](.agents/skills/write-tests/SKILL.md) and follow its red/green
workflow. Run the narrowest check that answers the question:

```bash
cargo test -p sim --test mechanics_symmetry       # one simulation test file
scripts/test-mechanics                          # mechanics bucket
bun run --cwd web test -- tests/camera3d.test.ts  # one web test file
bun run --cwd web scene campaign-map-alignment   # one browser scene
bun run --cwd web scene --list                   # available scenes
```

Use the package scripts and skill instructions as the source of truth for
closeout gates. `bun run check` covers formatting, lint, TypeScript, and the Rust
and web tests; it is a closeout gate, not the inner feedback loop.
`bun run verify` runs the configured browser verification subset against a
running dev server. It does not build WebAssembly or run every browser scene.
Run the checks required by the affected behavior and spec before merging.

Simulation optimizations must preserve deterministic outcomes unless a behavior
change is explicitly intended. Use the existing performance runner and
`crates/sim/src/bin/profile_tick.rs` for simulation profiling. Run timing probes
one at a time on a quiet machine; concurrent builds and browsers invalidate
comparisons.

## Visual changes

Use [renderer](.agents/skills/renderer/SKILL.md) for renderer work and
[aesthetics](.agents/skills/aesthetics/SKILL.md) for the visual target. Canonical
snapshot baselines live under `web/shots/` and flow through `web/snapshot.mjs`.
Transient evidence belongs in ignored `throwaway/`; snapshot failure images
belong in the harness's ignored diff directory.

For visual changes:

- Run [screenshot-critique](.agents/skills/screenshot-critique/SKILL.md) for an
  unprimed second opinion before claiming visual acceptance.
- Use [compare-screenshots](.agents/skills/compare-screenshots/SKILL.md) to judge
  before/after captures and references.
- Use [preview-shots](.agents/skills/preview-shots/SKILL.md) to show review shots
  to the user.

## TypeScript math

Load the [math skill](.agents/skills/math/SKILL.md) for performance-sensitive
vector, matrix, geometry, culling, noise, randomness, and easing work. Prefer
verified npm [math](https://github.com/pmndrs/math) primitives when they fit the
contract; do not create another equivalent math library alongside existing
owners. Check actual exports and the [installed source caveat](.agents/skills/math/SOURCE.md).

Replacing existing hot paths requires representative measurements, including
conversion costs. Preserve reverse-Z projection, precision, deterministic
random sequences, and caller-owned lifetimes. Skill guidance is not a reason
to change those contracts or add an unmeasured dependency.

## Skills

Repo skills live in `.agents/skills/<name>/`. `.claude/skills` is a relative
symlink to that directory, so both agents use the same files.
