// three@0.185.1 ships no .d.ts and @types/three is not installed (adding it
// would touch package.json, which this spike must not do). Spike-scoped
// any-typed shims so `tsc --noEmit` stays green.
declare module 'three/webgpu';
declare module 'three/tsl';
declare module 'three/addons/utils/BufferGeometryUtils.js';
