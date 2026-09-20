import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url);const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
const report={scope:'hardware correctness only; no timing verdict',checks:[],errors:[]};
const check=(name,pass,data)=>{report.checks.push({name,pass,data});console.log(name,pass);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
  const original=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){const d=await original.apply(this,args);window.__reloadDevice=d;const encoder=d.createCommandEncoder.bind(d);d.createCommandEncoder=desc=>{if(window.__reloadTracking)window.__reloadPoseEncoded=true;return encoder(desc);};window.__liveTextures=new Map();const create=d.createTexture.bind(d);d.createTexture=function(desc){const t=create(desc);window.__liveTextures.set(t,desc);const destroy=t.destroy.bind(t);t.destroy=()=>{window.__liveTextures.delete(t);destroy();};return t;};return d;};
 });
 await page.goto('http://localhost:5296/?map=A&ai=off');
 await page.waitForFunction(()=>window.__ready===true&&window.__game?.stats().renderStats?.ready,{timeout:120000});
 await page.evaluate(async()=>{const g=window.__game;g.freeze(true);for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
 await page.waitForFunction(()=>window.__game?.frameMetrics()?.renderer.skippedFrozenFrame===true,{timeout:60000});
 const initial=await page.evaluate(()=>{const g=window.__game;return {stats:g.stats(),pose:g.debugSoldierAnim(0)};});
 check('TypeGPU public catalog boots all soldiers',initial.stats.renderStats.backend==='typegpu'&&initial.stats.soldiers===initial.stats.renderStats.soldiers,initial.stats.renderStats);
 await page.screenshot({path:new URL('before.png',dir).pathname});
 const success=await page.evaluate(async()=>{const g=window.__game,b=g.debugSoldierAnim(0),tick=g.tickCount();await g.reloadSoldierAssets();for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);const a=g.debugSoldierAnim(0);return{sameTick:tick===g.tickCount(),newPayload:b?.playback!==a?.playback,priorPhase:b?.phase,phase:a?.phase,ready:g.stats().renderStats.ready};});
 check('successful reload replaces generation at same tick',success.sameTick&&success.newPayload&&success.ready,success);
 await page.screenshot({path:new URL('after.png',dir).pathname});
 await page.route('**/assets/soldiers/impostors/catalog.json',r=>r.fulfill({status:404,body:'missing catalog (injected)'}));
 const missing=await page.evaluate(async()=>{const g=window.__game,b=g.debugSoldierAnim(0);let error='';try{await g.reloadSoldierAssets();}catch(e){error=String(e);}for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);return{error,samePayload:b?.playback===g.debugSoldierAnim(0)?.playback,ready:g.stats().renderStats.ready};});
 check('missing atlas retains installed crowd',!!missing.error&&missing.samePayload&&missing.ready,missing);
 await page.unroute('**/assets/soldiers/impostors/catalog.json');
 const rejected=await page.evaluate(async()=>{const g=window.__game,d=window.__reloadDevice,b=g.debugSoldierAnim(0),orig=d.popErrorScope.bind(d);window.__reloadTracking=true;window.__reloadPoseEncoded=false;let injected=false;d.popErrorScope=function(){if(!injected&&window.__reloadPoseEncoded){injected=true;d.createBuffer({label:'reload-invalid-buffer',size:4,usage:0}).destroy();}return orig();};let error='';try{await g.reloadSoldierAssets();}catch(e){error=String(e);}finally{d.popErrorScope=orig;}for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);return{injected,error,samePayload:b?.playback===g.debugSoldierAnim(0)?.playback,ready:g.stats().renderStats.ready};});
 check('real GPU validation failure retains installed crowd',rejected.injected&&!!rejected.error&&rejected.samePayload&&rejected.ready,rejected);
 const disposed=await page.evaluate(async()=>{const g=window.__game,d=window.__reloadDevice,orig=d.popErrorScope.bind(d);let release,entered;const gate=new Promise(r=>release=r),reached=new Promise(r=>entered=r);window.__reloadTracking=true;window.__reloadPoseEncoded=false;let once=false;d.popErrorScope=async function(){const result=await orig();if(!once&&window.__reloadPoseEncoded){once=true;entered();await gate;}return result;};let error='';const reload=g.reloadSoldierAssets().catch(e=>error=String(e));await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(Error("Reload admission checkpoint not reached")),30000))]);g.disposeRenderer();release();await reload;d.popErrorScope=orig;let closed='';try{await g.reloadSoldierAssets();}catch(e){closed=String(e);}await new Promise(r=>setTimeout(r,500));return{error,closed,stats:g.stats().renderStats,liveTextures:[...window.__liveTextures.values()]};});
 check('disposal during GPU admission rejects pending and future reload',/disposed/i.test(disposed.error)&&/disposed/i.test(disposed.closed),disposed);
 await page.close();
}catch(e){report.error=String(e);console.error(e);process.exitCode=1;}finally{await browser.close();await writeFile(new URL('report.json',dir),JSON.stringify(report,null,2)+'\n');}
if(report.checks.some(c=>!c.pass)||report.errors.length)process.exitCode=1;
