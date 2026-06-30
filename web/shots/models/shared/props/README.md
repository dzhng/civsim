# Shared Props

Committed review baselines for reusable scenery props — trees, rocks,
mountains, carts, and other generic terrain dressing that both battle and
campaign place. These props are owned by one registry,
`packages/game-renderer/src/models/shared/sceneryPropRegistry.ts`: surfaces
place a prop by id and never re-declare the builder list, so the sheet here is
the single review evidence the campaign road and the battlefield both trust.

Regenerate after an intentional prop change:

```sh
npm --prefix web run shots:models:props
```

Each prop family is posed alone on neutral ground (no cities, labels, roads,
water, or fog) by the `shared-prop-models` scene. Campaign-specific
presentations — entities, terrain materials, water, fog, roads — stay under
`../../campaign/`.
