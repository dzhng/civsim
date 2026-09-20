# Aligned water comparison — ocean multisampling remains red

Candidate267949e8 plus root fog fix98692752 is not yet integrated. The original
comparison and its threshold remain unchanged. The aligned component is reported
separately. These are GPU correctness runs, not timing acceptance; owned CPU work
could overlap. All completed runs have no browser errors/warnings, zero tracked
water buffers after disposal and zero live candidate textures.

| Case | Original comparison | Aligned comparison |
| --- | --- | --- |
| Ocean1x | Same3/6 failures as before | 6/6 pass, peak .0009765625 |
| Lake1x | 6/6 pass | 6/6 pass, peak .0009765625 |
| Ocean4x | 6/6 fail, peak .040771484375 | Fails, peak .03466796875 |
| Lake4x | 6/6 pass | 6/6 pass, peak .0009765625 |

The [summary](summary.json) and compressed full reports carry every case. Ocean4x
is unresolved; geometry-probe success does not erase its image residual. No
threshold is relaxed and no full M3b visual exit is claimed.

## Falsification and review

Independent review found that NodeMaterial applies fog even after fragmentNode.
Root added a fog-disabled assertion to the existing probe test: it failed at
true versus false, then all13 tests passed with probe.fog=false. The earlier
color-mask proposal is already removed by the worker. The test now requires fog
as well as lighting to stay out of the coordinate readout. This is a lab-only
change; ordinary source/raw water rendering is unchanged.

With the fog fix, replacing displaced positionLocal with positionGeometry at
aligned clip output makes its coordinate movement exactly0 at all three camera
cases while the source remains nonzero. The aligned gate fails without GPU
errors. Independently perturbing raw roughness makes aligned beauty fail in all
six cases (peak .013671875), also without GPU errors. These mutations show the
probe detects dropped displacement and the aligned comparison still detects a
shading defect. Wrapped-coordinate magnitude is not a world-distance measure.

A fog-fixed browser launch was dispatched before build completion was observed;
that attempt is excluded, with its note retained in the runner archive. The
accepted run started after the build completed. Initial pre-fog reports remain
in main throwaway/ocean-aligned-hardware/pre-fog-fix for diagnostic history; they
are not the displacement-fidelity evidence above.
