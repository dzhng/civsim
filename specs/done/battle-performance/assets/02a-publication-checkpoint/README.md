# Resolved grass publication checkpoint

The actual menu source with the shared production residency owner was captured
through 38.632 seconds of its camera tour, then replayed from 185 lossless public
command batches and revision-addressed binary grass records. Source simulation,
settlement and camera timing were not overridden. Capture overhead is not a
performance measurement.

All four canonical 2880×1800 origin/pan endpoint images have zero differing RGB
pixels. All 22 selected camera records, visible/shadow crowd histograms, crowd
instance counts and actual Three active-layer record hashes match. Actual GPU
indirect commands also match at all four endpoints: every readback copy is queued
at its presentation boundary before awaiting mapping. Intermediate image parity
is not claimed. Browser page errors were empty.

The sixteen pan frames span the start of a real focus-ring rebuild. Source becomes
pending at pan frame 10 and remains pending through frame 15; replay preserves that
state instead of publishing its own sampler result early. Recorded residency
statistics are replay inputs, not independent evidence. GPU commands, active
record hashes and pixels are independent checks. This window does not cover the
later completion of that pending generation; that and zoom/horizon windows remain
required before 02a is complete.

The initial base/ring records total 101,867,008raw bytes; their base64 expansion
alone exceeds 128 MiB. Revisions therefore live in separate 4 MiB binary gzip chunks,
with exact byte hashes and small references in presentation packets. Source capture
reserves retained raw inputs plus one worker compression output, releases chunks
only after disk acknowledgment, and never discards a presentation. It peaked at
126,963,252bytes under 128 MiB. All 185 packets were acknowledged; final queue was empty.
The recorded binary payload and endpoint copies were charged 361,409,485 bytes
under the 1 GiB cap (excluding the small JSON reports in this captured run).
The driver now also charges report writes and reserves 64 KiB for failure evidence. Full-resolution images and the large archive remain locally at
`../02a-spool-publication-budget/`; this directory retains manifests, gates and
image hashes. Replay-only mode can reuse that archive without battle preparation.

The Vite substitution is confined to the residency import in Three's grass adapter.
The provider imports the real owner without recursion and forwards all live calls.
Only correctness replay supplies recorded publications to the existing consumer.
Native live candidates retain actual shared sampling work; native correctness
consumers receive the same hydrated Float32 records and routing/transition state.
