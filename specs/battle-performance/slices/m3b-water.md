# M3b — water

Depends on M2 and M3a. Selected backend: raw WebGPU.

The promoted water module owns GPU drawing while existing battleWaterGeometry and wave/shore policies own its inputs. Retain terrain-aligned height, translucency/depth behavior and environment-driven color.

Reuse water and complete-scene controls at the raised shoreline/horizon, with fixed wave time. Check no changed surface placement or transparency ordering. Inspect matched water crops and update/disposal behavior; no new port if inherited controls pass.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
