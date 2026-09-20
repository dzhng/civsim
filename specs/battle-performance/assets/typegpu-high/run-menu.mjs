import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const dir=new URL('./menu-hardware/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
const results=[];
try{
 for(const mode of ['single','csm','off']){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});const errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await page.goto(`http://127.0.0.1:5193/?map=A&ai=off&shadows=${mode}`);
  await page.waitForFunction(()=>window.__ready===true&&window.__game?.stats().renderStats?.ready,undefined,{timeout:120000});
  await page.evaluate(()=>window.__game.freeze(true));
  await page.waitForFunction(()=>window.__game.frameMetrics()?.renderer.skippedFrozenFrame===true);
  const start=await page.evaluate(()=>({stats:window.__game.stats(),camera:{x:window.__cam.x,y:window.__cam.y,zoom:window.__cam.zoom,yaw:window.__cam.yaw,pitch:window.__cam.pitch}}));
  await page.screenshot({path:new URL(`${mode}-tactical.png`,dir).pathname});
  const checkpoints=[];
  for(const [name,dx,dy,zoom,yaw,pitch] of [['pan',100,0,start.camera.zoom,start.camera.yaw,start.camera.pitch],['wide',100,80,.4,start.camera.yaw,.3],['reverse',-100,-40,1.5,start.camera.yaw+.3,.55],['return',0,0,start.camera.zoom,start.camera.yaw,start.camera.pitch]]){
   await page.evaluate(({x,y,zoom,yaw,pitch})=>window.__game.setCamera(x,y,zoom,yaw,pitch),{x:start.camera.x+dx,y:start.camera.y+dy,zoom,yaw,pitch});
   await page.waitForTimeout(500);
   const stats=await page.evaluate(()=>window.__game.stats().renderStats);checkpoints.push({name,stats});await page.screenshot({path:new URL(`${mode}-${name}.png`,dir).pathname});
  }
  await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(500);
  const resized=await page.evaluate(()=>window.__game.stats().renderStats);
  await page.evaluate(()=>window.__game.disposeRenderer());await page.waitForTimeout(500);
  const disposed=await page.evaluate(()=>window.__game.stats().renderStats);
  const expected=mode==='csm'?{layers:2,depthBytes:33554432}:mode==='single'?{layers:1,depthBytes:4194304}:{layers:0,depthBytes:0};
  const shadow=start.stats.renderStats.native.shadows;
  const result={mode,warnings,scope:'hardware correctness and diagnostic captures only, not a temporal or timing gate',errors,start,checkpoints,resized,disposed,passed:errors.length===0&&start.stats.renderStats.backend==='typegpu'&&shadow?.mode===mode&&shadow.layers===expected.layers&&shadow.depthBytes===expected.depthBytes&&disposed.allocations?.currentBytes===0};
  results.push(result);await writeFile(new URL(`${mode}.json`,dir),JSON.stringify(result,null,2)+'\n');console.log(mode,result.passed);await page.close();
 }
}finally{await browser.close();await writeFile(new URL('outcomes.json',dir),JSON.stringify(results.map(({mode,passed})=>({mode,passed})),null,2)+'\n');}
if(results.some(r=>!r.passed))process.exitCode=1;
