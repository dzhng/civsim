# Retained crowd snapshot copying

Adopted worker8efe096f ascc29b10a after the declared ABBA screen passed. The
shared retained snapshot copies its closed instance and clip-sample fields
explicitly, preserving mutable-shell isolation, endpoint aliases and absent
optional-field clearing. No LOD, asset, animation, GPU or simulation changes.

## Measured screen

Fixed pre-change raw build versus the candidate built directly from its isolated
worktree, Chrome hardware, CSS1280×800 atDPR1. Each run holds seed7 at tick30,
state hash14739215347954801209 with30,560 soldiers. Preparation is untimed;
each arm records12 seconds stationary then12 seconds of wall-time camera pan,
yaw and zoom. HUD hiding matches the supplemental30k workload, not final acceptance.
Own CPU/build/review jobs were terminal before timing. External host activity
was not controlled; process inventories are retained in throwaway.

| Arm | Wide rendered FPS | Moving rendered FPS | Wide CPU median ms | Moving CPU median ms |
| --- | ---: | ---: | ---: | ---: |
| Control A1 | 29.88 | 38.14 | 24.42 | 15.88 |
| Candidate B1 | 33.83 | 54.49 | 17.69 | 13.79 |
| Candidate B2 | 36.30 | 52.41 | 18.11 | 14.02 |
| Control A2 | 29.92 | 37.08 | 21.49 | 17.13 |

Both candidate CPU medians beat both controls in both segments. Pooled median
CPU reduction is23.63% stationary and15.80% moving, exceeding the declared10%
screen. CPU is renderCpuMs (observation/preparation through submission), not a
sum with nested upload/frame CPU or overlapping await time. Rows deduplicate
successful rendered-frame IDs; FPS uses elapsed observation time between first
and last distinct frames, not rAF count. Camera timing is matched by wall time;
faster arms sample more poses, so moving medians are route-level observations,
not a per-pose causal decomposition.

All four state/population checks pass, with no browser errors. The fixed wide
captures are pixel-identical across all four arms. Root inspected the candidate
capture: this tests the distant overhead30k stop, not the user's tactical framing.
All30,560 are main L4 impostors and L3 shadow casters at this stop; single1024
shadows and24,144,400 shadow triangles are preserved. The static wide stop still
misses60FPS and its median CPU duration remains above16.67ms. Further preparation
work remains. This does not close live battle throughput, moving visual quality,
net-shadow cost, or final default-shadow acceptance.

[Summary](summary.json), compressed per-arm reports, [matched wide image](wide.png),
and compressed runner preserve the screen. Full process inventories and builds
remain in throwaway/snapshot-copy-review.

## Review and change ledger

Independent Codex review found no actionable defects and passed all4 snapshot
checks. Root merged verification passes43 snapshot/audience/scene tests and web
TypeScript. Worker full web run was771 pass with one missing sparse campaign
fixture; no full-suite-green claim. Lab worker tests passed162.

One new test proves reused slots retain none of the overwritten submission's
values and do not alias playback. Mutation checks deleting seed copy or source
sample phase assignment go red. Existing expectations are unchanged. Consumers
are raw admission history and source PhotorealCrowd upload; the worker report's
source/raw labels were reversed, not the implementation.

The fixed literal makes required future instance fields a compile error until
handled. A future optional field still needs an explicit copy and test; no second
field registry or compatibility path is introduced. Frozen readonly pose sources
remain shared; mutable shells remain isolated.

## Changed-build30k gate

Both updated source and raw builds pass all19 existing checks. The raw mid stop
now collects75 distinct GPU samples (vista144), with correlated GPU medians7.88ms
and7.58ms. Pan/zoom/wheel rAFp95 are17.45/18.39/19.70ms, below the unchanged33ms
floor. Population, foliage, physical camera endpoints and pixel-content assertions
remain intact. See [raw report](raw-30k-report.json) and
[source report](source-30k-report.json).

The previous build's74/75 failure remains recorded as the original result;
this is a changed-build pass, not an unchanged rerun. Exactly75 samples is still
little headroom and does not establish60FPS; ABBA rendered cadence is the stronger
cadence evidence. These source/raw runs stop at their own paused ticks and use
different GPU metric scopes, so their times are not a matched causal comparison.
