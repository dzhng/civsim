# Current simulation contact cost

A fresh Node process runs the current production WASM with the canonical map,
seed, AI side and opening orders. It prepares through tick9000 and measures
308 one-tick calls. Both arms match the pinned start/end hashes and preserve the
binary hash. [Provenance](provenance.json) records the artifacts and limitations.

The [uninstrumented control](kernel-control.json) averages 28.02ms per call with
31.37ms p95. The separate [sampled arm](kernel-profile.json) averages 27.15ms;
that difference is run variation, not an optimization. Neither run includes the
renderer, browser scheduling, publication copy or later heavier combat. A short
initial-contact window cannot establish sustained 30Hz.

The [symbolized samples](kernel-symbol-summary.json) attribute 91.08% of self
sample time to `Battle::tick`, which includes inlined stages. Export refresh
accounts for 0.14%. This prioritizes deeper tick attribution over optimizing the
export loop for this window, without identifying any individual tick stage.
[Raw samples](contact.cpuprofile.gz) remain available for audit.

Production strips names. Re-running its original release artifact through the
same wasm-bindgen version and optimizer while retaining names produced identical
bytes in **every non-custom section**. Only this verified matching symbol table
was used; old-build function indices were not reused.

Next diagnostic: provide exact canonical initialization to the existing native
stage profiler, prove its checkpoint hashes before interpreting results, and
separately time later contact. Existing native numeric/fighting modes use different
seeds, openings or AI sides and cannot answer this question unchanged. Native stage
timing is diagnostic; the final throughput verdict remains the live browser.
