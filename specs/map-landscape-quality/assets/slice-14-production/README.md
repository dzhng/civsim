# Production adapter checkpoint

The normal campaign entry now consumes the shared physical world. Campaign still
owns commands, visibility policy, city/army composition, scenery reservations,
cart motion, labels and cards. The renderer does not introduce a save format,
backend selector, replacement canvas or private camera.

The existing traversal scheduler now belongs to
[terrain residency](../../../../packages/photoreal-renderer/src/campaign/terrainResidency.ts).
Production and the traversal route create the same landscape world. One worker
builds bounded tiles; preparation admits ready geometry before projecting cards.
The explicit prepared frame carries live entity input into drawing without
building it twice. Independent draw callers still prepare on demand.

The city body bounds and terrain sampler describe the same presented revision.
Buried foundation corners are clipped to terrain when finding conservative body
bounds. Existing card and city-label owners preserve their minimum gap while
clearing those bounds; the raw label caller retains its flat-anchor compensation.
The existing screen-army flag paint is shared by raw lab and physical consumers.

Retirement removes the production raw pass graph and old rendered-surface store,
the now-unconsumed raw fog pass, and campaign mountain-prop placement. Independent
raw map/model/prop/standard lab consumers retain their required owners. Existing
rock and woodland candidates keep their coordinates; mountains come from terrain.

## Evidence and limits

[The production scene](../../../../web/scenes/campaign/campaign-production.mjs)
exercises the normal campaign route at DPR1 and DPR2: actual selection/city-panel
clicks, card/body clearance, canvas drag and keyboard fog input. [Overview coverage](../../../../web/scenes/campaign/campaign-physical-overview.mjs)
uses the real map, with sea/faction hierarchy and screen army flags.

[Controlled DPR1](../../../../web/shots/campaign/campaign-production-physical.png),
[selected DPR1](../../../../web/shots/campaign/campaign-production-physical-selected.png),
[controlled DPR2](../../../../web/shots/campaign/campaign-production-physical-dpr2.png),
[selected DPR2](../../../../web/shots/campaign/campaign-production-physical-selected-dpr2.png)
and [real overview](../../../../web/shots/campaign/campaign-production-overview.png)
are the review artifacts.

All five final captures after correcting road seating repeat with zero differing
pixels. [Verification results](verification.json) record both DPR interaction
flows and the strict repeats. Fresh critique accepts road seating and city/card/label gaps at both DPRs.
The inherited Auto replenish row defect is corrected with scoped inline-flex;
all controlled frames repeat exactly after that correction. Separate fresh
critique accepts one aligned unwrapped control without clipping at both DPRs;
action buttons remain distinct. The real-map overview has eight accepted sea names, eight faction names
and ten screen flags, without shader warnings. The first-frame city test is red
when entity upload is delayed until after card layout, and green with explicit
preparation. The scenery test pins actual buffer versions across unchanged
entity/cart submissions and verifies that movement still updates the buffer.
The visibility regression requires moving sources to leave disabled-fog geometry
alone while still refreshing enabled fog, including an initially empty source set. Physical geographic ribbons consume
clearances from the builder and add presented height once.

Fresh visual critique finds readable cards and labels, with no hard UI usability
blocker. It flags the inherited large controlled-stage garrison ring, faint
near-top-down banners, overview card/map crowding, peripheral sea-name contrast,
and a rectangular sea artifact off Libya. These captures do not establish final
landscape quality or complete slice14 acceptance.

### Libya diagnostic

[Shadows on](libya-shadows-on.png) and [shadows off](libya-shadows-off.png) hold the
same frozen map and camera while changing the existing graphics setting. The
[measurement](libya-control.json) reports no change in the Libya rectangle,
although 39,260 whole-frame pixels change. The setting maps directly to sun
casting before draw, but direct sun/backend state was not separately logged.
This rules out a no-op whole-frame control; no specific remaining cause is claimed.
The artifact remains open for geographic/material diagnosis.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why it changed |
|---|---|---|---|
| CampaignRenderer stats contract | Exact snapshot of every raw-oriented stats key. | Required card/label/collision/timing telemetry before GPU readiness. | Retired raw pass fields are no longer meaningful; behavior-facing diagnostics remain. **moved** |
| campaign teardown during crowd preparation | Destroy raw shell and crowd exactly once after interrupted initialization. | Dispose the sole physical campaign world exactly once after interrupted initialization. | GPU lifetime has one physical owner. **moved** |
| hasCampaignWorldDepthContract | Required raw pass IDs, attachment format and role graph. | Requires physical substrate/projection, live reversed depth, terrain/geography and actual draws. | Shared world owns composition rather than the retired raw graph. Applies to production, conquest, save/load, handoff, menu-shell and full-game performance callers. **moved** |
| campaign-production ownership | Required raw glyph layer, sea-mask tag and one cloud quad. | Requires physical glyph layer and shared depth/composition; retains entity counts and click/card flow. | Ownership changed; app behavior remains the gate. **moved** |
| campaign-production pixel probe | Warm ground >120000, red >700, gold >40 and cloud-colored pixels >1200. | Same ground/faction/gold floors; removes the raw cloud-color proxy. | Physical atmosphere is not a raw cloud quad. **moved** |
| campaign-production selected-panel layout | Checkbox, block icon and text occupied separate lines (inherited). | Existing control occupies one aligned row; actual element/text bounds checked at DPR1/2. | Fresh critique identified a concrete readability defect; scoped layout only. **moved** |
| campaign-production city panel | Required raw glyph layer after actual city click. | Requires physical glyph layer after the same click, city panel and own-city card. | Renderer identity migrated; interaction stayed required. **moved** |
| campaign-visual label layer | Required raw-gpu-glyph-atlas. | Requires physical-gpu-glyph-atlas with the existing visual journey. | Same shared atlas/layout has a physical consumer. **moved** |
| campaign-lod border fog | Required one raw cloud quad alongside fog state/sources. | Requires shared-world fog state alongside the same source checks. | The raw cloud proxy no longer represents fog ownership. **moved** |
| campaign-lod feature density | Total >=4000, mountains >=1000, trees >=2400, rocks >=700. | Total >=3100, mountains =0, physical terrain allocation >0; same tree/rock floors. | Mountain models retired; continuous terrain now carries range mass. **moved** |
| campaign-map-alignment water ownership | Required raw map-sea-mask tag and absence of a freehand water pass. | Requires canonical source-shore input on physical terrain; geographic point checks remain. | Water coverage is consumed by the shared terrain material. **moved** |

[Before-road-seating controls](before-road-seat/) and [pixel measurements](road-seating-control.json)
preserve the visual effect of the geographic seating correction.

Independent review found and resolved duplicated road elevation and unnecessary
visibility uploads while fog was disabled. The geographic layer's clearance
contract and the red-to-green disabled-fog regression cover those corrections.

The Auto replenish checkbox/icon/text previously split across three lines. Its
JSX and shared icon CSS were unchanged from the parent commit: the block icon
forced line breaks inside an inline label. A scoped inline-flex label restores
one readable row without changing its callback. [Before-layout controls](before-replenish-layout/)
preserve the inherited defect; production checks measure the actual element/text
rectangles at both DPRs. Compare [DPR1 before](crops/replenish-before-dpr1.png)
and [after](crops/replenish-after-dpr1.png), or [DPR2 before](crops/replenish-before-dpr2.png)
and [after](crops/replenish-after-dpr2.png).

No simulation or unit stat changed in this adapter pass. The occupied-city crowd
policy belongs to the separately reviewed army/cart input commit.

The legacy campaign visual, LOD and map-alignment assertions now name the shared
owners. Their full journeys and replacement image baselines, along with the
remaining save/handoff/lifecycle and hardware gates, remain open in slice14.

[Journey settlement and lifetime evidence](journeys.md) covers the remaining
verification migration without changing immediate-frame contracts.
