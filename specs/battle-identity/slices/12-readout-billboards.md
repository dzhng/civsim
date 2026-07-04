# Slice 12 — battle readout leaves the DOM: GPU billboard bars + chips

**Contract:** the unit readout (own-unit bars, status chips, selection
treatment) renders in-scene as world-anchored, camera-facing GPU billboards —
anchored at the standard's pole top, same frame and depth buffer as the flag,
so nothing jitters against the 3D standard under camera motion. Bars are
instanced quads; chip text goes through a glyph atlas the way campaign labels
already do (CampaignLabelPass, mapPass.ts:1130, layer 'raw-gpu-glyph-atlas').
Camera-FACING, not world-tilted: perspective comes from the world anchor and
distance scaling (with a legibility clamp near/far), never from tilting the
plate — a tilted bar is unreadable at grazing angles. Depth policy: readout
draws over soldiers but may be occluded by terrain, matching how the flag
reads in the reference shots.

`UnitBanner` (web/src/battle/unitBanner.ts) dies with this slice; its state
contract (BannerState: hp/cohesion/morale/stamina, chips, mine/selected)
carries over unchanged into the billboard instance data. Ownership and
selection contracts unchanged: bars = own units only, enemy shows flag +
event chips; selection glow lives on the 3D standard (slice 11).

**Verify:** the banner-gallery baseline (?test=banners) is REPLACED by a
renderer scene rendering the same representative state grid
(BANNER_GALLERY states: both teams, bar levels, chip kinds, selection)
through the real pipeline — engine-free DOM snapshotting is retired with the
DOM. Motion check: a short camera-pan capture confirming readout and standard
move as one rigid assembly (the DOM seam this slice exists to kill);
screenshot-critique last.
