import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {symlink,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const main=process.cwd(),root=main,out=main+'/throwaway/typegpu-integrated-hardware';
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!sha.startsWith('f440191a'))throw Error('Candidate changed');
if(execFileSync('git',['-C',root,'diff','--name-only','HEAD','--','apps','packages'],{encoding:'utf8'}).trim())throw Error('Candidate code is dirty');
process.env.BATTLE_NATIVE_BACKEND='typegpu';
await build({root:root+'/web',configFile:root+'/apps/battle-perf-lab/src/live/vite.config.mts',build:{outDir:out+'/menu',copyPublicDir:false}});
for(const name of await readdir(main+'/web/public')){if(name==='assets'){for(const entry of await readdir(main+'/web/public/assets'))await symlink(main+'/web/public/assets/'+entry,out+'/menu/assets/'+entry);}else await symlink(main+'/web/public/'+name,out+'/menu/'+name);}

await writeFile(out+'/build-head.txt',sha+'\n');
