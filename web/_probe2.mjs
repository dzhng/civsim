import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:5174/");
await p.waitForSelector("#menu-new-campaign", { timeout: 30000 });
await p.click("#menu-new-campaign");
await p.waitForFunction(() => window.__campaignReady === true, { timeout: 30000 });
const res = await p.evaluate(() => {
  const out = [];
  for (let y = -470; y >= -760; y -= 25) {
    let row = ("" + y).padStart(5) + " ";
    for (let x = -560; x <= 520; x += 30) {
      const c = window.__campaign.cellInfo(x, y);
      row += c.oob ? " " : c.land ? (c.owner < 0 ? "." : String(c.owner)) : "~";
    }
    out.push(row);
  }
  return out.join("\n");
});
console.log("x -560..520 step30; ~=water .=UNCLAIMED 1=carthage 4=egypt 6=indep");
console.log(res);
await b.close();
