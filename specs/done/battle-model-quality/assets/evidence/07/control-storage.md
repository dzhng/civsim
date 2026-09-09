# Reusable control packing candidate

This bounded CPU allocation change keeps the production palette's preparation
array until disposal. It replaces allocation of 80 bytes per visible mesh
instance on every upload with growth only when that palette's worklist exceeds
its previous maximum. For a stable 30,000-instance worklist, that removes one
2.4 MB backing-array allocation per upload while retaining 2.4 MB of CPU scratch.
These are structural byte counts, not measured frame-time or GC improvements.
Typed-array views, snapshot planning and sample resolution still allocate;
active words are still cleared and copied into Three's resident controls.

The scratch array stays separate from resident GPU attributes so preparation
failure cannot partially replace their CPU data. Frozen pose identities,
snapshot residency/commit/discard, GPU allocation/rebinding, record layout and
Float32 conversion are unchanged. The raw adapter retains independently owned
prepared frames; reuse is explicit at the production adapter.

`bun run --cwd web test tests/playbackPacking.test.ts` passes all 12 tests.
The new caller-owned-storage test failed before implementation on backing-buffer
identity and passes after implementation. It also compares every control word
against independent storage over mounted exit, shrink to manual playback and
retry, including a nonzero byte offset, Uint32 mask and untouched outer sentinels.
Existing tests keep their assertions and pass. `bun run --cwd web typecheck`
passes with the unchanged generated wasm linked from the feature worktree.

CHANGE LEDGER: `caller-owned control storage preserves exact words across mounted
exit, shrink and retry` previously returned a separate 160-byte array despite
the supplied storage; it now writes the active prefix of that storage and
preserves exact words and surrounding memory. The added ownership path removes
the per-upload backing allocation (**moved**, new contract test). No existing
test was repinned or weakened, and no simulation/stat behavior moved.

The existing `battle-model-palette` production browser scene passes all17 checks
on bundled Chromium/SwiftShader at1280×800, served from this worktree on5197.
The [raw report](control-storage-browser.json) includes actual beauty/shadow
parity, growth, snapshot reuse/reentry, allocation failure and recovery. This
is numerical render-contract evidence, not authored art acceptance.

Review found no additional shape, diff or documentation changes needed. The
independent CLI review could not start: installed Codex0.144.4 rejects the
configured gpt-6-astra model as requiring a newer CLI. Integration must supply
that independent review. Hardware measurements and full temporal gates remain
pending in the shared validation lane. No performance win or07 acceptance is
claimed.
