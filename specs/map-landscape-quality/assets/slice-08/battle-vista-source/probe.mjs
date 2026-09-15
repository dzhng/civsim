import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]??'.');
const {default:init,Game}=await import(pathToFileURL(resolve(root,'web/src/wasm/game_wasm.js')).href);
const wasm=await init({module_or_path:readFileSync(resolve(root,'web/src/wasm/game_wasm_bg.wasm'))});
const game=new Game(42);game.load_generated_map(1n);
const descriptor=JSON.parse(game.generated_map_descriptor());
const out={descriptor,bands:[]};
for(let b=0;b<game.generated_vista_band_count();b++){
 const w=game.generated_vista_band_width(b),h=game.generated_vista_band_height(b),cell=game.generated_vista_band_cell(b),ox=game.generated_vista_band_origin_x(b),oy=game.generated_vista_band_origin_y(b);
 const height=new Float32Array(wasm.memory.buffer,game.generated_vista_band_height_ptr(b),w*h),water=new Float32Array(wasm.memory.buffer,game.generated_vista_band_water_ptr(b),w*h);
 const edge=[];
 for(let i=0;i<w;i++){const x=ox+i*cell;if(x<1200)continue;let last=-1;for(let j=0;j<h;j++)if(water[j*w+i])last=j;if(last>=0&&last<h-1)edge.push({x,y:oy+last*cell,z:height[last*w+i],nextY:oy+(last+1)*cell,nextZ:height[(last+1)*w+i]});}
 out.bands.push({b,w,h,cell,ox,oy,waterValues:[...new Set(water)],edge});
}
writeFileSync(process.argv[3]??'water-source.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.bands.map(b=>({...b,edge:b.edge.slice(0,20)})),null,2));
