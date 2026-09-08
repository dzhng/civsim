# Staggered mounted allocation failure

The existing budget scene now adds a mounted-only allocation phase after its
original timing, growth, frozen-repeat, advancing-interruption and replacement
phases. Its shared observation fixture is also exercised by the weighted-mesh
CPU test. Three interleaved cohorts begin walking on ticks 1, 3, 6, observe release
at 12 and running at 13. Each tick is one observation followed by a settled frame;
this phase does not measure cadence or replay missed ticks into one live frame.
No production behavior, device limits, source sharing or allocation policy changed.

The [hardware report](staggered-67-30k.json) records this command from the
isolated worktree served on 5198 (the repeat report is archived here):

```sh
BUDGET_FIXTURE=mounted BUDGET_SOLDIERS=30000 BUDGET_FRAMES=1 BUDGET_STOPS=close BUDGET_DETAIL='{"subdivisions":[3,1,0],"jointCopies":8,"influences":4,"keySubdivisions":2}' BUDGET_TEXTURE_SIZE=1024 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://localhost:5198 SCENARIO_REPORT_JSON=../throwaway/staggered-67-30k-repeat.json node web/scene.mjs battle-model-budget
```

This is an allocation diagnostic, not performance acceptance. All existing
timing rows remain enabled, but their single sampled frame misses the mounted
overlay in both interruption rows; those two failed coverage checks are retained.
The third failed check is the actual staggered allocation contract:

| Tick | Distinct frozen sources | Outcome |
| --- | --- | --- |
|12|30,000|All 30,000 bodies visible; 96,480,000 snapshot bytes uploaded.|
|13–16|60,000|`drawInstances` rejects 192,960,000 required bytes against 134,217,728 binding bytes; the whole crowd is suppressed.|
|17|30,000|All 30,000 bodies recover, with 96,480,000 new snapshot bytes uploaded.|
|23–24|0|All 30,000 bodies remain visible and CPU/GPU frozen references retire.|

The device reports 268,435,456 maximum buffer bytes and 134,217,728 maximum
storage-binding bytes. At the failing transition the controller owns 321,600,000
numeric snapshot bytes, excluding JS overhead. The prior 30,000-slot GPU bank
remains allocated; its retained residency must not be mistaken for successful
submission of the 60,000-source frame. No renderer warning or page error occurred.
These histories repeat six numerical poses across cohorts; the current bounded
exact-reuse memo nevertheless produces distinct retained identities in this
ordering. No claim is made that all 60,000 numerical poses differ.

The harness records each draw error with its stage and keeps observing later
ticks so recovery and retirement remain visible. It does not retry a failed
tick, cap sources, merge nearby poses or convert the failure into a passing gate.
25 focused fixture/packing/allocation tests and typecheck pass. The existing
fixture test's assertions are unchanged; its observation builder moved to the
shared scene fixture so the measured workload cannot drift from its CPU proof.
Independent parent review identified a possible empty-submission false positive.
The admission check now requires positive visible work, the pre-interruption
submitted count, and resident snapshots during interruption. The repeat records
a 30,000-body reference and the same staged failure and recovery. The installed
CLI/model mismatch still prevents the separate CLI review channel.
