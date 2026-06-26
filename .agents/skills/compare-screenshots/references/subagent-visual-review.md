# Subagent Visual Review

Use this when history or prior conclusions could bias the main agent's visual
judgment.

## Spawn Config

- `agent_type`: `default`
- `fork_context`: `false`
- Attach the two screenshots as `local_image` items.
- Label images neutrally: `Image A`, `Image B`, or `Reference`, `Candidate`.
- Do not tell the subagent which image is WebGPU, current renderer, expected,
  accepted, failed, better, or worse.

## Prompt

```text
You are doing an unbiased visual parity review of two screenshots for the same game scene. You have no prior context.

Compare Image A and Image B. Report:

1. Whether they appear to be the same camera/scene content.
2. Major visible differences in camera angle, terrain, props/trees/rocks, city markers, army marker, road/labels/UI.
3. Which image is more complete/readable as a game scene and why.
4. A concise verdict on whether one is close to parity with the other.

Do not assume either image is the desired target; judge only from visible pixels.
```

## How To Use The Result

- Treat the subagent result as independent evidence, not a replacement for
  metrics or your own inspection.
- If the subagent flags wrong camera or missing content, fix capture/rendering
  parity before accepting any lower pixel score.
- Quote the subagent verdict in the working notes when it changes or confirms
  the next implementation target.
