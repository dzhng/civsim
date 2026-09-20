# M9c — explicit whole-population seating inspection

Normal camera frames must not scan the population for diagnostics. Add an explicit
verification operation that re-samples every member of one admitted crowd against
the installed playable heightfield, with finite checks and the existing1e-3 metre
tolerance. It must identify the successful frame whose crowd and terrain it
examines; admission alone is not successful presentation.

Reuse the crowd history's existing submission identity and terrain's committed
generation. Crowd replacement needs a small owner epoch because a replacement
history restarts its submission counter. Capture these identities with the facade's
successful presented-frame record. If the current admitted crowd/terrain no
longer matches that record, report unavailable, not a result for an older frame.
Inspect synchronously under existing lifecycle ownership after readiness/pending
presentation settles. No new GPU submission/readback, background scan, retained
whole-army copy, or generic snapshot/generation framework.

Return the identified result to the caller through the existing battle debug API;
do not cache a transient true in stats or add another invalidation state machine.
Normal stats.seating remains unavailable. Browser consumers will deliberately
assert this operation's result in a later migration pass. Source normal-path
seating is assigned by construction after the shared builder; this new raw
inspection is stronger evidence and must name its scope. Neither alone proves
GPU feet placement: the existing raised-terrain image gate remains necessary.

Prove full visitation (including errors late in the population), nonfinite values,
failed/in-flight presentation, terrain and crowd replacement, frozen retention,
empty/unready/disposed worlds, and absence of repeated scans during normal frames.
Root verifies it on a frozen real battle. Preserve gameplay, camera rendering,
assets, source route and all existing thresholds.
