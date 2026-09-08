# Campaign performance workload gate maintenance

This is a verification correction, not a campaign rendering change. The full-game
scene measures route liveness under a substantive workload; it does not certify
road-network completeness or hardware release budgets.

## Carried-in failure proof

At both `90bbdcaa` and `4db79c4d`, the campaign map, road geometry generator,
map-pass statistics owner, and full-game performance scene have identical Git
blobs. The generator sends only sea edges to `lineVertices`; roads use
`roadMeshVertices`. Fourteen sea polyline segments each produce twelve vertices
(outer and inner strips), and the line statistics owner divides by six:
`14 * 12 / 6 = 28`. Five sea lanes are present.

Executing `buildCampaignMapDrawData` against each revision's map confirms 168
line vertices / 28 reported line segments for both. The old `lineSegments > 1000`
predicate therefore fails independently of this material pass. This is source
and actual generator reproduction, not a claim of a baseline browser run.

Owners: `packages/game-renderer/src/campaign/roadGeometry.ts` routes the edge
geometry; `mapPass.ts` reports line segments; `web/src/campaign/renderer.ts`
uploads those lines and publishes road triangles separately.

## Choice and test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `full-game-rendering-performance`: campaign route workload | Required over 1,000 line segments; carried-in failure at 28 on both revisions | Requires over 1,000 road triangles and at least one sea-lane segment | Attach the broad thousand-primitive workload floor to its actual road-mesh owner; independently require the sea-lane renderer to be populated |

The thousand-triangle floor is a coarse workload admission condition, not tuned
to the measured triangle count. City density, production renderer identity,
world-depth contract, and finite performance measurements remain required.
No timeout, performance budget, snapshot, or production campaign code changed.

## Verification and review

From the isolated worktree at `4db79c4d`, Vite on port 5196:

```sh
VERIFY_URL=http://127.0.0.1:5196 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs full-game-rendering-performance
```

All seven checks passed, including menu, max-crowd battle, campaign, handoff,
report coverage, honest release classification, and no page errors. Campaign:
401 cities, 288,852 road triangles, 236 junction caps, 28 line segments, five
sea lanes. Chrome reported `apple / metal-3`; campaign sampled 60 frames with
16.665 ms median and 16.670 ms p95. The report correctly remains
`headless-liveness-only`, with release budget `not-set`.

Two setup attempts failed before campaign because the isolated Vite server had
cached a cross-worktree WASM symlink outside its serving allow list. Copying the
existing built WASM locally and restarting Vite resolved that environment issue;
no application fix was made.

Independent read-only Codex review (`CAMPAIGN-PERF-MAINTENANCE`, thread
`01a0750e-f0be-73d0-99de-5576101d4c4d`) returned no actionable findings. Local
shape/diff/docs review and `git diff --check` passed. The decision audit is the
explicit gate-owner choice above; no renderer ownership or gameplay choice was
introduced.
