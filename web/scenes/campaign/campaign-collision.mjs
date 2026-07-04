// Slice 09 (campaign-map-bugs B7): one occupancy authority across canvas
// labels and DOM cards — nothing readable overlaps. Asserts the arbitration
// outcomes the renderer stats report (the same rects the arbitration ran on):
//   - label ink rects pairwise disjoint (city/army/faction; sea labels and
//     sub-0.3-opacity fades are background text, outside the game);
//   - cards pairwise disjoint and clear of label ink (major faction
//     engravings excepted — background-scale text, pinned in the slice);
//   - the named evidence pairs: LONDINIUM clear of ARVERNI at overview, the
//     Roma cluster (ROMA/TIBUR/OSTIA) card title rows readable at regional;
//   - the same-frame ordering pin: one cam() call = one drawWorld, and the
//     stats published by that single draw already agree with the live DOM
//     card rects — the label arbitration never runs a frame behind the cards.
const WHOLE_MAP_CAMERA = [-100, 250, 0.16];
const REGIONAL_ITALY_CAMERA = [-430, 445, 3.0];

export const meta = {
  name: "campaign-collision",
  kind: "visual",
  world: "campaign-real",
  tier: "quick",
  snapshots: ["collision-overview-political", "collision-regional-roma"],
  describe:
    "Occupancy authority: labels and cards never overlap readable ink; Londinium/Arverni and the Roma card cluster stay readable; card rects are same-frame.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "campaign collision scenes require VERIFY_GPU=1",
      true,
      "set VERIFY_GPU=1 to exercise the WebGPU campaign adapter",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "campaign-collision",
  });
  await page.goto(`${ctx.target}/`);
  await page.waitForSelector("#menu-new-campaign", { timeout: 20000 });
  await page.click("#menu-new-campaign");
  await page.waitForFunction(
    () =>
      window.__campaignReady === true &&
      window.__campaignGpuStats?.ready === true &&
      window.__campaignGpuStats?.renderer === "renderer-campaign",
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.factionView(true);
    window.__campaign.fogOfWar(false);
    window.__campaign.select(-1);
  });

  // ---- Overview: faction labels join the arbitration ----------------------
  await page.evaluate((camera) => window.__campaign.cam(...camera), WHOLE_MAP_CAMERA);
  await page.waitForTimeout(300);
  const overview = await collectCollisionState(page);
  const arverni = overview.labels.find(
    (label) => label.kind === "faction" && label.text === "ARVERNI",
  );
  const londinium = overview.labels.find(
    (label) => label.kind === "city" && label.text === "LONDINIUM",
  );
  ctx.check(
    "overview shows LONDINIUM beside (not under) the ARVERNI engraving",
    Boolean(arverni && londinium) && !inkOverlaps(londinium, arverni),
    JSON.stringify({ arverni: arverni?.ink, londinium: londinium?.ink }),
  );
  checkNoReadableOverlap(ctx, "collision overview", overview);
  await ctx.snap(page, "collision-overview-political");

  // ---- Regional Roma cluster: card-vs-card + the ordering pin --------------
  // Pinned ordering (slice 09): the card loop runs against the frame's camera
  // BEFORE the renderer draws, so every MEASURED card is arbitrated and
  // reported same-frame. A card entering visibility has no measurable DOM size
  // yet (display:none) and joins one frame later — an accepted <=1-frame
  // settle on visibility transitions only. cam() runs exactly one drawWorld
  // and this evaluate is synchronous, so frame 1 must already match its own
  // DOM, and frame 2 must have every visible card arbitrated.
  const regional = await page.evaluate((camera) => {
    const cardState = () => {
      const domCards = Array.from(document.querySelectorAll(".cmp-map-card"))
        .filter((node) => node.style.display !== "none")
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name: node.querySelector(".cmp-map-card__name")?.textContent?.trim() ?? "",
            box: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
          };
        });
      return { reported: window.__campaignGpuStats.visibleCardRects ?? [], domCards };
    };
    window.__campaign.cam(...camera);
    const firstFrame = cardState();
    window.__campaign.cam(...camera);
    const secondFrame = cardState();
    return { firstFrame, secondFrame };
  }, REGIONAL_ITALY_CAMERA);
  const staleIn = (frame) => {
    const domByName = new Map(frame.domCards.map((card) => [card.name, card.box]));
    return frame.reported.filter((card) => {
      const dom = domByName.get(card.name);
      if (!dom) return true;
      return ["x", "y", "w", "h"].some((k) => Math.abs(dom[k] - card.box[k]) > 1.5);
    });
  };
  ctx.check(
    "reported card rects are same-frame with the DOM; entering cards settle in one frame (ordering pin)",
    regional.firstFrame.reported.length > 0 &&
      staleIn(regional.firstFrame).length === 0 &&
      regional.secondFrame.reported.length === regional.secondFrame.domCards.length &&
      staleIn(regional.secondFrame).length === 0,
    JSON.stringify({
      frame1: {
        reported: regional.firstFrame.reported.length,
        stale: staleIn(regional.firstFrame),
      },
      frame2: {
        reported: regional.secondFrame.reported.length,
        dom: regional.secondFrame.domCards.length,
        stale: staleIn(regional.secondFrame),
      },
    }),
  );

  await page.waitForTimeout(200);
  const cluster = await collectCollisionState(page);
  const clusterNames = cluster.cards.map((card) => card.name);
  // Cards sit at a FIXED position under their city and simply hide when they
  // would overlap a higher-priority card — no nudging or stacking (the user
  // zooms in to see a hidden one). So the contract is: the top card of the
  // cluster (ROMA, tier 3) always wins its ground, and nothing overlaps.
  ctx.check(
    "Roma card stays visible (highest-priority card wins its ground on overlap)",
    clusterNames.includes("ROMA"),
    JSON.stringify({ visible: clusterNames, culled: cluster.culled }),
  );
  checkNoReadableOverlap(ctx, "collision regional-roma", cluster);
  await ctx.snap(page, "collision-regional-roma");

  // ---- Pella/Thessalonica framing: army labels join the arbitration -------
  const pella = await page.evaluate(async () => {
    const map = await (await fetch("/data/campaign-map.json")).json();
    return map.nodes.find((node) => node.name === "Pella")?.pos ?? null;
  });
  ctx.check("campaign map has Pella", Boolean(pella), JSON.stringify(pella));
  if (pella) {
    await page.evaluate((pos) => window.__campaign.cam(pos[0], pos[1], 3.0), pella);
    await page.waitForTimeout(300);
    checkNoReadableOverlap(ctx, "collision pella", await collectCollisionState(page));
  }

  await page.close();
}

/** Post-arbitration collision surface: label ink rects (the arbitration's own
 * currency — box deflated by the transparent halo padding) plus the reported
 * card rects, restricted to the participants (sea labels and fading ghosts
 * below 0.3 opacity stay out on both sides, mirroring the authority). */
async function collectCollisionState(page) {
  const stats = await page.evaluate(() => window.__campaignGpuStats);
  const labels = [
    ...stats.visibleCityLabelRects,
    ...stats.visibleArmyLabelRects,
    ...stats.visibleFactionLabelRects,
  ]
    .filter((label) => label.opacity >= 0.3)
    // Use the arbitration's own ink rect (deflate-then-rotate AABB), not the
    // full-quad box deflated by pad — for a tilted faction engraving the latter
    // is looser and flags sub-pixel kisses the arbitration already cleared.
    .map((label) => ({ ...label, ink: label.inkRect ?? deflate(label.box, label.padPx ?? 0) }));
  return {
    labels,
    cards: stats.visibleCardRects ?? [],
    culled: stats.labelCollisionCulledLabels ?? [],
  };
}

function checkNoReadableOverlap(ctx, name, state) {
  const labelPairs = [];
  for (let i = 0; i < state.labels.length; i++) {
    for (let j = i + 1; j < state.labels.length; j++) {
      if (inkOverlaps(state.labels[i], state.labels[j])) {
        labelPairs.push([labelId(state.labels[i]), labelId(state.labels[j])]);
      }
    }
  }
  const cardPairs = [];
  for (let i = 0; i < state.cards.length; i++) {
    for (let j = i + 1; j < state.cards.length; j++) {
      if (overlaps(state.cards[i].box, state.cards[j].box)) {
        cardPairs.push([state.cards[i].name, state.cards[j].name]);
      }
    }
  }
  // Cards over a MAJOR faction engraving are the pinned exception: a chip on
  // territory-scale background text reads fine (same reasoning as sea names).
  const cardLabelPairs = [];
  for (const card of state.cards) {
    for (const label of state.labels) {
      if (label.kind === "faction" && !label.minor) continue;
      if (overlaps(card.box, label.ink)) cardLabelPairs.push([card.name, labelId(label)]);
    }
  }
  ctx.check(
    `${name}: nothing readable overlaps (labels pairwise, cards pairwise, cards vs labels)`,
    labelPairs.length === 0 && cardPairs.length === 0 && cardLabelPairs.length === 0,
    JSON.stringify({
      labelPairs,
      cardPairs,
      cardLabelPairs,
      labels: state.labels.length,
      cards: state.cards.length,
    }),
  );
}

function labelId(label) {
  return `${label.kind}:${label.text}`;
}

function deflate(box, pad) {
  return {
    x: box.x + pad,
    y: box.y + pad,
    w: Math.max(1, box.w - pad * 2),
    h: Math.max(1, box.h - pad * 2),
  };
}

function inkOverlaps(a, b) {
  return overlaps(a.ink, b.ink);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
