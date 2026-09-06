// These zero-tolerance model baselines are captured with the runner's SwiftShader flags.
export function requireSwiftShaderBaseline(scene, env = process.env) {
  if (env.VERIFY_GPU !== '1' || env.VERIFY_GPU_ADAPTER === 'hardware') {
    throw new Error(
      `${scene}: screenshot baselines require VERIFY_GPU=1 and VERIFY_GPU_ADAPTER=swiftshader (or unset). Hardware/default browser captures are not comparable; no screenshots were taken.`,
    );
  }
}
