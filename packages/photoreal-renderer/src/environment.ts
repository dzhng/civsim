// applyCivsimEnvironment — dresses a PhotorealWorld from the ONE environment
// preset owner (CIVSIM_ENVIRONMENTS / BATTLE_ENVIRONMENTS in
// packages/game-renderer/src/environment/environment.ts): the physical sky
// (SkyModel — background dome + IBL + sun tint), the ONE aerial-perspective
// owner (scene.fogNode), the sun
// DirectionalLight, and toneMappingExposure. New physical fields are ADDED to
// that owner, never forked into a parallel table. Physical parameter math lives
// in game-renderer/environment/physicalEnvironment; this module wires the scene.
import { Color, DirectionalLight } from "three";
import type { Node } from "three/webgpu";
import type { CivsimEnvironment } from "../../game-renderer/src/environment/environment";
import { SkyModel } from "./atmosphere/skyModel";
import { aerialIdentity, aerialPerspectiveNode } from "./atmosphere/aerialPerspective";
import type { PhotorealWorld } from "./world";
import {
  photorealEnvironment,
  type PhotorealEnvironmentSpec,
} from "../../game-renderer/src/environment/physicalEnvironment";

interface PhotorealEnvironmentOptions {
  /** Observer point for aerial optical depth (see aerialPerspectiveNode) —
   *  the battle world passes its camera ground focus. Default: the eye. */
  aerialObserver?: Node<"vec3">;
  /** World-owned chart/physical transition; other worlds retain full depth. */
  aerialStrength?: Node<"float">;
}

export function applyCivsimEnvironment(
  world: PhotorealWorld,
  env: CivsimEnvironment,
  options: PhotorealEnvironmentOptions = {},
): PhotorealEnvironmentSpec {
  const spec = photorealEnvironment(env);
  const scene = world.scene;

  // The physical sky (10a): one SkyModel owns the background dome, the IBL
  // equirect (scene.environment IS the sky-view LUT — ambient always agrees
  // with the visible sky), and the sun tint below.
  const sky = new SkyModel(env);
  sky.bake(world.renderer);
  scene.add(sky.mesh);
  scene.environment = sky.lut.texture;
  scene.environmentIntensity = spec.environmentIntensity;

  // The ONE aerial-perspective owner (10b): every fog-enabled world material
  // hazes through this hook; the in-scatter colour is the sky itself.
  scene.fogNode = aerialPerspectiveNode(sky, env, options.aerialObserver, options.aerialStrength);
  world.atmosphere = { sky: sky.identity(), aerial: aerialIdentity(env) };

  // The sun: direction from the preset angles, colour from the SAME sky
  // parameterization (linear transmittance — no display conversion).
  const sun = new DirectionalLight(new Color(...spec.sunColor), spec.sunIntensity);
  sun.position.set(
    spec.sunDirection[0] * 400,
    spec.sunDirection[1] * 400,
    spec.sunDirection[2] * 400,
  );
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  // Published for the shadow seam: shadows are
  // cast BY this same sun, so the preset's sunIntensity already scales how
  // strongly they read (overcast-highland's 0.32 sun ⇒ faint shadows, by physics).
  world.sunLight = sun;
  world.ownEnvironment(() => {
    scene.remove(sky.mesh, sun, sun.target);
    scene.environment = null;
    scene.fogNode = null;
    world.sunLight = null;
    sky.dispose();
  });

  world.renderer.toneMappingExposure = spec.exposure;
  world.environmentId = spec.id;
  return spec;
}
