# Motor-capable travel observation

The simulation qualifies each tick at the branch that actually executes movement.
Ordinary and routing movement count; dead, stunned and bowled early returns do not.
After the tick's constraints and combat finish, the qualified body contributes its
final displacement from the existing tick-start position snapshot. World X/Y sums
preserve net direction, while summed tick lengths preserve cadence through reversals.
These are read-only presentation measurements, not voluntary drive or new gameplay
states. Conscious pressure recovery counts; disabled momentum transport does not.

The three double-precision values have one Sim-owned record and one zero-copy WASM
pointer. The adapter replaces its position-history copy with counter history, divides
differences by its existing observed interval and projects net travel against the
final displayed facing. Held pikes retain the unit-facing convention. New soldiers,
rewind and explicit identity reset establish zero baselines; appearance changes do
not erase body measurement. The timeline separately owns pose-history replacement.
No simulation consumer reads these measurements, and no force telemetry, save schema,
source asset, root smoothing or GPU fixture clock changes.

## Verification and red controls

The first regression ran against a zero counter: the recovered second tick required
`[-.03798399865627289, .011762641370296478, .03976360001214617]`, not zeros. Its
preceding half-tick stun expired after skipping movement; solver displacement was
real but correctly excluded. Removing qualification makes that disabled tick count
`.2477513037062704m` and the disabled cavalry control count `.10000000894069672m`;
both tests fail. Replacing adapter path length with net-vector length makes the
reversal control report 0 instead of 4m/s. Both mutants were removed and checks rerun.

The private bowled timer is injected only inside a Rust test module; the test calls
full `Sim::tick`, not a detached movement helper. The Game boundary test compares
two individual ticks with `advance_ticks(2)` across mixed incapacity/recovery and
reads actual contiguous f64 records through the exported pointer. It also reacquires
after spawn growth. This does not add a production timer-injection API.

The production Game → adapter → timeline → BattleCrowd pose test now advances the
actual engine, measures each resulting body displacement independently, and compares
the submitted pose with the authored rig sample. A contradictory exported run order
does not change the measured walking pose. A subsequent position-only transport
without qualified travel selects rest. A separate actual routing run validates
batched path and final-facing projection. Controlled WASM-buffer samples retain
rotated/sideways/reversal, held-pike/sidearm, append/memory-growth and reset coverage.

Passed CPU commands (worktree root unless otherwise stated):

```sh
cargo test -p sim --test presentation_travel --lib
cargo test -p game-wasm --lib
cargo test -p sim --test golden golden_state_hash_stable
cargo test -p campaign --test save_load
wasm-pack build crates/game-wasm --target web --release --out-dir ../../web/src/wasm
(cd web && node_modules/.bin/vitest run)
(cd web && node_modules/.bin/tsc --noEmit -p tsconfig.json)
```

The full web suite passes 343 tests in 60 files. The deterministic simulation hash
and campaign save round-trip pass without repinning. The WASM was rebuilt from this
worktree before the JavaScript tests; no shared generated binary was overwritten.

The shape review retains one measurement owner, replaces the old endpoint history
and adds no compatibility fallback. Main diff review found no remaining defect;
changed-source lint and formatting checks pass. Independent bundled CLI review
`01a07d25-6802-76e2-b141-8948545671ee` reported no actionable regressions and reran
focused Rust, golden and TypeScript checks successfully. Its web execution was
blocked by sandbox access to the dependency symlink; the canonical web run above
was executed separately, not inferred from that review.

The unchanged production action-replay browser gate passes [619 checks and all 40
snapshots](browser-report.json), with every snapshot reporting `0 px differ
(0.0000%)`, zero failures and no page errors. Command from `web`:
`VERIFY_URL=http://127.0.0.1:5347 VERIFY_GPU=1 node scene.mjs battle-model-action-replay`.
No UPDATE, baseline change, fixture-clock edit or new visual-quality claim was made.
This is the existing playback regression gate; actual qualified-engine observation
is proved by the native/bulk and production CPU consumer tests above.

Merged root `e879fb47` rebuilt its own WASM (terminal2562, exit0) and independently
passed all343 web tests and typecheck (21633),13 simulation library tests plus5
travel tests,6 Game tests, the unchanged golden hash and campaign save round-trip
(31380). Both test terminals exited0. Merged browser repeat is queued separately;
the implementing-worktree image result above is not relabelled as that repeat.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `presentation_travel`: mixed expiry/recovery | No qualified interval record; zero stub fails the recovered .0397636m tick | Disabled tick adds zero; enabled second tick adds its exact final vector/path | Final timer state cannot classify a batch; moved. |
| `presentation_travel`: conscious pressure/no-overlap | No observation of constrained recovery | Exact final X/Y/path includes solver movement; no-overlap control removes the large recovery | Final body motion, not pre-constraint drive, owns the record; moved. |
| `presentation_travel`: routing/cavalry/death | Raw endpoints include disabled .1m coast | Disabled/dead branches add zero; routing adds exact final travel | Actual movement branch qualifies, not routing or timer sampled later; moved. |
| `presentation_travel`: reversal/growth | Endpoint difference loses cancelled travel | Tick-path sum exceeds net length; existing record survives spawn and new record starts zero | Cadence and direction need distinct measurements; moved. |
| `presentation_travel`: long-lived counters | No long-battle precision assertion | Sub-metre steps survive a 1e9m accumulated baseline | Double accumulation avoids f32 loss; moved. |
| `routing` private bowled test | Only adjacent early-return behavior covered | Actual full tick excludes expiring bowled transport and includes subsequent recovery | Same interval distinction for the private timer, without exporting it; moved. |
| `Game` bulk mixed batch | No qualified bulk measurement | Individual and batched ticks have identical positions and exported records; spawn preserves prior values | Prove the real producer and packed boundary, not only adapter arithmetic; moved. |
| Production crowd distance pose | Test manually changed endpoint positions | Actual engine ticks drive exact authored walking pose; endpoint-only transport selects rest | Replace the obsolete position-based test setup with the real producer; moved. |
| Adapter observation histories | Controlled endpoint changes produced travel across append/memory growth | Qualified records preserve existing measurements and zero newcomer/rewind/reset baselines | Counter snapshots replace position history; lifecycle assertions remain; moved. |
| Adapter forward/lateral signs | Endpoint vector supplied the rotated/sideways rates | Qualified net vector preserves the same rates; 4m reversing path adds 4m/s with zero net rates | Reject substituting net length for accumulated path; moved. |
| Adapter held-pike motion | Endpoint travel projected against unit facing, then soldier facing after sidearm change | Qualified record differences preserve those signs through the appearance change | Appearance must not erase body measurement; moved. |
| Adapter routing/incapacitation/guarded posture | Synthetic endpoint displacement coexisted with final posture bits | Qualified historical travel coexists with those same current bits | Current posture does not retroactively classify earlier enabled movement; moved. |
| Adapter actual routing | No real batched-routing counter consumer | Actual game ticks equal independently measured path/net and final-facing rates | Cover the production bulk consumer; moved. |

No unit-stat, balance, physics or save assertion is repinned. Existing live root
smoothing remains .75m then .82m after a 1m engine jump, including a later frame with
no new engine movement; those assertions are untouched.

## Choices audit and limits

- **Transient branch qualification beside the cumulative record (sound, high confidence).**
  An enabled body may move and then be killed during combat later in the same tick.
  That movement still counts because its movement branch ran; a body already dead
  at movement does not. Reading final alive/timer values instead would mislabel
  history. The transient flag is cleared before every steering pass, initialized
  for new bodies and never exported as a separate gameplay state.
- **Cast stored positions to f64 before subtracting (sound, high confidence).**
  Positions remain the engine's f32 values. The observation takes their difference
  and accumulates in double precision; it never writes a corrected position back.
  This avoids adding another f32 rounding stage to a long-lived measurement.
- **Native mixed-incapacity boundary proof without a debug API (sound, high confidence).**
  Native Game tests can inject the existing timer and then execute the real batch.
  Browser tests use the existing bulk boundary and real ordinary/routing ticks;
  adding a production stun setter solely for tests would create an unrelated API.

This pass does not reconstruct the direction sequence inside a batch. Net direction
can cancel while path remains positive. Motor-capable pressure recovery is possible
stepping, not proof of voluntary propulsion, foot contact or grounded animation.
Live root/phase agreement and protected directional clip selection remain separate
acceptance work. No character-art quality verdict follows from these numerical tests.

Size (nonblank changed lines, excluding generated verification reports): production
logic +47/−9, comments +14/−2, tests/harness +276/−19. The structural cost is one
three-f64 cumulative record and one transient qualification boolean per soldier, one
bulk pointer, and replacement of the adapter's endpoint copy with a counter copy.
No new controller, dependency, serialized field or parallel observation path exists.
