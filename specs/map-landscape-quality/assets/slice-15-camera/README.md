# Battle performance framing audit

The close-fill gate must measure distinct, attainable production views. Raw zoom
dial labels cannot prove that: the production rig clamps this seed's dial at 8,
so previous requests 24 and 28 both measured the same 10m eye-to-target distance.
The static vista request 9.5 had the same clamp. This is a verification defect;
there is no evidence that either old close request meant a physical 24m/28m view.

The replacement keeps the existing closest view and adds a 24m formation-detail
view through `Camera.zoomAt`, the same physical distance inversion used by wheel
input. The farther stop gives over twice the viewing distance while remaining
low and close; the 10m stop retains the maximum supported close-fill workload.
This is explicitly new, useful two-stop coverage rather than a claim to recover
unsupported old dial values. Both measure the same crowd location and retain
all density, sample and 33ms timing gates. Static vista and the continuous sweep
now request the supported endpoint. The wheel bounds assertion also uses this
seed's actual supported range.

The existing scene records the settled camera parameters and asserts each
requested static dial and close physical distance. The distance tolerance is
one centimetre, for numerical inversion only. No production camera, field,
rendering, grass policy, or workload budget changes.

[CPU control](cpu-camera-control.json) runs the actual production Camera with
this fixture's rig bounds. It demonstrates the old duplicate endpoint and the
new distinct physical distances. Existing camera/rig tests pass (24 tests), and
typecheck passes. The [hardware report](hardware-report.json) verifies the
corrected framing, but the close-view performance gate remains red.

| Check | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Static camera framing | Reported requested 9.5 despite settled 8 | Reports and asserts actual dial/parameters, requests 8 | A report must describe the measured frame. **moved** |
| Close fill framing | Two unsupported requests both silently measured 10m | Asserts settled 24m and 10m, with distinct distances | Cover two real close views, preserve closest workload. **moved** |
| Zoom sweep | Upper segment clipped at 8 | Sweep reaches 8 without a clipped plateau | Exercise the supported interval. **moved** |
| Wheel range | Accepted dial up to 60 | Accepts only this seed's production maximum 8 | Reject impossible claimed camera coverage. **moved** |

No existing image baseline or performance threshold changed. Full visual and
hardware acceptance remains open because the closest view missed its timing gate.

## Hardware result

The installed Chrome/Apple Metal run completed with no page errors or rendering
warnings. Both requested physical distances were reached (24.00000023m and 10m),
with 30,560 soldiers and 1,663,751 grass records against the 2,000,000 active budget.
The 24m close view recorded rAF median 15.89 ms/p95 31.79 ms; the 10m view recorded
median 16.42 ms/p95 33.74 ms, failing the unchanged 33 ms gate. Pan p95 was 22.33 ms,
sweep 27.88 ms, and wheel 24.15 ms. All other scene checks passed.

This proves the framing correction, not full performance acceptance. No threshold
was changed, and no further runtime implementation was made. The new 24m stop
passes; the failure occurs at the 10m endpoint already exercised by both old
close requests. One run does not isolate the cause of this timing miss.

Independent review caught a stale name in the hardware-only assertion following
the constant rename. It was corrected before the hardware run; the final review
found no actionable regressions. Existing camera tests and typecheck ran outside
the review subprocess because its sandbox could not traverse linked dependencies.
