/** Area-weighted downsample: odd dimensions and one-pixel axes keep every source texel. */
export const imageMipBodyWgsl = `(source:texture_2d<f32>,position:vec2f)->vec4f {
  let size = textureDimensions(source);
  let destinationSize = max(size / 2u, vec2u(1));
  let scale = vec2f(size) / vec2f(destinationSize);
  let low = floor(position) * scale;
  let high = low + scale;
  var total = vec4f(0);
  // Area coverage includes every source texel for odd sizes and 1-pixel axes.
  // textureLoad decodes sRGB; the sRGB attachment encodes the resulting mean.
  for (var y = i32(floor(low.y)); y < i32(ceil(high.y)); y++) {
    for (var x = i32(floor(low.x)); x < i32(ceil(high.x)); x++) {
      let overlap = max(vec2f(0), min(high, vec2f(f32(x + 1), f32(y + 1)))
        - max(low, vec2f(f32(x), f32(y))));
      total += textureLoad(source, vec2i(x, y), 0) * overlap.x * overlap.y;
    }
  }
  return total / (scale.x * scale.y);
}`;
export const IMAGE_MIP_WGSL = `
@group(0) @binding(0) var source:texture_2d<f32>;
fn imageMip${imageMipBodyWgsl}
@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[index],0,1);
}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f {return imageMip(source,position.xy);}
`;
