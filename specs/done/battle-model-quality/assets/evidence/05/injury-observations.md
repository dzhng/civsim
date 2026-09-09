# Read-only injury observation seam

The simulation owns both injury pools. The WASM boundary exposes their storage directly; the production battle-view owner reacquires buffer, pointer and count on every call. There is no copied health cache, event counter or presentation writeback. Existing position, facing and unit-info views keep the same API and semantics.

## Signal limits and choices

- Infantry/rider health and mount health are current values. A decrease between observations is aggregate injury, not an exact strike, timestamp, attacker, damage source or event count. Several injuries can merge between render observations.
- `alive` remains authoritative. A lethal mount injury can kill the composite without reducing the rider pool. Zero mount health also describes an unmounted soldier; it is not independently a death event.
- Health views are read-only by convention, matching existing typed-array views. Retaining one across a WASM mutation is invalid: allocation can move vectors or detach the memory buffer. A replacement Game gets a new view owner; any future delta consumer must establish a fresh baseline on reset/ID reuse.
- `hit_ttl` is not exposed: contact/facing memory is not successful damage. This pass introduces no action-selection or controller policy.
- The small `battleViews` factory extracts the existing closures from `createBattleWorld` and adds the injury views there. This gives one testable memory-view owner, not a parallel cache or adapter. `BattleWorld` derives its view API from that owner.

## Verification

Rebuilt WASM from this worktree before running the real-WASM tests. `bun run --cwd web test battleViews`, `bun run typecheck`, and `cargo test -p game-wasm` pass. The independent reviewer also ran the full web suite: 47 files, 222 tests pass; lint reports only the inherited battleAudio no-this-alias warning.

Unchanged combat gates pass: `cargo test -p sim --test mechanics_melee --test mechanics_impact --test mechanics_survivability --test golden` (28 passed, three pre-existing ignored diagnostic probes). The golden hash stays `0x46c3732a78dc549c`; no simulation implementation or pin changed.

The native accessor test was first red on missing accessors, then green. A deliberate `.slice()` mutation in the health view failed both zero-copy identity and detachment controls (copied view retained 520 bytes after memory growth instead of detaching to zero). Restored direct views pass. The actual-injury fixture uses small 16-soldier opposing units because the simulation automatically routes units with at most nine survivors; no balance result or injury timing is pinned.

Independent code review found no actionable defects. Self-review removed two unnecessary comparisons that retained pre-tick views: those could falsely require pointer stability across a legitimate future allocation. Fresh view reads and buffer-identity assertions cover the intended contract instead. No visual/GPU work was needed or performed.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `injury_pointers_read_the_simulation_pools_without_copying` (`crates/game-wasm/src/lib.rs`) | No injury accessor coverage | Reads explicit distinct rider `[2.5,1.25]` and mount `[0,4.5]` values from the actual simulation pointers | Exposes current pools without copies; new requirement coverage (**moved**) |
| `fresh battle views follow soldier growth and detached WASM memory` (`web/tests/battleViews.test.ts`) | No shared-view lifecycle coverage | Fresh views follow 1→130→131 soldiers; all five views reacquire identical values after memory growth detaches old buffers | Prevents stale pointers/counts/buffers without adding a cache (**moved**) |
| `a replacement battle starts fresh views when soldier IDs are reused` (same file) | No injury reset coverage | Replacement Game starts empty; reused soldier 0 changes from a mounted pool to the new infantry health/zero mount values | Reset cannot inherit an old observation owner (**moved**) |
| `battle views expose live rider and mount pools without copying` (same file) | No real-WASM injury observation coverage | Initial per-soldier values equal class data; views alias actual WASM storage; real combat decreases observed pool values | Pins production boundary plumbing, not JS-written test data or combat balance (**moved**) |

All rows are new capability tests, not carried failures or changed simulation expectations. No stats, existing test thresholds, snapshots or golden expectations were modified.
