# Shared crowd and labels on the merged world

Merged crowd controls reproduce all three snapshots exactly. The actual campaign
frame still supplies twelve figures; terrain replacement, visibility, overview
hiding, removal and recreation pass. Merged labels reproduce DPR1/DPR2 snapshots
exactly and retain glyph ink, card occupancy, terrain replacement, resize, fog
and single-canvas recreation. All509web tests and typechecking pass.

Integration review reuses a same-sized atlas texture when labels move. Resizing
still replaces and disposes it. The exact glyph captures prove unchanged output;
this reduces resource replacement without changing layout or claiming a measured
whole-game performance improvement.

The current raw campaign visual suite passes. The raw collision behavioral
checks pass, while its stored Roma snapshot differs. The matched pre-label raw pass reproduces the same failure and its actual
Roma image is byte-identical in decoded RGBA (zero changed pixels). This stored
baseline difference predates the label extraction. No raw baseline or
threshold is changed here.
