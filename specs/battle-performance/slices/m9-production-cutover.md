# M9 — one production battle renderer

Depends on M2 through M8. Selected backend: raw WebGPU.

Replace the production BattleRenderer constructor implementation with the selected complete world and its frontend presentation/lifecycle policy. Delete the old battle implementation and obsolete candidate selectors/adapters, not the shared camera/environment/asset owners. Sweep real renderer-lab/baker consumers before deletion; retained Three tooling must have a real owner and no production fallback. Keep saved gameplay unchanged and add no migration.

Run actual Menu benchmark plus normal battle/campaign entry, settings including High, asset reload, error/cancellation/disposal and emitted-runtime dependency checks. Prove exactly one live device/world per battle. Retire experiment backend unions and align memory/debug consumers with honest final counters. The standing30k floor and final live net-shadow/input-latency gates remain10; a clean switch is not final performance acceptance.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
