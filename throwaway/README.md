# throwaway/

Scratch space for **throwaway** work — one-off probes, data dumps, plots, notes,
quick shell/python analysis. **Everything here except this README is gitignored**
(see `.gitignore`), so nothing in this folder can ever be committed. Delete freely.

This exists so throwaway scripts stop landing in `examples/` (now removed) or
anywhere a future reader would mistake them for a committed tool.

## Where throwaway things actually go

| Kind of throwaway | Put it in | Run it with |
| --- | --- | --- |
| **Runnable Rust probe** against a crate's public API (read a trajectory, sweep a matchup) | `crates/<crate>/tests/dbg*.rs` (gitignored) | `cargo test -p <crate> --test dbg<name> -- --nocapture` |
| Scratch data, plots, notes, shell/python one-offs | here, `throwaway/` | however you like |

A Rust probe is a `tests/dbg*.rs` file, NOT a `cargo` example or `src/bin` —
those dirs are for **committed** tools only (e.g. `src/bin/weave_shots.rs`). The
`dbg*.rs` glob is gitignored and auto-discovered by cargo, gets the full public
API and dev-dependencies, and prints with `--nocapture`.

**Throwaway means throwaway.** Delete the probe the moment the question is
answered. If a probe is worth keeping, PROMOTE it into a committed `scenario_*`
test (with a reusable tuning helper) — see the `write-tests` skill.
