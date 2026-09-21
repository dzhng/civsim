# Test changes

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Road surface width through steep/replaced terrain (`campaignGeographicLayer.test.ts`) | Newly added regression measured 2.96184065 for intended 1.10000002 before the fix. | Width stays within 0.00005 of its source width across three planes; center and perpendicularity stay fixed; repeat seating does not shrink it. | Width is measured in the local terrain plane. **moved** |
| Junction caps through terrain replacement | No explicit surface-radius regression. | Every center-led cap triangle preserves its source radius across three planes, without pinning the builder's triangle count. | Caps need the same local-distance meaning as ribbons. **moved** |
| Full fog refresh before regional seating | New implementation queued only range 0..281 despite a full CPU visibility update. | Empty upload ranges request the full fog buffer; every fog value remains 1. | Partial road ranges could truncate a pending full visibility upload. **your-regression** |
| Full fog refresh after regional seating | The same partial range survived the later full refresh. | Full fog buffer upload survives either order. | Same interaction in the actual frame's usual order. **your-regression** |
| Geography scene camera readiness | Alps capture began at frame 48/revision 16 and ended at revision 23; hidden capture progressed to 32. Exact restoration failed before road changes. | Requested-camera frame precedes readiness; settled visible/hidden/restored captures all remain at revision 32 and restore exactly. | Prior readiness belonged to the previous camera. No pixel tolerance relaxed. **moved** |

The existing four geographic tests retain their assertions; their fixture adds
the required road-anchor input and the plane helper retains its previous default
slopes. Full frontend suite: 1,064 tests passed; typecheck passed. No simulation
stats, thresholds, physical terrain, map routes or save schema changed.

Canonical geography screenshots last changed at 84ff3e4b. Subsequent accepted
source rock exposure 5c21f672, bitmap/landform lighting 45f22efb and saddles 99a97b52
predate this road pass. `geography-delta.json` separates that stored-to-control
drift from the small current-control-to-road-candidate delta. The Alps readiness
correction also excludes partially admitted terrain from the accepted frame.
