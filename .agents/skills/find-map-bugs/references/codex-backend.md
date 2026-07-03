# Running the vision passes on the Codex CLI

When the user asks for Codex as the vision backend, replace each Agent-tool
vision call with a `codex exec` call carrying the image. The orchestrator keeps
doing the cropping — Codex only looks and answers.

## Invocation

```
codex exec --sandbox read-only --skip-git-repo-check \
  "<finder/judge prompt>" -i <image.png> -o <out.txt> < /dev/null
```

- **`-i` is variadic and greedy**: a prompt placed after `-i <img>` is silently
  consumed as another image path and the run proceeds promptless. Put the
  prompt BEFORE the flags (or after `--`). This is the #1 silent failure.
- `--skip-git-repo-check` is required outside a trusted repo dir (scratch
  workdirs).
- Always redirect stdin (`< /dev/null`) and background with staggered starts;
  collect the `-o` files.
- Codex read-only cannot run the crop tool: in the center-and-judge loop, YOU
  crop, Codex judges the crop image and answers "centered? real/not-real?
  adjust x/y/w/h by how much" — then you re-crop. Same ≤4-round loop.
- A finder occasionally hangs at startup: no `-o` file after ~3 min → kill and
  retry once (reliably recovers).
