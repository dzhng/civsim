---
name: write-skills
description: Create or revise agent skills. Use when adding a new skill file, renaming a skill, simplifying an existing skill, improving trigger descriptions, or deciding what belongs in a skill versus references, scripts, assets, or ordinary docs.
---

# Write Skills

A skill is not documentation. It is compressed operational memory for an
agent that already knows how to code and reason. Put only the context that
changes what the agent will do.

## First Principles

1. **Trigger from the description.** The frontmatter `description` is the
   only part read before the skill loads. Say what the skill does and the
   concrete situations that should trigger it. Do not hide trigger rules in
   the body.

2. **Spend tokens like they are scarce.** Assume the agent is already good at
   general reasoning. Keep only non-obvious workflow, domain constraints,
   tool choices, failure modes, and validation rules. Delete background,
   motivation, and generic advice.

3. **Write procedures, not essays.** Prefer imperative rules, decision
   points, and small examples. A good skill changes behavior in the next
   turn; it does not merely explain the topic.

4. **Use progressive disclosure.** Keep the main skill file short. Put long
   schemas, examples, provider docs, or variant-specific guidance in directly
   linked `references/` files. Put repeatable fragile operations in
   `scripts/`. Put reusable output material in `assets/`.

5. **Validate by use.** A skill is good when a fresh agent applies it
   correctly on a realistic task. After editing, read it as if you had no
   conversation history and remove anything that would not affect action.

## Shape

Use this structure unless there is a strong reason not to:

```markdown
---
name: short-verb-phrase
description: What this does. Use when ...
---

# Skill Title

One short paragraph defining the job.

## Workflow

1. Do the first load-bearing thing.
2. Make the key decision.
3. Produce or verify the artifact.

## Rules

- Keep the constraints that prevent common mistakes.
- Link only the references that should be loaded conditionally.
```

## Edit Pass

When creating or revising a skill:

- Name it with lowercase hyphen-case; keep the folder name identical.
- Make the description specific enough to trigger without the body.
- Remove any "when to use" section from the body.
- Remove stale history, attribution, placeholders, and setup notes.
- Prefer one strong rule over several overlapping bullets.
- Keep examples tiny and realistic.
- Add no README, changelog, or auxiliary docs unless they are actual
  references the skill tells the agent when to read.
- Run the skill validator when available.

## Done

The skill is done when its metadata triggers correctly, its body is short
enough to read in one pass, and a fresh agent can follow it without asking
why the skill exists.
