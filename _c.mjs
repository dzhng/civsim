import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2});
await p.goto('http://localhost:5174/');await p.waitForSelector('#menu-new-campaign',{timeout:30000});
await p.click('#menu-new-campaign');await p.waitForFunction(()=>window.__campaignReady===true,{timeout:30000});
await p.evaluate(async()=>{await document.fonts.load('700 40px Cinzel');await document.fonts.ready;});
await p.evaluate(()=>window.__campaign.freeze());await p.evaluate(()=>{window.__campaign.fogOfWar(false);window.__campaign.factionView(true);});
const O='/tmp/claude-0/-home-user-civsim/92e5bc81-517a-5d39-b801-8b66d96dad5e/scratchpad/out';
await p.evaluate(()=>window.__campaign.cam(-456,446,0.75));await p.waitForTimeout(500);await p.screenshot({path:O+'/rb-italy.png'});
await b.close();console.log('ok');
