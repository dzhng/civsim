# Fixed native ABBA results — no production adoption

The predeclared12 invocations completed once, with two internal repeats each.
No owned build, test or GPU job overlapped timing. Host process snapshots retain
external activity; these are conditional results, not quiet-host certification.
Immutable executable hashes and workload identities match across every arm.

| Feature/thread mode | Controls, ms/tick | Candidates, ms/tick | Both candidates beat both controls |
| --- | --- | --- | --- |
| serial |14.676 /14.690 |15.103 /15.3235 |No |
| parallel, one thread |14.4285 /14.490 |14.3445 /14.423 |Yes, marginal |
| parallel, four threads |13.3155 /13.510 |11.3965 /11.3265 |Yes |

The four-thread candidate is approximately15.3% faster on the pair's averaged
means. The serial candidate is approximately3.6% slower. One-thread ranges nearly
touch; do not interpret its strict numeric pass as a robust effect size.

This fixture has15560 soldiers, first contact6846, measured window6906..7206,
all15560 soldiers alive throughout, minimum8 fighting, final hash
0x45dfbfdbd39da1b1. It is an early contact fixture, not the canonical intense Menu
window, not the same AI/initial commands/seed, and not a browser or GPU result.
The four-thread result supports native parallel preparation feasibility only.
It does not establish WASM worker-pool speed, the later battle cost or60fps.

Control c8580623 already includes unadopted serial counter/facing changes; comparison
against its matched feature builds isolates the new preparation. Neither this
candidate nor its predecessor is adopted into production. Production WASM remains
b42782f4. A future browser-parallel investigation needs a separately materialized
build/worker/COOP-COEP contract, canonical behavior hashes and actual browser timing.
No repeat to seek a better result is planned.
