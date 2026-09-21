import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
try{const p=await b.newPage(),errors=[],warnings=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});await p.goto('http://127.0.0.1:5192/frame-lifecycle-check.html');await p.waitForFunction(()=>window.__frameLifecycle!==undefined,null,{timeout:120000});const report=await p.evaluate(()=>window.__frameLifecycle);await writeFile('throwaway/typegpu-frame-hardware/report.json',JSON.stringify({report,errors,warnings},null,2));console.log(JSON.stringify({report,errors,warnings}));if(!report.passed||errors.length)process.exitCode=1;}finally{await b.close();}
