# Canonical phalanx poses through a trial detail boundary

Paired frames show the unchanged near mesh on the left and the 4,012-triangle
candidate in the middle slot on the right. Rows are canonical pike-ready phase 0,
pike-thrust phase 0.4 and death phase 1. Each pose is fixed while the camera
reverses through canonical standing-height projected spans 68, 66, 64, 62, 60, 62, 64, 66, 68 pixels.
This is sampled camera motion, not playback through the animation clips.

Both variants use the same prototype catalog, whose near mesh, rig, animation and
materials are byte-identical to production. Baseline uses the current 18-pixel
near boundary; the isolated trial uses 64. The actual candidate admissions are
L0/L0/L0/L1/L1/L1/L1/L0/L0, including the existing hysteresis. No production
asset or policy changed. The trial affects shadow selection too; it does not
independently establish acceptable shadow quality.

All 54 captures repeat exactly while frozen, and all six return endpoints match
their starting PNG exactly. Every paired frame is captured through snapCheck.
The first probe failed because it reset static state each frame, clearing LOD
history; moving that reset to sequence start produced the intended real history.
No production fix was needed. Reports retain actual cameras, clips and admissions.

Root review inspected every frame in order and the enlarged crop. A fresh reviewer
finds no meaningful difference in silhouette, pose, shield, spear continuity or
ground placement. The candidate has lighter, busier chest markings during its L1
frames, especially in the thrust crop. This is a small native-scale tonal change;
subtle transition shimmer remains possible and is not resolved by these stills.
Both variants share long soft shadows and weaker fallen-body contact shading.
The looping GIF supports human inspection; it is not frame-cadence evidence.

The candidate remains promising, not accepted for production. Before broader art
work, verify the canonical contact fixture, count actual appearance/size demand,
and measure a bounded original/candidate diagnostic. The proposed mechanism is
an intermediate representation over a calibrated main-view size interval, not
replacing the highest-detail mesh at every zoom. The numerical boundary and its
shadow policy remain unselected. A useful result must show that enough soldiers
actually leave L0 and that frame cost falls; fewer asset triangles alone is not
an improvement to the game.

These are Chrome/Metal hardware diagnostic images at 1280×800, DPR 1, fixed light
and time, captured on this host. They do not replace canonical SwiftShader
baselines, full animation/roster coverage, the user's tactical framing, dense
formation transition review, or live performance acceptance.
