import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {execFileSync} from 'node:child_process';
import {writeFile,readdir,symlink} from 'node:fs/promises';
const root='/Users/david/dev/game-battle-typegpu-impostor-state',out=process.cwd()+'/throwaway/typegpu-impostor-hardware/render';
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!=='fc4467263f3e237d39d49be811acab4e80a4d590')throw Error('Candidate changed');
await build({configFile:root+'/apps/battle-perf-lab/src/raw/impostor.vite.config.mts',build:{outDir:out,copyPublicDir:false,rolldownOptions:{input:root+'/apps/battle-perf-lab/src/raw/impostor-check.html'}}});
await writeFile(out+'/head.txt',sha+'\n');

const main=process.cwd();
for(const name of await readdir(main+'/web/public')){if(name==='assets'){for(const entry of await readdir(main+'/web/public/assets'))await symlink(main+'/web/public/assets/'+entry,out+'/assets/'+entry);}else await symlink(main+'/web/public/'+name,out+'/'+name);}
