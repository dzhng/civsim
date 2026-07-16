# Slice 04 change ledger

| Test / gate | Previous behavior | New behavior | Why |
|---|---|---|---|
| `groundSurface.test.ui.ts` legacy-byte test | No slice-local guard for the bespoke ground buffer | Stride 10 and FNV hash `8e8938da` are pinned | The photoreal path must not mutate `GROUND_WGSL` bytes |
| Road classifier cases | Tint 6 was visually ambiguous between road and scree | Float32-safe tint/rough/speed thresholds admit road/bridge and reject scree/missing/nonfinite data | Roads feather; scree does not |
| Earth-distance kernel cases | No separate earth ownership field | RG8 union/road channels pin orientation, finite empty fields, packed hash, small islands, and a gap-free mud↔road seam | Prevent halos, flips, and accidental ownership loss |
| Churn/width cases | Churn derived from premixed color; no measured edge contract | Churn pins 1.75–4 m mud interior and feather pins 1–2 m with bounded displacement | Churn cannot leak into feather or road |
| `battle-ground-turf` edge scenes | Six open-meadow production/control shots only | Adds dirt close, road close, road+scree RTS, and meter-ruler shots with live RG8/width telemetry | Makes edge quality and classifier ownership directly reviewable |

No pre-existing expectation was weakened or re-pinned. The four edge snapshots are new;
campaign snapshots did not move.
