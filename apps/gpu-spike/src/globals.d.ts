// Production still has an ambient mappable-buffer type. Keep this spike on the
// official WebGPU definitions without importing production's unknown aliases.
type GPUMappableBuffer = Pick<GPUBuffer, "mapAsync" | "getMappedRange" | "unmap">;
