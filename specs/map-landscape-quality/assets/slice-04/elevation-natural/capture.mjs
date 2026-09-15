import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {GPU_SWIFTSHADER_FLAGS} from '../web/renderer-probe-lib.mjs';
import {snapCheck} from '../web/snapshot.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {chromium}=require('playwright');
const stage=process.argv[2]; const spacing=2;
const apron=JSON.parse(await fs.readFile(new URL('elevation-control/apron-policy.json',import.meta.url)));
const entitySource=await fs.readFile(new URL('../packages/game-renderer/src/campaign/entityFrame.ts',import.meta.url),'utf8');
const radiusCode=entitySource.match(/function cityModelRadius\(tier: number\) \{[\s\S]*?\n\}/)[0].replace('tier: number','tier');
if(!['before','candidate'].includes(stage))throw Error('expected before or candidate');
const results=[];
const browser=await chromium.launch({headless:true,args:GPU_SWIFTSHADER_FLAGS});
const issues=[],checks=[];
try {
 for(const region of ['alps','italy','alps-close']) {
 const baseRegion=region==='alps-close'?'alps':region;
 const fixed=stage==='candidate'?JSON.parse(await fs.readFile(new URL('elevation-control/natural-before.json',import.meta.url))).find(r=>r.region===region).camera:null;
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 page.on('pageerror',e=>issues.push(String(e)));
 page.on('console',m=>{if(m.type()==='warning'&&/GPU|shader|bind|validation/i.test(m.text()))issues.push(m.text())});
 await page.route('**/packages/photoreal-renderer/src/world.ts*',async route=>{
   const response=await route.fetch();const text=await response.text();
   const observer=`\nconst fixedCamera = ${JSON.stringify(fixed)}; const measuredRender = PhotorealWorld.prototype.render; PhotorealWorld.prototype.render = function(camera, ...rest) { if(fixedCamera) { camera.matrixAutoUpdate=false; camera.matrix.fromArray(fixedCamera.world); camera.matrixWorld.fromArray(fixedCamera.world); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); camera.projectionMatrix.fromArray(fixedCamera.projection); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); } const result=measuredRender.call(this,camera,...rest); window.__measuredCamera={projection:camera.projectionMatrix.toArray(),world:camera.matrixWorld.toArray()}; return result; };\n`;
   await route.fulfill({response,body:text+observer});
 });
 const dem=JSON.parse(await fs.readFile(new URL(`elevation-control/${baseRegion}-${spacing}km-area.json`,import.meta.url)));
 if(stage==='candidate') await page.route('**/packages/game-renderer/src/terrain/campaignRelief.ts*',async route=>{
 const response=await route.fetch();let body=await response.text();
 body=body.replace('export function campaignRelief(', 'function originalCampaignRelief(');
 body+=`\nconst dem = ${JSON.stringify(dem)}; const apron = ${JSON.stringify(apron)}; export function campaignRelief(source, cell) { const original=originalCampaignRelief(source,cell); const elevation=originalCampaignRelief({...source,...dem},cell); const apronSampler=originalCampaignRelief({...source,...apron,height:apron.keep},cell); return {sample:original.sample,heightAt(x,y,inland=Infinity) { if(x<dem.minX+dem.cell/2 || x>dem.minX+(dem.w-.5)*dem.cell || y>dem.maxY-dem.cell/2 || y<dem.maxY-(dem.h-.5)*dem.cell) return original.heightAt(x,y,inland); const h=.5+Math.max(0,elevation.sample(dem.height,1,0,x,y))*.005; const keep=apronSampler.sample(apron.keep,1,0,x,y); return (h>2.2?2.2+(h-2.2)*keep:h)*smoothstep(0,16,inland); }}; }`;
 if(body.includes('export function campaignRelief(source:'))throw Error('untransformed module');
 await route.fulfill({response,body});
 });
 await page.route('**/apps/renderer-lab/src/routes/campaignLandscape.ts*',async route=>{
 const response=await route.fetch();let body=await response.text();
 const add=`const {CampaignCityLayer}=await import('/@fs${process.cwd()}/packages/photoreal-renderer/src/campaign/cityLayer.ts'); ${radiusCode}
const cityLayer=new CampaignCityLayer(world.scene); const cityInputs=data.map.nodes.flatMap((node,i)=>{if(node.kind!=='city'||Math.abs(node.pos[0]-center[0])>preset.radius-20||Math.abs(node.pos[1]-center[1])>preset.radius-20)return []; const owner=data.map.factions.find(f=>f.id===node.owner);const color=new THREE.Color(owner?.color??'#b0aa88');return [{id:i,label:node.name,selected:false,x:node.pos[0],y:node.pos[1],radius:cityModelRadius(node.tier),faction:[color.r,color.g,color.b],allegiance:[.9,.8,.3],kind:'city'}]}); cityLayer.upload(cityInputs,surface); window.__naturalCityCount=cityInputs.length;`;
 if(!body.includes('const world = await PhotorealWorld.create(ctx.canvas);'))throw Error('city injection seam changed');
 body=body.replace('const world = await PhotorealWorld.create(ctx.canvas);','const world = await PhotorealWorld.create(ctx.canvas);'+add).replace('scenery.dispose();','cityLayer.dispose(); scenery.dispose();');
 await route.fulfill({response,body});
 });
 await page.goto(`http://127.0.0.1:5189/renderer/campaign-landscape?ref=1&region=${baseRegion}${region==='alps-close'?'&zoom=7.5':''}&shadows=0&cell=2`);
 await page.waitForFunction(()=>window.__rendererLabReady===true,undefined,{timeout:90000});
 await page.waitForTimeout(1000);
 const stats=await page.evaluate(()=>({stats:window.__rendererLabStats,camera:window.__measuredCamera,cities:window.__naturalCityCount}));
 const shot=await page.screenshot({timeout:180000});
 await snapCheck(null,region,(name,ok,detail)=>checks.push({name,ok,detail}),{shot,threshold:0,maxDiffRatio:0,baseDir:new URL(`elevation-control/natural/${stage}/`,import.meta.url).pathname});
 const cameraDelta=fixed?Math.max(...fixed.world.map((v,i)=>Math.abs(v-stats.camera.world[i])),...fixed.projection.map((v,i)=>Math.abs(v-stats.camera.projection[i]))):0;
 const output={region,...stats,cameraDelta,issues:[...issues],checks:[...checks]}; results.push(output); await page.close();
 console.log(JSON.stringify({region,cameraDelta,issues,checks}));
 }
 await fs.writeFile(new URL(`elevation-control/natural-${stage}.json`,import.meta.url),JSON.stringify(results,null,2));
} finally {await browser.close();}
