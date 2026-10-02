---
name: code-review
description: Review changed code for naming, stale references, unnecessary complexity, and comment quality. Use after completing implementation work, before committing, or when the user asks to review or audit code. Enforces at review time the authoring rules of [write-tests](../write-tests/SKILL.md) and [tweak-mechanics](../tweak-mechanics/SKILL.md).
allowed-tools: Read Grep Glob Bash
---

# Code Review

Review the diff or specified files against these principles.

## 1. Names must reflect current reality

- Variable and function names should describe what they ARE, not what they used to be.
- If the underlying mechanism changed (e.g. grid lookup → spatial hash), all related names must update.
- Ask: would a new reader be confused by this name?

## 2. No stale references

- After refactoring, grep for references to the old approach — dead detection logic, abandoned feature flags, comments mentioning removed code.
- If something was tried and reverted, remove ALL traces. The codebase should look like the current approach was always the plan.

## 3. Simplify detection and guard logic

- A gate like "can this feature run" should check the ONE thing that actually matters.
- Don't chain fallback detections when one check covers it.

## 4. Comments document WHY, not WHAT HAPPENED

- **Keep:** non-obvious technical discoveries, platform quirks, "if you remove this, X breaks because Y."
  - Good: `// anchor is front-center; offset half-depth back along facing`
  - Good: `// separation must run after slot-seek or columns collapse during wheels`
- **Remove:** narrative of what was tried, what was abandoned, what was renamed.
  - Bad: `// We changed this from a force to a velocity clamp to fix jitter`
  - Bad: `// Previously this was called slot_drift but we renamed it`
- **Remove:** comments that just restate what the code does without adding reasoning.
- **One explanation, one location.** When the same fact (a field's units, an invariant, a tri-state's semantics) is documented at three call sites, pick the single best one — usually where the value is declared or applied — and delete the other copies. Transparent forwarders don't need to re-document what they pass through.
- Often no comment is needed at all.

## 5. Respect the sim/shell boundary

- `crates/sim` is pure simulation logic with no wasm dependencies — it must stay natively testable. Anything wasm-bindgen lives in `crates/sim-wasm`; anything rendering/UI lives in `web`.
- The wasm boundary is rare small calls in (orders) and zero-copy bulk reads out. Don't add chatty per-frame calls or copy buffers across the boundary when a pointer view works.
- Cohesion (and similar derived quantities) is **measured** from physical soldier state, never stored as a freestanding scalar. Flag any change that caches a derived stat in a way that can drift from what's on screen.

## 6. No intermediary artifacts

- After iterating through multiple approaches, audit for logic that only existed as a stepping stone.
- If a workaround was added for approach A and you switched to approach B, remove the workaround even if it's harmless.
- The code should read as if written from scratch by someone who already knew the right answer.

## 7. Tighten guarantees after changes

- When a change makes something guaranteed (e.g. a field is now always set, a vec is never empty, a function always returns), audit downstream code that still guards against the old "maybe" state.
- Redundant `Option` handling, fallback defaults, and `if (x)` guards on values that can no longer be absent are misleading — they imply a possibility that doesn't exist.
- Prefer `const` over `let` in TS; prefer non-`mut` bindings in Rust when reassignment is no longer needed.
- **Never suppress a signal — fix the root cause.** `_` prefix on unused params, `#[allow(...)]`, `// @ts-ignore`, `as any` — these all hide real issues. If a parameter is unused, DELETE it and cascade the removal to every caller. If a type doesn't match, fix the type. Run the checker, fix every error, repeat. Mechanical changes across many files is exactly what an agent excels at — there is no "too many callers."

## 8. When changes are tangled, start clean

- If a file has been through 3+ rounds of conflicting edits, `git restore` it and re-apply only what's needed.
- Don't try to surgically fix a mess — starting clean is faster and less error-prone.

## 9. Tests must verify actual values, not just counts

- When testing formation math, ordering, or idempotent operations, assert on the **resulting state**, not just a length or a survivor count.
- Count alone doesn't prove the logic worked — a broken controller could reach the right casualty number through the wrong behavior.
- Pattern: assert both the aggregate (count, cohesion band) AND a representative concrete value (a slot position, a facing, who won and where they ended up).

## 10. No thin wrappers or re-export-only modules

- If a module only forwards another crate's or package's functions or types, delete it and import the original directly.
- Do not preserve local compatibility shims for scaffold code or unshipped work. Replace the scaffold outright.
- Re-export barrels are not useful unless they define a real public boundary with project-specific semantics (`sim-wasm` is such a boundary; a TS file that only does `export * from` is not).
- Prefer using the upstream API name directly over inventing local aliases.

## 11. Extract only around real ownership boundaries

- Do not split files just to reduce line count. A new file should own a coherent responsibility that a reader can name (movement, morale, missiles — like the existing `crates/sim` modules).
- Extract modules when they concentrate related policy, state transitions, or domain-specific behavior.
- Avoid moving one-off helper functions into a new file if the caller still needs to understand all the details to use them.
- If extraction increases total indirection without clarifying ownership, keep the code local.

## 12. Tests do not justify keeping unused production code

- If a production function has no production callers, it is dead. Tests that exercise it in isolation do not make it live.
- Delete the function **and** the test in the same change. If the behavior the test was checking is still important, it is now an invariant of _some other_ production function — move the assertion there.
- Pattern: search every caller before deletion. If the only references are tests, both can go.

## 13. Decouple tests from implementation — drive the system end-to-end

The most valuable test suite is the one most decoupled from the implementation it covers. A test that pokes at internals freezes the internals; a test that drives the public surface frees you to refactor everything underneath. (This is the review-time check of [write-tests](../write-tests/SKILL.md)'s authoring rules — same principle, applied to a diff.)

- **Prefer the outermost entry point that still gives a fast, deterministic signal.** For sim behavior, that's scenario tests in `crates/sim/tests` that construct a battle, step it, and assert on outcomes. For anything the player sees or does (rendering, input, HUD, performance), that's the Playwright harness `web/scene.mjs` driving the real page.
- **Test behavior, not structure.** Assert on observable outcomes — final positions, casualties, morale states, rendered frames, screenshots. Do not assert on which internal functions ran, in what order, with which intermediate shapes.
- **A passing test should mean a real battle behaves correctly.** Common smells: hand-constructing internal state that the order pipeline would have built, stepping a subsystem in isolation when the bug only manifests with the other subsystems running.
- **Harnesses must wire the system the way production wires it.** If a bug was only visible in the browser, the scenario harness skipped something the real loop sets — fix the harness so the next regression in the same shape is caught by `cargo test -p sim`, not by playing the game.
- **Coupled tests are a refactor tax.** When renaming an internal function breaks dozens of tests without changing any battle-visible behavior, the suite is testing the wrong layer.
- **Reserve unit tests for genuinely tricky pure logic** — formation slot math, wheeling geometry, pathfinding, morale state machines. Everything else earns more value as a scenario test.

## 14. Keep the sim deterministic

- The sim must be reproducible: same orders, same seed → same battle. This is what makes golden tests (`crates/sim/tests/golden.rs`) and scenario tests trustworthy.
- No `HashMap`/`HashSet` iteration order feeding into sim state, no wall-clock time, no unseeded randomness, no float operations that vary by platform when avoidable.
- Anything nondeterministic (timing, viewport, animation phase) belongs in the web shell, not in `crates/sim`.
- If a change touches sim stepping order or float math, run the golden tests and say so in the review.

## 15. Reuse existing types — derive, don't redeclare

- If a type already exists upstream, use it directly. Don't redeclare its shape inline, even partially.
- In TS, derive variants with utility types: `Pick`, `Omit`, `Partial`, `Parameters`, `ReturnType`, indexed access (`T['field']`). In Rust, reuse the existing struct/enum or wrap it — don't mirror its fields in a second struct that must be kept in sync by hand.
- Why it matters: redeclared shapes drift. They miss new fields, hide which named type you mean behind a structural literal grep can't find, and force callers to update both sides on every change.
- The wasm boundary is the highest-risk drift zone in this repo: the unit-info buffer layout is defined by the Rust packing order and consumed in TS via numeric offsets (`info[u * STRIDE + 6]`). Any field-index literal in TS must trace back to one named source of truth, not be re-derived by counting in each file.

## 16. Leave the codebase cleaner than you found it

- Every change is a chance to delete duplication, not just an excuse to add more. When you touch a file, audit the surrounding code for things that were already wrong — and if your change is in the same neighborhood, fix them in the same turn.
- **No parallel literal sets.** Before adding a new enum, lookup table, or list of magic values, grep the repo for the same set. The classic shape here: a Rust enum (`UnitClass`, order kinds, terrain kinds) crossing the wasm boundary as raw ints, then re-enumerated in TS as bare numeric literals scattered across `main.ts`/`input.ts`/`renderer.ts`. Keep ONE named mapping on the TS side and derive everything from it.
- This applies recursively. If your change touches the Rust enum, the wasm export, and two TS call sites, and the literals already drifted in three places, fix all of them — don't leave two clean and two stale.
- "I'll do that in a follow-up" is how the codebase rots. The reviewer test: after your change, is there exactly ONE place a future contributor would look to add a new value?

## 17. Formulas read the physical world — men, mass, measured motion

Every formula in the sim takes physical inputs: **men, mass, measured
motion** (the creed of [tweak-mechanics](../tweak-mechanics/SKILL.md), enforced
here at review time). Never banners (unit counts), commanded state (orders, frame
speed, pace), or classifier outputs (thresholded counts, flags). Each
historical violation produced an effect wildly out of proportion to the
field: a contact-direction count flash-routed healthy units 19x; a
per-soldier mass term made five surviving horses as terrifying as a full
wing; unit-counting contagion meant reorganizing the same men into more
banners changed the army's morale economics.

Flag in review:
- Any term reading `frame_speed`, `pace`, or an order where the question
  is what the bodies are DOING — use `mass_advance`, measured positions,
  or per-soldier state.
- Any per-unit loop weighting by unit COUNT or per-class constants where
  the physical quantity is total living mass or men (`alive_count x
  class mass`); ask the doubling test — double the men but keep the
  banners: does the term respond?
- Any discrete classification (sector groups, thresholds, booleans)
  acting as a standalone drain/force. Classifications may GATE or
  AMPLIFY a physical quantity, never be the quantity.
- New scalar coefficients in a sum: check the operating MAGNITUDE of
  each term side by side (a 0.012 on a count that steps by 1.0 dwarfs a
  0.05 on a rate of magnitude 0.03).

## 18. Units know only what they can see

A unit's behavior may read of OTHER units only what a man on the field
could observe: positions, measured motion (`frame_speed`,
`mass_advance`, centroid), facing, formation extent, visible fighting,
routing (men running away). Never another unit's private state: orders,
`mode`, `charging`, `pursue`, internal clocks (`latch_timer`,
`charge_time`), or reserves (`fatigue`, `morale`). Canonical violation:
the kite band once read the enemy's `charging` flag — the screen fled a
charge before the horses moved.

Flag in review:
- Any cross-unit read of `mode`, `charging`, `pursue`, `move_target`,
  `fatigue`, `morale`, or a timer, in reflex/steering/combat code.
  Self-reads are fine (a unit knows its own orders and its own legs).
- The test: could a soldier standing there know this? Intent must be
  inferred from motion, or not at all.
- The AI commander counts as a PLAYER: it reads the field (and what the
  HUD would show its side), never the opposing player's orders or unit
  internals.

## 19. Task-runner scripts: the parent runs everything, suffixes are the parts

Package/task scripts follow one shape: a bare script (`build`, `test`, `fmt`)
runs the COMPLETE job across every submodule it touches; a `:suffix`
(`build:wasm`, `build:web`, `test:web`) runs one clearly-named part. A bare
parent that quietly does only half the work is the trap — someone runs `build`,
ships a stale artifact, and never learns the other stage existed (here `build`
must run the Rust→wasm step *and* the web bundle, not just `vite build`).

Flag in review:
- A bare parent that runs a subset of its parts. Either it does everything, or
  it isn't the parent — rename it to the part it actually runs.
- Two script keys with identical bodies (the `scene`/`scenario` smell). This is
  the parallel-literal-set bug of #16 in script form — pick the canonical name,
  delete the alias.
- An ambiguous stage name. If `build` could mean the native compile or the
  bundle, it's underspecified; split into named parts and let the parent chain
  them.
- A named alias wrapping an already-short, already-clear native command
  (`cargo fmt --all`) adds nothing but a place to drift; only wrap a stage when
  the underlying command is long or non-obvious.

## 20. A failing check can be a toolchain defect, not a code defect

Before hand-writing a type, adding a cast, pinning a value, or restructuring code to make a checker (type-checker, compiler, linter, test runner, build) pass, confirm the failure is a CODE defect and not a toolchain/environment artifact. Patching code to satisfy a broken or mismatched tool is a workaround that masks the real problem — the never-suppress-a-signal rule, one level up.

- **Reproduce under the exact toolchain that reports the failure** — the CI/deploy version and config, not just your local one. A green local check proves nothing if it ran a different version: a pinned prerelease, a preview build, or version drift between your machine and CI can pass locally and fail in CI on identical source (or the reverse).
- **If the same source passes under the real/pinned tool, the code is correct** — the fix belongs in the toolchain (pin the version, fix the config), not the code. When the output is ambiguous, probe the tool directly — force it to print the value, type, or error it actually computed — instead of guessing at the cause.
- **Keep local == CI.** Confirm the checks that gate merge/deploy run the same toolchain the deploy runs; version drift makes every green check suspect, and "it passed locally" stops being evidence the deploy will.

## 21. Internal APIs carry no version or compat machinery

- When we own both producer and consumer (our own apps, services, and functions), do not add `protocolVersion` fields, version negotiation, capability flags, or "in case the other side is older" branches. Deploying is the version.
- The one real compat axis is fields, not versions — and it's an asymmetry, not a knob: parse **requests strictly** (reject unknown fields), parse **responses/events tolerantly** (ignore unknown fields). That lets the producer add fields without a lockstep consumer release, which covers the only skew we actually have (components that update on their own schedule).
- Smells: a version literal in a wire schema that nothing reads; an `if (payload.v >= 2)` branch whose only caller is code we deploy ourselves; a strict parser on a response, which turns every additive server change into a breaking one.
- Exception: a genuinely external API (consumers we cannot redeploy) versions at the route (`/v1/`), never per-field.

## 22. Things that must agree need one owner

- When two declarations must stay consistent but each can change alone, they drift. Give the shared decision one home and have each site compose from it — a parallel enum, picker list, or switch that restates a set living elsewhere is the common case (deriving the shape is rule 17; this is the wider rule for any values that must agree).
- The harder half: where near-twins legitimately differ, justify the difference in the code. An undocumented divergence between otherwise-identical things is indistinguishable from a drift bug — a reader can't tell intent from oversight.

## 23. Don't hoist a single-use value into a named const unless it earns the name

- A `const` extracted to module scope but referenced exactly once adds indirection without payoff: the reader has to jump to the declaration to learn the value, and the name restates what an inline value + short comment would say anyway. Inline it at the one call site and let a comment carry the WHY.
- A single-use named const IS justified when at least one of these holds:
  - It's **configuration that changes often** or that an operator/reader is expected to tune (timeouts/limits grouped as knobs, feature thresholds, retry budgets that get adjusted).
  - It **sits next to related consts** and gains meaning from the cluster (a block of `*_TIMEOUT_MS`, a table of limits, sibling enum members) — the grouping is the documentation.
  - Declaring it independently is **structurally meaningful**: it's exported as part of a module's public surface, referenced by a type, or co-located with the data/file it parameterizes so a future second caller finds it.
- Otherwise inline. The reviewer test: if the name only exists to label a literal used once, and it neither changes often nor lives beside kin, it's noise — fold it into the call site with a comment explaining the value.
- Bad: `const STOP_SESSION_CONNECT_TIMEOUT_MS = 5_000` declared on its own, used in exactly one `runAction({ connectTimeoutMs: STOP_SESSION_CONNECT_TIMEOUT_MS })`.
- Good: `connectTimeoutMs: 5_000, // 5s: a cold sandbox must not hang on the 60s default connect` at the call site.

## 24. Batch loops isolate per-item failures — one bad item never starves the rest

- Any loop over independent work items (sweep, cron batch, queue drain, fleet pass, fanout) must catch per item and continue — collect failures into the result (a `failed` list) or log them. An uncaught per-item throw aborts the pass, and because the runner (cron, scheduler, sync rail) re-selects the same ordered set next tick, a deterministically-failing item becomes a permanent head-of-line blocker: everything behind it re-queues forever while metrics show the job "retrying".
- In transactional contexts (e.g. a database mutation that processes a page and advances a cursor) the failure is worse: the uncaught throw also rolls back the cursor/progress writes, so the same page re-runs forever. A caught error keeps the transaction alive — but the failed item's own pre-throw writes persist, so catch at item boundaries whose writes are idempotent or safe to re-run.
- Early-exit on failure is only correct when the failure is provably batch-wide (the shared downstream is unreachable), never for item-specific errors. If the pass's caller needs failure visibility, catch-record-continue and rethrow the first error after the pass completes.
- Watch the ordering trap even with isolation: if successful items stay in the candidate set (e.g. re-snapshotting everything before the blocker each retry), the sweep also needs its selection to exclude already-done work.
- Accepted shapes: per-item try/catch + `failed` in the result; `Promise.allSettled` keyed by item; catch-record-continue then rethrow-after-pass.
- Bad: `for (const ws of candidates) { await archive(ws); await mark(ws) }` inside an hourly cron — one unreachable VM freezes every candidate behind it, forever.
- Good: the same loop with the whole per-item body in try/catch pushing `{ workspaceId, error }` onto a `failed` array returned to the caller.

## 25. Renaming what users see means sweeping what tests see

- User-facing copy, accessible names, routes, and `data-*` attributes are load-bearing for test layers that do not run in your gates — live-staging harnesses, journey suites, external monitors. A rename that keeps every local gate green can silently break them hours later in someone else's session.
- When a change renames visible copy or restructures a surface, repo-wide grep the OLD strings/selectors — explicitly including test-harness and e2e packages — and update every anchor in the same pass. The diff that renames is the diff that sweeps.
- The reviewer test: pick a renamed string from the diff and grep the repo for it. Any surviving hit outside the diff is a break waiting for the next live run.
- Structural beats copy: where a journey needs an anchor, prefer an owned `data-*` attribute on the surface over its display text — then product copy can change freely without touching tests. Flag journeys that anchor on copy when a structural attribute already exists.
## 26. Leave the code better than you found it — a tidy diff is not worth an untidy repo

- **Never revert an incidental improvement to keep your diff focused.** If the formatter, the linter, or a codemod also cleans files your change didn't touch, **commit that too** (as its own commit if it's noisy). Reverting it optimizes for how the diff reads at review time and taxes every future pass, which pays the same cost again and re-reverts it again. The repo's health outranks the diff's tidiness.
- **Dead things go in the pass that finds them.** A dead column, argument, function, export, or a test whose only callers are tests — delete it, plus any comment defending it, right there. Don't file it; a note is a deferral, and the next reader has to re-derive that it's dead.
- **A comment you discover is false is a defect.** Fix it in place. A wrong comment outlives the diff that would have corrected it and actively misleads — worse than no comment at all.
- **Fix latent bugs your change surfaces.** Work that makes a rarely-run path run every time will expose ordering bugs, unreachable cleanup, and assertions that never fired. That is your bug now: it became reachable because of you.
- **Verify before you "improve".** Confirm the thing is actually dead, wrong, or broken before deleting or rewriting it — grep for consumers, run the test. A confident deletion of something load-bearing is far worse than the untidiness you were fixing.
- The limits: don't smuggle unrelated *behavior* changes into a feature commit, and don't rewrite a neighbouring module because you dislike its shape. This rule covers mechanical tidiness, dead code, false comments, and bugs you made reachable — not opportunistic redesign.
- The reviewer test: after this change lands, is any file in the repo **worse off**, or carrying a known-wrong statement, than before it started? If yes, the pass isn't done.

## Your task

Review: $ARGUMENTS

If no arguments given, review `git diff --staged` or `git diff` (unstaged changes).

For each issue found, cite the file and line number. Group by category. End with a clean/not-clean verdict.

When the review surfaces simplifications, apply them in the same turn instead of asking for confirmation. After applying, re-run the relevant checks — `cargo test -p sim`, `tsc --noEmit` in `web`, and `bun run --cwd web verify` if browser-visible behavior changed — then summarize what changed. Only stop to ask when a fix is genuinely ambiguous (e.g. two valid interpretations with different downstream impact).
