# Honest grass content and camera motion in the standing gate

The standing hardware gate passes with its 33 ms timing threshold and content
floors intact:30,560 soldiers,585 scenery objects and 992,334 accepted static
grass records. Static sampling still has capacity 1,000,000 with no stratified
budget. Active focus reports 653,895 accepted records, separately from padded
slot windows and its 640×1,600 capacity. Resident coverage is explicitly checked.

The previous gate confused active focus sampling with the static base sample
and assumed the focus pool had exactly one million slots. The owner now exposes
baseSample and focusSample alongside its existing active sampler summary.
A regression test fails before that addition and passes through focus engagement,
movement and off-map padding. Rendering and density are unchanged by telemetry.

Camera coverage also needed correction. The old 24/28 dial requests both clamped
to the same 10 m view after intentional overzoom removal in 3d5362cb. The gate now
requests 20 m and 10 m distances through the normal camera API and compares the
submitted physical pose. It retains the broad mid stop. The overview pan was
clamped stationary; pan now uses a 160 m tactical distance, verifies 200 m of actual
travel and its submitted endpoint. The sweep must reach 10 m and return to its
starting distance. Hardware loops finish their elapsed duration regardless of
refresh rate, and the wheel phase must deliver all 30 events.

The final report records a 200 m pan in 3027 ms (rAF p 95:18.80 ms), a 3200→10→3200 m
sweep in 3085 ms (p 95:23.85 ms), and a wheel p 95 of 25.40 ms. Every existing timing
limit remains 33 ms; every existing soldier/scenery/accepted-grass floor remains.
The new checks strengthen actual movement and accepted-content verification.
`report.json.gz` is the unmodified final scenario report. The two screenshots
show its static crowd/terrain load; they are not motion or live-fight evidence.

27 focused grass tests and the web TypeScript check pass. Independent review
found no weakened floor or introduced defect; a final camera review confirmed the
rendered travel and endpoint checks. This is the paused-simulation standing gate,
not the five-minute live benchmark, a 60 FPS claim, or backend ranking evidence.

## Test change ledger

- Standing grass accounting: previously read whichever sampler was active and
  accepted only 1M/2M aggregate caps; now checks the immutable base sampling budget
  and declared focus slots separately. Padded slots cannot satisfy content floors.
- Close camera stops: previously both requests settled at the same clamped view;
  now distinct 20 m/10 m views must actually reach the renderer.
- Pan/sweep/wheel: previously fixed frame counts could stop early, the overview
  pan could be clamped, and wheel bounds used an unrelated dial ceiling. Now
  actual travel, duration, endpoint, event count and normalized rig bounds are
  checked. The timing thresholds are unchanged.
