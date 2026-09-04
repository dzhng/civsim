// The fixed-size Total-War unit-card grid needs a dense lab fixture. The live game
// is ~5v5 — too few to exercise wrapping — so this drives the lab route
// `/renderer/card-bar` over synthetic 20 / 30 / 40 rosters, asserts the grid
// never scrolls either axis, that the card stays a FIXED size as the roster
// grows, and that the row/col count matches the S1 expectation, then snaps the
// `#unitcards` element. dpr 1 and 2 (the 2x pass catches sub-pixel collisions).

export const meta = {
  name: "card-bar",
  kind: "visual",
  world: "ui",
  tier: "quick",
  snapshots: [
    "card-bar-20",
    "card-bar-30",
    "card-bar-40",
    "card-bar-20-2x",
    "card-bar-30-2x",
    "card-bar-40-2x",
    "card-bar-too-small",
  ],
  describe:
    "Fixed-size 3:4 unit-card grid wrapping 20/30/40 cards into rows at dpr 1 and 2, plus the min-window gate.",
};

// The roster wraps into rows at a fixed card size (58px, 20% smaller than the
// original 72): 20→1×20, 30→2×15, 40→2×20 at these viewport widths.
const CARD_W = 58;
const CASES = [
  { count: 20, rows: 1, cols: 20 },
  { count: 30, rows: 2, cols: 15 },
  { count: 40, rows: 2, cols: 20 },
];

async function openCase(ctx, count, dpr) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: dpr,
    errorPrefix: `card-bar-${count}-dpr${dpr}`,
  });
  await page.goto(`${ctx.target}/renderer/card-bar?count=${count}`);
  await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 18000,
  });
  await page.waitForFunction(() => !!window.__cardGrid, undefined, { timeout: 8000 });
  // Wait for the baked <img> portraits to decode, or the snapshot flakes on
  // decode timing.
  await page.waitForFunction(
    () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    undefined,
    { timeout: 10000 },
  );
  await page.waitForTimeout(120);
  return page;
}

export async function run(ctx) {
  for (const dpr of [1, 2]) {
    for (const { count, rows, cols } of CASES) {
      const page = await openCase(ctx, count, dpr);

      // No scroll on either axis — the load-bearing guarantee.
      const box = await page.$eval("#unitcards", (el) => ({
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
      }));
      ctx.check(`card-bar-${count} no horizontal scroll`, box.sw <= box.cw, JSON.stringify(box));
      ctx.check(`card-bar-${count} no vertical scroll`, box.sh <= box.ch, JSON.stringify(box));

      // Geometry matches the S1 expectation; cards stay the fixed size.
      const grid = await page.evaluate(() => window.__cardGrid);
      ctx.check(`card-bar-${count} rows`, grid.rows === rows, `got ${grid.rows}, want ${rows}`);
      ctx.check(`card-bar-${count} cols`, grid.cols === cols, `got ${grid.cols}, want ${cols}`);
      ctx.check(
        `card-bar-${count} fixed card size`,
        grid.cardW === CARD_W,
        `got ${grid.cardW}, want ${CARD_W}`,
      );

      // Portraits are the baked <img> (S4), not the fallback canvas, and decoded.
      const ports = await page.$eval("#unitcards", (el) => {
        const all = [...el.querySelectorAll(".ucard-port")];
        return {
          total: all.length,
          imgs: all.filter((p) => p.tagName === "IMG").length,
          loaded: all.filter((p) => p.tagName === "IMG" && p.naturalWidth > 0 && p.currentSrc)
            .length,
        };
      });
      ctx.check(
        `card-bar-${count} portraits are baked imgs`,
        ports.imgs === ports.total && ports.loaded === ports.total,
        JSON.stringify(ports),
      );

      // Clip via page.screenshot (not element.screenshot — it mis-clips the
      // fixed-position band), clamped to the viewport so a centered band that
      // bleeds a few px off-edge doesn't error.
      const clip = await page.$eval("#unitcards", (el) => {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.x),
          y = Math.max(0, r.y);
        return {
          x,
          y,
          width: Math.min(window.innerWidth - x, r.right - x),
          height: Math.min(window.innerHeight - y, r.bottom - y),
        };
      });
      const shot = await page.screenshot({ clip });
      await ctx.snap(page, `card-bar-${count}${dpr === 2 ? "-2x" : ""}`, { shot });
      await page.close();
    }
  }

  // Selection wiring stays honest before S4 touches build(): clicking a card
  // fires the synthetic onSelect with that card's unit id.
  const page = await openCase(ctx, 20, 1);
  await page.click("#unitcards .ucard:nth-child(3)");
  await page.waitForTimeout(50);
  const sel = await page.evaluate(() => window.__cardBarLastSelect);
  ctx.check("card click fires onSelect", !!sel && sel.unit === 2, JSON.stringify(sel));
  // The min-window gate is hidden at the supported size...
  const hidden = await page.$eval("#viewport-too-small", (el) => getComputedStyle(el).display);
  ctx.check("min-window gate hidden at 1280x800", hidden === "none", `display=${hidden}`);
  await page.close();

  // ...and shown below the minimum, covering the bar.
  const small = await ctx.newPage({
    viewport: { width: 900, height: 600 },
    errorPrefix: "card-bar-too-small",
  });
  await small.goto(`${ctx.target}/renderer/card-bar?count=20`);
  await small.waitForFunction(() => window.__rendererLabReady === true, undefined, {
    timeout: 18000,
  });
  await small.waitForTimeout(120);
  const shown = await small.$eval("#viewport-too-small", (el) => getComputedStyle(el).display);
  ctx.check("min-window gate shown at 900x600", shown === "flex", `display=${shown}`);
  await ctx.snap(small, "card-bar-too-small");
  await small.close();
}
