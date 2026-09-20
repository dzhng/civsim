import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {execFileSync} from 'node:child_process';
import {mkdir,readdir,symlink,writeFile} from 'node:fs/promises';
const root='/Users/david/dev/game-battle-typegpu-content-state', main=process.cwd();
const sha=process.argv[2],label=process.argv[3];
if(!/^[0-9a-f]{40}$/.test(sha??'')||!['before','after'].includes(label))throw Error('Require exact scene commit and before/after');
const out=main+'/throwaway/typegpu-content-hardware/replacement';
await mkdir(out,{recursive:true});
const scene='apps/battle-perf-lab/candidates/typegpu/battleScene.ts';
const source=execFileSync('git',['-C',root,'show',sha+':'+scene],{encoding:'utf8'});
let patched=false,overridden=false;
await build({configFile:root+'/apps/battle-perf-lab/src/raw/scene.vite.config.mts',plugins:[{name:'explicit-pre-prepare-reload-probe',enforce:'pre',transform(code,id){
 if(id===root+'/'+scene){overridden=true;return source;}
 if(!id.endsWith('/apps/battle-perf-lab/src/raw/scene-check.ts'))return;
 const upload='if (!cameraOnly || label === "tactical") await scene.uploadCrowd(instances, camera, 0);';
 const presented='const actualInitial = await present();';
 if(!code.includes(upload)||!code.includes(presented))throw Error('Probe anchors moved');
 patched=true;
 return code.replace(upload,upload+`\n      const beforeTerrain=scene.stats().terrain;\n      const beforeHeight=scene.seatingHeightAt(0,0);\n      await scene.replaceTerrain({...options.terrain,grid:{...grid,height:Float32Array.from(grid.height,h=>h+1)}});\n      const afterTerrain=scene.stats().terrain;\n      const afterHeight=scene.seatingHeightAt(0,0);\n      for(const instance of instances)instance.elevation=scene.seatingHeightAt(instance.x,instance.y);\n      await scene.uploadCrowd(instances,camera,0);`).replace(presented,presented+`
      const inspection=scene.verifyAdmittedSeating();
      for(const fn of release.splice(0).reverse())fn();
      return {backend,beforeTerrain,afterTerrain,beforeHeight,afterHeight,instances:instances.length,inspection,stats:actualInitial.stats,errors,remaining:{textures:textures.liveCount(),buffers:buffers.liveCount()},scope:'actual terrain replacement then reseated crowd draw; no timing or image equivalence claim'};
 `);
}}],build:{outDir:out,copyPublicDir:false}});
if(!patched||!overridden)throw Error('Probe was not applied');
for(const name of await readdir(main+'/web/public')){
 if(name==='assets'){for(const entry of await readdir(main+'/web/public/assets'))await symlink(main+'/web/public/assets/'+entry,out+'/assets/'+entry);}
 else await symlink(main+'/web/public/'+name,out+'/'+name);
}
await writeFile(out+'/probe-head.json',JSON.stringify({sceneCommit:sha,dependencyHead:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Scene source overridden from exact Git commit; dependencies from recorded worker head'}));
