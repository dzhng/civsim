# Bounded CPU work audit

The current hardware run attributes phase time, not algorithm time. Observation
medians are 7.115/8.470 ms steady and 13.555/14.680 ms interrupted; upload and
preparation medians are 8.835/10.845 and 13.800/14.955 ms. They include multiple
owners, so neither number alone justifies replacing a data structure.

The real caller chain is `BattleCrowd.draw` → adapter observations →
`ActionTimeline.update/sample` → renderer `draw`/`drawInstances` → crowd upload →
palette preparation and bucket upload. The benchmark's `uploadMs` actually wraps
all of `PhotorealBattleWorld.drawInstances`: seating diagnostics, grass update,
camera/shadow preparation, culling, palette work and attribute preparation. It
must not be reported as pure GPU upload time.

## Priorities and dismissals

| Priority / disposition | Trigger and amplification | Owner / acceptance seam |
| --- | --- | --- |
| Small exact cleanup selected | Settled upper lanes resolve the same endpoint twice, unlike the existing settled-base path. A two-cycle CPU fixture trace reaches this in 45/1440 soldier samples, or 3.125%; a synchronized 30k frame in that state repeats 30k identical within-lane resolutions. This is modest average work, not the explanation for the full red envelope. | `PlaybackPacker.prepare`, tested through exact packed controls, decoded deformation and endpoint-read count. Identity only; no approximate phase or pose deduplication. |
| Profile before changing | Each moving observed body resolves walk/run nominal clips plus the chosen track: at least 90k clip searches per 30k observation, plus overlay tracks. The fixture has only six clips, so this is bounded and cheaply searchable. Per-appearance indexing may help, but needs evidence that lookup dominates and a clear replacement/mutation lifetime. | `ActionTimeline.update`, called by battle observation adapter and timed workload. Exact playback, rejected-batch atomicity, reset and appearance replacement are acceptance seams. No cache added. |
| Preserve atomicity | A normal observed body copies history and lane state before committing the batch; it then constructs the next history. Duplicate object construction is worth profiling, but careless in-place reuse can corrupt the retained prior state if a later soldier fails. | Timeline update's staged histories and frozen interruption capture. No pooling or alias change in this pass. |
| Profile diagnostic amplification | `buildCrowdInstances` already samples terrain to supply elevation. `drawInstances.updateSeating` samples terrain again for every body to compare its elevation, adding 30k samples per 30k frame for diagnostic stats. This is real duplicate sampling but its cost is not isolated by the hardware phase report. | World seating diagnostics; a future change must preserve the meaning and freshness of `stats().seating`, including deliberate mismatched-elevation fixtures. No telemetry omission here. |
| Required, bounded work | The measured frame has 30k palette recipients, 6113 main mesh instances and 30k shadow instances. Controls alone are 30k×20×4 = 2.4 MB per frame. Three packed vec4 instance attributes cover 36113 main/shadow records = 1,733,424 active bytes before driver/capacity effects. Camera, facing, death shade and positions may change; skipping them based on this static fixture would not preserve production behavior. | Crowd upload, palette upload and instance buckets. No dirty-state cache or omitted shadow/palette audience. |
| Do not revive rejected storage | LOD evaluates 30k bounds against the contributing frusta and emits main/shadow assignments, then audience packing shares each palette entry across views. The sphere is already reused, and storage grows with frame/crowd capacity rather than history. Earlier rejected caller-owned LOD storage is not reinstated. | `planPhotorealCrowdLods`, `queueCrowdInstance`, and `PosePalette.upload`; existing near-plane, audience and growth/recovery tests. |

No retry loop or unbounded history growth was found in these paths. Palette
allocation can prepare a second time after growth because a fresh generation
needs every live frozen source uploaded; ordinary frames prepare once. The
packer already interns frozen sources by exact identity and invalidates possible
overwrites after a failed/discarded submission. Those are recovery semantics,
not redundant work to delete.

Decision boundary: the selected change mirrors the existing base endpoint rule
inside the same packer. It makes no new asset-lifetime, caching, timing or quality
choice. Its measured incidence is too small to promise a cadence improvement;
no new hardware run is justified by counts alone.

## Selected fix and evidence

Four added production lines copy the encoded upper destination only when its
source is a clip and its sample is the very same object as the destination.
The source has already undergone normal interval resolution and validation.
Different endpoints, frozen sources, exiting-to-base overlays, snapshot
allocation and upload recovery retain their existing paths. No persistent
cache, new public API, phase approximation or generic helper was introduced.

The consumer test passed exact packed controls against a separate-endpoint
reference and decoded the expected 0.75 translation on both versions. Its
bounded-work assertion failed before the fix: the shared endpoint's phase was
read twice rather than once. Corrected code reads it once. The test uses a
stable-value getter as work instrumentation, not a substituted resolver.

The CPU trace uses the same mounted source/detail and current synchronized
schedule: three bodies, two cycles, four fractions per tick. Instrumentation
counts clip-array searches and predicate visits without changing their returned
values. [Before](packing-before.json) and [after](packing-after.json) preserve
counts and exact hashes of all prepared control bytes, uploaded snapshot bytes,
slots, and resident/high-water requirements. Both modes' hashes are identical.

| Trace | Observation searches / name comparisons | Packing searches / name comparisons before → after |
| --- | ---: | ---: |
| Steady, 1440 samples | 1080 / 3600 | 1440 / 4320 → unchanged |
| Interrupted, 1440 samples | 1167 / 4359 | 1839 / 7605 → 1794 / 7380 |

The 45 avoided resolutions are 2.45% of interrupted packing resolutions in this
trace. Timing fractions are not the hardware frame distribution; this is exact
work-count evidence, not a runtime speedup. The frozen hardware result stays red.
All 356 web tests and TypeScript pass. Independent Codex review 45028, session
`01a07f86-331b-78b1-a65c-70c2a943643e`, completed terminal 0, confirmed endpoint
preservation and independently passed all 15 packing tests. No GPU was used.

Shape review retains the existing packer owner, with four production lines and
one consumer test. Diff review preserves nonidentical/frozen/exit semantics;
docs link this audit from the measured-workload leaf. No threshold or existing
expected output moved. Root owns current slice07 handoff.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `settled upper endpoint is resolved once without changing packed controls`, `web/tests/playbackPacking.test.ts` | Exact controls and decoded translation pass, but shared endpoint is read twice | Same controls/translation; one endpoint read | Reuse already encoded words for the identical endpoint within the same submitted lane. **moved** |

The remaining decision gap is prioritization, not an implied authorization to
cache mutable appearance metadata or weaken atomic observation updates. A
targeted CPU profile separating seating, LOD, packing and timeline allocation
would determine which larger cost merits the next structural pass.
