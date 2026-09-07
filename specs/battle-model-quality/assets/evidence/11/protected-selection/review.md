# Protected selection — bounded controller proof

The engine remains canonical. Retained facing does not itself mean threatened:
safe withdrawal and automatic-evade movement can retain facing. New protected
selection therefore requires the existing not-at-ease decision. Missing bindings
and zero net direction retain existing selection; they are unsupported coverage,
not proof that ordinary carry is suitable for threatened retreat.

## Source and actual-engine recon

Public Sim API probe, default Tunables, seed59, two ten-soldier formations,
own(0,0) facing0, enemy HeavySword(80,0) facingPI; move toward(-30,0).
At tick30, all safe cases had atEase=true, guarded=true, target=-1,
threat=None, routing=false and stun=0:

| Case | Qualified forward / lateral m/s | Facing |
| --- | --- | --- |
| HeavySword Disengage | −1.485338 / −1.623263 | .906667 |
| Held MediumPhalanx Disengage | −1.388798 / −1.710728 | 1.000000 |
| Skirmisher Move, default evade_auto | −1.639870 / −1.466567 | 1.066667 |

Held pikes use the displayed unit facing, not the individual soldier's facing.
The matched HeavySword case with enemy30m had atEase=false and threat bearing
−.0012098805, with identical measured tick30 movement. The safe cases sustained
guarded backward observations for59,55,54 of120 ticks respectively. This is not
solely the initial formation relaxation. Native probe terminal0, then removed;
its Sim source was identical to root99e40376. Movement withdrawal/evade branches
own retained facing; `Sim::update_threat_bearings` shares the not-at-ease range.

## Implementation boundary

Existing presentation actions gain three nullable gait roles. The same gait
classification owns stride validation, distance sampling and compatible disabled
hold. No simulation, observation, clock, body placement, GPU skin, source asset
or live detailed binding changes. Canonical producer fields are explicit null;
there is no missing-field compatibility parser.

Longitudinal wins exact45-degree ties. This nearest-cardinal approximation uses
qualified interval net direction against final displayed facing, not voluntary
drive. Positive path with zero net cannot reconstruct the path sequence.
Normalized phase survives gait changes provisionally: backward currently leads
R, left leads L. A continuous blended pose is not support-foot continuity.
Live multi-phase direction/reversal and high-speed guarded-foot evidence remain
required before promotion; no phase matcher, mirroring or IK is introduced.

## Verification

First consumer tracer was red on unchanged selector: actual threatened targetless
Disengage returned `run` instead of `diagnostic-backward`; safe control retained
ordinary locomotion. New selector passes actual Game→bulk adapter→timeline→local
pose cases for sword, held pike and automatic-evade skirmisher. All354 web tests
and TypeScript pass. Four focused files have71 tests. Full `bun run bake:test`
passes. Generated40 appearance manifests plus both existing review-matrix copies
recursively equal HEAD after removing the three new explicit null fields; no
generated animation or candidate files changed.

Independent code review19533/session01a07d73-c945-72a3-ba86-95c293517d32 found no
runtime defect and independently passed71 focused tests plus tsc. Its soleP2
was the two uncommitted snapshot baselines, pending capture review at that point.
Main shape/diff review retained one shared gait classification and existing
transition/sampling ownership; the observation comment was corrected to state
not-at-ease eligibility explicitly.

Matched production-draw diagnostic, not actual-engine GPU footage:

- Exact c4f86c94 timeline SHA256a0524c060f1fb0980608aab8d3f8f27163470a72025983b9c38ffacd2795cb09:
  old49758 terminal1, expected two checks red. Both constructed postures selected
  march and had identical local poses and pixels. Each side repeated exactly.
- Candidate timeline restored byte-exact SHA2569499e075bea94710759a3bb5b83258e2d6cfa213d8b44eaa3d138bda7ff2d92e:
  candidate61977 terminal0. Safe march remains exact; threatened selects the
  diagnostic existing run clip. Same-side pose/pixels repeat exactly. Subsequent
  observation-comment-only cleanup changes no behavior.
- Source was never edited during a live browser capture. Renderer, assets,
  harness, camera, root and time0 stayed frozen. The initial boot-only attempt
  used127.0.0.1 against a Vite listener on::1; no image was produced. Corrected
  localhost URL returned200 and fetched local WASM compiled successfully.
- Four original970×758 PNGs: A=old, B=candidate;1=safe,2=threatened.
  Old pair0 changed pixels; candidate pair34,719; safe old/new0; threatened
  old/new34,719. The paired crop preserves nearest-neighbor source pixels.
  Raw reports and exact metrics accompany the images.
- [Fresh neutral visual review](visual-review.md) confirms changed stance and
  upper pose without missing content or framing drift, with existing block
  contact/edge/overlap limitations. It accepts transport readability only.

The source's subsequent comment-only SHA256 is
136c46deeeed52135b6cb1d03ef2f458bcd93deb19440acf36ae57a187d3a61c.
Parent approved the two new baselines after its own four-frame inspection and
the fresh neutral review. Shared snapCheck creation11921 passed; both images
are decoded-pixel exact against the reviewed candidate. The final helper also
asserts the selected clip's stride-derived phase (safe1/3; threatened.2564102564102564),
without changing any draw input. Standard full replay3861 then passed636 checks
and44 exact images, including all previous42 unchanged. Complete stdout and a
count/exit-code summary are archived alongside this leaf; structured report
output was not enabled for this run. No second capture was performed merely
to change report format.

Final independent CLI19449/session01a07d85-a95f-7663-ba02-27453d15ff09:
“No actionable regressions were found in the current changes. TypeScript
checking passed; focused tests could not start because of sandbox permissions
and configuration-loading limitations.” Its test attempt hit EPERM writing
the read-only .vite-temp config; the alternative native loader could not resolve
the extensionless vite.config import. These are not claimed as test passes.
The earlier independent71-test run and final own full354-test/60-file run plus
tsc passed. The missing-baseline finding is resolved by the reviewed creation
and standard exact gate above. Focused oxlint and git diff --check pass.

This leaf does not claim art, grounded feet, complete protected coverage or
live admission. Own GPU/browser and Vite processes are closed at handoff.

Reproduction from the isolated worktree:

```sh
bun run --cwd web test
bun run --cwd web typecheck
bun run --cwd web bake:test
# Against the strict-port worktree server, bundled Chromium/SwiftShader:
VERIFY_GPU=1 VERIFY_URL=http://localhost:5377 node web/scene.mjs battle-model-action-replay
```

## Choices audit

Sound, high confidence: put gait classification beside ActionRole so schema and
timeline cannot disagree about which clips need distance calibration. The plan
required shared semantics but not a helper location. This avoids a second
controller or separate stride table; future gait roles update this owner.

Sound, high confidence: use existing block-fixture motion as distinguishable
diagnostic clips in CPU consumer tests, never relabel detailed missing reactions
to bypass admission. These clips test selection/pose transport, not the artistic
meaning of the protective gesture. Current real appearances remain explicitly
unbound.

All posture precedence, cardinal ties, missing fallback and provisional normalized
phase choices are prescribed by the slice, not newly inferred here.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleActionAdapter.test.ts: “targetless Disengage selects protected travel only when the actual engine is not at ease” | Threatened case chose run | Threatened case chooses diagnostic backward; safe sword/pike/evade retain ordinary selection | New presentation gate reads canonical posture and direction. moved |
| actionTimeline.test.ts: “protected gait uses nearest cardinal with longitudinal ties and canonical eligibility” | All cases selected ordinary walk | Back/left/right select distinct poses; ties, safe/routing/no-guard, missing and cancelled net use prescribed fallback | Nullable directional roles are consumed. moved |
| actionTimeline.test.ts: “direction changes transport normalized phase and disabled endpoints retain their compatible gait” | New roles unavailable | Completed distance advances phase; disabled future sampling holds compatible directional gait; recovery/reset/replacement remain canonical | Shared gait owner includes new roles. moved |
| actionTimeline.test.ts: “protected direction changes and time-driven combat preserve exact interruption sources” | New roles unavailable | Exact source pose survives direction/hit/death/melee transition; combat time remains independent | Existing transition mechanism applies unchanged. moved |
| actionTimelineMounted.test.ts: “final incapacity holds corrected lower gait without freezing a masked release” | Ordinary gait only | Same exact lower hold and time-driven upper release also hold from protected gait | Extends existing layered contract without loosening assertions. moved |
| battleActionAdapter.test.ts: “actual routing ticks reach batched motor-travel observations in the displayed facing” | Measured routing values only | Also refuses protected binding | Existing routing semantics retain ordinary selection. moved |
| bake/presentation.test.mjs: HTTP loader checks | No protected keys | Accepts nullable/calibrated full-body gait bindings; rejects omitted/missing/uncalibrated/masked bindings | Strict owned schema extended, not compatibility. moved |
| battle-model-action-replay.mjs: verifyProtectedGait | Both constructed postures render identical march pose | Safe remains exact; threatened renders distinguishable existing run pose, 34,719 changed pixels; exact side repeats | New role selection reaches existing production GPU. moved |

Other touched tests/fixture constructors add explicit null schema fields only.
No stat, golden hash, timer or save assertions changed.
