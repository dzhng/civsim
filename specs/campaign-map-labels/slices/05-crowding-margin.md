# Slice 05 — Crowding margin ("too close", not just overlapping)

**Contract:** two surviving labels never sit closer than a crowding pad. "Too
close" = the ink rects, inflated by a zoom-scaled margin, must still not
overlap. One knob, applied uniformly.

**Slice variable:** inter-label *spacing* only.

**API seam / owner:** inside `arbitrateLabelOccupancy` /`placeCityLabel`
(`mapPass.ts`), inflate the claimed/candidate `ScreenRect` by `crowdPadPx`
(dpr-aware, scaled to text height) before the existing `rectsOverlap` call.
**Same overlap test, same one rect currency — inflated inputs, no new geometry
type, no world-space metric.**

**Deliverable:** even breathing room at overview; no near-touching pairs
(worst case: the Aegean city cluster).

**Gates:** re-bless the affected overview snaps; `render-probe.mjs` land
fractions unchanged (spacing doesn't move markers onto water); **screenshot-critique**
on the densest cluster; the collision test green.

**Human checkpoint (non-blocking):** tune `crowdPadPx` against a screenshot of
the Aegean cluster — open with preview-shots, decide on the evidence.

**Feedback that would change this:** the pad value is pure taste; expect one
tuning round with David.
