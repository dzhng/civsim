# Authored mesh detail needs projected-error calibration

The shared LOD policy selects L0 at 18 physical projected pixels, L1 at 9 and L2
at 4. These boundaries exist at history boundary c34ea56e, before the September
Blender heavy-kit work (f5a57d1b) and subsequent shared mesh reduction. No later
image-error calibration for the authored meshes was found.

Current heavy-sword assets contain 7,958 L0 triangles versus 982 in L1; the other
catalog entries are inventoried in `mesh-costs.json`. The current Three live run's
terminal snapshot reports 7,786 L0 main-view soldiers, nine L1 and no L2/L3. These
facts make calibrated detail selection a concrete candidate, not permission to
reduce quality or cap troops. Three's overall triangle statistic is aggregated
since its independent info reset across shadow/main/post work; do not call it a
verified beauty-pass triangle count.

Next compare L0/L1 at the same physical projected heights, fixed pose/light/time,
and actual viewing scale. Begin with sword, silhouette-sensitive spear/shield and
mounted assets, including ready/attack/death, then extend any proposed boundary
to every appearance and a camera-reversal sequence. Preserve silhouette, equipment,
shading and grounding. No production threshold is selected yet.

The existing `_mesh-lod-sheet` magnification trick is no longer a valid way to
hold a tier: current `battleWorld.render()` replans camera audiences. A calibration
must explicitly select its inspected representation in an isolated workbench or
magnify pixels from the actual admitted view. Do not silently inspect L0 twice or
re-bless the old sheet on that assumption. Production camera reprojection remains
required; an inspection technique cannot disable that behavior in gameplay.
