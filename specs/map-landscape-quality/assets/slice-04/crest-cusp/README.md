# Equal-height crest cusp: rejected before rendering

One CPU control replaced only the dominant ridge profile with
`max(0, 0.95 * (1 - abs(n)))`, still squared. Its analytical maximum remains
0.95, preserving the source envelope, dominant wavelength, saddle, small fold,
foothill and coast formula. This addressed rounded crests without the increased
prominence that amplified walls in an earlier control. Production is unchanged.

The real-source 240 km window and 120 km core use the existing 0.5 km diagnostic
lattice, 0.005 km derivative separation and Float32 2 km triangle approximation.
Both fields use the current control's p25 height cutoffs and slope below0.2 for
gentle-low connectivity; those cutoffs differ from the older omit28 report.
Coast attenuation is not exercised (`inland=Infinity`).

[Metrics](metrics.json) show only a small gain in the largest core gentle patch
(65.75→67 km²), more components (37→42), and worse tail interpolation error
(p99 0.401→0.578; maximum0.862→1.915 render km). The
[worst samples](worst-samples.json) cluster on the intended sharp crest. At
(-475,1001), the candidate field reaches46.047 but its triangle reaches44.132.
The 2 km mesh truncates the new off-vertex cusp; a 0.5 km probe cannot establish
its exact extrema either. Window slope extremes also increase.

Reject this profile at current sampling. These measurements do not establish
visual quality, but they contradict the desired readable crest improvement at
the actual mesh scale. Do not spend another visual or parameter sweep on this
same cusp. The outstanding requirement remains a legible ridge-to-valley
hierarchy with broad foothills, not merely a sharper analytical function.
