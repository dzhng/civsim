// @vitest-environment node
import { beforeAll, expect, test } from "vitest";
import initWasm, { Game } from "../src/wasm/game_wasm.js";
import { readFile } from "node:fs/promises";
import { BattleActionAdapter } from "../src/battle/battleActionAdapter";
import {
  battleObservationMetadata,
  createLiveObservationSource,
  createBattleViews,
} from "../src/battle/battleViews";
import {
  layoutPublication,
  newLayoutScratch,
  publicationBytes,
  publicationFieldIndex,
} from "../src/battle/sim/publicationLayout";
import {
  NO_PUBLICATION_OVERLAYS,
  publicationCounts,
  readQueuedOrders,
  writePublication,
} from "../src/battle/sim/publicationProducer";
import { HeldPublication, PUBLISHED_FIELD } from "../src/battle/sim/publicationReader";
import { PublishedBattleRecords } from "../src/battle/sim/publishedRecords";
import type { PublicationHeader } from "../src/battle/sim/protocol";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";

let wasm: Awaited<ReturnType<typeof initWasm>>;
beforeAll(async () => {
  wasm = await initWasm({
    module_or_path: await readFile(new URL("../src/wasm/game_wasm_bg.wasm", import.meta.url)),
  });
});

const scratch = newLayoutScratch();

function publish(
  game: Game,
  tick: number,
  overlays = NO_PUBLICATION_OVERLAYS,
): { header: PublicationHeader; buffer: ArrayBuffer } {
  const counts = publicationCounts(game, overlays);
  const bytes = layoutPublication(counts, scratch.offsets, scratch.lengths);
  const buffer = new ArrayBuffer(bytes);
  writePublication(game, wasm.memory, buffer, counts, scratch, overlays);
  return {
    header: {
      tick,
      counts,
      bytes,
      victor: game.victor(),
      stateHash: game.state_hash().toString(),
      completedAtMs: 0,
      postedAtMs: 0,
      tickMs: 0,
      copyMs: 0,
      acks: [],
      droppedCatchupTicks: 0,
      starvedMs: 0,
      scriptId: null,
      scriptCancelled: false,
      preparing: false,
    },
    buffer,
  };
}

test("the adapter derives identical observations from a publication and from the live Game", () => {
  const live = new Game(91);
  try {
    // Archers loosing at infantry that closes and reaches them, so releases,
    // deaths and melee all move inside the window; a still parade would prove
    // nothing about the transitions.
    live.spawn_class(-30, 0, 0, 24, 6, 4, 0);
    live.spawn_class(40, 0, Math.PI, 24, 6, 0, 1);
    live.set_fire_at_will(0, 1);
    live.set_attack_order(1, 0);
    const held = new HeldPublication();
    const records = new PublishedBattleRecords(
      battleObservationMetadata(live.class_specs(), live.loosing_duration()),
    );
    const published = new BattleActionAdapter(records);
    const direct = new BattleActionAdapter(createLiveObservationSource(live, wasm.memory));
    const views = createBattleViews(live, wasm.memory);
    const marks = { releasing: 0, fighting: 0, dead: 0 };
    for (let tick = 1; tick <= 1500; tick++) {
      live.advance_ticks(1);
      const { header, buffer } = publish(live, tick);
      held.adopt(header, buffer);
      records.absorb(held, header);
      const fromPublication = published.read(tick);
      const fromGame = direct.read(tick);
      expect(fromPublication.observations).toEqual(fromGame.observations);
      expect(Array.from(fromPublication.facings)).toEqual(Array.from(fromGame.facings));
      expect(Array.from(held.f32(PUBLISHED_FIELD.positions))).toEqual(
        Array.from(views.positions()),
      );
      expect(Array.from(held.f32(PUBLISHED_FIELD.unitInfo))).toEqual(Array.from(views.unitInfo()));
      expect(held.counts.projectiles).toBe(live.projectile_count());
      for (const observation of fromPublication.observations) {
        if (observation.releaseTtl > 0) marks.releasing++;
        if (observation.fighting) marks.fighting++;
        if (!observation.alive) marks.dead++;
      }
      held.release();
      // The records outlive the buffer: the battle reads them after the producer
      // already has its storage back.
      expect(published.read(tick).observations).toEqual(fromGame.observations);
    }
    expect(marks.releasing, "archers loosed inside the window").toBeGreaterThan(0);
    expect(marks.fighting, "men traded blows inside the window").toBeGreaterThan(0);
    expect(marks.dead, "men died inside the window").toBeGreaterThan(0);
  } finally {
    live.free();
  }
});

test("a returned publication leaves the consumer holding nothing it can still read", () => {
  const game = new Game(12);
  try {
    game.spawn_class(0, 0, 0, 4, 2, 0, 0);
    const held = new HeldPublication();
    const { header, buffer } = publish(game, 0);
    held.adopt(header, buffer);
    expect(held.held).toBe(true);
    expect(held.release()).toBe(buffer);
    expect(held.held).toBe(false);
    expect(() => held.f32(PUBLISHED_FIELD.positions)).toThrow(/no snapshot is held/);
    expect(() => held.counts).toThrow(/no publication is held/);
  } finally {
    game.free();
  }
});

test("overlay records are published only when asked for, and match the tick they ride on", () => {
  const game = new Game(44);
  try {
    game.spawn_class(0, 0, 0, 12, 4, 0, 0);
    game.spawn_class(60, 0, Math.PI, 12, 4, 0, 1);
    game.enqueue(0, 0, 30, 10, 0, 0);
    game.enqueue(0, 0, 40, 20, 0, 0);
    game.advance_ticks(5);

    const bare = publish(game, 5);
    expect(bare.header.counts.queuedUnits).toBe(0);
    expect(bare.header.counts.queuedWaypoints).toBe(0);
    expect(bare.header.counts.previewPlacements).toBe(0);

    const queued = readQueuedOrders(game);
    const preview = game.formation_preview(new Uint32Array([0]), -10, -10, 10, -10);
    const withOverlays = publish(game, 5, {
      queuedIndex: queued.index,
      queuedOrders: queued.orders,
      formationPreview: preview,
    });
    expect(withOverlays.header.counts.queuedUnits).toBe(game.unit_count());
    expect(withOverlays.header.counts.queuedWaypoints).toBe(queued.orders.length / 3);
    expect(withOverlays.header.counts.previewPlacements).toBe(preview.length / 7);
    expect(withOverlays.header.bytes).toBeGreaterThan(bare.header.bytes);

    const held = new HeldPublication();
    held.adopt(withOverlays.header, withOverlays.buffer);
    const index = held.u32(PUBLISHED_FIELD.queuedIndex);
    const orders = held.f32(PUBLISHED_FIELD.queuedOrders);
    expect(Array.from(orders.subarray(index[0] * 3, index[1] * 3))).toEqual(
      Array.from(game.queued_orders(0)),
    );
    expect(Array.from(held.f32(PUBLISHED_FIELD.formationPreview))).toEqual(Array.from(preview));
  } finally {
    game.free();
  }
});

test("the published layout follows the counts, and a growing battle needs more bytes", () => {
  const game = new Game(5);
  try {
    game.spawn_class(0, 0, 0, 10, 5, 0, 0);
    const before = publicationBytes(publicationCounts(game));
    game.spawn_class(20, 0, 0, 200, 10, 0, 1);
    const after = publicationBytes(publicationCounts(game));
    expect(after).toBeGreaterThan(before);
    // A buffer sized for the smaller battle is refused rather than truncated.
    const counts = publicationCounts(game);
    expect(() =>
      writePublication(game, wasm.memory, new ArrayBuffer(before), counts, scratch),
    ).toThrow(/buffer holds/);
  } finally {
    game.free();
  }
});

test("every published field has one owner and an aligned, non-overlapping extent", () => {
  const counts = {
    soldiers: 37,
    units: 5,
    unitInfoStride: 35,
    projectiles: 11,
    queuedUnits: 5,
    queuedWaypoints: 9,
    previewPlacements: 3,
  };
  const { offsets, lengths } = newLayoutScratch();
  const total = layoutPublication(counts, offsets, lengths);
  let end = 0;
  for (let index = 0; index < offsets.length; index++) {
    expect(offsets[index]).toBeGreaterThanOrEqual(end);
    end = offsets[index] + lengths[index];
  }
  expect(end).toBeLessThanOrEqual(total);
  // 64-bit records must start 8-aligned or the reader cannot view them at all.
  const travel = publicationFieldIndex("motorTravel");
  expect(offsets[travel] % 8).toBe(0);
  expect(lengths[travel]).toBe(counts.soldiers * 3 * 8);
  expect(lengths[publicationFieldIndex("unitInfo")]).toBe(counts.units * counts.unitInfoStride * 4);
  expect(lengths[publicationFieldIndex("queuedIndex")]).toBe((counts.queuedUnits + 1) * 4);
});

test("published unit records carry the fields the HUD and orders read", () => {
  const game = new Game(77);
  try {
    game.spawn_class(0, 0, 0, 16, 4, 0, 0);
    game.spawn_class(90, 0, Math.PI, 16, 4, 0, 1);
    game.set_attack_order(0, 1);
    game.advance_ticks(30);
    const { header, buffer } = publish(game, 30);
    const held = new HeldPublication();
    held.adopt(header, buffer);
    const info = held.f32(PUBLISHED_FIELD.unitInfo);
    const stride = header.counts.unitInfoStride;
    expect(info[UNIT_INFO.team]).toBe(0);
    expect(info[stride + UNIT_INFO.team]).toBe(1);
    expect(info[UNIT_INFO.hasTarget]).toBeGreaterThan(0.5);
    expect(header.victor).toBe(game.victor());
    expect(header.stateHash).toBe(game.state_hash().toString());
  } finally {
    game.free();
  }
});
