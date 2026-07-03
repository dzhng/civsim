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

- **city-on-water** — a city marker or its name label sitting on open water
  instead of land. Waterline-adjacent ports are only bugs when the marker reads
  clearly offshore.
- **sea-label-on-land** — a sea/ocean name whose glyphs sit over land instead
  of inside its body of water.
- **label-detached** — a city label far from any marker, or a bare marker with
  its label floating elsewhere (labels should hug their marker — compare
  neighbors).
- **road-missing** — a city with no road reaching it, on a shot zoomed enough
  that roads render for its neighbors.
- **road-dead-end** — a road that trails off into open terrain, connecting
  nothing on one end.
- **jagged-water-edge** — faction-color territory edge stair-stepping hard
  against the coastline (blocky aliased fringe in the water), vs the smooth
  drawn coast.
- **label-collision** — labels overlapping each other or unreadable against
  what's under them.
- **other** — anything else that reads broken to fresh eyes (describe it; the
  judge will hold it to the derived legend).

## Workflow

1. **Get the shot(s).** Use the screenshot the user gave (image-cache path or
   file). If asked to audit the live map instead, capture whole-map and 1–2
   regional shots first (the repo's campaign scenes / a playwright probe against
   a dev server you own); roads and edge quality need a regional zoom, city
   placement shows best at overview.
2. **Derive the legend from the code — never from memory.** Spawn one recon
   subagent to read the current campaign rendering/UI code (the label emitter,
   marker/icon passes, map-card components, faction/allegiance color rules,
   sea-label styling) and return a compact legend: every element class that can
   appear on the map, its visual signature (shape, icon, casing, color source),
   and what CORRECT placement/appearance means for it. The legend must let a
   stranger distinguish, e.g., a city label from an army marker from a
   decoration, and say which colors are faction-owned vs status-owned.
   Completion: every on-map element class is described with its signature and
   correctness rule, each grounded in code the agent actually read. Do not
   hardcode a legend in prompts from memory — the map's vocabulary changes;
   the code is the source of truth.
   **The legend describes, it never excuses.** It says what elements look like
   and where they belong — it must NOT carry "the code renders X this way on
   purpose, so X is fine." Whether a visible artifact is acceptable is the
   HUMAN's call: a judge may refute a claim only by showing the pixels don't
   show it or the element is a different class than claimed. "Intentional per
   the code" is not a refutation — such findings ship, tagged
   `intended-by-code`, for the human to rule on.
3. **Tile it.** `node <skill>/scripts/tile.mjs slice <shot> <workdir>/tiles`
   (3×3 with overlap by default; `--cols 4 --rows 3` for very wide shots).
   `manifest.json` maps each tile to its full-image offset.
4. **Fan out finders.** One subagent per tile, **launched in a single
   message**, model `opus`. Each prompt: fresh-eyes map-QA role, the tile's
   image path to Read, the taxonomy, AND the derived legend. Strict output
   contract — JSON array of `{type, desc, x, y, w, h, confidence}` in TILE
   pixel coordinates, empty array if clean. Tell finders: sweep, don't skim —
   walk EVERY label and EVERY marker in the tile and check each against the
   legend's correctness rule (a blatant offshore label is missed when the eye
   only scans for anomalies); for EVERY city, check a road reaches it whenever
   neighboring cities show roads — and when the tile's edge cuts off the
   context needed to tell, report the city as a LOW-confidence road-missing
   candidate rather than staying silent (the judge resolves it on the full
   shot); then scan coastlines and territory edges;
   report what you SEE, never what you infer should exist; when unsure,
   include at low confidence (later passes filter). Completion: every tile has
   reported, and each report states how many labels/markers/cities it checked.
5. **Merge.** Convert tile bboxes to full-image coordinates via the manifest;
   dedupe overlapping-tile duplicates (same type, centers within ~60px → keep
   the higher confidence). Completion: every finder finding is either merged,
   deduped, or carried forward.
6. **Center & judge — one agent per candidate** (batch in one message), model
   `opus`, tools Bash + Read. Give it: the FULL shot path, the candidate's
   full-image bbox + type/desc, the derived legend, and the crop tool:
   `node <skill>/scripts/tile.mjs crop <shot> <out.png> <x> <y> <w> <h>
   [--margin N --scale K]`.
   Its loop: crop → Read the crop → if the claimed defect is off-center, cut
   off, or too small to judge, adjust x/y/w/h (pan, zoom in/out) and re-crop —
   up to ~4 rounds. **An off-center final crop is a failed loop, not a
   shippable finding.** Then rule adversarially — and the verdict must verify
   EVERY ELEMENT of the claim against pixels, using the legend:
   - "water on all sides" → trace the marker's footprint; any rendered land
     contact refutes that wording (it may still be a waterline case — say so).
   - element identity → classify the marker/label per the legend before ruling
     (a city label mistaken for an army marker, or vice versa, is a wrong
     verdict in either direction: don't ship it, don't explain it away).
   - `other`-type claims (seams, artifacts) → must rule out the legitimate
     feature the legend suggests (e.g. a political border) or downgrade to
     "suspected, unproven".
   - road-missing claims → pan the FULL shot around the city (roads may enter
     from outside the finder's tile) and trace every approach before ruling;
     confirm only when no road reaches the city while comparable neighbors
     have them.
   Completion: every candidate has a verdict whose stated evidence covers each
   claim element, AND a centered final crop.
7. **Report.** Write `<workdir>/bugs.md`: one line per CONFIRMED bug — type,
   description, refined bbox, crop path — plus a count of refuted candidates.
   Show the user the list and open or attach the centered crops.

## Rules

- Finders see ONE tile each; never hand the full overview to a single finder —
  marker-size defects vanish at that scale.
- Vision first: finding uses no repo data beyond the derived legend. Only
  AFTER verification, optionally cross-check city bugs against the map data +
  terrain probe to tag each as data vs render vs label-placement — do this
  when the next step is a fix.
- Coastal calls fail in both directions: a port at the waterline is correct
  (don't ship it), and a marker/label genuinely surrounded by water is a bug
  (don't explain it away as some other element — check the legend). Encode
  both directions in finder AND judge prompts.
- Sea-label checks cut both ways: the name must sit in ITS water — flag it on
  land, and flag it absent from a large named sea when other seas are labeled.
- Keep the workdir in scratch space; only crops attached to a real bug report
  or spec belong in the repo.
- Vision backend is the Agent tool (`opus`) by default. If asked to run the
  vision passes on the Codex CLI instead, read
  [references/codex-backend.md](references/codex-backend.md) first — its
  invocation quirks silently eat prompts.
