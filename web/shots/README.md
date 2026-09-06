# Baseline screenshots (`web/shots/`)

These PNGs are **committed baselines**: each is both the picture you review and a
gate that turns red when a frame drifts. They are produced by three independent
harnesses — there is no single "regen all" button, so know which folder you are
touching before you delete or re-bless.

## Who owns which folder

| Folder                                | Harness                                                    | Regen command (run from `web/`, dev server up)                                                                |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `campaign/` `ui/` `battle/` `models/` | `scene.mjs` (headless Chrome / WebGPU)                     | Select scenes with matching capture provenance; see below. |
| `vibe/`                               | `web/vibe/*.mjs` (melee/duel sim flip-books)               | `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome UPDATE_SHOTS=1 node vibe/all.mjs`     |
| `weave/`                              | `crates/sim/src/bin/weave_shots.rs` (Rust sim, no browser) | `cargo run -p sim --bin weave_shots --features shots` (from repo root)                                        |
| `diff/`                               | transient diff output, **gitignored**                      | n/a — safe to delete, never committed                                                                         |

`scene.mjs` routes a scene to a folder by its top-level directory under
`scenes/` (`battle/ campaign/ ui/ models/`); anything else lands in `misc/`.
`vibe/` and `weave/` are **not** reachable from `scene.mjs` — they are separate
generators, so a blanket `rm -rf shots` is only fully repopulated by running all
three. Model-shot family layout is documented in [`models/README.md`](models/README.md).

This file is the cross-harness mechanics (where shots come from, how to
regenerate, what bites). For what a _vibe_ check is and why it films a timeline,
see [`../vibe/README.md`](../vibe/README.md). For the scene catalog and the
100%-coverage contract, read the scenes under `scenes/` and `specs/scenes.md`.

## Regenerating a reviewed set

Scene baselines do not all share one capture adapter. Select scenes by name
(`node scene.mjs --list`) and preserve each set's browser and adapter provenance;
there is no safe universal `UPDATE_SHOTS=1 node scene.mjs --full` invocation.
The strict model scenes declare their SwiftShader requirement through
[`_swiftshader-baseline.ts`](../scenes/models/_swiftshader-baseline.ts).
An environment error is a failed verification, not permission to change the
adapter or re-bless its pixels.

```bash
# from web/ — pick a free port; multiple checkouts contend for 5173/5174
bunx vite --port 5185 --strictPort &

# 1. scene harness: pass the reviewed scene names and their capture environment
# to scene.mjs; do not mix hardware and SwiftShader baselines in one update run.

# 2. vibe melee flip-books
VERIFY_URL=http://localhost:5185 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome UPDATE_SHOTS=1 node vibe/all.mjs

# from repo root — 3. weave (Rust, no server needed; self-wipes shots/weave)
cargo run -p sim --bin weave_shots --features shots
```

Then `git status shots/` shows exactly what moved. A missing capture from an
unselected or failed scene is not evidence that its baseline is obsolete.

## Things that bite (learned the hard way)

- **`--full` matters.** Without it, `scene.mjs` skips `tier: 'full'` scenes
  (the whole-game flow runs, model/soldier gates, perf report). Quick-tier alone
  leaves most `battle/` and `models/` baselines unwritten.
- **`VERIFY_GPU=1` is mandatory for campaign scenes.** Campaign WebGPU scenes
  no-op into a skip-check without it, so they neither verify nor regenerate.
- **A passing snapshot writes nothing.** The harness only writes
  `shots/diff/<name>-actual.png` on **FAIL**. If you are eyeballing a
  `-actual.png` to judge a change, you may be staring at a stale image from an
  earlier failing run — a pass leaves it untouched. To inspect the _current_
  render, re-bless (`UPDATE_SHOTS=1`) and open the baseline, or screenshot the
  page directly. Re-blessing preserves the existing baseline file when the
  decoded pixels are identical, even if the newly captured PNG bytes differ.
- **Sub-percent raster wobble is expected.** Headless Chrome on hardware/Metal
  can move text edges and dense alpha-blended silhouettes by small amounts. The
  per-snap tolerance absorbs named raster noise, not unknown product drift.
- **WebGPU adapter policy.** Capture provenance belongs to the baseline family,
  not the machine's default adapter. Hardware/Metal and bundled Chromium with
  SwiftShader can differ in shadows even when model geometry is unchanged.
  Do not silently mix another adapter, browser
  channel, or headful/headless mode into the baselines; if you must, record the
  provenance and prove determinism with a second no-update run.
- **Free-port hygiene.** Vite servers from other checkouts linger on
  5173/5174/5179; always start your own with `--port <free> --strictPort` and
  point `VERIFY_URL` at it, or you will verify against the wrong build.
- **Determinism.** Scenes freeze sim/scene time before snapping, so a correct
  re-bless is byte-identical on a second run. A non-zero diff on an unchanged
  scene means something is reading wall-clock time, not a flaky harness.
