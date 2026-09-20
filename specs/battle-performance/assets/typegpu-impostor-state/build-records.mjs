import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const root='/Users/david/dev/game-battle-typegpu-impostor-state',out=process.cwd()+'/throwaway/typegpu-impostor-hardware/dist';
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!=='fc4467263f3e237d39d49be811acab4e80a4d590')throw Error('Candidate changed');
await build({configFile:root+'/web/vite.typegpu.config.ts',build:{outDir:out,copyPublicDir:false,rolldownOptions:{input:root+'/apps/battle-perf-lab/candidates/typegpu/impostor-record-check.html'}}});
await writeFile(out+'/head.txt',sha+'\n');
