---
name: screenshot-critique
description: Use the unprimed sub agent as a second set of eyes before accepting visual work.
---

# Screenshot Critique

Use an unprimed sub-agent as a second set of eyes before accepting visual work.
This is for visual defects, not pixel metrics; pair it with
`compare-screenshots` when you also need numbers.

## Workflow

1. Capture or locate the exact PNGs/GIF frames under review.
2. Spawn one fresh explorer with `fork_context: false`; pass only the images and
   a short neutral task. Do not include the main thread history, implementation
   details, or expected answer.
3. Ask for concrete visible defects with confidence levels. Name likely risk
   categories: layering, shadows, selection markers, labels, blur, scale,
   perspective, lighting, artifacts, missing models, and readability.
4. Compare the sub-agent's critique against your own inspection. Treat overlap
   as high-priority evidence. Treat novel high-confidence findings as bugs to
   inspect, not as taste notes to dismiss.
5. Record actionable findings in the spec, visual report, or next task plan
   before claiming the screenshot is accepted.

## Sub-Agent Prompt

Use this shape, replacing the bracketed surface and attaching local images:

```text
Fresh visual critique task. You have no project backstory and should only
inspect the supplied screenshots. Look for concrete visual/layout defects in
[surface], especially layering, shadows, selection rings, labels, blur, scale,
perspective, lighting, artifacts, missing models, and readability. Do not assume
these are correct. Return a concise list of issues you can see, with confidence.
```

Spawn config:

- `agent_type`: `explorer`
- `fork_context`: `false`
- attach screenshots as `local_image` items
- omit model overrides unless the user explicitly requests one

## Rules

- Never tell the sub-agent the defect you expect it to find.
- Use the current candidate screenshot, not a stale visual-report image.
- For animation, attach a short set of deterministic still frames first; GIFs
  are useful for human review, but still frames make specific defects easier to
  name.
- A passing sub-agent critique does not replace direct inspection by the main
  agent or screenshot regression gates.
- If the sub-agent catches an issue the main agent missed, add that failure mode
  to the relevant feature plan or visual checklist immediately.
