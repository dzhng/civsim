# Reject the 2k formation shading transition

A 64-soldier formation uses canonical ready and thrust poses while the camera
reverses through 44/40/36/32/28/32/36/40/44 standing-height projected pixels.
Original near geometry is left; the 2k prototype with a trial 32-pixel near boundary
is right. All soldiers remain admitted, real hysteresis is retained, frozen
captures repeat exactly and starting/return endpoint PNGs match exactly.

Root inspects every frame and the enlarged crop. Fresh review identifies a
native-visible formation-wide lightening at the smallest view and on the first
return frame: the right loses dark blue shield/body separation and becomes more
gold/brown and noisy. No troop/equipment silhouette or grounding loss is found.
This is sufficient to **reject adoption of this candidate at this boundary**,
despite acceptable single-soldier silhouettes and animation deformation.

The stronger 4k candidate is inspected separately. A scratch normal-preservation
experiment may test whether shading transfer can improve 2k; material colors are
not retuned to hide the discrepancy. Neither candidate changes production yet.
These are fixed-pose sampled camera reversals, not real-time cadence evidence;
Chrome/Metal 1280×800, DPR 1 diagnostics do not replace canonical baselines.
