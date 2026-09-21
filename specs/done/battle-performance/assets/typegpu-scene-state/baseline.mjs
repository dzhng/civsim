import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5195/?map=A&ai=off');
 await page.waitForFunction(()=>window.__ready===true&&window.__game?.stats().renderStats?.ready,undefined,{timeout:120000});
 await page.evaluate(()=>window.__game.freeze(true));
 await page.waitForFunction(()=>window.__game.frameMetrics()?.renderer.skippedFrozenFrame===true);
 const baseline=await page.evaluate(async()=>{
  const game=window.__game,stats=game.stats().renderStats;
  const seating=await game.verifySeating(),pose=game.debugSoldierAnim(0);
  let reloadError=null;
  try {await game.reloadSoldierAssets();} catch(e){reloadError=String(e);}
  game.disposeRenderer();
  return {backend:stats.backend,depth:stats.depth,seating,pose,reloadError,disposedBytes:game.stats().renderStats.allocations?.currentBytes};
 });
 const expectedGap=baseline.backend==='typegpu'&&baseline.depth===null&&baseline.seating.measurement===null&&baseline.pose===null&&/does not own crowd assets/.test(baseline.reloadError)&&baseline.disposedBytes===0&&errors.length===0;
 await writeFile(new URL('./baseline.json',import.meta.url),JSON.stringify({head:'f440191a',scope:'Pre-scene-integration real Menu capability gaps; not timing',baseline,errors,expectedGap},null,2)+'\n');
 console.log(JSON.stringify({expectedGap,baseline,errors}));
 if(!expectedGap)process.exitCode=1;
}finally{await browser.close();}
