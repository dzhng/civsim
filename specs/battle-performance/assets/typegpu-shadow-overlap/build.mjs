import {build} from '../../web/node_modules/vite/dist/node/index.js';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const root='/Users/david/dev/game-battle-typegpu-shadow-overlap',out=process.cwd()+'/throwaway/typegpu-shadow-overlap-hardware/dist';
const sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!=='3d922bb7811665a627218f0febf7880b5baa1fe8')throw Error('Candidate changed');
await build({configFile:root+'/web/vite.typegpu.config.ts',build:{outDir:out,copyPublicDir:false,rolldownOptions:{input:root+'/apps/battle-perf-lab/candidates/typegpu/shadow-check.html'}}});
await writeFile(out+'/head.txt',sha+'\n');
