# Softer budget-selection boundaries

The final tree budget ranked eligible candidates by a smooth spatial score,
creating hard selection contours independent of source woodland edges. Add a
small deterministic per-candidate variation to that existing score. The same
budget, lattice, regional quotas, species, sizes and source/slope/water/road/city
exclusions remain. There is no second scatter pool or new rendering input.

The [CPU probe](metrics.json) isolates budget selection on a uniformly eligible
forest. The32000 cap and exact repeat hold;28226 placements remain,3774 change.
Fully surrounded candidates decrease15907→13268 and isolated candidates18→234.
This supports less abrupt selection boundaries, not a visual-quality verdict.
A stronger variation removed too much interior continuity and was not retained.

Matched [Alps before](before-alps.png) and [Italy before](before-italy.png) compare
with current canonical [Alps](../../../../../web/shots/campaign/landscape-alps.png)
and [Italy](../../../../../web/shots/campaign/landscape-italy.png). Camera pose,
world and projection matrices match exactly. Submitted scenery is2454→2456 and
1243→1240 after unchanged view filtering and footprint exclusions. [Pixel changes](pixels.json)
prove the effect reached rendering. Both images [repeat exactly](repeat.json).
Edge detail is visible in the [Alps before](alps-before-crop.png)/[after](alps-after-crop.png)
and [Italy before](italy-before-crop.png)/[after](italy-after-crop.png) crops.

Root and fresh independent review prefer the candidate with moderate confidence.
Woodland margins are less compact and scattered groups connect some formerly
empty gaps, especially in Italy. Interiors remain substantial and no obvious new
floating trees or severe placement defects appear. Some new dark conifers are
conspicuous. Full-size outliers, oversized-looking tree/shadow relationships,
uniform forest floor and missing intermediate growth remain unresolved. This
accepts a small edge improvement, not final ecological integration or reference
quality. Final composed presentation baselines remain part of the common matrix.

The12 existing woodland/scenery tests pass; no CPU assertion or floor changed.
Static review confirms the added work is one deterministic hash per candidate,
without changing asymptotic work, ownership, gameplay or resource lifetime.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| landscape-alps snapshot | Compact budget-selected woodland boundaries | Slightly more irregular margins and outliers; exact repeat | Smooth score cutoff is feathered within the existing budget. **moved** |
| landscape-italy snapshot | Isolated groups with fewer intermediate trees | Loose connecting groups and irregular edges; exact repeat | Same selection policy transfer. **moved** |
