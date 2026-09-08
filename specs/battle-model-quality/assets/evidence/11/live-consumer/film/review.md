# Matched live start/contact film

This is presentation integration on the existing diagnostic class0 catalog,
not final soldier-art, collision, foot-plant or sword-contact approval. The
frozen A/B sources and environment are those in [held review](../held/review.md).
No simulation, source pose, renderer clock or threshold changes were made.

The unchanged scene (`d1094a9d…`) captures64 start and64 contact frames per arm,
each16ms through the real paused/unpaused production clock. Start ticks4004–4034:
move command at frame8, reform at40 after observed travel. Contact ticks6978–7008:
actual engagement is present in52 samples, first at frame6. Same camera/viewport,
asset/WASM and authoritative inputs. Standard visibility is not claimed in this
subject framing; it is separately covered by the centroid held check.

## Gates and comparison

- A49292 first film and A49742 repeat exited0: all128 repeat snapshots exact0px.
- B38374 first film exited0. B47903 repeat exited1 on40 contact snapshots;
  all behavior/framing gates and page-error checks passed. No baseline UPDATE.
- [Paired traces and exact pixel metrics](metrics.json) show no mismatch in
  tick/clock/index/alive, authoritative endpoints, formation, commands, engagement
  or target state across all128 A/B pairs. Every paired PNG differs.
- On33 adjacent same-tick transitions in each sequence, A root moves0 times,
  B33 times. This is observed removal of tick-held roots, not exact stride/root
  equality through arbitrary collisions or proof of self-propulsion.
- [All40 repeat failures](repeat-diff.json) are the same11 exactRGBA pixels,
  max channel delta1, within `[62,565,70,590]` in the static lower-left HUD
  portrait. Shared checker reports8 pixels per failed frame. **World and all
  other image pixels are exact** for these pairs; do not call the full repeat
  green. The cause of the portrait variation is not yet established.

The portrait is the existing `HudPanel.tsx` static `img.hud-port`, supplied by
`cardThumbUrl`, not a live animated canvas. Main inspected both5× crops; there
is no discernible geometry/quality difference. That observation alone does not
authorize a tolerance or baseline change.

### Bounded portrait provenance check

One approved read-only retry (`9988`, terminal1) captured contact18/22/23/24/63:
18/22/23 matched exactly;24/63 retained the same portrait failure. The wrapper
changed no image source, style or clock. [DOM provenance](portrait-dom.json)
covers all64 contact frames, and [runner report](b-portrait-probe.json) retains
both failures. Source/natural dimensions/complete state, and image/head/panel/body
rectangles plus recorded computed styles each had **one unique value** throughout;
before/after every screenshot was identical. Natural image200×184, displayed
border box `[28,540.5,60,56]`; panel `[12,520.5,314,267.5]`. Both arms' static PNG
SHA256 is `106ffb2e0237d773e013a2a540a87508af0d7d9226bf8bf8bbaf40f94c0afa3e`.
The meta text updates, but it does not move/resize/restyle the portrait or panel.
This falsifies the proposed changing-layout/source explanation. Stable
half-pixel placement and static image resampling/compositing precision remain
possible causes, not a demonstrated causal mechanism. No further retry,
threshold change or baseline update is justified by this check.

Parent authorized the fixed body-motion region `[400,140,512,500]`, above the
bottom HUD, and banked its restricted acceptance boundary in slice 11 and choices.
The existing scene now names its moving snapshots `body-motion-region-*` and
passes an exact crop buffer to the same shared checker. All 256 original full
images are preserved here under `full-A/` and `full-B/`, together with red reports.
[Seed provenance](body-region-seed.json) records the new targets created by exact
cropping those originals through `snapCheck`, not by UPDATE. The frozen source
and production clock are unchanged. Normal A capture 71598 and B capture 82440
both exited 0, with 389 checks and all 128 body-region images at exactly zero
pixels per arm. [Result and complete-trace controls](body-region-result.json)
also show exact trace equality against each original full-frame film. Reports:
[A](a-body-region.json), [B](b-body-region.json). No UPDATE was used. This is
not a full-frame/HUD repeatability claim and no existing default gate or
tolerance changed. These frozen-base controls do not claim validation of later
upstream/main changes that root merged during the study.

A [CPU pixel mutant](body-region-mutant.json) replaced an 8×8 foreground patch
inside one region buffer: the unchanged shared checker rejected all 64 pixels
at zero tolerance (terminal 1). Baseline SHA256 remained identical before and
after. This checks the narrowed gate still detects a body-region change; it is
not a production-renderer mutation or new visual-quality evidence.

## Whole chronology review

Main inspected all16 numbered sheets, all256 panels in sequence, plus full
first/last context images and selected full middle frames. Start shows nearly
rigid figures translating, with limited readable leg excursion; no missing
central body or obvious ring detachment. Contact body/arc groups shift more
gradually in B, but overlapping opaque soldiers and translucent combat overlays
obscure precise contact. Overlay appearances/disappearances are discrete and
remain visibly coarse. The candidate is provisionally less wrong for contact
continuity, not a demonstrated complete natural-motion result.

[Fresh neutral critique](fresh-review.txt), session
`01a07ff7-de0c-7b21-a539-185be1faac50` / terminal28559, inspected28 PNGs:
all256 chronological panels and12 full contexts. Verdict: **B slightly less
wrong, low-to-moderate confidence**, especially contact10→14 and37→40 versus
A's sharper transitions. Start/stop remains indeterminate; shared stiff/gliding
motion, ring overlap and overlay occlusion limit the finding. No clear missing
central body, detached ring or orphaned overlay. Parent independently inspected
all 256 chronological panels and retained the live presentation direction:
modestly smoother contact, no detached rings, shared stiff/gliding start remains
indeterminate. This does not accept soldier art. HUD repeat variation stays open
outside the explicitly narrowed body-region gate.

## Artifacts and reproduction

Sheets `{A,B}-{start,contact}-{0..3}.png` each contain16 consecutive512px crops,
numbered0–63. Crop bounds are `[400,140,512,512]`; full originals remain under
`full-A/` and `full-B/`. B's retired full/probe shot files were moved recoverably
to ignored `throwaway/live-consumer-capture/retired-shots/`, so they cannot be
confused with the new committed region gates. Four whole context frames per
sequence are copied here. GIFs use2-centisecond delay (50fps), so they are
slightly slower than the captured16ms schedule and player-dependent. MP4s use
exact125/2fps,64 frames,1.024s, with the same crops. Neither derivative replaces
the full-resolution pixel gates.

From each arm's `web/`, choose port5463 or5464 and a distinct report name:

```sh
SNAP=start-,contact- VERIFY_GPU=1 VERIFY_URL=http://localhost:5464 SCENARIO_REPORT_JSON=../throwaway/live-consumer-capture/b-film-repeat.json node scene.mjs battle-delayed-root-phase
```

Ignored CPU derivative commands: `node throwaway/live-consumer-capture/prepare-film.mjs`,
`film-metrics.mjs`, and `repeat-diff.mjs` in the same directory. Movies:

```sh
ffmpeg -v error -n -framerate 125/2 -i web/shots/battle/delayed-root-phase/contact-%03d.png -frames:v 64 -vf crop=512:512:400:140 -c:v libx264 -crf 18 -pix_fmt yuv420p -an B-contact.mp4
```

The current normal body-region command is:

```sh
SNAP=body-motion-region VERIFY_GPU=1 VERIFY_URL=http://localhost:5464 SCENARIO_REPORT_JSON=../throwaway/live-consumer-capture/b-body-region.json node scene.mjs battle-delayed-root-phase
```

Captured scene SHA256 is `423b1d58065745f12c14b6ee497624d98aa16d2873713894552b8d9f2e64a28f`
in both arms. The repository pre-commit formatter changes only layout/trailing
commas, producing committed SHA256
`b81cfd465d440120ac3696cfe838ea9965abe096efac32e1e27a554ecba6076a`.
Independent TypeScript parsing confirms identical ordered AST node kinds,
identifiers and literal values (normalized AST SHA256
`8be258026503e570fcd5944091589a1ab4272ebb34ac95a430faddb95d12a68e`).
The earlier full-frame command above describes the archived
`d1094a9d…` capture boundary; it must not be mistaken for current HUD coverage.

No scratch script is a new product capture owner. The single scene continues
to use shared `ctx.snap` with threshold0/maxDiffRatio0.

## Preview checkpoint

One confirmed Preview window showed B-contact.gif followed by A-contact.gif
from 2026-09-08 08:28:07 UTC until 08:33:21 UTC. The owned window was closed
after the five-minute nonblocking interval. No feedback arrived in this lane;
silence is not user approval. The retained disposition is root's independent
whole-chronology review plus the fresh critique and scoped gates, not final art
or full-HUD acceptance. The GIF timing limitation above was disclosed.
