# Fresh readout visual critique

## Scope and method

Inspected both full 768×512 images and nearest-neighbor tight3x crops for **chips, growth, shrink, restore, rotate, bright, behind**, in **samples-1 and samples-4**. Separately inspected source-before expected versus current expected for growth and shrink, at full size and 3x. No product source, prior report/judgment, trace, browser or GPU was consulted. All generated files are in this temporary directory; no tracked files were edited.

Visual target: characters should remain identifiable and contained within separate, contrasting chip backgrounds; placement should not produce collisions, truncated words, stale labels or unexplained actual-versus-expected omissions. Baseline equality alone is not a legibility verdict.

## Verdict

**No visible actual-versus-current-expected regression in these captures (confidence 0.99). Current growth and shrink expected images visibly differ from source-before and are substantially less wrong (confidence 0.99).** This is screenshot-only evidence, not certification of implementation correctness or runtime behavior.

Remaining usability reservation: **growth numbers are too small to read comfortably at native full-frame size** in both current actual and expected images, both sample settings (confidence 0.97). The 3x views expose heavily reduced, uneven numeric strokes, particularly the three-digit upper rows; enlargement helps identify many numbers but cannot recover crisp glyph detail. This is visible as tiny text in the full image and as damaged/ambiguous stroke detail in crops. It is not an actual-versus-expected discrepancy and does not negate the large before/current improvement.

## Case-by-case inspection

All observations below apply to both sample settings unless noted.

| Case | Full image | Tight3x detail | Confidence |
|---|---|---|---|
| chips | Seven visible chips in two separated groups. ROUTING above STEADY / TIRED; LONG WORDS / STEADY above x WIDE / A:B. Words are readable, though small and soft. No missing counterpart or overlap. | All glyphs fit; word space and colon remain identifiable. Padding is compact but present. Rounded/stepped corners and uneven border coverage are more apparent at 3x, especially samples-1. Soft raster edges, not visibly sliced or repeated letters. | 0.98 |
| growth | Regular, widely separated rows of numeric chips; no collision or visible frame-edge truncation. Numbers are very small, especially upper rows. | Numerals now form recognizable numbers rather than stripes. Some tiny strokes/counters merge or fade; three-digit labels are not reliably glance-readable. Backgrounds remain discrete black/dark-brown rectangles with orange or muted outlines. No missing chip relative to current expected. | 0.97 readability; 0.99 counterpart agreement |
| shrink | Exactly one visible red-bordered NEW chip; no leftover array or old word chips. | N, E and W are complete and contained, with dark fill and padding. Not striped or clipped. | 0.99 |
| restore | Same seven-chip arrangement as chips; no visible stale NEW or numeric array. | Same legibility, spacing and soft glyph edges as chips. No missing word/punctuation. | 0.99 |
| rotate | Groups shift and differ in size; all seven chips remain horizontal, readable and separated. No overlap. | Smaller ROUTING remains decipherable; larger right-hand words are easier to read. All text stays inside backgrounds. Thin outlines are uneven at samples-1; samples-4 softens corners but does not substantially sharpen letters. | 0.97 |
| bright | Ochre field replaces dark slate; black/dark chip fills keep pale words readable. No washed-out/missing labels. | Orange borders have less contrast against ochre than against slate, but dark fills preserve chip separation. No new clipping or spacing fault. | 0.98 |
| behind | Uniform dark slate in both actual and expected; no chips, ghost fragments or stray edges. | Blank crop corroborates absence, not legibility. A screenshot cannot establish whether hiding every chip is semantically correct. | 1.00 absence; no claim about intended culling |

Growth visibly has shorter first two rows (1–12 and 15–26) and subsequent wider rows. Numbers 0, 13, 14 and 27 are not visible. Without scene data or camera semantics, this is **not evidence of a missing-chip bug**: actual and current expected agree, and no visible chip touches the frame edge. The content bounds are x=7…760, y=130…315.

## Source-before versus current expected: real visible content change

- **Growth, both settings — full and crop, confidence 0.99:** Before contains vertical cream/brown streaks, partial rectangles and visually empty slots instead of readable numeric labels. Current contains complete dark chips with recognizable numeric strings across the grid. This is not merely a small antialiasing adjustment. Some previously blank-looking positions now visibly contain chips. Because the old labels are unreadable, their intended numeric values cannot be verified from images alone.
- **Shrink, both settings — full and crop, confidence 0.99:** Before is a small orange/cream, horizontally striped rectangle, not readable NEW text. Current is one coherent red-bordered, dark-filled NEW chip at the same location. The change is noticeable full-frame and unmistakable at 3x.

## Independently decoded metrics

Computed from PNG RGBA buffers using `web/node_modules/pngjs`, not existing report.json. Each full image has 393,216 pixels. A changed pixel means any RGBA channel differs. Grayscale metrics use Rec.709 weighted RGB values on the decoded bytes (not linear-light conversion).

| Comparison | samples-1 changed pixels | samples-4 changed pixels | Maximum channel delta |
|---|---:|---:|---:|
| Actual vs expected: chips, shrink, restore, bright, behind (each) | 0 | 0 | 0 |
| Actual vs expected: growth | 17 (0.00432%) | 17 (0.00432%) | 1 |
| Actual vs expected: rotate | 1 (0.000254%) | 1 (0.000254%) | 1 |
| Before vs current expected: growth | 12,155 (3.09118%) | 13,735 (3.49299%) | 225 |
| Before vs current expected: shrink | 528 (0.134277%) | 554 (0.140889%) | 184 |

The actual/expected differences are not visibly distinguishable, including in crops. Full-frame percentages understate the before/current changes because most pixels are empty background: shrink changes essentially its entire tiny chip footprint.

Detailed dimensions, foreground bounds, crop rectangles, RGBA MAE, grayscale MAE/RMSE, threshold ratios and difference bounds are saved in [metrics.json](metrics.json). Foreground means any pixel differing from the image's top-left background RGBA, not a semantic text mask; no OCR or intended chip-count inference was used.

## Artifacts and reading order

- `s{1,4}-{case}-full.png`: full images, **actual above expected**, 12-pixel gray separator. No resizing of source panels.
- `s{1,4}-{case}-tight3x.png`: matching content-union crops with four native pixels of padding, nearest-neighbor 3x; same order.
- `s{1,4}-{growth,shrink}-before-current-{full,tight3x}.png`: **source-before expected above current expected**.
- Growth's wide 3x sheet may be fitted down by viewers. Prefer the additional `growth-{left,center,right}-tight3x.png` panels for stroke inspection. Those regional cuts can cut a chip at an artificial crop boundary; that is not image clipping. Corresponding before/current regional panels are also saved.
- Behind has no text to crop; its 3x panel is a labeled-by-filename blank background sample, not a hidden text region.
- Reproducible decoding/crop script: [decode.cjs](decode.cjs).

Selected starting points: [chips s1](s1-chips-tight3x.png), [rotate s4](s4-rotate-tight3x.png), [bright s4](s4-bright-tight3x.png), [growth center s4](s4-growth-center-tight3x.png), [growth before/current s1](s1-growth-before-current-full.png), [shrink before/current s4](s4-shrink-before-current-tight3x.png).
