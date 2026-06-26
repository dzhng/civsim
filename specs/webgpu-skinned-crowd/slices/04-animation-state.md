# 04 — Animation State Contract

## Contract

The existing per-soldier `frames` protocol maps deterministically to clip,
phase, loop/hold, and death behavior.

## API Seam

- `packages/crowd-runtime/src/animationState.ts`
  - `animationForFrame(frame, tick, seed, alive): AnimationState`
  - no wall-clock reads.
- Clip names match the asset manifest:
  - `idle`, `march`, `run`, `attack_a`, `hit_a`, `death_a`, `at_ease`,
    later variants as assets arrive.

## Playable Deliverable

- `/webgpu/animation-state`
- Browser table showing each frame value, chosen clip, phase, loop flag, and
  visual placeholder pose.

## Verification

- Unit tests cover every current frame value: `0..10`.
- Frozen tick plus same seed returns identical output.
- Phase changes only when the deterministic tick/phase input changes.

## Must Stay Green

- Battle scene continues producing the same `frames` buffer.
- Vibe timelines remain on `?debug=blocks` and do not churn because art changed.

## Human Feedback

Review whether each tactical state reads as the intended animation before
skinning is implemented.
