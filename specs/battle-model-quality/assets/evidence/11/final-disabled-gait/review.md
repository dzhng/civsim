# Final-disabled prospective gait

Completed motor-capable travel and the body's current condition answer different
questions. The timeline counts the observed interval before setting a disabled
body's future gait rate to zero. It retains the compatible current walk/run track;
without one it preserves the engine's existing at-ease/ready/pike-ready choice. It does not erase adapter
measurements, bank disabled transport, invent a stun action or change engine state.

Only gait phase stops. Existing blend weights may still settle, and standing,
death, hit, release and melee remain time-driven with unchanged priority. Thus this
is not a whole-pose freeze or acceptance of a realistic stunned pose. Full-body
interruptions preserve the previously presented composed source; a masked release
preserves the upper source while the lower gait receives its interval correction.
Recovery uses new observations; incompatible appearance/reset histories start fresh.

## Verification

The first red tracer retained integer phase .25 but sampled .2625 at the fractional
tick instead of holding .25. After the prospective-rate fix it passes exactly.
The second tracer then exposed the stable-track shortcut: another qualified
interval left phase .25 instead of .375 because both future rates were zero.
Reuse now requires both prospective and measured rates to match the existing rate.
The hold/recovery tracer initially changed run to walk at the disabled endpoint;
it now retains run and counts the interval using that clip's stride distance.

Passed from this worktree:

```sh
cd web
node_modules/.bin/vitest run tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts tests/battleActionAdapter.test.ts tests/playbackPacking.test.ts
node_modules/.bin/vitest run
node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Focused: 67 tests in four files. Full: 350 tests in 60 files. Changed-source lint,
formatting and diff whitespace checks pass. An initial full-suite invocation from
the repository root with `--root web` failed the campaign image fixture's cwd-based
path; the canonical invocation above passes without a source or assertion change.
Rust and generated assets are untouched; tests consume the parent's current rebuilt
WASM through a temporary read-only-use symlink, never rebuilding a shared binary.

Initial bundled Codex review `01a07d3b-e889-77b0-9935-866e0b1761c1` completed
with no actionable regressions and independently passed all 42 timeline tests.
Parent review then corrected the planned standing fallback: incapacity is not
evidence that an at-ease body becomes battle-ready. The forced-ready condition was
removed, and the lifecycle test now distinguishes canonical at-ease from ready and
pike-ready. Corrected independent review `01a07d3e-97ce-7ee3-b201-80482875a6ef`
found no actionable regressions and passed all 66 focused tests. The corrected
full web suite and typecheck also pass. Shape review keeps the existing
track owner and adds no controller, schema, API, state field, dependency or binding.
Parent owns the global spec/handoff and choices consolidation.

Final independent code review `01a07d4a-2dab-79f0-a765-62ebb5394918` passed all
67 focused tests; its sole finding was the then-missing new screenshot baselines.
Those must ship only after the following matched proof and final standard gate.
The parent also removed an unbounded fixture readiness loop in favor of the
existing page readiness wait with a 30-second timeout. No polling framework or
new production debug API was added.

## Matched production proof

The unchanged [original gate](browser-report.json) passes 619 checks and all
40 existing images exactly. It never observes incapacity, so it is regression
coverage, not evidence that the new behavior reaches the renderer.

Two new checks use the existing workbench, replay recipe interface and production
`drawInstances` owner. Camera, viewport, root and world time stay fixed. The
authored nominal walk speed supplies positive qualified travel through tick 15;
the final observation is disabled. Fractional samples at 15.1 and 15.9 consume no
new integer observations. The scene measures real submitted playback, evaluated
locals, exact same-side repeats and cross-time pixels. It runs after the original
production temporal checks and before their separate diagnostic-route navigation,
so it cannot alter the old checks' preceding render history.

For the old control, only this isolated worktree's timeline source was replaced
using apply_patch with exact `d17f092c` bytes. SHA256:
`f31098e5d6d582b372ca7f1c2accd4ffd5ec84d716121a58d97db1953a779d0e`.
The [old run](old-report.json) fails four intended hold checks: phases advance
`.5033333333333333 → .53`, and 17,405 RGBA pixels change. Same-side pose/pixel
repeats remain exact; no page errors. After that browser closed, the candidate
was restored byte-exact, SHA256
`a0524c060f1fb0980608aab8d3f8f27163470a72025983b9c38ffacd2795cb09`.
The [candidate run](candidate-report.json) holds both phases at `.5`, with exact
locals, playback, same-side pixels and cross-time pixels; no page errors.

[Pixel telemetry](pixel-comparison.json) records 5,594 old/new changed pixels at
15.1 and 17,836 at 15.9. All four full 970×758 canvas PNGs are archived beside
the [two-times/two-versions body crop](pairs-body-2x.png). The author inspected all
four full images and the enlarged crop. The [fresh neutral review](visual-review.md)
confirms visible limb/equipment movement in A and effective stability in B, with
comparable framing/content/light and no missing body or equipment. B is less wrong
for this explicit phase-hold requirement. Stepped edges, ground banding and angular
fixture intersections remain diagnostic-block limitations, not accepted soldier art.
Two stills do not establish grounded movement or continuous motion quality.

After author, parent and neutral-review inspection, the shared snapshot primitive
created only the two new baselines; both decoded RGBA images equal the reviewed
candidate captures exactly. The [standard full repeat](final-browser-report.json)
passes **629 checks and all 42 snapshots**, each reporting `0 px differ (0.0000%)`,
with no failures or page errors. The existing 40 files are untouched. This resolves
the independent review's missing-baseline finding without weakening any gate.
Command from `web` (own strict Vite on 5367):
`VERIFY_URL=http://127.0.0.1:5367 VERIFY_GPU=1 node scene.mjs battle-model-action-replay`.
No UPDATE flag was used. Both new baseline images were also opened and inspected.

## Changed-test ledger

All seven CPU tests are new; no existing assertion or image baseline is repinned.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `final incapacity preserves completed travel but stops prospective gait` | Fractional phase .2625 after completed .25 | Integer and fractional phase .25, exact evaluated pose | Final condition gates future sampling, not completed distance; moved. |
| `a second final-disabled interval still counts its qualified past travel` | Intermediate rate-only fix retained .25 | Additional interval advances to .375, then holds | Equal future rates do not imply equal past travel; your-regression, caught before completion. |
| `incapacity holds the compatible gait through zero travel and recovers without replay` | Low-speed endpoint selected walk | Retains run at .125 through zero travel; recovery reaches walk .375 from new travel only | Hold the compatible gait, not the interval's inferred pace; moved. |
| `disabled fresh, reset and replaced appearances preserve canonical time-driven standing` | No explicit disabled lifecycle coverage; initial plan forced ready despite at-ease | Engine-selected at-ease/ready/pike-ready starts at zero and advances by time; reset/replacement cannot reuse gait | Incapacity does not replace canonical posture; moved, initial policy corrected by parent review. |
| `disabling and interrupting gait keeps exact full-body source and event timing` | Existing interruption coverage lacked final incapacity | Exact old pose at interruption for hit/death/melee; event phase subsequently advances | Disabled gait must not weaken higher-priority timing or source ownership; moved. |
| `final incapacity holds corrected lower gait without freezing a masked release` | Existing masked source coverage lacked disabled endpoint | Exact upper source, corrected held lower pose, advancing release | Lower gait correction and upper animation keep their existing owners; moved. |
| `disabled gait phase holds while an existing transition still settles by time` | No explicit disabled in-progress blend control | Destination phase holds; transition weight/pose advances, repeated sample exact | Only gait phase is vetoed, not existing transition timing; moved. |
| Production disabled two-frame gate | Old phases .50333→.53 and 17,405 changing pixels | Both phases .5 and zero changing pixels, each side repeats exactly | Prove the actual production submission responds, not only CPU arithmetic; moved. |

## Choices audit

- **Forced battle-ready fallback rejected (unsound, corrected).** The initial
  plan interpreted a disabled body without gait history as ready even when the
  engine said at-ease. That introduced an unsupported defensive-posture decision.
  Parent review corrected the plan and implementation: preserve canonical standing
  selection unchanged. No new incapacity-to-threat inference remains.
- **Current destination gait is the compatible pose (sound, high confidence).**
  A body disabled while its walk/run transition is settling retains that current
  gait and stops its clip clock. The existing blend continues to settle; freezing
  the entire blend would add a different pose policy and interrupt time-driven
  transitions. This interprets the planned compatible-gait hold without another
  snapshot owner. The scope is phase transport, not disabled character-art acceptance.
- **Recovery retains ordinary measured-speed hysteresis (sound, high confidence).**
  The disabled condition does not rewrite the timeline's measured moving/stopped
  history. On recovery, existing observations select the background normally.
  Resetting movement history on incapacity would introduce a new recovery threshold
  policy beyond the requested future-rate veto.

Directional protected bindings, net-cancelled direction inference, live root
placement and detailed appearance promotion remain outside this pass.

Size (nonblank changed lines): production logic +21/−11, production comments +1/−0;
tests/harness logic +230/−1 and harness comments +1/−0. The structural cost is a
branch in the existing timeline owner, one bounded verification helper within the
existing replay scene, and two snapshot baselines. No production state field,
controller, dependency, schema, timer, simulation/save change or asset binding.
