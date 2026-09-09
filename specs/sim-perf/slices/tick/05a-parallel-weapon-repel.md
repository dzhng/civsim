# tick/05a — native parallel weapon-repel search

**Status: retained.** The revised scheduler preserves identity and reduces the
measured developed-fight tick without the first trial's small-battle overhead.
The combined native budget and integration gates remain owned by tick/05.

## Contract

Each weapon bearer searches immutable body geometry. Searches may run
concurrently; forces still accumulate serially in original body order. One
search closure owns the default serial and native `parallel` paths, preserving
candidate traversal, repeated hash buckets, strict nearest-distance ties and
penetration arithmetic. No RNG moves and trace emission remains serial.

The optional native path reuses one result slot per body in the existing
weapon-repel scratch owner. A slot contains no neighbor or the chosen owner
and penetration. Indexed writes need neither sorting nor float reductions.
Default and wasm builds neither store those slots nor call Rayon. The native
path uses the global Rayon pool, with a minimum split length of 1024 bodies
to avoid fragmenting tiny searches into costly tasks. When existing extents
prove no unit can scan an enemy, the pass returns without changing outputs.

## Evidence

[Identity checks](../../assets/tick05a-repel-identity.json) preserve default
golden, parallel golden at 1/2/8 threads, all 230 duel fingerprints, all 19
AI checkpoints, and both developed 30k windows. Wasm32 with `parallel`
compiles through the serial path. Independent Codex review of the revision
found no actionable defects and reran default/eight-thread golden plus wasm
checks successfully. No tests or expected behavior were changed.

[The first scheduler trial](../../assets/tick05a-repel-first-timing.json) is
rejected: eight threads helped developed combat but took 51.9 seconds for the
small duel matrix against serial controls of 27.4/24.3 seconds. The no-work
exit and coarse scheduling address that cost without a second sim algorithm.

[The revised bounded comparison](../../assets/tick05a-repel-revised-timing.json)
ran with an exclusive CPU lane and load below the user-approved limit of 10
before and after every run. Each workload brackets the candidate with the
original serial executable; raw outputs, hashes and load observations are
preserved. Developed and idle entries contain two fixed windows per run.

| Workload | Original opening | Refactored default | Parallel, 8 threads | Original closing |
| --- | ---: | ---: | ---: | ---: |
| Developed 30k, ms/tick | 38.022 | 37.957 | 34.896 | 37.771 |
| Idle 15.5k, ms/tick | 4.501 | 4.409 | 4.410 | 4.506 |
| Small duel matrix, seconds | 24.2 | 24.0 | 24.0 | 24.2 |

The developed gain is 2.875–3.126 ms (7.6–8.2%) against both controls.
Small-battle overhead is resolved in this comparison; idle does not regress.
The user accepted a 35 ms target after this measurement; the measured
34.896 ms meets it without further optimization. This is the optional native
`parallel` feature using Rayon, not the default serial or browser build. The
integrating pass owns the final shipping-configuration check and full gates;
this result makes no browser performance claim.
