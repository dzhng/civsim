# M5 — grass integration

Depends on M1b and M2. Selected backend: raw WebGPU.

The promoted grass/grassField modules consume the current bounded residency owner. Preserve resident records, terrain/cover input, wind, far-grass coverage and visibility settings; sampling, pending/active generations and GPU routing retain their existing owners.

Reuse grass field/routing and complete-scene controls. Check camera reversals, cell crossings, cancellation/replacement and bounded resources. Record CPU commits/uploads and GPU work, inspect moving ground coverage. This joins04/05; relocation alone cannot close popping or cadence.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
