# Exact single-body friend recording

Targeting visits each hashed bucket at most once. A foot soldier contributes
one body, so its owner cannot already be in the friendly record set when
that body is visited. Horses contribute two bodies and retain the original
owner lookup and nearest-body replacement. Record ordering, capacity,
priority ties and all bearing/distance calculations remain unchanged.

The developed profile identified targeting as the largest cost; operation
counts showed over 36 million friendly-record attempts in 300 ticks. The
first timing trials were inconclusive under high load and their prototype
was removed. The [partial historical data](../../assets/friend-trial-inconclusive.txt)
proves neither a speedup nor a slowdown.

After David revised the load condition to below 10, a fresh bounded
comparison qualified. Two controls averaged 39.837 and 40.001 ms; two
candidate runs averaged 38.368 and 39.585 ms. Each run contains two fresh
300-tick developed windows. All hashes match. The mean difference is about
0.94 ms (2.4%); whole-run user CPU time improved by about 1%, including
preparation. This is a modest measured benefit, not the 25 ms budget result.
[Complete qualifying comparison](../../assets/friend-trial-under10.txt)
retains every sample summary and load observation.

The code is retained. Golden, existing friend-recording tests, duel hashes
and the 9,000-tick AI hash pass; independent static review found no defects.
The rebuilt-wasm timeline is byte-identical to the original reference;
see [visual evidence](../../assets/visual-comparison.md). Integrated workspace
verification is still running. No other targeting prototype ships and no
stored state is added.
