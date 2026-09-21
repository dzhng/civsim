# Verification changes

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| Six existing native audience tests | Native owner directly planned and stored LOD history | Same assertions pass through the shared policy | One CPU history/grouping owner for all three runtimes |
| Camera-only refresh | Audience had no refresh command | Seven total raw cases include refresh without mesh/LOD/pose advancement | Match source render-only camera boundaries |
| Library composition/lifecycle | No combined mesh/full-catalog audience owner | Fourteen CPU cases exercise public adapter boundaries, publication failures and cleanup | Verify orchestration independently before joint GPU control |
| Vgpu main-camera override | Mesh received override; impostors captured constructor camera | Both populations receive the same camera; negative guard retained | Avoid inconsistent projection across LOD populations |

No numerical image tolerance moved. Existing GPU component evidence is historical; joint scene verification remains open.

The retained L3 snapshot guard initially failed at recycled x=77 rather than committed x=0; the snapshot restores placement and corpse weight. This is a native publication-lifetime guard, not a claim about arbitrary source mutations. Allocation cost is documented in the README.
