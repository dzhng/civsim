# User-directed closure scope — 2026-09-21

The user asked to wrap up once there is some performance improvement and the
migration to TypeGPU is complete. This supersedes the earlier absolute 60 FPS
closing target and continued exploratory optimization. It does not authorize
calling the migration done while normal battles still construct Three.

Closeout must ship one TypeGPU battle renderer, remove the old production battle
owner/selector and migrate real consumers. Keep gameplay/save semantics and
campaign rendering intact. Default tactical shadows and the actual menu benchmark
remain requested features. Verify normal battle entry/input/selection/settings,
asset and device lifetimes, and the benchmark's real live run/export/chart.

Use the recorded CPU preparation and matched GPU improvements as evidence;
validate any newly published candidate on the final production path. Report live
FPS and remaining hitches honestly. Historical absolute performance thresholds
remain unchanged measurements, not grounds to restart open-ended optimization
under this revised closing bar. Functional failures, lost content, unreadable
default shadows and an incomplete production cutover remain blockers.

Optional unadopted grass/camera/mesh experiments can be retired or recorded as
unshipped research. Do not leave their temporary selectors or alternative worlds
in the production dependency graph. Shared WGSL helpers and campaign/authoring
uses of Three need an explicit remaining owner; they do not constitute a second
production battle renderer. TypeGPU's typed resource/binding ownership and retained
shader-body boundaries must be described accurately.

The main handoff and migration graph identify the remaining work. On completion,
consolidate decisions and close the spec as shipped rationale, distinguishing
implemented changes from research that the user chose not to pursue further.
