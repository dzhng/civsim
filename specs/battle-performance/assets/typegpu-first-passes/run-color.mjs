import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
try{for(const corrupt of [false,true]){
 const page=await browser.newPage();const errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 if(corrupt)await page.addInitScript(()=>{const original=GPUBuffer.prototype.getMappedRange;GPUBuffer.prototype.getMappedRange=function(...args){const result=original.apply(this,args);new Float32Array(result)[0]=NaN;return result;};});
 await page.goto('http://127.0.0.1:5191/color-check.html');await page.waitForFunction(()=>window.__typegpuColors!==undefined,null,{timeout:120000});
 const report=await page.evaluate(()=>window.__typegpuColors);await writeFile(`throwaway/root-review/${corrupt?'equal-nan':'finite'}-report.json`,JSON.stringify({report,errors,warnings},null,2));
 console.log(JSON.stringify({corrupt,...report,errors,warnings}));
 if(errors.length||(!corrupt&&!report.passed)||(corrupt&&(report.passed||report.nonfinite!==2)))throw Error('Unexpected verdict');
 await page.close();
}}finally{await browser.close();}
