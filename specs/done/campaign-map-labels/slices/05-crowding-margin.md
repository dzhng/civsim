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

---

**RESLICED — not built (premise removed by slice 04).** This slice assumed the
overview was crowded and needed spacing. After slice 04's importance-driven
declutter (34 → 13 faction labels), the unbiased screenshot-critique found the
opposite — the overview reads *sparse*, not crowded, and every no-overlap gate
(collision scene, the Roma cluster, Pella) already passes. Adding a crowding pad
would inflate rects and cull *more* labels, sparsifying a map the reviewer
already called under-labelled. So the slice's goal (comfortable breathing room)
is met by the declutter itself, with no crowding margin. If a future dense
regional cluster ever fails the no-overlap gate, revisit with a **zoom-scaled**
pad (larger at close zoom, ~0 at overview) so it never re-crowds — but there is
no such failure today.
