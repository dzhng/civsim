# 20 — Crisp faction borders (David, mid-build addition)

**Contract unlocked:** territory edges in faction view are crisp, not blurry
(feedback #18, `assets/feedback/18-blurry-territory-border.png`), and each border
is an **actual rendered line in the owning faction's color — two neighbor
territories show two touching border lines** (one per side, each in its own
faction color; the EU4/political-map convention, visible in
`assets/faction-wash-target-eu4.png`).

## API seam (single owner — faction-fill material + borders, invariant 3)
Two variables, likely two passes of work:
1. **Crisp fill edge.** The wash blur comes from bilinearly sampling the
   field-resolution territory texture (`web/src/campaign/territory.ts` builds the
   rgba at terrain-field res; `territoryPass.ts` samples with a linear sampler).
   Options, in order of preference: switch the territory sampler to nearest
   (crisp texel edges — matches the terrain's own texel look), or sharpen in the
   fragment (majority-of-neighbors), or raise the territory raster resolution.
   Judge on the feedback crop's zoom level: the edge must read as a clean stepped
   line, not a gradient smear.
2. **Dual faction-colored border lines.** The border geometry already exists
   (`territory.borders` → `campaignBorderVertices` in `territoryPass.ts`, today a
   single dark line). Extend the border extraction to carry BOTH side owners per
   segment and emit two offset strips, each tinted its side's faction color
   (`map.factions[].color`), meeting at the boundary. Keep a thin dark seam
   between/under them if needed for definition. Border strips render in faction
   view only, above the wash, below labels.

**Firewall:** the wash alpha/hue (slice 04/04b) is frozen; no terrain-palette
changes; no new color vocabulary (faction colors only, invariant: two-color rule).

## What the human can see
- A regional faction-view shot at the feedback crop's zoom: crisp edges + two
  colored border lines meeting along a Rome/neighbor boundary.

## Verification
- **Slice variable / crop:** the territory EDGE only (crispness + the dual
  colored lines). Out of scope: wash strength, terrain, labels.
- **compare-screenshots** vs feedback #18 (blur gone) and vs the EU4 reference
  (border convention).
- **screenshot-critique** last.
- Stay green: `campaign-lod` political scenes; `territoryPixels`/`borderSegments`
  stats stay sane.

## Feedback that would change this slice
- Border line width/definition taste; whether the dark seam stays.
