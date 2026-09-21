export const vistaOpacityWgsl = `(position:vec3f,eye:vec3f)->f32{return 1.0-smoothstep(-0.012,0.05,normalize(position-eye).z);}`;
