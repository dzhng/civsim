# Floor-width controls on the real source

The exact production TerrainField was exported using the browser canvas loader
in a blank CPU-only page. Measurements sample four fixed Alps/Italy transects;
coastal attenuation is excluded and only mountain envelope greater than two is
counted. Low floor means below the original transect's p25 height and directional
slope below 0.2. Connected intervals are one-dimensional, not proof of connected
valleys in a regional image.

Lower-fold compression was rejected before a visual implementation: it increases
low-height occupancy but its recovery to unchanged upper crests raises maximum
flank slope by 29–80%. Its peak mapping derivative is 2.28157. A peak-preserving
valley-fill alternative limits the derivative to 0.35–1 but reduces low-floor
occupancy, so it also fails the intended change. Lowering valleys and returning to
unchanged upper heights necessarily requires some derivative greater than one.

A simpler visual control remains eligible: reduce the existing mountain multiplier
from 2.5 to 2.0, retaining the ridge/saddle pattern and foothill term. Maximum slopes
fall 18–20%; longest gentle low intervals change from 11 to 31.75km, 4 to 5km,
17.25 to 19.75km and 5.5 to 22km across the four transects. This also lowers upper
mountain relief by 20%. It is a height-exaggeration control, not a new valley
structure, and must earn acceptance in unchanged regional and close production
views. No production candidate has been accepted from these numbers.

## Lower-amplitude visual verdict: rejected

All three control views repeated exactly on the accepted production build. The
2.0 multiplier candidate changed 933,696 Alps pixels, 464,710 Italy pixels and
944,403 close Alps pixels, with RGB mean absolute differences10.337,4.879,13.104.
The regional [candidate](lower-amplitude-alps.png) compared against the unchanged
[source-slope control](../source-slope-control/control/alps.png) shows a slightly
smoother southern apron but the same thick rounded rock fingers and dark trenches.
Root and unprimed review judge the overall result effectively equal and both
inadequate. Broad green interior valleys and varied ridge hierarchy remain absent;
reduced southern relief is a small tradeoff rather than the intended structure.
The candidate code is removed. Its16 focused tests passed, but no acceptance
repeat is needed for a rejected visual. Neither scalar valley remapping nor global
height reduction provides the missing internal structure.
