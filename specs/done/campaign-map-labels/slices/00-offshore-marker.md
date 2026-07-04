# Slice 00 — Offshore marker: city labels never take the world-edge inset (SHIPPED)

**Contract:** an overview city marker (the label's icon) sits on its city's
anchor, never displaced by the world-edge inset. Ierusalem's house renders on
its coastal-strip land, not in the sea to its west.

**Root cause (measured, see README):** `horizontalEdgeOffset` /
`verticalEdgeOffset` — the inset that pulls free-floating faction engravings
away from the map's world edge — was applied to the city label's
`screenOffsetX/Y`. Since campaign-map-bugs slice-04 made the overview marker
*be* the label's icon, that inset dragged the marker ~52 px west off its
anchor onto water for cities in the outer 22 % of the map (Ierusalem).

**API seam / owner:** `web/src/campaign/renderer.ts` — `campaignCityLabels`
drops the `edgeX`/`edgeY` computation; `overviewCityLabelAnchors` and
`closeupCityLabelAnchors` lose their edge-offset parameters and author offsets
about the marker only. The inset stays for `campaignFactionLabels`
(engravings legitimately float and clip at the frame edge). `mapEdgeProjector`
/ `horizontalEdgeOffset` / `verticalEdgeOffset` remain, used only by the
faction path now.

**Deliverable:** the icon-above marker on its city at all zooms; verified live.

**Verification (done):**
- Live probe: drawn icon box centre offset from anchor went `−52.2 px → −0.2 px`;
  drawn icon world `bg-land = false → true`; icon world now `(1619.6, −546.6)` =
  Ierusalem's position.
- Visual crop: purple house on the pink Ierusalem territory, "IERUSALEM"
  beneath it (was: house in the dark-blue sea).
- Scenes: `campaign-visual`, `campaign-lod`, `campaign-collision`,
  `campaign-map-alignment` all pass. Only the three whole-map overview snaps
  changed (label move + benign glyph-atlas repack) and were re-blessed;
  every regional/close/alignment framing is 0 px.

**Stays green:** the collision scene's no-overlap assertions; the label-hug
invariant (Slice 00 is its enforcement, not a violation).

**Feedback that would change this:** if a city near the frame edge now clips
its name off-screen badly, split the label so the *text* may inset while the
*icon* stays pinned — but never re-displace the marker.
