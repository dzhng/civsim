// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rectsOverlap } from "@packages/game-renderer/src/campaign/labelLayout";
import {
  ANCHOR_CLEAR_PX,
  CARD_NUDGE_GAP_PX,
  resolveMapCards,
  type MapCardCandidate,
} from "./cardLayout";

// Actual border-fog city cards: normal campaign, Roma sidebar, cam(-430,380,2.2).
// The old solver reproduces all 15 captured rects from these inputs exactly.
// Rows: name, map node, tier, anchorX, cardW/H, desiredY, anchorY.
const BORDER_FOG_CITIES: [string, number, number, number, number, number, number, number][] = [
  ["ALBA FUCENS", 11, 1, 752.6575723410416, 105, 38, 230.59431181203405, 214.4908075723241],
  ["ASCULUM", 41, 2, 788.1143449245179, 81, 38, 57.505727693961255, 41.40222345425128],
  ["CAPUA", 94, 2, 896.3017601957401, 116, 54, 481.73776156676496, 465.63425732705497],
  ["CASINUM", 99, 2, 823.5007807407493, 81, 38, 377.7325024184457, 361.6289981787357],
  ["CLUSIUM", 110, 2, 508.9669529296956, 81, 38, 12.181009414006354, -3.9224948257036214],
  ["COSA", 122, 1, 382.32333092396857, 82, 38, 130.8865025175757, 114.78299827786574],
  ["FERENTINUM", 157, 1, 718.7554295623422, 103, 38, 325.10838965055535, 309.00488541084536],
  ["MINTURNAE", 225, 2, 808.1499615414281, 97, 38, 441.0200875332882, 424.9165832935782],
  ["NARNIA", 233, 1, 598.3040567601308, 82, 38, 129.04987848740365, 112.94637424769368],
  ["OSTIA/PORTUS", 251, 2, 551.316424557418, 114, 38, 300.9665808414176, 284.86307660170763],
  ["REATE", 286, 1, 657.2870455240613, 82, 38, 153.6880535509796, 137.58454931126963],
  ["ROMA", 288, 3, 582.7726803147941, 109, 54, 274.96622448229436, 258.8627202425844],
  ["TARRACINA", 336, 2, 713.0116027500276, 92, 38, 416.480837398375, 400.377333158665],
  ["TIBUR", 348, 1, 639.7382751547924, 82, 38, 258.7963821135467, 242.69287787383675],
  ["VOLSINII", 378, 1, 508.2753142760845, 82, 38, 95.73301029821305, 79.62950605850307],
];

const borderFogEntries = (): MapCardCandidate[] =>
  BORDER_FOG_CITIES.map(([name, node, tier, anchorX, w, h, desiredY, anchorY]) => ({
    id: `city:${node}`,
    name,
    priority: 10 + tier,
    city: true,
    anchor: [anchorX, anchorY] as [number, number],
    x: anchorX,
    y: desiredY,
    size: { w, h },
    visible: true,
  }));

const byName = (entries: MapCardCandidate[]) => new Map(entries.map((e) => [e.name, e]));
const desiredOf = (name: string) => BORDER_FOG_CITIES.find(([n]) => n === name)![6];

describe("campaign map card layout, border-fog frame", () => {
  it("leaves TIBUR's card under its own city instead of cascading past the cluster", () => {
    const entries = borderFogEntries();
    resolveMapCards(entries, true);
    // Pre-fix, tier priority let ROMA/OSTIA/TARRACINA claim first and TIBUR
    // (a tier-1 card wanted 16px ABOVE ROMA) cascaded downward-only to
    // 458.48 — 199.68px below its city, in open sea.
    expect(byName(entries).get("TIBUR")!.y).toBe(desiredOf("TIBUR"));
  });

  it("only ever slides a card below cards that wanted to sit above it", () => {
    const entries = borderFogEntries();
    resolveMapCards(entries, true);
    for (const entry of entries) {
      const desired = desiredOf(entry.name);
      expect(entry.y).toBeGreaterThanOrEqual(desired);
      // A card's displacement is bounded by the neighbours it had to clear,
      // not by the cluster: nothing is pushed past a card it outranked in the
      // north-to-south packing order.
      const above = entries.filter((other) => desiredOf(other.name) < desired);
      const floor = Math.max(
        desired,
        ...above.map((other) => other.y + other.size!.h + CARD_NUDGE_GAP_PX),
      );
      expect(entry.y).toBeLessThanOrEqual(floor);
    }
  });

  it("shows every own city card, disjoint and clear of its neighbours' anchors", () => {
    const entries = borderFogEntries();
    const { culls } = resolveMapCards(entries, true);
    expect(culls).toEqual([]);
    expect(entries.filter((entry) => entry.visible && entry.rect)).toHaveLength(
      BORDER_FOG_CITIES.length,
    );
    for (const entry of entries) {
      const rect = entry.rect!;
      // The reported rect is the one the card finally claimed, never the spot
      // it was nudged off.
      expect(rect.y).toBe(entry.y);
      for (const other of entries) {
        if (other === entry) continue;
        expect(rectsOverlap(rect, other.rect!)).toBe(false);
        const [ax, ay] = other.anchor!;
        const buries =
          ax >= rect.x - ANCHOR_CLEAR_PX &&
          ax <= rect.x + rect.w + ANCHOR_CLEAR_PX &&
          ay >= rect.y - ANCHOR_CLEAR_PX &&
          ay <= rect.y + rect.h;
        expect(buries).toBe(false);
      }
    }
  });

  it("still ranks by tier where a colliding card can be culled", () => {
    // Below full tilt the loser hides, so the ground goes to the stronger
    // card: ROMA (tier 3) keeps the spot TIBUR (tier 1) overlaps by 1.93px,
    // and TIBUR yields — the reverse of the full-tilt packing order.
    const entries = borderFogEntries();
    const { culls } = resolveMapCards(entries, false);
    expect(byName(entries).get("ROMA")!.y).toBe(desiredOf("ROMA"));
    expect(byName(entries).get("TIBUR")!.visible).toBe(false);
    expect(culls).toContain("card:TIBUR");
  });
});
