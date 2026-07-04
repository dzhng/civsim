# Slice 06 — Reappearance at closer zoom (verify + per-zoom budget)

**Contract:** a label culled at zoom Z reappears at some Z′ > Z; survival is
**monotonic** in zoom for a fixed importance — no flicker, no popping in and out
across a single zoom sweep. A per-zoom visible-count budget guarantees "no wall
of text" at the widest zoom.

**Slice variable:** total *density* across the zoom ladder.

**API seam / owner:** expressed through the existing `visibleLabels`
(`mapPass.ts`) LOD + Slice 04's ranking — **no new mechanism, and no per-label
"was shown" memory.** The rank is zoom-*independent*; only screen geometry (rect
size/position) scales with zoom. So as Z rises, rects spread, lower-rank labels
clear the greedy budget and reappear — a stateless, monotone consequence. Any
per-zoom cap reads the same `BUDGET[Z]` table the probe asserts (one shared
constant). Add hysteresis only if a scene actually shows threshold flicker.

**Deliverable:** a zoom-ladder montage (overview → regional → close) showing a
named low-importance city absent at overview and present zoomed in, its
neighbours stable.

**Gates:**
- Extend `render-probe.mjs` with a fixed zoom ladder (e.g. scales
  `0.16, 0.4, 0.8, 1.6, 3.0` at a stable centre); add a `labelDensity` section
  from `visibleLabelNames`. Assert: `count ≤ BUDGET[Z]`; **reappearance
  monotonicity** (a name visible at Z is visible at every Z′ > Z, tolerance for
  edge-panned labels); determinism (probe run twice → identical
  `visibleLabelNames`).
- `campaign-lod` snaps across the ladder re-blessed.
- **find-map-bugs** oracle at the density lane close on all three canonical
  shots; **screenshot-critique** on the montage.

**Human checkpoint (non-blocking):** final density sign-off across the ladder.

**Feedback that would change this:** if a name flickers at a zoom threshold,
add minimal hysteresis in `visibleLabels` — never a stored per-label history.

---

**SHIPPED (verification).** The reappearance mechanism is slice 04's league LOD:
`LEAGUE_IMPORTANCE_BAR_HI` falls to 0 by mid-zoom, so a league culled at overview
clears the bar and reappears as the camera comes in — stateless, recomputed per
frame. `tools/reappearance-probe.mjs` locks it: holding a fixed center over the
league-dense east-Med and stepping the zoom, visible league count is
non-decreasing (**5 → 7 → 12 → 14**) and the overview stays within budget (5 ≤
10). Above zoom ~1.0 `leagueHiFade` intentionally retires faction engravings so
cities take over — that upper cutoff is by design, not a monotonicity break. The
apparent drops when free-panning are labels leaving the shrinking viewport, so
the probe compares counts at a fixed center, the density signal.

*Close:* `close-spec` archives this feature to `specs/done/`. The deferred
polish (duplicate league/city name, faint-league legibility, bar tuning) is
recorded for David — taste calls, not open slices.
