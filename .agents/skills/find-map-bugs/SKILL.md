---
name: find-map-bugs
description: Hunt campaign-map screenshots for visual bugs with fresh-eyes vision subagents — misplaced cities (markers/labels floating on water), sea-name labels sitting on land, missing or dead-end roads, jagged faction-color coastlines, detached or colliding labels. Takes a map screenshot (overview or regional) and returns a verified bug list with a centered, zoomed crop per bug. Use when the user reports map bugs from a screenshot, asks to audit/sweep the campaign map for placement or rendering defects, or after a map-rendering/data change that could move cities, roads, labels, or territory edges.
---

# Find Map Bugs

Turn one campaign-map screenshot into a verified list of visual bugs, each with
a crop centered on the defect. This is the heaviest screenshot skill in the
repo — spend agents freely: vision does the finding, tiling makes marker-size
defects visible, and every candidate gets its own agent that pans/zooms its
crop until the bug is centered, then rules on it adversarially. You
orchestrate — subagents look.

## Bug taxonomy (give this to every finder and judge)

- **city-on-water** — a city marker (square/house icon) or its name label
  sitting on open water instead of land. Waterline-adjacent ports are only bugs
  when the marker reads clearly offshore.
- **sea-label-on-land** — a sea/ocean name (italic engraved caps) whose glyphs
  sit over land instead of inside its body of water.
- **label-detached** — a city label far from any marker, or a bare marker with
  its label floating elsewhere (labels should hug their marker — compare
  neighbors).
- **road-missing** — a city (roofs/marker visible) with no road reaching it, on
  a shot zoomed enough that roads render for its neighbors.
- **road-dead-end** — a road that trails off into open terrain, connecting
  nothing on one end.
- **jagged-water-edge** — faction-color territory edge stair-stepping hard
  against the coastline (blocky aliased fringe in the water), vs the smooth
  drawn coast.
- **label-collision** — labels overlapping each other or unreadable against
  what's under them.
- **other** — anything else that reads broken to fresh eyes (describe it).

## Workflow

1. **Get the shot(s).** Use the screenshot the user gave (image-cache path or
   file). If asked to audit the live map instead, capture whole-map and 1–2
   regional shots first (the repo's campaign scenes / a playwright probe against
   a dev server you own); roads and edge quality need a regional zoom, city
   placement shows best at overview.
2. **Tile it.** `node <skill>/scripts/tile.mjs slice <shot> <workdir>/tiles`
   (3×3 with overlap by default; `--cols 4 --rows 3` for very wide shots).
   `manifest.json` maps each tile to its full-image offset.
3. **Fan out finders.** One subagent per tile, **launched in a single
   message**, model `opus`. Each prompt: fresh-eyes map-QA role, the tile's
   image path to Read, the full taxonomy, and a strict output contract — JSON
   array of `{type, desc, x, y, w, h, confidence}` in TILE pixel coordinates,
   empty array if clean. Tell finders: report what you SEE, never what you
   infer should exist; when unsure, include at low confidence (later passes
   filter). Completion: every tile has reported.
4. **Merge.** Convert tile bboxes to full-image coordinates via the manifest;
   dedupe overlapping-tile duplicates (same type, centers within ~60px → keep
   the higher confidence). Completion: every finder finding is either merged,
   deduped, or carried forward.
5. **Center & judge — one agent per candidate** (batch in one message), model
   `opus`, tools Bash + Read. Give it: the FULL shot path, the candidate's
   full-image bbox + type/desc, and the crop tool:
   `node <skill>/scripts/tile.mjs crop <shot> <out.png> <x> <y> <w> <h>
   [--margin N --scale K]`.
   Its loop: crop → Read the crop → if the claimed defect is off-center, cut
   off, or too small to judge, adjust x/y/w/h (pan, zoom in/out) and re-crop —
   up to ~4 rounds until the defect is centered and fills a good fraction of
   the frame. Then rule adversarially: "try to REFUTE the claim" —
   real/not-real + one-line reason, plus the final crop path and refined bbox.
   Completion: every candidate has a verdict AND a centered final crop.
6. **Report.** Write `<workdir>/bugs.md`: one line per CONFIRMED bug — type,
   description, refined bbox, crop path — plus a count of refuted candidates.
   Show the user the list and open or attach the centered crops.

## Rules

- Finders see ONE tile each; never hand the full overview to a single finder —
  marker-size defects vanish at that scale.
- Vision first: finding uses no repo data. Only AFTER verification, optionally
  cross-check city bugs against the map data + terrain probe
  (`campaign-map.json` node positions vs `terrainAt`) to tag each as data vs
  render vs label-placement — do this when the next step is a fix.
- Coastal false positives are the main noise source: a port at the waterline is
  correct; a marker surrounded by water on all sides is not. Encode that
  distinction in finder AND judge prompts.
- Sea-label checks cut both ways: the name must sit in ITS water — flag it on
  land, and flag it absent from a large named sea when other seas are labeled.
- Keep the workdir in scratch space; only crops attached to a real bug report
  or spec belong in the repo.
