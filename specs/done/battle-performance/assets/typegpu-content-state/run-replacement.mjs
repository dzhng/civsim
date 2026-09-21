import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const label=process.argv[2];if(!['before','after'].includes(label))throw Error('before or after required');
const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
const errors=[],warnings=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 await page.goto('http://127.0.0.1:5197/scene-check.html?backend=typegpu&atlasCatalog=/assets/soldiers/impostors/catalog.json');
 await page.waitForFunction(()=>window.__sceneCheck!==undefined,undefined,{timeout:180000});
 const result=await page.evaluate(()=>window.__sceneCheck);
 const observedExpected=!result.error&&result.backend==='typegpu'&&result.inspection?.measurement?.matches&&result.inspection.measurement.checked===result.instances&&result.instances===15560&&result.beforeTerrain.generation===1&&result.afterTerrain.generation===2&&result.afterTerrain.installed&&result.afterHeight>result.beforeHeight+0.5&&result.inspection.installed.terrainGeneration===2&&result.remaining.textures===0&&result.remaining.buffers===0&&result.errors.length===0;
 await writeFile(new URL('./replacement.json',import.meta.url),JSON.stringify({label,result,errors,warnings,observedExpected},null,2)+'\n');
 console.log(JSON.stringify({label,observedExpected,result,errors,warnings}));
 if(!observedExpected||errors.length)process.exitCode=1;
}finally{await browser.close();}
