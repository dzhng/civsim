# Slice 4 — Static wave: army builder + battle modals

## Contract unlocked
The quick-battle army builder (`mountQuickBattleSetup`) and the in-battle modals (pause/result/
field-manual overlays) are React, driven by local component state — the first surface where
React **earns its keep** (forms, validation, derived totals), not just a refactor. This is the
"army builder is a better fit for React" thesis, shipped.

## API seam
- `web/src/ui/menu/ArmyBuilder.tsx` — `<ArmyBuilder classSpecs onConfirm={(armyConfig)=>…} />`.
  Per-side roster, per-class counts, point/size totals, validation → `useReducer`. The output
  `armyConfig` shape handed to battle start is **unchanged** — the seam to `main.ts`/sim is the
  same object the vanilla builder produced. Replace `mountQuickBattleSetup` at its call site.
- `web/src/ui/battle/Modals.tsx` — pause, battle-result, field-manual as React, mounted into
  `#ui-root` by `BattleScene`, fed by the ≤5 Hz external store (battle phase, result payload).
  Esc/resume handlers become React.
- Consumes S2's `<Menu>` modal shells; consumes the `menu-modals` baseline added in S2.

## What a human can run / see
Open quick-battle, build both armies (counts, totals, validation errors on empty/over-cap),
start the battle, pause it, fight to a result, read the field manual — all React, bronze, with
working form state and live totals.

## Verification
- **`menu-modals` baseline** (added S2) re-blessed as a **reviewed** change (the builder markup
  legitimately reflows) — never a blind `UPDATE_SHOTS=1`. Add a `battle-modals` snap (pause +
  result) if none exists.
- **Behavioral:** a `node --test` (or harness) asserting `ArmyBuilder`'s reducer produces the
  **same `armyConfig`** for a fixed sequence of clicks that the vanilla builder produced — the
  contract is the output object, prove it byte-for-byte.
- `tsc`/`build` green; deep-link `?battle=…` still boots straight into a battle (bypasses the
  builder).
- **compare-screenshots** the React builder/modals against the archived vanilla shots
  ("no worse"), then an unprimed **screenshot-critique** as the last check, then
  **preview-shots**.

## Must stay green
Battle start from the builder output; `?battle=` deep links; the menu (S2); the HUD (whichever
S3/S6 path); GPU-off disabling.

## Human review checkpoint (non-blocking)
David builds an army and starts a fight in `npm run dev`, confirms totals/validation feel right
and the bronze look held. Silent ~5 min + compare-screenshots "no worse" + the reducer test
green → accept, record, close Preview, proceed.

## What feedback would change this slice
If David wants the army builder UX itself redesigned (not just ported), that's **new feature
work** — this slice ports the existing behavior 1:1 into React; a redesign gets its own spec so
the port stays a clean, measurable refactor.
