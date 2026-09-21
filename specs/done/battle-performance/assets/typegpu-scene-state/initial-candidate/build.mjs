import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {symlink,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const main=process.cwd(),root='/Users/david/dev/game-battle-typegpu-scene-state',out=main+'/throwaway/typegpu-scene-hardware';
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!process.argv[2]||sha!==process.argv[2])throw Error('Provide the reviewed exact candidate commit');
if(execFileSync('git',['-C',root,'diff','--name-only','HEAD','--','apps','packages'],{encoding:'utf8'}).trim())throw Error('Candidate code is dirty');
process.env.BATTLE_NATIVE_BACKEND='typegpu';
await build({root:root+'/web',configFile:root+'/apps/battle-perf-lab/src/live/vite.config.mts',build:{outDir:out+'/candidate',copyPublicDir:false}});
for(const name of await readdir(main+'/web/public')){if(name==='assets'){for(const entry of await readdir(main+'/web/public/assets'))await symlink(main+'/web/public/assets/'+entry,out+'/candidate/assets/'+entry);}else await symlink(main+'/web/public/'+name,out+'/candidate/'+name);}

await writeFile(out+'/build-head.txt',sha+'\n');
