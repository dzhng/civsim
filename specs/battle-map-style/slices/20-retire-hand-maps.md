# 20 — Retire the hand maps (David-gated)

The three hand-painted maps become curated recipes; the legacy seams close.

## Contract unlocked

One map source. The `BATTLE_RELIEF_EXAGGERATION` split and the legacy
horizon-blocker path — both named as short-lived seams — are deleted.

## API seam

- `maps.rs` map bodies replaced by curated recipes reproducing each
  archetype's *character* (river-east, walled-west, coastal) — not its bytes.
  `MapId` survives as names over recipes; wasm `load_map(u32)` keeps working.
- Delete: the 1.6 exaggeration branch (everything renders true meters), the
  hand-map horizon-blocker path (slice 14's owner covers all maps), and any
  remaining tuft-era plumbing.

## The named cost

**Golden re-bless.** Replacing hand-map `speed`/`rough` changes sim goldens
and every battle baseline. This is a deliberate, David-approved event —
scheduled last so it happens exactly once.

## Human can run

The same three menu entries — now generated — plus battles on each.

## Verification

- Per-archetype compare-screenshots: new vs old map at the vista camera —
  less-wrong verdict on character preservation (river still east, wall still
  west…).
- Full cargo + scenario + balance suites re-pinned deliberately (see the
  change-report skill for the ledger David expects).
- Certificates green on the three curated recipes; elevation tripwire;
  perf:30k.

## Precondition

Slices 17 + 18 accepted, and **David explicitly approves the re-bless**. This
slice is optional to the spec's success — the spec can close with hand maps
alive as legacy.

## Feedback that would change it

David may prefer keeping the hand maps forever as "classic" entries — then
this slice archives unbuilt, and only the exaggeration/blocker cleanup runs
for generated maps.
