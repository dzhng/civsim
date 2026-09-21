import {chromium} from '../../web/node_modules/playwright/index.mjs';
import {GPU_HARDWARE_FLAGS} from '../../web/renderer-probe-lib.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true,args:GPU_HARDWARE_FLAGS});
const pageErrors=[],warnings=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 await page.goto('http://127.0.0.1:5198/impostor-check.html?candidate=typegpu&samples=1&canonical&atlasCatalog=/assets/soldiers/impostors/catalog.json');
 await page.waitForFunction(()=>window.__impostorCheck!==undefined,undefined,{timeout:180000});
 const result=await page.evaluate(()=>window.__impostorCheck);
 await writeFile(new URL('./render-report.json',import.meta.url),JSON.stringify({result,pageErrors,warnings}));
 console.log(JSON.stringify({passed:result.passed,error:result.error,errors:result.errors,pageErrors,warnings,cases:result.results?.map(r=>({label:r.label,passed:r.passed,packingEqual:r.packingEqual,coverageMismatch:r.coverageMismatch,different:r.different,maxCovered:r.maxCovered}))},null,2));
 if(!result.passed||result.error||result.errors?.length||pageErrors.length)process.exitCode=1;
}finally{await browser.close();}
