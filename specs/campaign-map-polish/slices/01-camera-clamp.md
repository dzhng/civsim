# 01 — Camera clamp: never see off the map

**Contract unlocked:** at every zoom/pitch/aspect ratio the campaign camera's
frustum stays inside the map — no black off-map corners (feedback #1, top-left/
top-right black wedges at full zoom-out). Foundation shots are then captured in a
clean frame.

## API seam
- `web/src/campaign/renderer.ts` `clampCam()` (≈148-172). `minZoom = fillZoom`
  today; `fillZoom` divides height by `cosP` (pitch foreshortening) — that
  corrects the frame *center*, not the tilted trapezoid's **top corners**, which
  still overreach the map edge at max zoom-out. Raise the non-controlled `minZoom`
  floor by the frustum-top overreach of the tilted trapezoid. Do **not** fix this
  by clamping pan harder — the pan hard-clamp (169-170) must stay as-is.
- **Refactor-clean:** the zoom ceiling `8` is duplicated at `scene.ts:501` and
  `renderer.ts:161` — extract to one exported constant (single owner, invariant 7).

## What the human can see
- Full zoom-out overview with no black corners, at multiple aspect ratios.

## Verification (mechanical gate — not the human checkpoint)
- New addressable scene `campaign-frame` with snaps `frame-zoomout-wide` (16:9),
  `frame-zoomout-tall` (4:3 / 21:9). Assert the four corner regions sample
  terrain/sea, never the clear-color.
- **Slice variable / crop:** the four corner regions of the max-zoom-out frame
  only. Out of scope: palette brightness (slice 02), any label/marker.
- Run **screenshot-critique** on the zoom-out shot (last check): confirm no black.
- **compare-screenshots** vs feedback #1 (`assets/feedback/01-...png`) to confirm
  the black wedges are gone.

## Stay green
- `campaign-lod`, `campaign-map-alignment` (controlled-stage pan/zoom feel must
  not move). The controlled-stage camera branch is untouched.

## Feedback that would change this slice
- If David wants to *keep* a thin cloud/parchment vignette framing the edge at max
  zoom-out (rather than hard terrain-to-edge), the floor target changes — ask/note
  at the frame shot.
