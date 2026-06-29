# Battle Effects And Corpses

## Contract

Battle impacts read as events: dust/blood on hit, projectiles that look like 3D
arrows in flight, and corpses that are visually distinct from the living instead
of a one-shot death pose. This is fidelity polish on top of parity, not a release
blocker.

## Why

Lower-severity gaps from the gap review (legacy lacked most of these too — this
is improvement, not regression recovery):

- Only projectile lines exist; the effects array holds line segments only
  (`scene.ts:764-776`). No dust, blood, muzzle/impact. Blood is static sprite art
  (`atlas.ts:298-303`).
- Projectiles render as a 2D line-list (`effectLinePass.ts:59`,
  `scene.ts:767-776`) — no 3D arrows, spin, or trails.
- Corpses: `crowdPass.ts:62-64` sets `FRAME_FALLEN`, plays `death_a` once
  (`animationState.ts:38-40`); no fade/tilt/material change. `deathVariant`
  (seed%3) is dead code — never enters `CrowdInstance` (`instanceData.ts:21`) or
  the GPU.

## API Seam

- New battle effects pass (or extend `BattleEffectLinePass`) for short-lived
  GPU particles: impact dust, blood puffs, driven by the existing effects/event
  stream from `scene.ts`.
- Projectiles: a small instanced 3D arrow mesh + orientation along velocity,
  replacing/augmenting the 2D line representation.
- Corpses: wire `deathVariant` into `CrowdInstance` and the skinned shader;
  apply settle/tilt and a desaturated/darkened material so fallen soldiers read
  as corpses, with variety across the field.

## Human Review

A battle vibe: arrows arc as 3D shafts and land; impacts kick dust/blood; the
field of fallen reads as varied corpses, not a frozen identical pose. Compare
against the battle aesthetics north star.

## Verification

- Battle vibe baseline frames re-blessed once, with a change-ledger entry.
- Particle-budget probe: effects stay within the battle frame budget at peak
  (cap particle count; log if capped).
- `deathVariant` reaches the GPU (no longer dead code) and produces visible
  variety.

## What Must Stay Green

- Frame budget at peak combat (particles are capped and culled).
- Sim/balance unchanged; effects are cosmetic and event-driven.

## Feedback That Would Change This Slice

- How much gore/dust fits the aesthetic (restrained vs. dramatic).
- Whether 3D projectiles are worth it now or the 2D lines are acceptable (this
  slice is explicitly polish and can be deferred without blocking cutover).
