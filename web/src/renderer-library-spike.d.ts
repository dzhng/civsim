declare module "*.wgsl" {
  const shader: import("@vgpu/wgsl").ShaderSource;
  export default shader;
}
