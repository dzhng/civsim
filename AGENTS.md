# Working in this repo

Read [`README.md`](README.md) first: what the game is, how the repo fits together, and how to run and check it. Active plans live with their specs, and each one says what to do next. If a folder you're working in has a readme, read it before continuing. The readmes are written for you.

These are the principles. Commands, flags and paths live with the code that owns them: the readmes, the manifests, and each tool's own usage text.

## Talking to the user

The user is very technical but doesn't read the code day to day. Pointing at code is fine; introduce a variable, function or module briefly the first time you mention it.

Lead with contracts. When work touches an interface between components (a simulation command, the layout the simulation worker publishes, a GPU buffer layout, fixture data, a module boundary), say what the contract looks like and how it changed before anything else.

Answer routine questions from the evidence. Ask the user only when the answer changes a decision that matters and can't be settled any other way.

## Proving a change

Optimize for iteration speed. The measure is the time to feedback you can trust, not the amount of process you ran.

Run the narrowest check that answers your question: one test, then one file, then one crate or scene. That is the proof for everyday work, including a commit, a merge and a push.

**Run everything once, when a spec's implementation is finished.** Running every test and every browser scene is slow and saturates the machine. Until then a change is checked by what it can move: its own tests, and the one or two scenes it touches. That is enough for a commit, a merge, a push and a finished feature. A failure that only the full run finds is fixed at the end; that is cheaper than gating every step.

A change that reaches the whole system (a rule every battle depends on, the frame every scene is drawn through) does not bring that run forward on its own. While more work is coming, the full run still waits for the end. Run it sooner only when the next piece of work can't be trusted without it.

Every expensive run must answer a question a cheaper one can't. The whole test suite, browser scenes, balance runs and the performance gates are the expensive runs here; do only the ones a change can move. Reuse a result that is still valid, and rerun only what a change could have invalidated. Docs and data that no code reads need no run at all.

Write the test first. Before changing behaviour or fixing a bug, invoke [`write-tests`](.agents/skills/write-tests/SKILL.md) and follow its red/green workflow. Test what the game does and how it fails, not how the code is shaped.

The simulation is deterministic. A change that shouldn't alter outcomes (a refactor, an optimization) must leave the simulation's state fingerprint unchanged, or be a named decision.

A browser check is only as current as the simulation build it loads. Rebuild it when it is absent or stale.

Run timing probes one at a time on a quiet machine. Concurrent builds and browsers invalidate the comparison.

Never loosen a requirement to make a check pass. A narrow pass proves a narrow claim: say what you verified, what you assumed and what is unfinished.

Don't wait on a long run. Start it in the background and keep working. Give it a visible sign of progress and a point where you stop, and never repeat a failure unchanged.

## What the player sees

Look at the picture. A passing check is not evidence that a battle looks real or that something reads well on screen.

For any visual change:
- get an unprimed second opinion with [`screenshot-critique`](.agents/skills/screenshot-critique/SKILL.md) before claiming it is accepted;
- judge before against after, and our shots against references, with [`compare-screenshots`](.agents/skills/compare-screenshots/SKILL.md);
- show the user with [`preview-shots`](.agents/skills/preview-shots/SKILL.md).

Before renderer work, load [`renderer`](.agents/skills/renderer/SKILL.md). The visual target is owned by [`aesthetics`](.agents/skills/aesthetics/SKILL.md).

Committed screenshot baselines are regression gates; change them only through [`screenshot-regression`](.agents/skills/screenshot-regression/SKILL.md). Transient evidence goes in the ignored scratch folder, never beside the baselines.

## Game rules

Formulas read the physical world: men, mass and measured motion, never banners, commanded state or classifier counts. A term that reads bookkeeping produces an effect out of proportion to what is happening on the field.

Units know only what they can see. A unit's behaviour reads of other units only what a soldier standing there could observe, and intent is inferred from motion or not at all. The AI commander obeys the same rule.

Watching is the ground truth for realism. A change to how bodies move or lay out is not done until it has been seen and pinned as a reproducible snapshot. When a tiny change in input flips a battle, remove the cliff in the logic; never hide the symptom.

Before proposing or changing a mechanic, invoke [`tweak-mechanics`](.agents/skills/tweak-mechanics/SKILL.md).

## One owner per concept

Use what the repo already chose before writing your own. Find the existing owner of a concept before creating another.

Before performance-sensitive vector, matrix, geometry, culling, noise, randomness or easing work in TypeScript, load [`math`](.agents/skills/math/SKILL.md). Don't create another math library beside the existing owners. Replacing a hot path needs a representative measurement, conversion costs included, and must preserve what its callers rely on: the projection convention, precision, deterministic random sequences and caller-owned lifetimes. A skill's advice is not a reason to change a contract or add an unmeasured dependency.

Prefer one general rule to a special case, and a simple structure to an abstraction nobody needs yet. When something replaces an old mechanism, delete the old one. When a change exposes a duplicate or a stale owner, invoke [`refactor-clean`](.agents/skills/refactor-clean/SKILL.md).

## Parallel work stays cheap

Every parallel checkout is a full copy, and assets, installed dependencies and build output multiply with each one.

- Share installed dependencies with the main checkout when they match. Don't install through the shared copy; that changes the main checkout's installation.
- Give each checkout its own build output. Checkouts whose sources differ overwrite each other's builds, and the symptom is an error from someone else's change.
- Remove a checkout and its build output when its branch is merged.

## Skills

Skills hold the procedures behind these principles. Load the one that covers your work before you start.

Before changing this file, invoke [`audit-agents`](.agents/skills/audit-agents/SKILL.md).
