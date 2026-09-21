# Carried-red lifecycle tests restored

Root reproduced five failures from the missing reproject mock. The fixture now
returns false for its unchanged camera demand, allowing the original assertions
to run. No production behavior or assertion changed. The pose test title now
states that unchanged-demand condition. All14 tests across5 TypeGPU files pass;
independent review found no actionable regression and passed the5 lifecycle tests.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| failed staged terrain replacement retains the previously prepared scene | Fails in setup before assertions | Original lifecycle assertions pass | Mock now implements the real reproject contract for unchanged demand |
| a dependent failure after terrain commit cannot present mixed generations | Fails in setup before assertions | Original lifecycle assertions pass | Mock now implements the real reproject contract for unchanged demand |
| disposal during an awaited UI upload prevents late readout allocation | Fails in setup before assertions | Original lifecycle assertions pass | Mock now implements the real reproject contract for unchanged demand |
| every update submits pose once; unchanged camera demand and repeat presentation submit none | Fails in setup before assertions | Original lifecycle assertions pass | Mock now implements the real reproject contract for unchanged demand |
| pending crowd upload rejects overlapping updates and disposal prevents late pose submission | Fails in setup before assertions | Original lifecycle assertions pass | Mock now implements the real reproject contract for unchanged demand |
