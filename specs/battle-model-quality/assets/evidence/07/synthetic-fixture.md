# Controlled synthetic asset costs

The [scene helper](../../../../../web/scenes/models/_synthetic-budget-fixture.ts)
changes geometry density, referenced palette joints, influence-address locality
and authored-time density independently. It clones the mounted diagnostic through
the existing temporal admission; it does not change the catalog or admit art.
Texture sweeps and actual hardware measurements belong to the budget scene.

Subdivision partitions existing flat surfaces rather than layering duplicate
triangles. Equivalent sibling joints preserve motion and hierarchy depth while
increasing palette work; every added joint has nonzero mesh references. A fixed
expanded rig supports one-versus-four influences. The production shader already
reads all four slots, so this comparison cannot claim reduced instruction count.
Inserted keys preserve authored intervals and STEP boundaries, not a new fixed
sampling rate. Far geometry, materials and framing bounds remain fixed.

## Numerical evidence

`./node_modules/.bin/vitest run tests/syntheticBudgetFixture.test.ts
tests/mountedTemporalFixture.test.ts` from `web/` passes all ten tests.
`bun run --cwd web typecheck` passes with the feature worktree's existing WASM
and dependency directories linked locally for verification only.

The [tests](../../../../../web/tests/syntheticBudgetFixture.test.ts) compare actual
CPU-posed surfaces during real controller replay, including upper-body composition
and interruption/death transitions. They do not establish GPU timing or visual
acceptance. No production code, asset, shader or existing test changed.

## Change ledger

Every row adds coverage previously absent; no prior expectation moved.

| New check | Behavior pinned | Why |
| --- | --- | --- |
| Subdivision | Posed area, winding, plane containment and normals survive; other tiers stay fixed. | More triangles must not add overdraw or change the subject. |
| Referenced bones | Added joints are used; replayed posed surfaces agree. | Empty padding would measure a different workload. |
| Influence count | Fixed skeleton/topology and equivalent composed motion with distinct weighted addresses. | Isolate address locality from animation changes. |
| Authored-key density | Original values, STEP discontinuities and fractional motion survive rebaking. | Storage cost must not change playback semantics. |
| Combined mutation | Seed remains unchanged; unsupported requests reject. | Rows must not contaminate each other. |
| Wide indices | Dense geometry retains valid indices above65535. | A larger fixture must not silently wrap triangles. |

Shape/diff/docs review kept the mutations in one scene-owned helper and reused
the existing sampler, bake and controller admission. Integration still owns its
independent review and hardware use; this evidence is not a budget verdict.
