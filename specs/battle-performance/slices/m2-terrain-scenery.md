# M2 — terrain and opaque scenery

Depends on M1b. Selected backend: raw WebGPU.

The promoted terrain, terrainScene, scenery and backdrop modules own terrain/scenery GPU resources; existing game-renderer terrain preparation and height policy remain shared. Keep static upload, atomic terrain replacement, environment inputs and reverse-Z world depth unchanged.

Reuse the raw terrain/complete-scene controls with raised terrain, sealed edges, horizon, scenery and replacement. Check picking/seating against the canonical surface and retained/disposed resources. Compare existing grounded crops; no new port is needed if relocation preserves these gates.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
