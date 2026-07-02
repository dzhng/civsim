---
name: codex
description: Use the local Codex CLI as an independent second agent. Two branches — (1) proactively run `codex review` for a second opinion after completing a substantive change, before presenting it as done or committing; (2) delegate a well-defined implementation task via `codex exec`, ONLY when the user explicitly asks for Codex to do it.
---

# Codex

Codex is an independent agent on PATH (`codex`), sharing this working tree and
already authenticated. It is a second opinion, not ground truth: verify what it
reports, own what it changes.

## Review — proactive

Run a Codex review whenever you have a substantive diff you'd want a second set
of eyes on — sim physics, balance, refactors, renderer work — before declaring
it done or committing. Skip it for trivial edits (typos, comments, doc-only).

1. Pick the diff scope: `codex review --uncommitted` for working-tree changes,
   `--base <branch>` for a branch diff, `--commit <sha>` for a landed commit.
   Scope flags and custom instructions are mutually exclusive (despite what
   `--help` implies): `codex review "<instructions>"` reviews the default
   scope with your framing, a scope flag takes no prompt. When you do write
   instructions, scope the risk area — never state the answer you expect
   (unprimed, same discipline as screenshot-critique).
2. Triage every finding: confirm it against the code before acting. Overlap
   with your own doubts is high-priority evidence; a finding you dismiss needs
   a stated reason, not silence.
3. Report the outcome to the user — what Codex flagged, what you fixed, what
   you dismissed and why. Done when every finding is either fixed or
   explicitly dismissed.

## Implementation — explicit ask only

Delegate implementation to Codex only when the user names Codex for the task.
Never hand it work on your own initiative, and never re-delegate follow-up
work without a fresh ask.

1. Make the task well-defined before delegating: goal, constraints, and how to
   verify. An underspecified task stays with you until it's sliced sharp
   enough that a fresh agent couldn't misread it.
2. Start from a clean tree (or record the baseline commit) so Codex's diff is
   separable from yours.
3. Run `codex exec --sandbox workspace-write "<task>"`; use
   `-o <file>` to capture the final message and background the call when the
   task is long. Non-interactive runs never ask for approval — the sandbox is
   the only control — so workspace-write already auto-executes shell commands,
   tests included. Network is off inside the sandbox; add
   `-c sandbox_workspace_write.network_access=true` only when the task must
   fetch (e.g. new deps).
4. Follow up with `codex exec resume <session-id> "<follow-up>"`, taking the
   id from the run header. `resume --last` means the most recent session
   globally — a review or any other codex run in between will hijack it.
5. You own the result: read the full diff, run the tests, and only then report
   it. "Codex says it's done" is not done.

## Rules

- Don't touch the working tree while a Codex exec is running on it.
- `--sandbox read-only` (the default) for consultation and questions;
  `workspace-write` only for delegated implementation.
- Never use the `--dangerously-bypass-*` flags. `--full-auto` is deprecated
  and is just an alias for workspace-write — don't reach for it.
- Omit model overrides unless the user asks for one.
