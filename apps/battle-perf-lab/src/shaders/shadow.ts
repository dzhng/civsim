/** Pinned Three r185 PCFShadowFilter: five Vogel disk taps with per-pixel IGN.
 * Shadow projection/fit and bias remain inputs, not a second lighting policy. */
export const shadowPcfWgsl = `(depth:texture_depth_2d, compare:sampler_comparison, uv:vec2f, z:f32, pixel:vec2f, radius:f32)->f32 {
  let phi=fract(52.9829189*fract(dot(pixel,vec2f(0.06711056,0.00583715))))*6.28318530718;
  let scale=radius/f32(textureDimensions(depth).x);
  var visibility=0.0;
  for(var i=0u;i<5u;i++) {
    let r=sqrt((f32(i)+0.5)/5.0);
    let theta=f32(i)*2.399963229728653+phi;
    let offset=vec2f(cos(theta),sin(theta))*r*scale;
    visibility+=textureSampleCompareLevel(depth,compare,uv+offset,z);
  }
  return visibility*0.2;
}`;

/** Source reverse-Z coordinate/bias contract; world normal is the material's
 * resolved shading normal. Pixel coordinates are physical fragment coordinates. */
export const shadowVisibilityWgsl = `(depth:texture_depth_2d, compare:sampler_comparison, matrix:mat4x4f, settings:vec4f, world:vec3f, normal:vec3f, pixel:vec2f)->f32 {
  let clip=matrix*vec4f(world+normal*settings.y,1);
  let coord=clip.xyz/clip.w;
  let uv=vec2f(coord.x*0.5+0.5,0.5-coord.y*0.5);
  let z=coord.z-settings.x;
  let inside=all(uv>=vec2f(0))&&all(uv<=vec2f(1))&&z<=1;
  let shade=shadowPcf(depth,compare,uv,z,pixel,settings.z);
  return select(1.0,shade,inside);
}`;
