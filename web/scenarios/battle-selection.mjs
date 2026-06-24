export const meta = {
  name: 'battle-selection',
  kind: 'flow',
  world: 'battle-5v5',
  tier: 'quick',
  snapshots: [],
  describe: 'Real click and drag-box selection at dpr 1 and dpr 2.',
};

export async function run(ctx) {
  for (const dpr of [1, 2]) {
    const page = await ctx.newPage({ deviceScaleFactor: dpr, errorPrefix: `dpr${dpr}` });
    await page.goto(`${ctx.target}?battle=5v5&ai=off&debug=blocks`);
    await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
    await page.waitForTimeout(400);

    const trueScreen = (u) => page.evaluate((unit) => {
      const a = window.__game.unitInfo(unit);
      const c = window.__cam;
      const cv = document.getElementById('battlefield');
      const cosP = Math.max(0.2, Math.cos(c.pitch || 0));
      const canvasX = (a[32] - c.x) * c.zoom + cv.width / 2;
      const canvasY = (c.y - a[33]) * c.zoom * cosP + cv.height / 2;
      return { x: canvasX * (cv.clientWidth / cv.width), y: canvasY * (cv.clientHeight / cv.height) };
    }, u);

    await page.evaluate(() => {
      const a = window.__game.unitInfo(4);
      const c = window.__cam;
      c.zoom = 3;
      c.pitch = 0;
      c.x = a[32] - 90;
      c.y = a[33];
      c.clampView?.();
      window.__game.select(-1);
    });
    await page.waitForTimeout(150);

    const cpt = await trueScreen(4);
    await page.mouse.click(cpt.x, cpt.y);
    await page.waitForTimeout(120);
    const clicked = await page.evaluate(() => window.__game.selected());
    ctx.check(`dpr${dpr}: left-click selects the unit under the cursor`, clicked.includes(4),
      `clicked (${cpt.x.toFixed(0)},${cpt.y.toFixed(0)}) -> selected ${JSON.stringify(clicked)}`);

    await page.evaluate(() => window.__game.select(-1));
    const c2 = await trueScreen(4);
    await page.mouse.move(c2.x - 70, c2.y - 45);
    await page.mouse.down();
    await page.mouse.move(c2.x, c2.y, { steps: 3 });
    await page.mouse.move(c2.x + 70, c2.y + 45, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const boxed = await page.evaluate(() => window.__game.selected());
    ctx.check(`dpr${dpr}: drag-box selects the unit inside it`, boxed.includes(4),
      `box around (${c2.x.toFixed(0)},${c2.y.toFixed(0)}) -> selected ${JSON.stringify(boxed)}`);

    await page.close();
  }
}
