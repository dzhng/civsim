# Completed-interval timeline candidate

CPU-only implementation of the approved slice-11 policy, based on `c3a580ef`
plus policy `4ab9d810` (local cherry-pick `748a02bb`). No crowd/clock wiring,
engine fields, gameplay changes, GPU run, screenshot update or live acceptance.
Endpoint playback itself intentionally changes; merging this is not evidence that
the existing live renderer now has a coherent delayed root/pose clock.

The existing timeline retains one completed interval and current histories. Lane
shells are copied; immutable clip/frozen-pose payloads are shared. Only actual
transitions capture bone poses. Eligible preceding gait owns interval distance;
disabled-left travel is deliberately unassigned, never replayed later. An
eligible standing entry blends from its exact left pose. Final events then capture
the completed composed endpoint. The existing replay consumer now asks for that
endpoint instead of labeling its old-rate prediction as the before-event truth.

## Verification and boundaries

Final own checks: **365 tests in 60 files pass**, `tsc --noEmit` exits 0,
and `git diff --check` passes. No browser verification claimed.

Run from `web/`: `./node_modules/.bin/vitest run` and
`./node_modules/.bin/tsc --noEmit`. The full test transcript is
[cpu-tests.txt](cpu-tests.txt). Initial setup lacked ignored WASM/dependencies;
read-only symlinks to the existing root build fixed those environment failures.
An additional `--root web` invocation from the repository root failed an unrelated
campaign image path because that test uses the process working directory; its
[setup log](setup-wrong-cwd.txt) is not a behavioral regression. No source workaround.

The first active-gait tracer failed because retrospective sampling threw; the
idle tracer then failed `rest != walk`; the recovery tracer failed phase `.15 !=
.1`; the death-retention tracer exposed a real early-return omission (phase `.1`
instead of `.033333…`). Each was implemented to green before the next tracer.

Calibrated masked coverage independently constructs the completed base and rider
samples, evaluates local poses, and requires exact endpoint equality. The
unmasked lower-joint translation is `10.75`, not an old-rate prediction. Existing
mounted tests retain local TRS, joint-matrix and asymmetric-vertex checks.

Deliberate mutants all return exit 1, with individual transcripts here:

- [Old predicted rate](mutant-predicted-rate.txt): midpoint and masked endpoint fail.
- [No inferred entry](mutant-no-inferred-entry.txt): midpoint remains rest.
- [Ignore routing compatibility](mutant-ignore-routing-posture.txt): forbidden retrospective entry.
- [Disabled-left path](mutant-disabled-path.txt): held phase advances `.1` to `.15`.
- [Combat entry](mutant-combat-entry.txt): prior combat is overwritten retrospectively.
- [Old predicted source](mutant-predicted-source.txt): independently composed endpoint differs.
- [Incoming stride](mutant-incoming-stride.txt): backward-to-left endpoint `.25` instead of `.5`.
- [Unreported interval storage](mutant-unreported-retained-storage.txt): reports 80 rather than 160 bytes.
- [Replay old prediction](mutant-replay-old-prediction.txt): both production replay continuity consumers fail.

After the last three mutants, exact source restoration hashes were
`8f85c097d0135ccabffe4ade045555a3af1a17e9c300636848f95c7eb4bffcf5`
(timeline) and `d853b14e66420e7bb6fc535867fe782d4f701fdfed527da1218157e79418a572`
(replay). Subsequent cleanup derives stored observation types, removes an obsolete
rate-fast-path condition and adds comments; final full checks cover that source.

## Change ledger

Every test below lives under `web/tests/`; full test names are retained for exact
lookup. No sim stats, performance thresholds or pixel thresholds changed.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| actionTimeline.test.ts — completed gait uses observed interval distance at midpoint and exact hit boundary | No retrospective range; tracer threw. | Midpoint phase `.05`, local X `1.05`; completed hit source X `1.1`; explicit before/after endpoint equality. | Completed `.2 m` owns the boundary instead of old-rate `.4 m`; invalid before-boundary requests throw. **moved** |
| actionTimeline.test.ts — completed idle entry blends from prior rest at inferred onset, not the observation endpoint | Retained midpoint was rest. | Midpoint phase `.0375`, blend `.5`, local X `.51875`; endpoint phase `.1`, blend 1. | Eligible inferred onset is the left boundary. **moved** |
| actionTimeline.test.ts — completed disabled recovery holds prior gait and never catches up unassigned path | Initial implementation advanced disabled-left midpoint to `.15`. | Midpoint and recovery endpoint hold `.1`; next enabled interval reaches `.2`. | Prior disability forbids assigning that interval's path to gait. **your-regression** |
| actionTimeline.test.ts — inferred entry holds its completed phase at a disabled endpoint and resumes without replay | Independent review reproduced inferred walk `.1` before endpoint but rest afterward, then walk zero on recovery. | Walk `.1` before/after disabled endpoint and recovery; next enabled interval reaches `.2`. | Resolve disabled standing/gait from completed inferred history, not stale left standing. Red tracer in red-inferred-disabled-endpoint.txt failed before correction. **your-regression** |
| actionTimeline.test.ts — completed death history remains sampleable until its interval retires | Initial early-return path sampled latest death phase `.1` for tick 4. | Retained death phase `.033333…` and blend `.222222…`; times before retained interval throw. | Death must retain its earlier lane shell before current-source retirement. **your-regression** |
| actionTimeline.test.ts — retained clip sources and caller observations cannot mutate past eligibility or output | No retained-eligibility test; existing snapshot mutation coverage only. | Mutating input disability after update cannot create retrospective gait; emitted source mutation cannot alter a reread. | Store primitive observation values, not caller-owned records. **moved** |
| actionTimeline.test.ts — completed entry respects disabled, combat, posture and appearance boundaries | No completed-entry exclusions tested. | Disability, melee, death, hit, full-body/masked release keep their earlier playback; four changed posture flags and replacement cannot infer gait; genuine endpoint entry starts at zero. | Restrict invented onset to compatible enabled background standing. **moved** |
| actionTimeline.test.ts — completed masked interruption freezes independently calibrated base and rider endpoint | Predicted-rate/source mutants fail exact composed endpoint. | Exact independently constructed base/rider pose, lower X `10.75`, no remaining overlay after hit, retained output unchanged. | Count interval once before capturing composed interruption. **moved** |
| actionTimeline.test.ts — completed lifecycle retains one interval through append and discards it on rewind or shrink | No retrospective lifecycle coverage. | Existing append prefix remains exact, new soldier phase zero, out-of-order repeat exact; old range retires, rewind/shrink reset phase, explicit reset releases storage. | One interval, with first-known anchoring rather than reconstructed birth. **moved** |
| actionTimeline.test.ts — direction changes transport normalized phase and disabled endpoints retain their compatible gait | Incoming 2 m left stride gave `.25`; recovery added `.5/3`. | Preceding 1 m backward stride gives `.5`, then left reaches `.75`; disabled/recovery intervals hold `.75`. | Approved preceding-stride ownership and no disabled catch-up. **moved** |
| actionTimeline.test.ts — protected direction changes and time-driven combat preserve exact interruption sources | Source X `10.333333…` from old 1 m/s prediction. | Source X `10.166666…` from measured `.5 m/s`; event phases unchanged. | Completed path, not predicted past, owns source. **moved** |
| actionTimeline.test.ts — a disabled-left interval does not assign hidden qualified travel to its held gait (renamed) | Second disabled interval counted `.375`. | Holds `.25` both at endpoint and fractional sample. | Uniform approximation cannot infer hidden recovery under disabled-left state. **moved** |
| actionTimeline.test.ts — incapacity holds the compatible gait through zero travel and recovers without replay | Recovery `.375`, later `.3875`. | Recovery `.125`, later `.1375`. | Resume held phase, no interval catch-up. **moved** |
| actionTimeline.test.ts — disabling and interrupting gait keeps exact full-body source and event timing | Predicted source X `1.25`. | Completed source X `1.125`; hit/death/melee start phase zero and advance by time. | Measured `.25 m` replaces predicted `.5 m`. **moved** |
| actionTimeline.test.ts — disabled gait phase holds while an existing transition still settles by time | Sample 4.75 was still inside old endpoint-started blend. | Sample 4.25 remains inside inferred-start blend; held phase and changing pose still required. | Entry blend now begins at tick 0 rather than tick 3; preserve a genuinely interior sample. **moved** |
| actionTimeline.test.ts — gait entry counts its observed interval while blending from the exact prior rest pose | Tick 930 source X `.25`, blend zero. | Tick 900 source X zero; tick 930 X `1.5`, blend one; phase `.5` unchanged. | Same measured distance, earlier inferred blend onset. **moved** |
| actionTimeline.test.ts — render sampling advances clip time without advancing observation or consuming injury | Sampling tick 5 after update 6 threw. | Tick 5 recoil phase `2/15`; tick 2 throws. | Exactly one preceding interval is now readable. **moved** |
| actionTimeline.test.ts — interruptions preserve the exact blended pose, including repeated early and late interruption | Endpoint observations silently changed speed from 1 to 0. | Explicit speed 1 keeps the intended unchanged-rate exact continuity experiment. | Separate constant-rate bit identity from measured-rate correction, covered independently. **moved** |
| actionTimeline.test.ts — snapshot storage stays bounded through repeated interruptions and releases after death blend | One 80-byte source; zero immediately after death settles at tick 60. | 80 bytes initially, 160 during repeated interruptions, 80 for retained death interval, zero at next interval retirement. | Count current and preceding interval unique payloads honestly. **moved** |
| actionTimeline.test.ts — identical interrupted poses share one immutable numeric snapshot without synchronizing later actions | Total owned storage 80 bytes. | Total 160: one shared current interruption plus one shared preceding entry source; current 32 soldiers still share exactly one immutable source. | Retained source lifetime, not loss of exact deduplication. **moved** |
| actionTimelineMounted.test.ts — speed correction completes the composed interruption source and unmasked gait from measured distance (renamed) | Upper source X `1.037333…` predicted, corrected lower differed. | Whole source X `1.046666…` independently sampled at completed phase; lower still follows measured gait. | Completed source must include both lower and masked upper pose. **moved** |
| actionTimelineMounted.test.ts — final incapacity holds corrected lower gait without freezing a masked release | Frozen source used old predicted pose. | Source equals independently sampled completed gait; lower holds, release and upper blend continue. | Apply final disability after completed composition. **moved** |
| actionTimelineMounted.test.ts — mounted death captures the full composed pose during simultaneous base and rider blends | Default endpoint speed changed 2 to 1 while asserting old prediction. | Explicit speed 2 preserves unchanged-rate continuity through death. | Control speed in the existing simultaneous-blend test; variable-rate masked oracle is separate. **moved** |
| battleModelReplay.test.ts — mounted release exit follows a changing base, then composed death holds and releases snapshots | Before state used prediction; storage bound two poses. | Before state uses completed endpoint; bound four poses (two lanes × two interval endpoints); terminal cleanup still zero. | Correct existing replay consumer and account for bounded retained ownership. **moved** |
| mountedTemporalFixture.test.ts — authored mounted overlay exits to the advancing base and full-body terminal transition is continuous | Unchanged exact assertion failed at boundary 25 under the new timeline with old replay sampling. | Exact continuity at all existing eight boundaries; assertions unchanged. | Replay before-state now means completed endpoint. Old-prediction mutant restores failure. **moved** |
| syntheticBudgetFixture.test.ts — staggered mounted observations expose distinct weighted frozen poses without long setup | Six unique posed meshes required. | Exact repeating geometry identity groups `[0,1,1,3,4,5]`: five geometries, while snapshot-slot lower bound six remains unchanged (actual 6/18 for 3/9 bodies). | First rider and second base now share completed geometry; all other groups remain distinct. No fixture or timing/budget changes. **moved** |

## Decision audit for parent-owned global choices

All verdicts sound, with remaining uncertainties explicit; no art or latency
acceptance is implied. Storage layout was explicitly delegated, not a new policy.

- **Medium confidence — exact compatible-posture equality.** If a standing soldier
  changes any of at-ease, pike-ready, guarded-facing or routing across a batch, do
  not invent a walk before that change. The plan left compatibility undefined;
  parent approved equality of these four flags. This may omit plausible movement,
  but does not silently backdate a new protective posture. Future live work inherits
  this intentionally conservative approximation.
- **High confidence — explicit completed before-event endpoint.** A replay that
  changes speed and receives a hit cannot use its earlier speed prediction as the
  hit's starting pose. Parent approved `sample(latest, "before")`; it rejects other
  times or missing intervals, defaults remain after-event. Existing replay owns the
  consumer; no parallel timeline/history service was added.
- **High confidence — first-known append anchoring.** When a new soldier first
  appears alongside a retained interval, old soldiers retain history and the new
  soldier shows its first known pose even for the earlier requested time. Parent
  approved this boundary rather than inventing birth chronology.
- **High confidence — corpse appearance latch remains.** A dead soldier keeps the
  bundle that owned its death, even if incoming metadata names another bundle.
  Parent confirmed the existing equipment-until-reset invariant; the general
  appearance-reset rule applies to nonterminal histories.
- **High confidence — distinct geometry is not snapshot identity.** The staggered
  fixture's now-equal pair is tested explicitly, rather than weakening coverage to
  an arbitrary minimum count. Separate immutable source identities and packing-slot
  coverage remain unchanged. No hardware comparison is claimed for this new timeline.

Shape/diff review keeps interval ownership in the existing timeline and fixes its
existing replay consumer; no compatibility flag, dependency or renderer path.
The [first independent CLI review](independent-review.txt), session
`01a07fad-5a82-7530-91e2-6779c6d79dac`, completed with one P2: inferred rest-to-gait
entry followed by an immediately disabled endpoint selected standing from stale
pre-inference history. Confirmed with a [red tracer](red-inferred-disabled-endpoint.txt),
then corrected by resolving endpoint background after completed history. The
inferred gait now receives the existing hold/resume rule. No finding was dismissed.
The [follow-up review](independent-review-final.txt), session
`01a07fb0-f0a6-7251-8f99-8a9a8cd6ceb3`, exited 0 with no actionable defects.
Its test attempt failed environment/configuration setup, so its conclusion is
code inspection only; the separate own full365/tsc terminal-0 checks above supply
execution evidence. Shape, diff and documentation review are complete. Parent
owns adding this leaf pointer/current status to global slice/README/choices.
