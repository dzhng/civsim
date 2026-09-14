/** Exact battleTsl ground/water noise and albedo functions, without renderer imports. */
export const terrainNoiseWgsl = `
fn terrainHash(p:vec2f)->f32 {
 let p3=fract(vec3f(p.x,p.y,p.x)*0.1031);
 let q=p3+dot(p3,p3.yzx+vec3f(33.33));
 return fract((q.x+q.y)*q.z);
}
fn terrainNoise(p:vec2f)->f32 {
 let i=floor(p);let f=fract(p);let u=f*f*(vec2f(3)-f*2.0);
 return mix(mix(terrainHash(i),terrainHash(i+vec2f(1,0)),u.x),mix(terrainHash(i+vec2f(0,1)),terrainHash(i+vec2f(1,1)),u.x),u.y);
}
fn terrainFbm(p:vec2f)->f32 {return terrainNoise(p)*0.52+terrainNoise(p*2.11+vec2f(4.3,1.7))*0.31+terrainNoise(p*4.07+vec2f(9.1,6.4))*0.17;}
fn terrainRidge(p:vec2f)->f32 {let r=1.0-abs(terrainNoise(p)*2.0-1.0);return r*r;}
fn terrainWaterHash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn terrainWaterNoise(p:vec2f)->f32{
 let i=floor(p);let f=fract(p);let u=f*f*(vec2f(3)-f*2.0);
 return mix(mix(terrainWaterHash(i),terrainWaterHash(i+vec2f(1,0)),u.x),mix(terrainWaterHash(i+vec2f(0,1)),terrainWaterHash(i+vec2f(1,1)),u.x),u.y);
}
fn terrainLinear(c:vec3f)->vec3f{return select(pow(c*0.9478672986+vec3f(0.0521327014),vec3f(2.4)),c*0.0773993808,c<=vec3f(0.04045));}
`;
