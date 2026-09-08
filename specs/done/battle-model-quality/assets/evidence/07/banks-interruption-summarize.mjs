import { readFile, writeFile } from 'node:fs/promises';
const profile = JSON.parse(await readFile(new URL('banks-interruption.cpuprofile', import.meta.url)));
const report = JSON.parse(await readFile(new URL('banks-interruption.json', import.meta.url)));
const row = report.checks.find(c => c.name.endsWith('frame measurements')).detail;
const origin = report.clockMetrics.metrics.find(m => m.name === 'NavigationStart').value * 1e6;
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of nodes.values()) for (const child of n.children ?? []) parent.set(child,n.id);
const key = id => { const c=nodes.get(id).callFrame;return `${c.functionName || '<anonymous>'} ${c.url.split('?')[0]}:${c.lineNumber+1}`; };
const phases = ['observeMs','sampleMs','buildMs','uploadMs','renderSubmitMs'];
const frames = row.samples.map(f=>({...f,start:origin+f.frameStartMs*1000}));
const self = new Map(), inclusive = new Map();
const phaseSelf = Object.fromEntries(phases.map(p=>[p,new Map()]));
const phaseInclusive = Object.fromEntries(phases.map(p=>[p,new Map()]));
const add=(map,k,dt)=>map.set(k,(map.get(k)??0)+dt);
let time=profile.startTime, measured=0;
for(let i=0;i<profile.samples.length;i++){
  const end=time+profile.timeDeltas[i],id=profile.samples[i],leaf=key(id);
  const ancestry=new Set();for(let cursor=id;cursor;cursor=parent.get(cursor))ancestry.add(key(cursor));
  for(const f of frames){
    const overlap=Math.max(0,Math.min(end,f.start+f.cpuFrameMs*1000)-Math.max(time,f.start))/1000;
    if(!overlap)continue;
    measured+=overlap;add(self,leaf,overlap);for(const k of ancestry)add(inclusive,k,overlap);
    let at=f.start;
    for(const p of phases){const next=at+f[p]*1000;const dt=Math.max(0,Math.min(end,next)-Math.max(time,at))/1000;
      if(dt){add(phaseSelf[p],leaf,dt);for(const k of ancestry)add(phaseInclusive[p],k,dt);}at=next;}
  }
  time=end;
}
const round=x=>+x.toFixed(3);
const top=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([name,ms])=>({name,ms:round(ms)}));
const q=(k,p)=>{const a=frames.map(f=>f[k]).sort((a,b)=>a-b);return round(a[Math.min(a.length-1,Math.floor(a.length*p))]);};
const summary={caveat:'One 1ms CPU sampling diagnostic, not acceptance. Profiler starts before initial draw and 60-frame warmup. Attribution clips sample intervals to 180 measured frame and phase intervals using NavigationStart; approximate at sampling resolution. Inclusive times overlap and must not be added. GC location is not allocation origin.',
  frameCount:frames.length,firstFrame:frames[0],sampledFrameMs:round(measured),profileMs:round((profile.endTime-profile.startTime)/1000),
  timing:Object.fromEntries([...phases,'cpuFrameMs','rafMs'].map(k=>[k,{median:q(k,.5),p95:q(k,.95),total:round(frames.reduce((n,f)=>n+f[k],0))}])),
  self:top(self),inclusive:top(inclusive),
  phases:Object.fromEntries(phases.map(p=>[p,{self:top(phaseSelf[p]),inclusive:top(phaseInclusive[p])}]))};
await writeFile(new URL('banks-interruption-summary.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,phases:undefined,inclusive:undefined},null,2));
