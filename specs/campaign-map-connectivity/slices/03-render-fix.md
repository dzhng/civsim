# S3 — Sea-lane render: solid, on top of the water (parallel)

**Contract:** the 3 sea lanes render as SOLID, continuous, clearly-visible lines
drawn ON TOP of the water at every zoom; Gades↔Tingi reads as one continuous
lane. Independent of the bake spine — lands early on the current map, re-verified
on the final map in S4.

**Root cause (measured):** the sea-lane pass uses the flat `xy`
`CampaignWorldLinePass` (`renderer.ts:752`, defaults to `LINE_WGSL`, z=0), so it
is depth-buried under the height-mapped water surface (the exact bug the borders
comment at `mapPass.ts:336` describes). Borders already use the `xyz` variant
(`renderer.ts:754`, `LINE3D_WGSL`). And `pushEdgeLines` (`mapPass.ts:1358`)
draws dashes (`dash=12, gap=10`).

**API seam / owner (two edits, mirroring the borders precedent):**
1. `renderer.ts:752` → `new CampaignWorldLinePass(this.shell, "triangle-list",
   "xyz")` so lanes carry z.
2. `mapPass.ts::pushEdgeLines` → thread `style.heightAt` (already available; used
   by `pushRaisedRoad`), emit **7 floats/vertex** with `z = heightAt(x,y) +
   LANE_LIFT` (small positive, water ~0), and **remove the dash loop** — one
   continuous band per via-segment (keep the dark-outline + bright-core two-band
   style for legibility). Update the `stats.lineVertices` divisor for the xyz
   layout.

Keep the pass depth `read` (a genuine island between endpoints should still
occlude). No pass-order or depth-mode reshuffle.

**Deliverable / inspectable:** screenshot of the lanes solid + on top of water.

**Verification gates:**
- Render-probe / scene stats: `lineSegments > 0`, segment count == via-segment
  count (not dash count).
- **screenshot-critique** on the lane crops (last check before accept).
- **compare-screenshots** vs David's faint-dashes/occluded before shots — verdict
  "less wrong": solid + visible + on top.

**Stays green:** faction borders (share the `xyz` seam — must not regress);
roads; battle render untouched.

**Human checkpoint (non-blocking):** David approves solid/on-top/continuous.
