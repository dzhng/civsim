# Slice 03B4C5C - atlas tile content and colour integration

## Contract

Fix reference-route atlas integration only after B4A, B4B1R, B4B1A, B4B2-B4B5,
B4C0-B4C3, B4D1-B4D4, and B4E prove that a grass representation has a fair lab
scale, can form visible close foreground body with a locked close palette/atlas,
can survive camera-relative generation and LOD collapse, and can return to
`battle-map-reference` through grass-only reference-crop compose. This slice owns
**reference-scale texture integration, opacity shape, tip/base colour carryover,
and tile silhouette repetition**.

Freeze:

- accepted close foreground lab scale, body technique, body coverage, strand
  scale, clump softness, and close palette/atlas lock from 03B4C5B4B1R, B4B1A,
  and B4B2-B4B5;
- accepted backend policy, camera-relative generation, and terrain response from
  03B4C5B4C0-B4C3;
- accepted LOD collapse from 03B4C5B4D1-B4D4;
- accepted grass-only reference crop compose from 03B4C5B4E;
- density budget and submitted triangle ceiling;
- meadow/root material, camera, terrain, fog, water, sky, crop windows, and
  reference target.

## Approach

Change only `generateGrassVolumeAtlas(...)` and texture-colour math needed to
preserve the B4B5 close-lab atlas at reference scale:

- remove repeated tile silhouettes and obvious branch/stroke motifs;
- tune alpha so mip/linear filtering reads as soft grass body, not confetti;
- keep darker seated bases and muted tips in the civsim Aegean palette;
- avoid broad palette shifts that hide density or distribution failures.

## Accept / Reject

Accept if the same accepted B4 close/reference grass stack now reads as soft
integrated grass texture rather than repeated yellow-olive cutouts.

Reject if the shot still depends on changing count, carrier/body profile, LOD
bands, camera-relative generation, meadow/root colour, fog, camera, or terrain.

## Verification

- Capture the close lab and `battle-map-reference-primitive-family`.
- Use `compare-screenshots` for close hero, transition, and mid-mass crops, with
  the accepted B4 artifacts as regression guards.
- Run unprimed `screenshot-critique` scoped to atlas repetition, colour
  integration, opacity, and texture artifacts.
- Keep route telemetry and existing green checks unchanged.

## Next Slice

If texture reads credibly but midground still needs tuning, continue with
`03b4c5d-midground-continuity-and-depth-falloff.md` only within the accepted
camera-relative LOD architecture.
